import fs from 'fs';
import { type Server } from 'node:https';
import path from 'path';
import { download } from '@prisma/fetch-engine';
import { fastify, type FastifyHttpsOptions } from 'fastify';
import forge from 'node-forge';
import { PrismaAccelerate } from './prisma-accelerate.js';
export * from './prisma-accelerate.js';

export const createKey = () => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter.setFullYear(now.getFullYear() + 1);

  const attrs = [
    {
      name: 'commonName',
      value: 'example.com',
    },
    {
      name: 'countryName',
      value: 'EXAMPLE',
    },
    {
      shortName: 'ST',
      value: 'Example State',
    },
    {
      name: 'localityName',
      value: 'Example Locality',
    },
    {
      name: 'organizationName',
      value: 'Example Org',
    },
    {
      shortName: 'OU',
      value: 'Example Org Unit',
    },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.sign(keys.privateKey);
  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };
};

const getAdapter = (datasourceUrl: string) => {
  const url = new URL(datasourceUrl);
  const schema = url.searchParams.get('schema');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const pg = require('pg');
  const pool = new pg.Pool({
    connectionString: url.toString(),
  });
  return new PrismaPg(pool, {
    schema: schema ?? undefined,
  });
};

export const createServer = ({
  datasourceUrl,
  https,
  wasm,
  secret,
  fastifySeverOptions,
  singleInstance,
  onRequestSchema,
  onChangeSchema,
}: {
  datasourceUrl?: string;
  https?: { cert: string; key: string } | null;
  wasm?: boolean;
  secret?: string;
  fastifySeverOptions?: Omit<FastifyHttpsOptions<Server>, 'https'> | FastifyHttpsOptions<Server>;
  singleInstance?: boolean;
  onRequestSchema?: ({
    engineVersion,
    hash,
    datasourceUrl,
  }: {
    engineVersion: string;
    hash: string;
    datasourceUrl: string;
  }) => Promise<string | undefined | null>;
  onChangeSchema?: ({
    inlineSchema,
    engineVersion,
    hash,
    datasourceUrl,
  }: {
    inlineSchema: string;
    engineVersion: string;
    hash: string;
    datasourceUrl: string;
  }) => Promise<void>;
}) => {
  const { getPrismaClient } = require('@prisma/client/runtime/library.js');
  const prismaAccelerate = new PrismaAccelerate({
    secret,
    datasourceUrl,
    activeProvider: 'postgresql',
    adapter: wasm ? getAdapter : undefined,
    getRuntime: () => require(`@prisma/client/runtime/query_engine_bg.postgresql.js`),
    getPrismaClient,
    singleInstance,
    onRequestSchema,
    onChangeSchema,
    getQueryEngineWasmModule: wasm
      ? async () => {
          const runtimePath =
            './node_modules/@prisma/client/runtime/query_engine_bg.postgresql.wasm';
          const queryEngineWasmFilePath = fs.existsSync(runtimePath)
            ? runtimePath
            : path.resolve(
                __dirname,
                fs.existsSync(path.resolve(__dirname, '../node_modules')) ? '..' : '../..',
                'node_modules',
                '@prisma/client/runtime',
                'query_engine_bg.postgresql.wasm'
              );
          const queryEngineWasmFileBytes = fs.readFileSync(queryEngineWasmFilePath);
          return new WebAssembly.Module(queryEngineWasmFileBytes);
        }
      : undefined,
    getEnginePath: async (adapter, engineVersion) => {
      const baseDir = adapter ? '@prisma/client/runtime' : '.prisma/client';
      const dirname = path.resolve(
        __dirname,
        fs.existsSync(path.resolve(__dirname, '../node_modules')) ? '..' : '../..',
        'node_modules',
        baseDir,
        adapter ? '' : engineVersion
      );
      if (!adapter) {
        fs.mkdirSync(dirname, { recursive: true });
        const engine = await download({
          binaries: {
            'libquery-engine': dirname,
          },
          version: engineVersion,
        }).catch(() => undefined);
        if (!engine) {
          return undefined;
        }
      }

      return dirname;
    },
  });

  const _fastify = fastify({
    https: https === undefined ? createKey() : https,
    ...fastifySeverOptions,
  });

  _fastify.addContentTypeParser('*', { parseAs: 'string' }, function (_req, body, done) {
    done(null, body);
  });

  _fastify
    .post('/:version/:hash/graphql', async ({ body, params, headers }, reply) => {
      const { hash } = params as { hash: string };
      return prismaAccelerate.query({ hash, headers, body }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
    })
    .post('/:version/:hash/transaction/start', async ({ body, params, headers }, reply) => {
      const { version, hash } = params as { version: string; hash: string };
      const result = await prismaAccelerate
        .startTransaction({ version, hash, headers, body })
        .catch((e) => {
          return reply.status(e.code).send(e.value);
        });
      return result;
    })
    .post('/:version/:hash/itx/:id/graphql', async ({ body, params, headers }, reply) => {
      const { hash, id } = params as { hash: string; id: string };
      return prismaAccelerate.queryTransaction({ hash, headers, body, id }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
    })
    .post('/:version/:hash/itx/:id/commit', async ({ params, headers }, reply) => {
      const { hash, id } = params as { hash: string; id: string };
      return prismaAccelerate.commitTransaction({ hash, headers, id }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
    })
    .post('/:version/:hash/itx/:id/rollback', async ({ params, headers }, reply) => {
      const { hash, id } = params as { hash: string; id: string };
      return prismaAccelerate.rollbackTransaction({ hash, headers, id }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
    })
    .put('/:version/:hash/schema', async ({ body, params, headers }, reply) => {
      const { hash } = params as { hash: string };
      return prismaAccelerate.updateSchema({ hash, headers, body }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
    })
    .all('*', async (req, reply) => {
      return reply.status(404).send('Not found');
    });

  return _fastify;
};

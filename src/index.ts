import { type Server } from 'node:https';
import { PrismaPg } from '@prisma/adapter-pg';
import { getPrismaClient } from '@prisma/client/runtime/library.js';
import { fastify, type FastifyServerOptions, type FastifyHttpsOptions } from 'fastify';
import forge from 'node-forge';
import pg from 'pg';
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
  const pool = new pg.Pool({
    connectionString: url.toString(),
  });
  return new PrismaPg(pool, {
    schema: schema ?? undefined,
  });
};

export const createServer = (
  {
    datasourceUrl,
    https,
    wasm,
    secret,
  }: {
    datasourceUrl?: string;
    https?: { cert: string; key: string } | null;
    wasm?: boolean;
    secret?: string;
  },
  fastifySeverOptions: FastifyServerOptions = {}
) => {
  const prismaAccelerate = new PrismaAccelerate({
    secret,
    datasourceUrl,
    adapter: wasm ? getAdapter : undefined,
    getPrismaClient,
    async getQueryEngineWasmModule() {
      const dirname = (this as unknown as { dirname: string }).dirname;
      const queryEngineWasmFilePath = (await import('node:path')).join(
        dirname,
        'query-engine.wasm'
      );
      const queryEngineWasmFileBytes = (await import('node:fs')).readFileSync(
        queryEngineWasmFilePath
      );
      return new WebAssembly.Module(queryEngineWasmFileBytes);
    },
  });
  return fastify({
    ...fastifySeverOptions,
    https: https === undefined ? createKey() : https,
  } as FastifyHttpsOptions<Server>)
    .post('/:version/:hash/graphql', async ({ body, params, headers }, reply) => {
      const { hash } = params as { hash: string };
      return prismaAccelerate.query({ hash, headers, body }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
    })
    .post('/:version/:hash/transaction/start', async ({ body, params, headers }, reply) => {
      const { version, hash } = params as { version: string; hash: string };
      return prismaAccelerate.startTransaction({ version, hash, headers, body }).catch((e) => {
        return reply.status(e.code).send(e.value);
      });
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
    });
};

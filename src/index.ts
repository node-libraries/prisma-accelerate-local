import fs from 'fs';
import path from 'path';
import { getPrismaClient } from '@prisma/client/runtime/library';
import { download } from '@prisma/fetch-engine';
import { FastifyReply, FastifyRequest, fastify } from 'fastify';
import forge from 'node-forge';

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

const BaseConfig = {
  runtimeDataModel: { models: {}, enums: {}, types: {} },
  relativeEnvPaths: {
    rootEnvPath: '',
    schemaEnvPath: '',
  },
  relativePath: '',
  datasourceNames: ['db'],
  inlineSchema: '',
  dirname: '',
  clientVersion: '',
  engineVersion: '',
  activeProvider: '',
  inlineDatasources: {},
  inlineSchemaHash: '',
};

const getPrisma = ({
  request,
  reply,
  prismaMap,
  apiKey,
  ignoreSchemaError,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  apiKey?: string;
  prismaMap: {
    [key: string]: Promise<InstanceType<ReturnType<typeof getPrismaClient>> | undefined>;
  };
  ignoreSchemaError?: boolean;
}) => {
  if (apiKey) {
    const authorization = request.headers['authorization'];
    const key = authorization?.replace('Bearer ', '');
    if (key !== apiKey) {
      reply.status(401).send({ Unauthorized: { reason: 'InvalidKey' } });
      return;
    }
  }
  const { hash } = request.params as {
    version: string;
    hash: string;
  };
  const engineVersion = request.headers['prisma-engine-hash'] as string;
  if (!engineVersion) {
    reply.status(404).send({ EngineNotStarted: { reason: 'VersionMissing' } });
    return;
  }
  const prisma = prismaMap[`${engineVersion}-${hash}`];
  if (!prisma && !ignoreSchemaError) {
    reply.status(404).send({ EngineNotStarted: { reason: 'SchemaMissing' } });
    return;
  }
  return prisma;
};

export const getHost = (request: FastifyRequest) => {
  const { headers } = request;
  return headers['x-forwarded-host'] ?? headers['host'];
};

export const createServer = ({
  datasourceUrl,
  https,
  apiKey,
}: {
  datasourceUrl: string;
  https?: { cert: string; key: string };
  apiKey?: string;
}) => {
  const prismaMap: {
    [key: string]: Promise<InstanceType<ReturnType<typeof getPrismaClient>> | undefined>;
  } = {};

  return fastify({ https: https ?? createKey() })
    .post('/:version/:hash/graphql', async (request, reply) => {
      const prisma = await getPrisma({ apiKey, request, reply, prismaMap });
      if (!prisma) return;
      const query = JSON.parse(request.body as string);

      if (query.batch) {
        const result = await prisma._engine
          .requestBatch(query.batch, {
            containsWrite: true,
            transaction: {
              kind: 'batch',
              options: query.transaction,
            },
          })
          .then((batchResult) => {
            return { batchResult };
          })
          .catch((e) => {
            return {
              errors: [
                {
                  error: String(e),
                  user_facing_error: {
                    is_panic: false,
                    message: e.message,
                    meta: e.meta,
                    error_code: e.code,
                    batch_request_idx: 1,
                  },
                },
              ],
            };
          });
        return result;
      }
      return prisma._engine
        .request(query, { isWrite: true })
        .catch((e: { message: string; code: number; meta: unknown }) => {
          return {
            errors: [
              {
                error: String(e),
                user_facing_error: {
                  message: e.message,
                  error_code: e.code,
                  is_panic: false,
                  meta: e.meta,
                },
              },
            ],
          };
        });
    })
    .post('/:version/:hash/transaction/start', async (request, reply) => {
      const prisma = await getPrisma({ apiKey, request, reply, prismaMap });
      if (!prisma) return;
      const { id } = await prisma._engine.transaction(
        'start',
        {},
        JSON.parse(request.body as string)
      );
      const { version, hash } = request.params as {
        version: string;
        hash: string;
      };
      return {
        id,
        extensions: {},
        'data-proxy': {
          endpoint: `https://${getHost(request)}/${version}/${hash}/itx/${id}`,
        },
      };
    })
    .post('/:version/:hash/itx/:id/graphql', async (request, reply) => {
      const prisma = await getPrisma({ apiKey, request, reply, prismaMap });
      if (!prisma) return;
      const { id } = request.params as {
        id: string;
      };
      const query = JSON.parse(request.body as string);
      const result = await prisma._engine
        .request(query, { isWrite: true, interactiveTransaction: { id, payload: {} } })
        .catch((e: { message: string; code: number; meta: unknown }) => {
          return {
            errors: [
              {
                error: String(e),
                user_facing_error: {
                  message: e.message,
                  error_code: e.code,
                  is_panic: false,
                  meta: e.meta,
                },
              },
            ],
          };
        });
      return result;
    })
    .post('/:version/:hash/itx/:id/commit', async (request, reply) => {
      const prisma = await getPrisma({ apiKey, request, reply, prismaMap });
      if (!prisma) return;
      const { id } = request.params as {
        id: string;
      };
      return prisma._engine.transaction('commit', {}, { id, payload: {} });
    })
    .post('/:version/:hash/itx/:id/rollback', async (request, reply) => {
      const prisma = await getPrisma({ apiKey, request, reply, prismaMap });
      if (!prisma) return;
      const { id } = request.params as {
        id: string;
      };
      return prisma._engine.transaction('rollback', {}, { id, payload: {} });
    })
    .put('/:version/:hash/schema', async (request, reply) => {
      if (await getPrisma({ apiKey, request, reply, prismaMap, ignoreSchemaError: true })) return;

      const { hash } = request.params as {
        version: string;
        hash: string;
      };
      const engineVersion = request.headers['prisma-engine-hash'] as string;

      const result = async () => {
        const inlineSchema = request.body as string;

        const dirname = path.resolve(
          __dirname,
          fs.existsSync(path.resolve(__dirname, '../node_modules'))
            ? '../node_modules/.prisma/client'
            : '../../node_modules/.prisma/client',
          engineVersion
        );
        fs.mkdirSync(dirname, { recursive: true });
        const engine = await download({
          binaries: {
            'libquery-engine': dirname,
          },
          version: engineVersion,
        }).catch(() => undefined);
        if (!engine) {
          reply.status(404).send({ EngineNotStarted: { reason: 'EngineMissing' } });
          return undefined;
        }
        const PrismaClient = getPrismaClient({
          ...BaseConfig,
          inlineSchema,
          dirname,
          engineVersion,
        });
        return new PrismaClient({ datasourceUrl });
      };
      prismaMap[`${engineVersion}-${hash}`] = result();
    });
};

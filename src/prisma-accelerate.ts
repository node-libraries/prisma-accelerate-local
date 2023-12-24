import type { PrismaPg } from '@prisma/adapter-pg';
import type { getPrismaClient } from '@prisma/client/runtime/library';
import type { IncomingHttpHeaders } from 'node:http';
import type pg from 'pg';

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

export class ResultError extends Error {
  constructor(
    public code: number,
    public value: unknown
  ) {
    super();
  }
}

export class PrismaAccelerate {
  prismaMap: {
    [key: string]: Promise<InstanceType<ReturnType<typeof getPrismaClient>> | undefined>;
  } = {};
  apiKey?: string;
  wasm?: boolean;
  getQueryEngineWasmModule?: () => Promise<unknown>;
  getPrismaClient: typeof getPrismaClient;
  PrismaPg: typeof PrismaPg;
  pg: typeof pg;

  constructor({
    apiKey,
    wasm,
    getQueryEngineWasmModule,
    getPrismaClient: _getPrismaClient,
    PrismaPg: _PrismaPg,
    pg: _pg,
  }: {
    apiKey?: string;
    wasm?: boolean;
    getQueryEngineWasmModule?: () => Promise<unknown>;
    getPrismaClient: typeof getPrismaClient;
    PrismaPg: typeof PrismaPg;
    pg: typeof pg;
  }) {
    this.apiKey = apiKey;
    this.wasm = wasm;
    this.getQueryEngineWasmModule = getQueryEngineWasmModule;
    this.getPrismaClient = _getPrismaClient;
    this.PrismaPg = _PrismaPg;
    this.pg = _pg;
  }
  // deno-lint-ignore require-await
  private async getPrisma({
    headers,
    hash,
    ignoreSchemaError,
  }: {
    headers: IncomingHttpHeaders;
    hash: string;
    ignoreSchemaError?: boolean;
  }) {
    if (this.apiKey) {
      const authorization = headers['authorization'];
      const key = authorization?.replace('Bearer ', '');
      if (key !== this.apiKey) {
        throw new ResultError(401, { Unauthorized: { reason: 'InvalidKey' } });
      }
    }
    const engineVersion = headers['prisma-engine-hash'] as string;
    if (!engineVersion) {
      throw new ResultError(404, {
        EngineNotStarted: { reason: 'VersionMissing' },
      });
    }
    const prisma = this.prismaMap[`${engineVersion}-${hash}`];
    if (!prisma && !ignoreSchemaError) {
      throw new ResultError(404, {
        EngineNotStarted: { reason: 'SchemaMissing' },
      });
    }
    return prisma;
  }

  async query({
    hash,
    headers,
    body,
  }: {
    hash: string;
    headers: IncomingHttpHeaders;
    body: unknown;
  }) {
    const prisma = await this.getPrisma({ hash, headers });
    if (!prisma) return;
    const query = JSON.parse(body as string);

    if (query.batch) {
      const result = await prisma._engine
        .requestBatch(query.batch, {
          containsWrite: true,
          transaction: query.transaction
            ? {
                kind: 'batch',
                options: query.transaction,
              }
            : undefined,
        })
        .then((batchResult) => {
          return {
            batchResult: batchResult.map((v) => ('data' in v ? v.data : v)),
            extensions: {
              traces: [],
              logs: [],
            },
          };
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
  }
  async startTransaction({
    version,
    hash,
    headers,
    body,
  }: {
    version: string;
    hash: string;
    headers: IncomingHttpHeaders;
    body: unknown;
  }) {
    const prisma = await this.getPrisma({ hash, headers });
    if (!prisma) return;
    const { id } = await prisma._engine.transaction('start', {}, JSON.parse(body as string));
    const host = headers['x-forwarded-host'] ?? headers['host'];
    return {
      id,
      extensions: {},
      'data-proxy': {
        endpoint: `https://${host}/${version}/${hash}/itx/${id}`,
      },
    };
  }
  async queryTransaction({
    hash,
    headers,
    body,
    id,
  }: {
    hash: string;
    headers: IncomingHttpHeaders;
    body: unknown;
    id: string;
  }) {
    const prisma = await this.getPrisma({ hash, headers });
    if (!prisma) return;
    const query = JSON.parse(body as string);
    const result = await prisma._engine
      .request(query, {
        isWrite: true,
        interactiveTransaction: { id, payload: {} },
      })
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
  }
  async commitTransaction({
    hash,
    headers,
    id,
  }: {
    hash: string;
    headers: IncomingHttpHeaders;
    id: string;
  }) {
    const prisma = await this.getPrisma({ hash, headers });
    if (!prisma) return;
    return prisma._engine.transaction('commit', {}, { id, payload: {} });
  }
  async rollbackTransaction({
    hash,
    headers,
    id,
  }: {
    hash: string;
    headers: IncomingHttpHeaders;
    id: string;
  }) {
    const prisma = await this.getPrisma({ hash, headers });
    if (!prisma) return;
    return prisma._engine.transaction('rollback', {}, { id, payload: {} });
  }
  async getPath(engineVersion: string) {
    const baseDir = this.wasm ? '@prisma/client/runtime' : '.prisma/client';
    if ('process' in globalThis) {
      const path = await import('node:path');
      const fs = await import('node:fs');

      const dirname = path.resolve(
        __dirname,
        fs.existsSync(path.resolve(__dirname, '../node_modules')) ? '..' : '../..',
        'node_modules',
        baseDir,
        this.wasm ? '' : engineVersion
      );
      if (!this.wasm) {
        fs.mkdirSync(dirname, { recursive: true });
        const engine = await (
          await import('@prisma/fetch-engine')
        )
          .download({
            binaries: {
              'libquery-engine': dirname,
            },
            version: engineVersion,
          })
          .catch(() => undefined);
        if (!engine) {
          throw new ResultError(404, {
            EngineNotStarted: { reason: 'EngineMissing' },
          });
        }
      }
      return dirname;
    }
    return '';
  }
  async updateSchema({
    hash,
    headers,
    body,
    datasourceUrl,
  }: {
    hash: string;
    headers: IncomingHttpHeaders;
    body: unknown;
    datasourceUrl: string;
  }) {
    if (await this.getPrisma({ hash, headers, ignoreSchemaError: true }).catch(() => null)) return;

    const engineVersion = headers['prisma-engine-hash'] as string;

    const result = async () => {
      const inlineSchema = body as string;
      const dirname = await this.getPath(engineVersion);
      const PrismaClient = this.getPrismaClient({
        ...BaseConfig,
        inlineSchema,
        dirname,
        engineVersion,
        generator: this.wasm
          ? {
              name: '',
              provider: {
                fromEnvVar: null,
                value: 'prisma-client-js',
              },
              output: {
                value: '',
                fromEnvVar: null,
              },
              config: {
                engineType: 'wasm',
              },
              binaryTargets: [
                {
                  fromEnvVar: null,
                  value: '',
                  native: true,
                },
              ],
              previewFeatures: ['driverAdapters'],
            }
          : undefined,
        getQueryEngineWasmModule: this.getQueryEngineWasmModule,
      });
      if (this.wasm) {
        const url = new URL(datasourceUrl);
        const schema = url.searchParams.get('schema');
        const pool = new this.pg.Pool({
          connectionString: url.toString(),
        });
        const adapter = new this.PrismaPg(pool, {
          schema: schema ?? undefined,
        });
        return new PrismaClient({ adapter });
      } else {
        return new PrismaClient({ datasourceUrl });
      }
    };
    this.prismaMap[`${engineVersion}-${hash}`] = result();
  }
}

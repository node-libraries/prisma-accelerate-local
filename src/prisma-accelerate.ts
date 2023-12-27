import { SignJWT, jwtVerify } from 'jose';
import type { DriverAdapter, getPrismaClient } from '@prisma/client/runtime/library';
import type { IncomingHttpHeaders } from 'node:http';

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
  secret?: string;
  getQueryEngineWasmModule?: () => Promise<unknown>;
  getPrismaClient: typeof getPrismaClient;
  adapter?: (datasourceUrl: string) => DriverAdapter;
  datasourceUrl?: string;

  static createApiKey = async ({
    secret,
    datasourceUrl,
  }: {
    secret: string;
    datasourceUrl: string;
  }) => {
    return new SignJWT({ datasourceUrl })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('prisma-accelerate')
      .sign(new TextEncoder().encode(secret));
  };

  constructor({
    getQueryEngineWasmModule,
    getPrismaClient: _getPrismaClient,
    adapter,
    secret,
    datasourceUrl,
  }: {
    getQueryEngineWasmModule?: () => Promise<unknown>;
    getPrismaClient: typeof getPrismaClient;
    adapter?: (datasourceUrl: string) => DriverAdapter;
    secret?: string;
    datasourceUrl?: string;
  }) {
    this.adapter = adapter;
    this.getQueryEngineWasmModule = getQueryEngineWasmModule;
    this.getPrismaClient = _getPrismaClient;
    this.secret = secret;
    this.datasourceUrl = datasourceUrl;
  }
  private getDatasourceUrl(headers: IncomingHttpHeaders) {
    if (!this.secret) return this.datasourceUrl;
    const authorization = headers['authorization'];
    const key = authorization?.replace('Bearer ', '') ?? '';
    return jwtVerify<{ datasourceUrl: string }>(key, new TextEncoder().encode(this.secret))
      .then((v) => v.payload.datasourceUrl)
      .catch(() => undefined);
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
    const datasourceUrl = await this.getDatasourceUrl(headers);
    if (!datasourceUrl) {
      throw new ResultError(401, { Unauthorized: { reason: 'InvalidKey' } });
    }

    const engineVersion = headers['prisma-engine-hash'] as string;
    if (!engineVersion) {
      throw new ResultError(404, {
        EngineNotStarted: { reason: 'VersionMissing' },
      });
    }
    const prisma = this.prismaMap[`${engineVersion}-${hash}-${datasourceUrl}`];
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
    const baseDir = this.adapter ? '@prisma/client/runtime' : '.prisma/client';
    if ('Deno' in globalThis) return '';

    const path = await import('node:path');
    const fs = await import('node:fs');

    const dirname = path.resolve(
      __dirname,
      fs.existsSync(path.resolve(__dirname, '../node_modules')) ? '..' : '../..',
      'node_modules',
      baseDir,
      this.adapter ? '' : engineVersion
    );
    if (!this.adapter) {
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
  async updateSchema({
    hash,
    headers,
    body,
  }: {
    hash: string;
    headers: IncomingHttpHeaders;
    body: unknown;
  }) {
    if (await this.getPrisma({ hash, headers, ignoreSchemaError: true }).catch(() => null)) return;

    const engineVersion = headers['prisma-engine-hash'] as string;
    const datasourceUrl = await this.getDatasourceUrl(headers);
    if (!datasourceUrl) {
      throw new ResultError(401, { Unauthorized: { reason: 'InvalidKey' } });
    }
    const result = async () => {
      const inlineSchema = body as string;
      const dirname = await this.getPath(engineVersion);
      const PrismaClient = this.getPrismaClient({
        ...BaseConfig,
        inlineSchema,
        dirname,
        engineVersion,
        generator: this.adapter
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

      if (this.adapter) {
        return new PrismaClient({ adapter: this.adapter(datasourceUrl) });
      } else {
        return new PrismaClient({ datasourceUrl });
      }
    };
    this.prismaMap[`${engineVersion}-${hash}-${datasourceUrl}`] = result();
  }
}

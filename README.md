# prisma-accelerate-local

Prisma Accelerate functionality can be self-hosted locally.

## Samples

- Node.js (local)  
  https://github.com/SoraKumo001/prisma-accelerate-local-test
- Cloudflare Workers(Postgres) (local)  
  https://github.com/SoraKumo001/cloudflare-workers-prisma
- Cloudflare Workers(Postgres) (server)  
  https://github.com/SoraKumo001/prisma-accelerate-workers
- Cloudflare Workers(D1) (server)  
  https://github.com/SoraKumo001/prisma-accelerate-workers-d1
- Deno(Postgres) (server)  
  https://github.com/SoraKumo001/prisma-accelerate-deno

## usage

### CLI Options

| Category      | Option                      | Description                                   |
| ------------- | --------------------------- | --------------------------------------------- |
| **USAGE**     | [option] _\<url>_           |                                               |
| **ARGUMENTS** | _\<url>_                    | Datasource url                                |
| **OPTIONS**   | -t, --http                  | Accepted at http                              |
|               | -p, --port \<port>          | Port to listen on (default:4000)              |
|               | -h, --host \<host>          | Host to listen on (default:localhost)         |
|               | -c, --cert \<path>          | Path to ssl cert file                         |
|               | -k, --key \<path>           | Path to ssl key file                          |
|               | -w, --wasm                  | Use wasm as the run-time engine(early-access) |
|               | -s, --secret \<secret>      | Secret used with API key                      |
|               | -m, --make                  | make api key                                  |
|               | -b, --bodyLimit \<size(MB)> | body limit size(default: 16MB)                |

### CLI

#### Start without setting an API key for local use.

```sh
# Startup by specifying the Datasource url
npx prisma-accelerate-local postgresql://postgres:password@localhost:5432/postgres

# Startup by specifying Port
npx prisma-accelerate-local postgresql://postgres:password@localhost:5432/postgres -p 8000
```

#### When setting the API key

- Create an API key

```sh
npx prisma-accelerate-local -s secret -m postgresql://postgres:password@localhost:5432/postgres

# Output
eyJhbGciOiJIUzI1NiJ9.eyJkYXRhc291cmNlVXJsIjoiYSIsImlhdCI6MTcwMzY2NDg1NywiaXNzIjoicHJpc21hLWFjY2VsZXJhdGUifQ.4ruaA1RAT9cD3PACSEVIdUs3i2exKkMpNYGks3hyos4
```

- Activate with API key enabled.

If secret is used, the DB address is embedded in the API key

```sh
npx prisma-accelerate-local -s secret
```

### Client Environment Variables

#### With regard to the Node.js configuration.

Please set the environment variable NODE_TLS_REJECT_UNAUTHORIZED because you are using an unauthenticated certificate.

#### With regard to api_key

- If you are not using `secret`, the api_key can be any string.
- If you are using `secret`, put `--secret` and the api_key created with `--make` in api_key

#### Example

- .env

```env
DATABASE_URL="prisma://localhost:4000/?api_key=API_KEY"
NODE_TLS_REJECT_UNAUTHORIZED="0"
# To remove the NODE_TLS_REJECT_UNAUTHORIZED warning
NODE_NO_WARNINGS="1"
```

## library

If you call this package as a library, it will look like this.

```ts
import { createServer } from 'prisma-accelerate-local';

const server = createServer({
  datasourceUrl: 'postgresql://postgres:password@localhost:5432/postgres',
})
  .listen({ port: 4000 })
  .then((url) => console.log(`🚀  Server ready at ${url} `));
```

## Cloudflare Workers (PostgreSQL)

https://github.com/SoraKumo001/prisma-accelerate-workers

- package.json

Need `pg-compat` to patch `pg` to fix it.
Use Prisma versions lower than 5.20.0; due to the size of the wasm, it will not work with the free plan.

```json
{
  "name": "prisma-accelerate-workers",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "start": "wrangler dev"
  },
  "dependencies": {
    "@prisma/adapter-pg": "<5.20.0",
    "@prisma/adapter-pg-worker": "<5.20.0",
    "@prisma/client": "<5.20.0",
    "pg": "^8.13.0",
    "prisma-accelerate-local": "^1.1.6"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240925.0",
    "@types/pg": "^8.11.10",
    "pg-compat": "^0.0.7",
    "typescript": "^5.6.2",
    "wrangler": "^3.78.12"
  },
  "resolutions": {
    "@prisma/client": "5.19.1",
    "@prisma/adapter-pg": "5.19.1",
    "@prisma/adapter-pg-worker": "5.19.1"
  }
}
```

- wrangler.toml

Set `nodejs_compat_v2`.

```toml
name = "prisma-accelerate-workers"
main = "src/index.ts"
minify = true
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat_v2"]

[placement]
mode = "smart"

[observability]
enabled = true
```

- src/index.ts

```ts
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { createFetcher } from 'prisma-accelerate-local/workers';
import WASM from '@prisma/client/runtime/query_engine_bg.postgresql.wasm';

export type Env = {
  SECRET: string;
};

export default {
  fetch: createFetcher({
    secret: (env: Env) => env.SECRET,
    queryEngineWasmModule: WASM,
    adapter: (datasourceUrl: string) => {
      const url = new URL(datasourceUrl);
      const schema = url.searchParams.get('schema') ?? undefined;
      const pool = new Pool({
        connectionString: url.toString() ?? undefined,
      });
      return new PrismaPg(pool, {
        schema,
      });
    },
  }),
};
```

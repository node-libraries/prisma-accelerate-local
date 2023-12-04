# prisma-accelerate-local

Prisma Accelerate functionality can be self-hosted locally.

## usage

### CLI Options

| Category      | Option            | Description                      |
| ------------- | ----------------- | -------------------------------- |
| **USAGE**     | [option] _\<url>_ |                                  |
| **ARGUMENTS** | _\<url>_          | Datasource url                   |
| **OPTIONS**   | _-p, --port_      | Port to listen on (default:4000) |
|               | _-c, --cert_      | Path to ssl cert file            |
|               | _-k, --key_       | Path to ssl key file             |
|               | _-a, --apiKey_    | API key for authentication       |

### CLI

```sh
# Startup by specifying the Datasource url
npx prisma-accelerate-local postgresql://postgres:password@localhost:5432/postgres

# Startup by specifying Port
npx prisma-accelerate-local postgresql://postgres:password@localhost:5432/postgres -p 8000
```

### Client Environment Variables

Please set the environment variable NODE_TLS_REJECT_UNAUTHORIZED because you are using an unauthenticated certificate.  
If the "-a" option is not specified at startup, the value of api_key is ignored.

- .env

```env
DATABASE_URL="prisma://localhost:4000/?api_key=abc"
NODE_TLS_REJECT_UNAUTHORIZED="0"
```

- Prisma Accelerate must be configured on the client side.

https://www.prisma.io/docs/data-platform/accelerate/getting-started

## library

If you call this package as a library, it will look like this.

```ts
import { createServer } from 'prisma-accelerate-local';

const server = createServer({
  datasourceUrl: 'postgresql://postgres:password@localhost:5432/postgres',
}.listen({ port:4000 }).then((url) => console.log(`🚀  Server ready at ${url} `));
```

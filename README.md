# prisma-accelerate-local

Prisma Accelerate functions locally on your behalf.

## usage

|               |                   |                                  |
| ------------- | ----------------- | -------------------------------- |
| **USAGE**     | [option] _\<url>_ |                                  |
| **ARGUMENTS** | _\<url>_          | Datasource url                   |
| **OPTIONS**   | _-p, --port_      | Port to listen on (default:4000) |

### CLI

```sh
# Startup by specifying the Datasource url
prisma-accelerate-local postgresql://postgres:password@localhost:5432/postgres

# Startup by specifying Port
prisma-accelerate-local postgresql://postgres:password@localhost:5432/postgres -p 8000
```

### Client Environment Variables

Please set the environment variable NODE_TLS_REJECT_UNAUTHORIZED because you are using an unauthenticated certificate.  
The api_key setting is ignored, but cannot be omitted.

- .env

```env
DATABASE_URL="prisma://localhost:4000/?api_key=abc"
NODE_TLS_REJECT_UNAUTHORIZED="0"
```

## library

```ts
import { createServer } from "prisma-accelerate-local";

const server = createServer({
  datasourceUrl: "postgresql://postgres:password@localhost:5432/postgres",
  port: 4000,
}).then((url) => console.log(`🚀  Server ready at ${url} `));
```

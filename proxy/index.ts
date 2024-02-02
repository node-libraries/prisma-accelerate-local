import zlib from 'zlib';
import fastifyProxy from '@fastify/http-proxy';
import { fastify } from 'fastify';
import { createKey } from '../dist/cjs/index';

const main = async () => {
  const server = fastify({
    https: createKey(),
  });
  const proxyUrl = 'https://accelerate.prisma-data.net';
  const port = Number(process.env.PORT || 8000);
  server
    .register(fastifyProxy, {
      upstream: proxyUrl,
      replyOptions: {
        onResponse(request, reply, res) {
          console.log('\n--- method ---');
          console.log(request.method, request.originalUrl);
          console.log('--- headers ---');
          console.log(request.headers);
          console.log('status', reply.statusCode);
          console.log('--- body ---');
          console.log(request.body);

          const path = request.originalUrl.split('/');
          const isTransaction = path[3] === 'transaction' && path[4] === 'start';

          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          res.on('end', async (chunk: Buffer) => {
            if (chunk) {
              chunks.push(chunk);
            }
            const contentEncoding = reply.getHeader('content-encoding');
            const data = Buffer.concat(chunks);
            const result = (contentEncoding === 'gzip' ? zlib.gunzipSync(data) : data).toString(
              'utf-8'
            );
            console.log('--- response body ---');
            console.log(result);
            if (isTransaction) {
              const value = JSON.parse(result);
              const endpoint = value['data-proxy'].endpoint.replace(
                'accelerate.prisma-data.net',
                `localhost:${port}`
              );
              value['data-proxy'].endpoint = endpoint;
              console.log(JSON.stringify(value));
              reply.send(zlib.gzipSync(JSON.stringify(value)));
            }
          });
          if (!isTransaction) reply.send(res);
        },
      },
    })
    .listen({ port })
    .then(() => console.log(`http://localhost:${port}`));

  server;
};
main();

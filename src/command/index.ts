#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { PrismaAccelerate, createServer } from '../index.js';
import '@colors/colors';

const readPackage = () => {
  try {
    return require(path.resolve(__dirname, '../../../package.json'));
  } catch (e) {}
  return require(path.resolve(__dirname, '../../package.json'));
};

const main = async () => {
  const argv = minimist(process.argv.slice(2), {
    alias: {
      t: 'http',
      p: 'port',
      h: 'host',
      c: 'cert',
      k: 'key',
      a: 'apiKey',
      w: 'wasm',
      s: 'secret',
      m: 'make',
      b: 'bodyLimit',
    },
    boolean: ['wasm', 'make', 'http'],
  });

  const datasourceUrl = argv._[0];
  const http = argv.http;
  const port = argv.p ?? 4000;
  const host = argv.h;
  const cert = argv.c;
  const key = argv.k;
  const wasm = argv.w;
  const secret = argv.s;
  const make = argv.m;
  const bodyLimit = argv.b ?? '16';

  if ((!datasourceUrl && !secret) || (make && !secret)) {
    const pkg = readPackage();
    console.log(`${pkg.name} ${pkg.version}\n`.blue);
    console.log('USAGE'.bold);
    console.log('\tcommand <path>');
    console.log('ARGUMENTS'.bold);
    console.log(`\t<url> Datasource Url`);
    console.log('OPTIONS'.bold);
    console.log(`\t-t, --http Accepted at http`);
    console.log(`\t-p, --port <port> Port to listen on`);
    console.log(`\t-p, --host <host> Host to listen on`);
    console.log(`\t-c, --cert <path> Path to ssl cert file`);
    console.log(`\t-k, --key <path> Path to ssl key file`);
    console.log(`\t-w, --wasm Use wasm as the run-time engine`);
    console.log(`\t-s, --secret <secret>`);
    console.log(`\t-m, --make make api key`);
    console.log(`\t-b, --bodyLimit <size(MB)> body limit size(default: 16MB)`);
  } else {
    if (secret && make) {
      const token = await PrismaAccelerate.createApiKey({ datasourceUrl, secret });
      console.log(token);
      return;
    }

    const https =
      cert && key
        ? {
            cert: fs.readFileSync(cert).toString('utf8'),
            key: fs.readFileSync(key).toString('utf8'),
          }
        : undefined;

    createServer({
      datasourceUrl,
      https: http ? null : https,
      wasm,
      secret,
      fastifySeverOptions: { bodyLimit: Number(bodyLimit) * 1024 * 1024 },
    })
      .listen({ port, host })
      .then((url) => console.log(`🚀  Server ready at ${url} `));
  }
};

main();

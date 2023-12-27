#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { PrismaAccelerate, createServer } from '..';
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
      p: 'port',
      c: 'cert',
      k: 'key',
      a: 'apiKey',
      w: 'wasm',
      s: 'secret',
      m: 'make',
    },
    boolean: ['wasm', 'make'],
  });

  const datasourceUrl = argv._[0];
  const port = argv.p ?? 4000;
  const cert = argv.c;
  const key = argv.k;
  const wasm = argv.w;
  const secret = argv.s;
  const make = argv.m;

  if (!datasourceUrl && secret && make) {
    const pkg = readPackage();
    console.log(`${pkg.name} ${pkg.version}\n`.blue);
    console.log('USAGE'.bold);
    console.log('\tcommand <path>');
    console.log('ARGUMENTS'.bold);
    console.log(`\t<url> Datasource Url`);
    console.log('OPTIONS'.bold);
    console.log(`\t-p, --port <port> Port to listen on`);
    console.log(`\t-c, --cert <path> Path to ssl cert file`);
    console.log(`\t-k, --key <path> Path to ssl key file`);
    console.log(`\t-w, --wasm Use wasm as the run-time engine`);
    console.log(`\t-s, --secret <secret>`);
    console.log(`\t-m, --make make api key`);
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
    createServer({ datasourceUrl, https, wasm, secret })
      .listen({ port })
      .then((url) => console.log(`🚀  Server ready at ${url} `));
  }
};

main();

#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { createServer } from '..';
import '@colors/colors';

const readPackage = () => {
  try {
    return require(path.resolve(__dirname, '../../../package.json'));
  } catch (e) {}
  return require(path.resolve(__dirname, '../../package.json'));
};

const main = async () => {
  const argv = minimist(process.argv.slice(2));

  if (!argv._.length) {
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
    console.log(`\t-a, --apiKey <key> API key for authentication`);
  } else {
    const datasourceUrl = argv._[0];
    const port = argv.p ?? argv.port ?? 4000;
    const cert = argv.c ?? argv.cert;
    const key = argv.k ?? argv.key;
    const apiKey = argv.a ?? argv.apiKey;

    const https =
      cert && key
        ? {
            cert: fs.readFileSync(cert).toString('utf8'),
            key: fs.readFileSync(key).toString('utf8'),
          }
        : undefined;
    createServer({ datasourceUrl, port, https, apiKey }).then((url) =>
      console.log(`🚀  Server ready at ${url} `)
    );
  }
};

main();

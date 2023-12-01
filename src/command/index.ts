#!/usr/bin/env node
import path from "path";
import minimist from "minimist";
import "@colors/colors";
import { createServer } from "..";

const readPackage = () => {
  try {
    return require(path.resolve(__dirname, "../../../package.json"));
  } catch (e) {}
  return require(path.resolve(__dirname, "../../package.json"));
};

const main = async () => {
  const argv = minimist(process.argv.slice(2));

  if (!argv._.length) {
    const pkg = readPackage();
    console.log(`${pkg.name} ${pkg.version}\n`.blue);
    console.log("USAGE".bold);
    console.log("\tcommand <path>");
    console.log("ARGUMENTS".bold);
    console.log(`\t<url> Datasource Url`);
    console.log("OPTIONS".bold);
    console.log(`\t-p, --port <port> Port to listen on`);
  } else {
    const datasourceUrl = argv._[0];
    const port = argv.p ?? argv.port ?? 4000;
    createServer({ datasourceUrl, port }).then((url) =>
      console.log(`🚀  Server ready at ${url} `)
    );
  }
};

main();

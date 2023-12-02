import { getPrismaClient } from "@prisma/client/runtime/library";
import { download } from "@prisma/fetch-engine";
import { fastify } from "fastify";
import forge from "node-forge";
import fs from "fs";
import path from "path";

const createKey = () => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter.setFullYear(now.getFullYear() + 1);

  const attrs = [
    {
      name: "commonName",
      value: "example.com",
    },
    {
      name: "countryName",
      value: "EXAMPLE",
    },
    {
      shortName: "ST",
      value: "Example State",
    },
    {
      name: "localityName",
      value: "Example Locality",
    },
    {
      name: "organizationName",
      value: "Example Org",
    },
    {
      shortName: "OU",
      value: "Example Org Unit",
    },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.sign(keys.privateKey);
  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };
};

const BaseConfig = {
  runtimeDataModel: { models: {}, enums: {}, types: {} },
  relativeEnvPaths: {
    rootEnvPath: "",
    schemaEnvPath: "",
  },
  relativePath: "",
  datasourceNames: ["db"],
  inlineSchema: "",
  dirname: "",
  clientVersion: "",
  engineVersion: "",
  activeProvider: "",
  inlineDatasources: {},
  inlineSchemaHash: "",
};

const getEngineVersion = async (version: string) => {
  const versions = await fetch(
    "https://registry.npmjs.org/@prisma%2Fengines-version"
  )
    .then((v) => v.json())
    .then(({ versions }) =>
      Object.keys(versions).sort((a, b) => (a === b ? 0 : a > b ? -1 : 1))
    );
  return versions.find((v) => v.startsWith(version))?.slice(-40);
};

export const createServer = async ({
  port,
  datasourceUrl,
}: {
  port: number;
  datasourceUrl: string;
}) => {
  const prismaMap: {
    [key: string]: InstanceType<ReturnType<typeof getPrismaClient>>;
  } = {};

  return fastify({ https: createKey() })
    .post("/:version/:hash/graphql", async (request, reply) => {
      const { version, hash } = request.params as {
        version: string;
        hash: string;
      };
      const prisma = prismaMap[`${version}-${hash}`];
      if (!prisma) {
        reply
          .status(404)
          .send({ EngineNotStarted: { reason: "SchemaMissing" } });
        return;
      }
      const query = JSON.parse(request.body as string);
      const result = await prisma._engine
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
      return result;
    })
    .put("/:version/:hash/schema", async (request, reply) => {
      const { version, hash } = request.params as {
        version: string;
        hash: string;
      };
      const engineVersion = await getEngineVersion(version);
      if (!engineVersion) {
        reply
          .status(404)
          .send({ EngineNotStarted: { reason: "VersionMissing" } });
        return;
      }
      const inlineSchema = request.body as string;
      const dirname = path.resolve(
        __dirname,
        "../../node_modules/.prisma/client",
        engineVersion
      );
      fs.mkdirSync(dirname, { recursive: true });
      const engine = await download({
        binaries: {
          "libquery-engine": dirname,
        },
        version: engineVersion,
      }).catch(() => undefined);
      if (!engine) {
        reply
          .status(404)
          .send({ EngineNotStarted: { reason: "EngineMissing" } });
        return;
      }
      const PrismaClient = getPrismaClient({
        ...BaseConfig,
        inlineSchema,
        dirname,
        engineVersion,
      });
      const prisma = new PrismaClient({ datasourceUrl });
      prismaMap[`${version}-${hash}`] = prisma;
      return { success: true };
    })
    .listen({ port });
};

import { getPrismaClient } from "@prisma/client/runtime/library";
import { enginesVersion } from "@prisma/engines";
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
      value: "example.org",
    },
    {
      name: "countryName",
      value: "JP",
    },
    {
      shortName: "ST",
      value: "Tokyo",
    },
    {
      name: "localityName",
      value: "Chiyoda-ku",
    },
    {
      name: "organizationName",
      value: "Test",
    },
    {
      shortName: "OU",
      value: "Test",
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
  engineVersion: enginesVersion,
  activeProvider: "",
  inlineDatasources: {},
  inlineSchemaHash: "",
};

export const createServer = ({
  port,
  datasourceUrl,
}: {
  port: number;
  datasourceUrl: string;
}) => {
  const prismaMap: {
    [key: string]: InstanceType<ReturnType<typeof getPrismaClient>>;
  } = {};
  const targetPath = path.resolve(
    __dirname,
    "../../node_modules/.prisma/client"
  );
  fs.mkdirSync(targetPath, { recursive: true });
  download({
    binaries: {
      "libquery-engine": "./node_modules/.prisma/client",
    },
    version: enginesVersion,
  });

  return fastify({ https: createKey() })
    .post("/:version/:hash/*", async (request, reply) => {
      const { hash } = request.params as { version: string; hash: string };
      const prisma = prismaMap[hash];
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
      return JSON.stringify(result);
    })
    .put("/:version/:hash/*", async (request) => {
      const { hash } = request.params as { version: string; hash: string };
      const inlineSchema = request.body as string;
      const PrismaClient = getPrismaClient({ ...BaseConfig, inlineSchema });
      const prisma = new PrismaClient({ datasourceUrl });
      prismaMap[hash] = prisma;
    })
    .listen({ port });
};

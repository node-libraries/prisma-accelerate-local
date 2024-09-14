import { PrismaClient } from '@prisma/client/edge';
import { beforeAllAsync } from 'jest-async';
import { createServer } from '../../src';

const port = 8002;

describe('transaction test', () => {
  const property = beforeAllAsync(async () => {
    let schema: string | undefined = undefined;
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
      singleInstance: true,
      onChangeSchema: async ({ inlineSchema, engineVersion, hash, datasourceUrl }) => {
        schema = inlineSchema;
      },
      onRequestSchema: async ({ engineVersion, hash, datasourceUrl }) => {
        return schema;
      },
    });
    server.listen({ port });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=${process.env.API_KEY}`,
    });
    return { server, prisma };
  });

  afterAll(async () => {
    const { prisma, server } = await property;
    prisma.$disconnect();
    server.close();
  });

  it('createMany', async () => {
    const { prisma } = await property;
    await prisma.post.deleteMany();
    const result = await prisma.post.createMany({
      data: [
        { title: 'test1', content: 'test1@example.com' },
        { title: 'test2', content: 'test2@example.com' },
        { title: 'test3', content: 'test3@example.com' },
      ],
    });

    expect(result.count).toEqual(3);
  });

  it('batch', async () => {
    const { prisma } = await property;
    await prisma.post.deleteMany();
    const result = await prisma.$transaction([
      prisma.post.create({ data: { title: 'test1', content: 'test1@example.com' } }),
      prisma.post.create({ data: { title: 'test2', content: 'test2@example.com' } }),
    ]);
    expect(result.length).toEqual(2);
  });
});

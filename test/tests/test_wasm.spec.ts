import { PrismaClient } from '@prisma/client/edge';
import { beforeAllAsync } from 'jest-async';
import { createServer } from '../../src';

const port = 8004;

describe('insert', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
      wasm: true,
    });
    server.listen({ port });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=${process.env.API_KEY}`,
    });
    return { server, prisma };
  });

  afterAll(async () => {
    const { prisma, server } = await property;
    await prisma.$disconnect();
    await server.close();
  });

  it('insert', async () => {
    const { prisma } = await property;
    await prisma.category.deleteMany();
    const result = await Promise.all([
      prisma.category.create({ data: { name: 'test1' } }),
      prisma.category.create({ data: { name: 'test2' } }),
      prisma.category.create({ data: { name: 'test3' } }),
    ]);
    expect(result.length).toEqual(3);
  });
});

describe('query error', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
      wasm: true,
    });
    server.listen({ port });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=${process.env.API_KEY}`,
    });
    return { server, prisma };
  });

  afterAll(async () => {
    const { prisma, server } = await property;
    await prisma.$disconnect();
    await server.close();
  });

  it('findFirstOrThrow', async () => {
    const { prisma } = await property;
    const result = prisma.category.findFirstOrThrow({ where: { id: '' } });
    await expect(result).rejects.toThrow();
  });

  it('batch', async () => {
    const { prisma } = await property;
    await prisma.category.deleteMany();
    const result = prisma.$transaction([
      prisma.category.create({ data: { name: 'test1' } }),
      prisma.category.create({ data: { name: 'test2' } }),
      prisma.category.create({ data: { name: 'test2' } }),
    ]);
    // Different wasm .
    // expect((await result).length).toEqual(3);
    await expect(result).rejects.toThrow();
  });

  it('transaction', async () => {
    const { prisma } = await property;
    await prisma.category.deleteMany();
    const result = prisma.$transaction(async (prisma) => {
      return [
        prisma.category.create({ data: { name: 'test1' } }),
        prisma.category.create({ data: { name: 'test2' } }),
        prisma.category.create({ data: { name: 'test2' } }),
      ];
    });
    // Different wasm .
    expect((await result).length).toEqual(3);
    // await expect(result).rejects.toThrow();
  });
});

describe('api_key', () => {
  const apiKey = process.env.API_KEY;

  const property = beforeAllAsync(async () => {
    const server = createServer({
      secret: 'abc',
      wasm: true,
    });
    server.listen({ port });
    return { server };
  });

  afterAll(async () => {
    const { server } = await property;
    server.close();
  });

  it('success', async () => {
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=${apiKey}`,
    });
    const result = await prisma.user.findMany();
    expect(Array.isArray(result)).toBeTruthy();
    prisma.$disconnect();
  });

  it('error', async () => {
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=test`,
    });
    const result = prisma.user.findMany();
    await expect(result).rejects.toThrow();
    prisma.$disconnect();
  });
});

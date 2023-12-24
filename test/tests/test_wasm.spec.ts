import { PrismaClient } from '@prisma/client/edge';
import { beforeAllAsync } from 'jest-async';
import { createServer } from '../../src';

const port = 8004;

describe('insert', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
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
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
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
  const property = beforeAllAsync(async () => {
    const server = createServer({
      apiKey: 'ABC',
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
      wasm: true,
    });
    server.listen({ port });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=abc`,
    });
    return { prisma, server };
  });

  afterAll(async () => {
    const { server, prisma } = await property;
    await server.close();
    await prisma.$disconnect();
  });

  it('success', async () => {
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=ABC`,
    });
    const result = await prisma.category.findMany();
    expect(Array.isArray(result)).toBeTruthy();
    prisma.$disconnect();
  });

  it('query error', async () => {
    const { prisma } = await property;
    const result = prisma.category.findMany();
    await expect(result).rejects.toThrow();
  });
  it('transaction error', async () => {
    const { prisma } = await property;
    const result = prisma.$transaction(async (prisma) => {
      return [
        prisma.category.create({ data: { name: 'test1' } }),
        prisma.category.create({ data: { name: 'test2' } }),
        prisma.category.create({ data: { name: 'test3' } }),
      ];
    });
    await expect(result).rejects.toThrow();
  });
});

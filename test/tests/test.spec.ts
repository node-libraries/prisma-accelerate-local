import { PrismaClient } from '@prisma/client/edge';
import { beforeAllAsync } from 'jest-async';
import { createServer } from '../../src';

const port = 8000;

describe('insert', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
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

  it('insert', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = await Promise.all([
      prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
      prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
      prisma.user.create({ data: { name: 'test3', email: 'test3@example.com' } }),
    ]);
    expect(result.length).toEqual(3);
  });
});

describe('bodyLimit', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
      fastifySeverOptions: { bodyLimit: 1 * 1024 * 1024 },
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

  it('insert', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = await Promise.all([
      prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
      prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
      prisma.user.create({ data: { name: 'test3', email: 'test3@example.com' } }),
    ]);
    expect(result.length).toEqual(3);
  });
});

describe('bodyLimit error', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
      fastifySeverOptions: { bodyLimit: 1 },
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

  it('limit error', async () => {
    const { prisma } = await property;
    const result = prisma.user.deleteMany();
    await expect(result).rejects.toThrow();
  });
});

describe('query error', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
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

  it('findFirstOrThrow', async () => {
    const { prisma } = await property;
    const result = prisma.user.findFirstOrThrow({ where: { id: '' } });
    await expect(result).rejects.toThrow();
  });

  it('batch', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = prisma.$transaction([
      prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
      prisma.user.create({ data: { name: 'test2', email: 'test1@example.com' } }),
      prisma.user.create({ data: { name: 'test2', email: 'test1@example.com' } }),
    ]);
    await expect(result).rejects.toThrow();
  });

  it('transaction', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = prisma.$transaction(async (prisma) => {
      return [
        await prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
        await prisma.user.create({ data: { name: 'test2', email: 'test1@example.com' } }),
        await prisma.user.create({ data: { name: 'test2', email: 'test1@example.com' } }),
      ];
    });
    await expect(result).rejects.toThrow();
  });
});

describe('api_key', () => {
  const apiKey = process.env.API_KEY;
  const property = beforeAllAsync(async () => {
    const server = createServer({
      secret: 'abc',
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

describe('engine error', () => {
  const originalFetch = global.fetch;
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: process.env.DATABASE_URL,
    });
    server.listen({ port });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=abc`,
    });
    const engineVersion = { value: '' };

    const mockFetch = jest.fn();
    global.fetch = mockFetch;
    mockFetch.mockImplementation((url, options) => {
      options.headers['Prisma-Engine-Hash'] = engineVersion.value;
      return originalFetch(url, options);
    });

    return { prisma, server, engineVersion };
  });

  afterAll(async () => {
    const { server, prisma } = await property;
    server.close();
    prisma.$disconnect();
    global.fetch = originalFetch;
  });

  it('query error', async () => {
    const { prisma } = await property;
    const result = prisma.user.findMany();
    await expect(result).rejects.toThrow();
  });
  it('query error2', async () => {
    const { prisma, engineVersion } = await property;
    engineVersion.value = 'test';
    const result = prisma.user.findMany();
    await expect(result).rejects.toThrow();
  });
  it('transaction error', async () => {
    const { prisma } = await property;
    const result = prisma.$transaction(async (prisma) => {
      return [
        await prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
        await prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
      ];
    });
    await expect(result).rejects.toThrow();
  });
});

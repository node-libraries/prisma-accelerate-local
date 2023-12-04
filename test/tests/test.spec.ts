import { PrismaClient } from '@prisma/client/edge';
import { beforeAllAsync } from 'jest-async';
import { createServer } from '../../src';

describe('query error', () => {
  const port = 8002;
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
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

describe('transaction test', () => {
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
    });
    server.listen({ port: 8000 });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:8000/?api_key=${process.env.API_KEY}`,
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
    await prisma.user.deleteMany();
    const result = await prisma.user.createMany({
      data: [
        { name: 'test1', email: 'test1@example.com' },
        { name: 'test2', email: 'test2@example.com' },
        { name: 'test3', email: 'test3@example.com' },
      ],
    });

    expect(result.count).toEqual(3);
  });

  it('batch', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = await prisma.$transaction([
      prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
      prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
    ]);
    expect(result.length).toEqual(2);
  });

  it('transaction', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = await prisma.$transaction(async (prisma) => {
      return [
        await prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
        await prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
      ];
    });
    expect(result.length).toEqual(2);
  });
});

describe('api_key', () => {
  const port = 8001;
  const property = beforeAllAsync(async () => {
    const server = createServer({
      apiKey: 'ABC',
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
    });
    server.listen({ port });
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=abc`,
    });
    return { prisma, server };
  });

  afterAll(async () => {
    const { server, prisma } = await property;
    server.close();
    prisma.$disconnect();
  });

  it('success', async () => {
    const prisma = new PrismaClient({
      datasourceUrl: `prisma://localhost:${port}/?api_key=ABC`,
    });
    const result = await prisma.user.findMany();
    expect(Array.isArray(result)).toBeTruthy();
    prisma.$disconnect();
  });

  it('query error', async () => {
    const { prisma } = await property;
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

describe('engine error', () => {
  const originalFetch = global.fetch;
  const port = 8004;
  const property = beforeAllAsync(async () => {
    const server = createServer({
      datasourceUrl: 'postgresql://postgres:password@localhost:25432/postgres?schema=test',
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
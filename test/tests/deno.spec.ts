import { PrismaClient } from '@prisma/client/edge';
import { beforeAllAsync } from 'jest-async';

describe('insert', () => {
  const property = beforeAllAsync(async () => {
    const prisma = new PrismaClient({
      datasourceUrl: `${process.env.DENO}/?api_key=${process.env.DENO_API_KEY}`,
    });
    return { prisma };
  });

  afterAll(async () => {
    const { prisma } = await property;
    prisma.$disconnect();
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
  it('batch', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = await prisma.$transaction([
      prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
      prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
      prisma.user.create({ data: { name: 'test3', email: 'test3@example.com' } }),
    ]);
    expect(result.length).toEqual(3);
  });

  it('transaction', async () => {
    const { prisma } = await property;
    await prisma.user.deleteMany();
    const result = await prisma.$transaction(async (prisma) => {
      return [
        prisma.user.create({ data: { name: 'test1', email: 'test1@example.com' } }),
        prisma.user.create({ data: { name: 'test2', email: 'test2@example.com' } }),
        prisma.user.create({ data: { name: 'test3', email: 'test3@example.com' } }),
      ];
    });
    expect(result.length).toEqual(3);
  });
});

/**
 * Prisma Client singleton
 *
 * Next.js hot-reload in development creates a new PrismaClient on every change,
 * which exhausts the database connection pool. The global cache pattern keeps
 * one client across reloads.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

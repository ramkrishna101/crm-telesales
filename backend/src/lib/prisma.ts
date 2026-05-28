import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  prismaKeepalive: ReturnType<typeof setInterval> | undefined;
};

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;

  // Ping every 4 minutes to prevent Railway's idle-connection timeout (5 min)
  if (!globalForPrisma.prismaKeepalive) {
    globalForPrisma.prismaKeepalive = setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        // Ignore keepalive failures — Prisma will reconnect on next real query
      }
    }, 4 * 60 * 1000);
  }
}

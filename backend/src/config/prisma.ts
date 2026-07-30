import { PrismaClient } from '@prisma/client';

/*
 * Query logging is opt-in via PRISMA_LOG_QUERIES=1.
 *
 * It used to be on for the whole of development, which printed the full SQL of every call —
 * including the catalogue reads that return thousands of rows. Writing that to the console is
 * slow enough to be felt on each request, and it buries the lines worth reading.
 */
const logQueries = process.env.PRISMA_LOG_QUERIES === '1' || process.env.PRISMA_LOG_QUERIES === 'true';

export const prisma = new PrismaClient({
  log: logQueries ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
});

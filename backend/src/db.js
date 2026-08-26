const { PrismaClient } = require('@prisma/client');

// Instantiate global Prisma client singleton
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Load .env manually (same as fresh-import.ts)
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContents = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[key]) process.env[key] = val;
  }
}

const dbUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function count() {
  console.log('📊 DB Record Counts:');
  console.log('---');
  console.log('Party:         ', await prisma.party.count());
  console.log('Product:       ', await prisma.product.count());
  console.log('InventoryBatch:', await prisma.inventoryBatch.count());
  console.log('PurchaseBill:  ', await prisma.purchaseBill.count());
  console.log('SalesBill:     ', await prisma.salesBill.count());
  console.log('Customer:      ', await prisma.customer.count());
  console.log('---');
  await prisma.$disconnect();
}

count();

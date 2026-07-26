import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function verifyAllTables() {
  const [parties, products, purchaseBills, purchaseItems, inventoryBatches, salesBills, salesItems, ledgerEntries] = await Promise.all([
    prisma.party.count(),
    prisma.product.count(),
    prisma.purchaseBill.count(),
    prisma.purchaseBillItem.count(),
    prisma.inventoryBatch.count(),
    prisma.salesBill.count(),
    prisma.salesBillItem.count(),
    prisma.ledgerEntry.count(),
  ]);

  console.log('\n📊 FINAL SUPABASE DATABASE ROW COUNTS:');
  console.log(`  🏢 Parties:          ${parties}`);
  console.log(`  💊 Products:         ${products}`);
  console.log(`  🧾 Purchase Bills:   ${purchaseBills}`);
  console.log(`  📦 Purchase Items:   ${purchaseItems}`);
  console.log(`  🏷️  InventoryBatches: ${inventoryBatches}`);
  console.log(`  🛒 Sales Bills:      ${salesBills}`);
  console.log(`  🛍️  Sales Items:      ${salesItems}`);
  console.log(`  📒 Ledger Entries:   ${ledgerEntries}`);

  await prisma.$disconnect();
}

verifyAllTables();

/**
 * Compare two databases row for row and rupee for rupee.
 *
 * Run this after copying the data to a new region and before pointing the app at it. A restore
 * that "looked fine" but silently dropped a table is the failure mode that matters here, and row
 * counts alone will not catch a truncated numeric column — so the money is totalled too.
 *
 *   OLD_DATABASE_URL="…" NEW_DATABASE_URL="…" npx ts-node src/scripts/compare-databases.ts
 *
 * Exits non-zero if anything differs, so it can gate the switch-over.
 */
import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

// Defaults to the same pair migrate-region.ts uses: the live connection in .env and the
// candidate in .env.new, so the check needs no arguments right after a copy.
const BACKEND_DIR = path.resolve(__dirname, '../..');
const source = dotenv.config({ path: path.join(BACKEND_DIR, '.env') }).parsed || {};
const target = dotenv.config({ path: path.join(BACKEND_DIR, '.env.new') }).parsed || {};

const OLD = process.env.OLD_DATABASE_URL || source.DATABASE_URL;
const NEW = process.env.NEW_DATABASE_URL || target.NEW_DATABASE_URL;

if (!OLD || !NEW) {
  console.error('Set OLD_DATABASE_URL and NEW_DATABASE_URL (or fill backend/.env and backend/.env.new).');
  process.exit(1);
}

const client = (url: string) => new PrismaClient({ datasources: { db: { url } } });

/*
 * Deliberately sequential. Firing all sixteen at once was enough to make a freshly created
 * Supabase pooler refuse connections outright (P1001), which reads as "the copy failed" when the
 * data was in fact fine. This runs in a couple of seconds either way.
 */
async function snapshot(db: PrismaClient) {
  const users = await db.user.count();
  const products = await db.product.count();
  const parties = await db.party.count();
  const customers = await db.customer.count();
  const batches = await db.inventoryBatch.count();
  const purchaseBills = await db.purchaseBill.count();
  const purchaseItems = await db.purchaseBillItem.count();
  const salesBills = await db.salesBill.count();
  const salesItems = await db.salesBillItem.count();
  const ledger = await db.ledgerEntry.count();
  const salesReturns = await db.salesReturn.count();
  const purchaseReturns = await db.purchaseReturn.count();
  const adjustments = await db.stockAdjustment.count();
  const salesMoney = await db.salesBill.aggregate({ _sum: { grandTotal: true, taxTotal: true } });
  const purchaseMoney = await db.purchaseBill.aggregate({ _sum: { grandTotal: true, taxTotal: true } });
  const stock = await db.inventoryBatch.aggregate({ _sum: { quantity: true } });

  const round = (n: number | null) => Math.round((n || 0) * 100) / 100;

  return {
    users, products, parties, customers, batches,
    purchaseBills, purchaseItems, salesBills, salesItems,
    ledger, salesReturns, purchaseReturns, adjustments,
    salesGrandTotal: round(salesMoney._sum.grandTotal),
    salesTaxTotal: round(salesMoney._sum.taxTotal),
    purchaseGrandTotal: round(purchaseMoney._sum.grandTotal),
    purchaseTaxTotal: round(purchaseMoney._sum.taxTotal),
    stockOnHand: round(stock._sum.quantity),
  };
}

async function main() {
  const oldDb = client(OLD!);
  const newDb = client(NEW!);

  const before = await snapshot(oldDb);
  const after = await snapshot(newDb);

  let mismatches = 0;
  console.log('metric'.padEnd(22) + 'old'.padStart(14) + 'new'.padStart(14) + '   ');
  console.log('-'.repeat(56));
  for (const key of Object.keys(before) as (keyof typeof before)[]) {
    const a = before[key];
    const b = after[key];
    const same = a === b;
    if (!same) mismatches++;
    console.log(
      key.padEnd(22) + String(a).padStart(14) + String(b).padStart(14) + (same ? '   ok' : '   MISMATCH')
    );
  }

  await Promise.all([oldDb.$disconnect(), newDb.$disconnect()]);

  if (mismatches > 0) {
    console.error(`\n${mismatches} mismatch(es). Do NOT switch the app over.`);
    process.exit(1);
  }
  console.log('\nIdentical. Safe to switch DATABASE_URL / DIRECT_URL.');
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

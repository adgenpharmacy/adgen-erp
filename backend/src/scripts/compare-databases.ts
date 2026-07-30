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

const OLD = process.env.OLD_DATABASE_URL;
const NEW = process.env.NEW_DATABASE_URL;

if (!OLD || !NEW) {
  console.error('Set OLD_DATABASE_URL and NEW_DATABASE_URL.');
  process.exit(1);
}

const client = (url: string) => new PrismaClient({ datasources: { db: { url } } });

async function snapshot(db: PrismaClient) {
  const [
    users, products, parties, customers, batches,
    purchaseBills, purchaseItems, salesBills, salesItems,
    ledger, salesReturns, purchaseReturns, adjustments,
    salesMoney, purchaseMoney, stock,
  ] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.party.count(),
    db.customer.count(),
    db.inventoryBatch.count(),
    db.purchaseBill.count(),
    db.purchaseBillItem.count(),
    db.salesBill.count(),
    db.salesBillItem.count(),
    db.ledgerEntry.count(),
    db.salesReturn.count(),
    db.purchaseReturn.count(),
    db.stockAdjustment.count(),
    db.salesBill.aggregate({ _sum: { grandTotal: true, taxTotal: true } }),
    db.purchaseBill.aggregate({ _sum: { grandTotal: true, taxTotal: true } }),
    db.inventoryBatch.aggregate({ _sum: { quantity: true } }),
  ]);

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

  const [before, after] = await Promise.all([snapshot(oldDb), snapshot(newDb)]);

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

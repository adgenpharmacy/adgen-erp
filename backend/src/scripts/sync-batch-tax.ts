/**
 * Stamp every inventory batch with the GST rate its supplier bill carried.
 *
 * Sales read the rate off the batch (see batchTaxRate in routes/sales.routes.ts) so that output
 * tax on a medicine is the same rate as the input tax claimed for the same goods. Batches that
 * existed before that column did are still at 0, which would make them fall back to the
 * product's configured rate; this fills them in from the purchase line that created them.
 *
 * Idempotent: it recomputes the rate from the purchase bill every run and writes an absolute
 * value, so running it twice changes nothing. Safe to re-run after any purchase edit.
 *
 *   npx ts-node src/scripts/sync-batch-tax.ts          # report only
 *   npx ts-node src/scripts/sync-batch-tax.ts --apply  # write
 */
import { prisma } from '../config/prisma';

const APPLY = process.argv.includes('--apply');

async function main() {
  const batches = await prisma.inventoryBatch.findMany({
    select: { id: true, productId: true, batchNumber: true, taxPercent: true, purchaseBillId: true },
  });

  const purchaseLines = await prisma.purchaseBillItem.findMany({
    select: { purchaseBillId: true, productId: true, batchNumber: true, taxPercent: true },
  });

  // Keyed by the bill that brought the stock in, then by product + batch label.
  const byBillProductBatch = new Map<string, number>();
  const byProductBatch = new Map<string, number>();
  const key = (...parts: (string | null | undefined)[]) =>
    parts.map((p) => (p || '').trim().toUpperCase()).join('|');

  for (const line of purchaseLines) {
    byBillProductBatch.set(key(line.purchaseBillId, line.productId, line.batchNumber), line.taxPercent);
    // Fallback for batches whose purchaseBillId was lost: same product + batch label anywhere.
    const pk = key(line.productId, line.batchNumber);
    if (!byProductBatch.has(pk) || line.taxPercent > 0) byProductBatch.set(pk, line.taxPercent);
  }

  let matched = 0;
  let changed = 0;
  let unmatched = 0;
  const updates: { id: string; taxPercent: number }[] = [];

  for (const b of batches) {
    const fromOwnBill = b.purchaseBillId
      ? byBillProductBatch.get(key(b.purchaseBillId, b.productId, b.batchNumber))
      : undefined;
    const rate = fromOwnBill ?? byProductBatch.get(key(b.productId, b.batchNumber));

    if (rate === undefined) {
      unmatched++;
      continue;
    }
    matched++;
    if (rate !== b.taxPercent) {
      changed++;
      updates.push({ id: b.id, taxPercent: rate });
    }
  }

  console.log(`batches:            ${batches.length}`);
  console.log(`matched to purchase:${matched}`);
  console.log(`no purchase line:   ${unmatched} (these fall back to the product's GST rate)`);
  console.log(`need updating:      ${changed}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    await prisma.$disconnect();
    return;
  }

  // One statement per distinct rate rather than per batch: same result, a fraction of the
  // round trips against a remote database.
  const byRate = new Map<number, string[]>();
  for (const u of updates) {
    const list = byRate.get(u.taxPercent);
    if (list) list.push(u.id);
    else byRate.set(u.taxPercent, [u.id]);
  }

  for (const [rate, ids] of byRate) {
    const res = await prisma.inventoryBatch.updateMany({
      where: { id: { in: ids } },
      data: { taxPercent: rate },
    });
    console.log(`  set ${rate}% on ${res.count} batches`);
  }

  const spread = await prisma.inventoryBatch.groupBy({ by: ['taxPercent'], _count: { id: true } });
  console.log('\nfinal batch rates:', spread.map((r) => `${r.taxPercent}% x${r._count.id}`).join(', '));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

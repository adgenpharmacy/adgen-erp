/**
 * Rebuilds stock on hand from the documents that are supposed to define it.
 *
 *   npx ts-node src/scripts/rebuild-inventory.ts            # dry run
 *   npx ts-node src/scripts/rebuild-inventory.ts --apply    # writes
 *
 *     batch quantity = purchases received - sales sold + manual adjustments
 *
 * The legacy Firebase app maintained its stock collection separately from its bills, and the
 * two stopped agreeing: 95 products ended up holding an exact 2x, 3x or 4x multiple of what
 * their purchase bills delivered, because the stock write ran more than once. Since the shop
 * was physically counted and purchase bills were raised from that count, the bills are the
 * truth and stock is rebuilt to match them.
 *
 * Every change is recorded as a StockAdjustment row carrying the before, the after and a
 * reason, so nothing is silently overwritten and the whole run can be explained or reversed.
 *
 * Quantities stay fractional throughout. Purchase lines are routinely written as 0.5 or 1.05
 * packs, and 0.5 must remain 0.5 rather than being rounded to a whole pack. Values are
 * rounded to 3 decimals only to remove floating-point dust such as 1.05 * 20 = 21.000000000004.
 */
import { PrismaClient, AdjustmentSource, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const envPath = path.join(__dirname, '../../.env');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const APPLY = process.argv.includes('--apply');

const money = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Keeps fractions intact; only clears binary floating-point noise. */
const round = (n: number) => Math.round(n * 1000) / 1000;
const bn = (s: string | null | undefined) => (s || '').trim().toUpperCase();
const ym = (d: Date) => d.toISOString().slice(0, 7);

async function main() {
  const batches = await prisma.inventoryBatch.findMany({
    select: {
      id: true,
      productId: true,
      batchNumber: true,
      expiryDate: true,
      quantity: true,
      purchaseRate: true,
      mrp: true,
      product: { select: { name: true, packSize: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });

  const purchaseLines = await prisma.purchaseBillItem.findMany({
    select: { productId: true, batchNumber: true, expiryDate: true, quantity: true, freeQuantity: true },
  });

  const soldRows = await prisma.salesBillItem.groupBy({ by: ['batchId'], _sum: { quantity: true } });
  const soldByBatch = new Map(soldRows.map((r) => [r.batchId, r._sum.quantity || 0]));

  // Manual corrections must survive the rebuild, otherwise every physical count would be
  // undone the next time this runs. Reconciliation rows are excluded: they describe this
  // process itself, and feeding them back in would compound on each pass.
  const priorAdjustments = await prisma.stockAdjustment.groupBy({
    by: ['batchId'],
    where: { source: { not: AdjustmentSource.RECONCILIATION } },
    _sum: { quantityDelta: true },
  });
  const adjustByBatch = new Map(priorAdjustments.map((r) => [r.batchId, r._sum.quantityDelta || 0]));

  const packOf = new Map<string, number>();
  batches.forEach((b) => packOf.set(b.productId, b.product.packSize > 0 ? b.product.packSize : 1));

  /*
   * Keyed on product + batch number + expiry month.
   *
   * Batch number alone is not unique: 41 rows share one with a different expiry, and giving
   * each of them the full received quantity would re-inflate exactly the stock this script
   * exists to correct. Including the expiry month cuts that to 12 genuine duplicates, handled
   * by allocating the whole quantity to one row and emptying its twins.
   */
  const keyOf = (productId: string, batchNumber: string | null, expiry: Date) =>
    `${productId}|${bn(batchNumber)}|${ym(expiry)}`;

  const received = new Map<string, number>();
  for (const line of purchaseLines) {
    const k = keyOf(line.productId, line.batchNumber, line.expiryDate);
    const packSize = packOf.get(line.productId) ?? 1;
    const units = (line.quantity + (line.freeQuantity || 0)) * packSize;
    received.set(k, round((received.get(k) || 0) + units));
  }

  // Group the stock rows the same way so duplicates can be collapsed.
  const groups = new Map<string, typeof batches>();
  for (const b of batches) {
    const k = keyOf(b.productId, b.batchNumber, b.expiryDate);
    const list = groups.get(k) || [];
    list.push(b);
    groups.set(k, list);
  }

  interface Change {
    batchId: string;
    productId: string;
    name: string;
    batchNumber: string;
    from: number;
    to: number;
    reason: string;
    valueDelta: number;
  }
  const changes: Change[] = [];
  let currentCost = 0;
  let rebuiltCost = 0;
  let currentMrp = 0;
  let rebuiltMrp = 0;

  for (const [k, rows] of groups) {
    const packSize = packOf.get(rows[0].productId) ?? 1;
    const inUnits = received.get(k) || 0;
    const soldUnits = rows.reduce((s, r) => s + (soldByBatch.get(r.id) || 0), 0);
    const adjUnits = rows.reduce((s, r) => s + (adjustByBatch.get(r.id) || 0), 0);
    const target = round(Math.max(0, inUnits - soldUnits + adjUnits));

    // The whole quantity goes to the row already carrying stock, so FEFO keeps pointing at
    // the row sales history already references. Its duplicates are emptied.
    const primary = rows.find((r) => r.quantity > 0) ?? rows[0];

    for (const row of rows) {
      const to = row.id === primary.id ? target : 0;
      currentCost += row.quantity * (row.purchaseRate / packSize);
      rebuiltCost += to * (row.purchaseRate / packSize);
      currentMrp += row.quantity * (row.mrp / packSize);
      rebuiltMrp += to * (row.mrp / packSize);

      if (Math.abs(to - row.quantity) < 0.0005) continue;

      let reason: string;
      if (rows.length > 1 && row.id !== primary.id) {
        reason = 'Duplicate batch row merged into the batch of the same number and expiry';
      } else if (inUnits === 0) {
        reason = 'No purchase bill records this batch being received';
      } else {
        reason =
          `Rebuilt from documents: received ${round(inUnits)}` +
          `, sold ${round(soldUnits)}` +
          (adjUnits ? `, adjusted ${round(adjUnits)}` : '');
      }

      changes.push({
        batchId: row.id,
        productId: row.productId,
        name: row.product.name,
        batchNumber: row.batchNumber,
        from: row.quantity,
        to,
        reason,
        valueDelta: (to - row.quantity) * (row.purchaseRate / packSize),
      });
    }
  }

  const down = changes.filter((c) => c.to < c.from);
  const up = changes.filter((c) => c.to > c.from);
  const emptied = changes.filter((c) => c.to === 0 && c.from > 0);

  console.log(`\nbatch rows: ${batches.length}   purchase lines: ${purchaseLines.length}`);
  console.log(`prior manual adjustments honoured: ${priorAdjustments.length}`);
  console.log(`\nchanges: ${changes.length}   reduced: ${down.length}   increased: ${up.length}   emptied: ${emptied.length}`);
  console.log(`\n  stock @ cost : ${money(currentCost)}  ->  ${money(rebuiltCost)}   (${money(rebuiltCost - currentCost)})`);
  console.log(`  stock @ MRP  : ${money(currentMrp)}  ->  ${money(rebuiltMrp)}   (${money(rebuiltMrp - currentMrp)})`);

  console.log('\nlargest reductions:');
  [...down].sort((a, b) => a.valueDelta - b.valueDelta).slice(0, 12).forEach((c) =>
    console.log(`  ${c.name.slice(0, 30).padEnd(30)} ${bn(c.batchNumber).slice(0, 11).padEnd(11)} ${String(c.from).padStart(8)} -> ${String(c.to).padStart(8)}  ${money(c.valueDelta)}`)
  );

  const fractional = changes.filter((c) => c.to % 1 !== 0);
  console.log(`\nrebuilt quantities that are fractional (kept as-is): ${fractional.length}`);
  fractional.slice(0, 6).forEach((c) => console.log(`  ${c.name.slice(0, 34).padEnd(34)} ${c.from} -> ${c.to}`));

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('\n================ APPLYING ================');

  // One transaction: either stock and its audit trail both land, or neither does.
  await prisma.$transaction(
    async (tx) => {
      for (const c of changes) {
        await tx.inventoryBatch.update({ where: { id: c.batchId }, data: { quantity: c.to } });
        await tx.stockAdjustment.create({
          data: {
            batchId: c.batchId,
            productId: c.productId,
            quantityDelta: round(c.to - c.from),
            previousQuantity: c.from,
            newQuantity: c.to,
            reason: c.reason,
            source: AdjustmentSource.RECONCILIATION,
          },
        });
      }
    },
    { timeout: 120000, maxWait: 20000 }
  );

  const after = await prisma.inventoryBatch.findMany({
    select: { quantity: true, purchaseRate: true, mrp: true, product: { select: { packSize: true } } },
  });
  let c = 0;
  let m = 0;
  after.forEach((b) => {
    const size = b.product.packSize > 0 ? b.product.packSize : 1;
    c += b.quantity * (b.purchaseRate / size);
    m += b.quantity * (b.mrp / size);
  });
  console.log(`\nWrote ${changes.length} corrections, each with an audit row.`);
  console.log(`STOCK NOW : ${money(c)} at cost, ${money(m)} at MRP\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

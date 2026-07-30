/**
 * Re-split every sales bill's stored money into net revenue and GST, using the rate the stock
 * was purchased at.
 *
 * Two defects are being corrected on historical bills:
 *
 *   1. The counter sent a flat 12% for every line whatever the medicine was, so bills for 5% and
 *      18% goods carry the wrong output tax. The rate is re-read from the batch that was sold
 *      (which carries the supplier bill's rate), falling back to the product's configured rate
 *      for stock with no purchase behind it.
 *   2. GST was extracted before the bill-level discount was taken off, so tax was declared on
 *      money never collected.
 *
 * `grandTotal` is never touched — what the customer paid is a fact. Only the split of that total
 * (and each line's taxPercent) changes. Any bill whose lines no longer add up to its stored
 * total is reported and left alone rather than quietly rewritten.
 *
 * Idempotent: every value written is recomputed from the bill's own lines, so repeated runs
 * converge on the same numbers.
 *
 *   npx ts-node src/scripts/repair-sales-gst.ts          # report only
 *   npx ts-node src/scripts/repair-sales-gst.ts --apply  # write
 */
import { prisma } from '../config/prisma';
import { splitInclusiveTax, money } from '../lib/billing-math';

const APPLY = process.argv.includes('--apply');

async function main() {
  const bills = await prisma.salesBill.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      items: {
        include: {
          batch: { select: { taxPercent: true } },
          product: { select: { gstPercent: true } },
        },
      },
    },
  });

  let billsChanged = 0;
  let linesChanged = 0;
  let taxBefore = 0;
  let taxAfter = 0;
  const mismatched: string[] = [];

  const itemUpdatesByRate = new Map<number, string[]>();
  const billUpdates: { id: string; subtotal: number; taxTotal: number }[] = [];

  for (const bill of bills) {
    if (bill.items.length === 0) continue;

    const lines = bill.items.map((item) => {
      const fromBatch = Number(item.batch?.taxPercent) || 0;
      const rate = fromBatch > 0 ? fromBatch : Number(item.product?.gstPercent) || 0;
      return { item, rate, total: item.totalAmount };
    });

    const lineSum = lines.reduce((s, l) => s + l.total, 0);
    const expectedRaw = Math.max(0, lineSum - bill.discount);
    // What the stored grand total implies once rounding is accounted for.
    const drift = Math.abs(expectedRaw + bill.roundOffAmount - bill.grandTotal);
    if (drift > 1) {
      mismatched.push(
        `${bill.invoiceNumber || bill.id}: lines ${money(lineSum)} − discount ${money(bill.discount)} ` +
          `= ${money(expectedRaw)}, stored grandTotal ${money(bill.grandTotal)}`
      );
      continue;
    }

    const split = splitInclusiveTax(
      lines.map((l) => ({ total: l.total, taxPercent: l.rate })),
      bill.discount
    );

    taxBefore += bill.taxTotal;
    taxAfter += split.taxTotal;

    for (const l of lines) {
      if (l.rate === l.item.taxPercent) continue;
      linesChanged++;
      const list = itemUpdatesByRate.get(l.rate);
      if (list) list.push(l.item.id);
      else itemUpdatesByRate.set(l.rate, [l.item.id]);
    }

    if (Math.abs(split.subtotal - bill.subtotal) > 0.01 || Math.abs(split.taxTotal - bill.taxTotal) > 0.01) {
      billsChanged++;
      billUpdates.push({ id: bill.id, subtotal: split.subtotal, taxTotal: split.taxTotal });
    }
  }

  console.log(`bills:              ${bills.length}`);
  console.log(`bills re-split:     ${billsChanged}`);
  console.log(`lines re-rated:     ${linesChanged}`);
  console.log(`output GST before:  ${money(taxBefore)}`);
  console.log(`output GST after:   ${money(taxAfter)}`);
  if (mismatched.length) {
    console.log(`\nskipped ${mismatched.length} bill(s) whose lines do not add up to their stored total:`);
    mismatched.slice(0, 15).forEach((m) => console.log('  ' + m));
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    await prisma.$disconnect();
    return;
  }

  for (const [rate, ids] of itemUpdatesByRate) {
    const res = await prisma.salesBillItem.updateMany({ where: { id: { in: ids } }, data: { taxPercent: rate } });
    console.log(`  set ${rate}% on ${res.count} sale lines`);
  }

  for (const u of billUpdates) {
    await prisma.salesBill.update({
      where: { id: u.id },
      data: { subtotal: u.subtotal, taxTotal: u.taxTotal },
    });
  }
  console.log(`  rewrote the split on ${billUpdates.length} bills`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

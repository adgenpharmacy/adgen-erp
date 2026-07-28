/**
 * Backfills `totalAmount` on sales lines that were imported without one.
 *
 *   npx ts-node src/scripts/repair-sales-line-totals.ts            # dry run
 *   npx ts-node src/scripts/repair-sales-line-totals.ts --apply    # writes
 *
 * The original Firebase import wrote quantity and unitPrice but never the line total, so 81
 * rows sat at 0. The bill header was computed independently and stayed correct, which hid the
 * problem everywhere except the printed invoice, where each line read "Rs 0.00" against a real
 * quantity while the subtotal underneath it was right.
 *
 * Retail pricing here is tax-inclusive MRP, so the line is simply quantity x unit price less
 * the per-item discount, with no tax added on top. Verified against bill headers below.
 *
 * Only fills zeroes. A line that already carries a total is never rewritten.
 */
import { PrismaClient } from '@prisma/client';
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
const money = (n: number) => `Rs ${n.toFixed(2)}`;

async function main() {
  const broken = await prisma.salesBillItem.findMany({
    where: { totalAmount: 0 },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      discountPercent: true,
      salesBillId: true,
      product: { select: { name: true } },
    },
  });

  console.log(`\n${broken.length} sales lines carry totalAmount = 0`);

  const fixes = broken
    .map((it) => ({
      id: it.id,
      salesBillId: it.salesBillId,
      name: it.product.name,
      qty: it.quantity,
      value: it.quantity * it.unitPrice * (1 - (it.discountPercent || 0) / 100),
    }))
    // A genuinely free line (zero quantity or zero price) should stay at zero.
    .filter((f) => f.value > 0);

  console.log(`${fixes.length} of them have a real value to restore`);
  console.log(`total value currently unprinted: ${money(fixes.reduce((s, f) => s + f.value, 0))}\n`);

  // Cross-check: once repaired, do the lines on each affected bill agree with its header?
  const billIds = [...new Set(fixes.map((f) => f.salesBillId))];
  const bills = await prisma.salesBill.findMany({
    where: { id: { in: billIds } },
    select: { id: true, invoiceNumber: true, grandTotal: true, discount: true, items: { select: { id: true, quantity: true, unitPrice: true, discountPercent: true, totalAmount: true } } },
  });

  let agree = 0;
  const off: string[] = [];
  for (const b of bills) {
    const repaired = b.items.reduce((s, i) => {
      const stored = i.totalAmount;
      const computed = i.quantity * i.unitPrice * (1 - (i.discountPercent || 0) / 100);
      return s + (stored > 0 ? stored : computed);
    }, 0);
    const expected = b.grandTotal + (b.discount || 0);
    if (Math.abs(repaired - expected) <= 1.01) agree++;
    else off.push(`${b.invoiceNumber}: lines ${money(repaired)} vs header ${money(expected)}`);
  }
  console.log(`bills whose repaired lines reconcile to their header: ${agree} of ${bills.length}`);
  off.slice(0, 8).forEach((o) => console.log(`   ${o}`));

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  for (const f of fixes) {
    await prisma.salesBillItem.update({ where: { id: f.id }, data: { totalAmount: f.value } });
  }
  const left = await prisma.salesBillItem.count({ where: { totalAmount: 0 } });
  console.log(`\nRepaired ${fixes.length} lines. Lines still at zero: ${left}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

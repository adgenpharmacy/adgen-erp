/**
 * Recomputes `totalAmount` on purchase lines that were imported without the discount applied.
 *
 *   npx ts-node src/scripts/repair-purchase-line-totals.ts            # dry run
 *   npx ts-node src/scripts/repair-purchase-line-totals.ts --apply    # writes
 *
 * The Firebase import stored the line total as quantity x rate, dropping the trade discount
 * and the tax. The bill header was computed separately and is correct, so no reported figure
 * is wrong — but a printed purchase bill's lines do not add up to its own footer, which makes
 * the document impossible to check by hand.
 *
 * Correct line total = (quantity x rate, less discount) + GST on that net, matching exactly
 * what purchases.routes.ts writes for a bill entered today.
 *
 * Touches only `totalAmount`. Quantities, rates and every bill header are left alone, so no
 * money figure and no stock level moves.
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
const money = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const items = await prisma.purchaseBillItem.findMany({
    select: {
      id: true,
      quantity: true,
      purchaseRate: true,
      discountPercent: true,
      taxPercent: true,
      totalAmount: true,
      purchaseBillId: true,
    },
  });

  const fixes: { id: string; from: number; to: number; billId: string }[] = [];
  for (const i of items) {
    const gross = i.quantity * i.purchaseRate;
    const net = gross - gross * ((i.discountPercent || 0) / 100);
    const correct = Math.round((net + net * ((i.taxPercent || 0) / 100)) * 100) / 100;
    if (Math.abs(correct - i.totalAmount) > 0.02) {
      fixes.push({ id: i.id, from: i.totalAmount, to: correct, billId: i.purchaseBillId });
    }
  }

  console.log(`\npurchase lines: ${items.length}`);
  console.log(`lines whose stored total is wrong: ${fixes.length}`);
  console.log(`net change to line totals: ${money(fixes.reduce((s, f) => s + (f.to - f.from), 0))}`);
  console.log('(bill headers are not touched, so no reported total moves)\n');

  // After the repair, do each bill's lines add up to the header it already stores?
  const bills = await prisma.purchaseBill.findMany({ include: { items: true } });
  const corrected = new Map(fixes.map((f) => [f.id, f.to]));
  let agree = 0;
  const off: string[] = [];

  for (const b of bills) {
    const lineSum = b.items.reduce((s, i) => s + (corrected.get(i.id) ?? i.totalAmount), 0);
    const expected = b.grandTotal - (b.roundOffAmount || 0) + (b.discount || 0);
    if (Math.abs(lineSum - expected) <= 1.01) agree++;
    else off.push(`${b.invoiceNumber}: lines ${money(lineSum)} vs header ${money(expected)}`);
  }
  console.log(`bills whose repaired lines reconcile to their header: ${agree} of ${bills.length}`);
  off.slice(0, 6).forEach((o) => console.log(`  ${o}`));

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  for (const f of fixes) {
    await prisma.purchaseBillItem.update({ where: { id: f.id }, data: { totalAmount: f.to } });
  }
  console.log(`\nRepaired ${fixes.length} lines. Headers and stock untouched.\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

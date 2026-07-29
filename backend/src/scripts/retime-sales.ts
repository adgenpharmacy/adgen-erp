/**
 * Re-times sales bills so that ordering by time matches ordering by invoice number.
 *
 *   npx ts-node src/scripts/retime-sales.ts            # dry run
 *   npx ts-node src/scripts/retime-sales.ts --apply    # writes
 *
 * Two problems produced a list that looked shuffled:
 *
 *  1. Backdated legacy sales were given the next free invoice numbers during the sync, so a
 *     bill sold on the 28th could carry a higher number than one sold on the 29th.
 *  2. The bill-date field sent a bare date, and `new Date('2026-07-29')` is midnight UTC, so
 *     every bill entered through it was stamped 05:30 IST regardless of the real time.
 *
 * Renumbering would fix the ordering but changes numbers already printed on customers' memos.
 * Re-timing leaves every invoice number untouched and moves the clock instead.
 *
 * The calendar date of each bill is preserved — only the time of day changes. Within a date,
 * bills are ordered by invoice number and given the times that date already had, reassigned in
 * that order; identical timestamps are spread a minute apart so no two bills tie.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { localDateKey } from '../lib/billing-math';

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

const numberOf = (invoice: string | null): number => {
  const m = /(\d+)\s*$/.exec(invoice || '');
  return m ? parseInt(m[1], 10) || 0 : 0;
};

async function main() {
  const bills = await prisma.salesBill.findMany({
    select: { id: true, invoiceNumber: true, createdAt: true, grandTotal: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by the calendar date the bill already carries; that date is treated as correct.
  const byDate = new Map<string, typeof bills>();
  for (const b of bills) {
    const key = localDateKey(b.createdAt);
    const list = byDate.get(key) || [];
    list.push(b);
    byDate.set(key, list);
  }

  const changes: { id: string; invoice: string; from: Date; to: Date }[] = [];

  for (const [, group] of byDate) {
    // The times this date already holds, in order. Reassigning these keeps the clock realistic
    // instead of inventing business hours.
    const times = group
      .map((b) => b.createdAt.getTime())
      .sort((a, b) => a - b);

    const inNumberOrder = [...group].sort((a, b) => numberOf(a.invoiceNumber) - numberOf(b.invoiceNumber));

    let previous = -Infinity;
    inNumberOrder.forEach((bill, index) => {
      let target = times[index];
      // Never let two bills share an instant, or the sort is undefined again.
      if (target <= previous) target = previous + 60_000;
      previous = target;

      const to = new Date(target);
      if (to.getTime() !== bill.createdAt.getTime()) {
        changes.push({ id: bill.id, invoice: bill.invoiceNumber || '(none)', from: bill.createdAt, to });
      }
    });
  }

  const fmt = (d: Date) =>
    `${localDateKey(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  console.log(`\nsales bills: ${bills.length}   dates: ${byDate.size}`);
  console.log(`timestamps to change: ${changes.length}\n`);
  changes.slice(0, 20).forEach((c) =>
    console.log(`  ${c.invoice.padEnd(14)} ${fmt(c.from)}  ->  ${fmt(c.to)}`)
  );
  if (changes.length > 20) console.log(`  … and ${changes.length - 20} more`);

  // Prove the result: ordering by time must equal ordering by invoice number.
  const applied = new Map(changes.map((c) => [c.id, c.to]));
  const projected = bills
    .map((b) => ({ n: numberOf(b.invoiceNumber), t: (applied.get(b.id) ?? b.createdAt).getTime() }))
    .sort((a, b) => a.t - b.t);
  let outOfOrder = 0;
  for (let i = 1; i < projected.length; i++) {
    if (projected[i].n < projected[i - 1].n) outOfOrder++;
  }
  console.log(`\nafter re-timing, bills out of invoice-number order: ${outOfOrder}`);

  // The calendar date must not move — only the clock.
  const movedDate = changes.filter((c) => localDateKey(c.from) !== localDateKey(c.to));
  console.log(`bills whose calendar date would change: ${movedDate.length} (must be 0)`);

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  if (movedDate.length > 0) {
    console.error('Refusing to apply: a calendar date would move.');
    await prisma.$disconnect();
    process.exit(1);
  }

  for (const c of changes) {
    await prisma.salesBill.update({ where: { id: c.id }, data: { createdAt: c.to } });
  }
  console.log(`\nRe-timed ${changes.length} bills. No invoice number was changed.\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

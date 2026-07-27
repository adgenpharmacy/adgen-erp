/**
 * Financial data audit & repair.
 *
 * Reports (and optionally repairs) two issues found in data imported from the legacy system:
 *
 *   1. Sales bills whose header `taxTotal` / `subtotal` are zero even though their line items
 *      carry real GST rates. This made the GST filing report show ₹0 output tax.
 *   2. Duplicate invoice numbers across bills — these break the GST invoice series.
 *
 * Runs read-only by default. Pass --fix to write the recalculated tax totals.
 * Duplicate invoice numbers are only ever REPORTED: renumbering issued invoices is a
 * bookkeeping decision, not something a script should silently do.
 *
 *   npx ts-node --transpile-only src/scripts/audit-financial-data.ts
 *   npx ts-node --transpile-only src/scripts/audit-financial-data.ts --fix
 */
import { prisma } from '../config/prisma';

const APPLY = process.argv.includes('--fix');

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function reportDuplicateInvoiceNumbers() {
  console.log('\n── Duplicate invoice numbers ──────────────────────────────');

  const sales = await prisma.salesBill.findMany({
    select: { id: true, invoiceNumber: true, grandTotal: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof sales>();
  for (const b of sales) {
    if (!b.invoiceNumber) continue;
    const list = groups.get(b.invoiceNumber) || [];
    list.push(b);
    groups.set(b.invoiceNumber, list);
  }

  const dupes = [...groups.entries()].filter(([, list]) => list.length > 1);

  if (dupes.length === 0) {
    console.log('  ✓ No duplicate sales invoice numbers.');
    return;
  }

  console.log(`  ⚠ ${dupes.length} sales invoice number(s) used by more than one bill:`);
  for (const [num, list] of dupes) {
    console.log(`    ${num} → ${list.length} bills (${list.map((b) => inr(b.grandTotal)).join(', ')})`);
  }
  console.log('\n  These are reported only. Decide with your accountant whether to renumber,');
  console.log('  cancel, or annotate them — the script will not alter issued invoice numbers.');
}

async function auditSalesTaxTotals() {
  console.log('\n── Sales bills with missing GST breakdown ─────────────────');

  const bills = await prisma.salesBill.findMany({
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });

  const broken: { id: string; invoiceNumber: string | null; grandTotal: number; subtotal: number; taxTotal: number }[] = [];

  for (const bill of bills) {
    if ((bill.taxTotal || 0) > 0) continue;

    // Retail prices are GST-inclusive: tax = gross − gross / (1 + rate)
    let taxTotal = 0;
    let subtotal = 0;

    for (const item of bill.items) {
      const gross = item.totalAmount || item.quantity * item.unitPrice;
      const rate = (item.taxPercent || 0) / 100;
      const tax = rate > 0 ? gross - gross / (1 + rate) : 0;
      taxTotal += tax;
      subtotal += gross - tax;
    }

    if (taxTotal > 0.005) {
      broken.push({
        id: bill.id,
        invoiceNumber: bill.invoiceNumber,
        grandTotal: bill.grandTotal,
        subtotal: Math.round(subtotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
      });
    }
  }

  if (broken.length === 0) {
    console.log('  ✓ Every sales bill has a consistent GST breakdown.');
    return;
  }

  const recoverable = broken.reduce((s, b) => s + b.taxTotal, 0);
  console.log(`  ⚠ ${broken.length} bill(s) store taxTotal = 0 despite taxable line items.`);
  console.log(`    Unreported output GST: ${inr(recoverable)}`);
  for (const b of broken.slice(0, 15)) {
    console.log(`    ${b.invoiceNumber ?? b.id}  total ${inr(b.grandTotal)}  → tax ${inr(b.taxTotal)}`);
  }
  if (broken.length > 15) console.log(`    … and ${broken.length - 15} more`);

  if (!APPLY) {
    console.log('\n  Dry run — nothing written. Re-run with --fix to apply these corrections.');
    return;
  }

  console.log('\n  Applying corrections…');
  let updated = 0;
  for (const b of broken) {
    await prisma.salesBill.update({
      where: { id: b.id },
      data: { subtotal: b.subtotal, taxTotal: b.taxTotal },
    });
    updated++;
  }
  console.log(`  ✓ Updated ${updated} sales bill(s). grandTotal was left untouched.`);
}

async function main() {
  console.log('AdGen Pharmacy ERP — financial data audit');
  console.log(APPLY ? 'MODE: APPLY (--fix)' : 'MODE: dry run (read-only)');

  await auditSalesTaxTotals();
  await reportDuplicateInvoiceNumbers();

  console.log('\nDone.\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Audit failed:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});

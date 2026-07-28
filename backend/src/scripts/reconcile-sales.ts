/**
 * Reconciles sales bills against a legacy PharmacyERP backup export, then renumbers the
 * whole invoice series so every bill carries a distinct number.
 *
 *   npx ts-node src/scripts/reconcile-sales.ts <backupDir>            # dry run
 *   npx ts-node src/scripts/reconcile-sales.ts <backupDir> --apply    # writes
 *
 * The legacy app reuses invoice numbers: its 44 sales share only 12 distinct numbers, with
 * "ADG/2607/0011" alone covering twelve separate sales. The original import treated the
 * number as a key and kept one bill per number, discarding 25 sales worth Rs 8,748 — which
 * is why revenue, gross profit and GST output all read low.
 *
 * So bills are paired within an invoice-number group by closest grand total, never by the
 * number alone. Afterwards every sale is renumbered INV-000001.. in date order, which both
 * gives the client a clean GST series and lets nextSalesInvoiceNumber() in sales.routes.ts
 * carry on from the highest number without colliding.
 *
 * Deliberately does NOT move stock. Legacy inventory is a snapshot that already reflects all
 * 44 sales, and reconcile-inventory.ts restores that snapshot wholesale afterwards; deducting
 * here as well would take the same goods off the shelf twice.
 *
 * IMPORTANT: reconciles against a point-in-time export. Do not re-run once the client starts
 * billing in this app — the renumbering pass would rewrite invoice numbers they have issued.
 */
import { PrismaClient, Prisma } from '@prisma/client';
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
const backupDir = process.argv[2];
const INVOICE_PREFIX = 'INV-';

if (!backupDir || backupDir.startsWith('--')) {
  console.error('Usage: reconcile-sales.ts <backupDir> [--apply]');
  process.exit(1);
}

interface LegacySalesItem {
  productName?: string;
  productId?: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity?: number;
  rate?: number;
  mrp?: number;
  gstPercent?: number;
  discountPercent?: number;
  packSize?: number;
}

interface LegacySale {
  _id: string;
  invoiceNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  doctorName?: string;
  saleDate?: string;
  createdAt?: string;
  subtotal?: number;
  totalGst?: number;
  grandTotal?: number;
  amountPaid?: number;
  schemeDiscountAmount?: number;
  totalDiscount?: number;
  paymentMethod?: string;
  isCreditPaid?: boolean;
  isRoundOff?: boolean;
  roundOffAmount?: number;
  notes?: string;
  items?: LegacySalesItem[];
}

const money = (n: number) => `Rs ${n.toFixed(2)}`;
const key = (s: string | null | undefined) => (s || '').trim().toLowerCase();
const when = (b: LegacySale) => new Date(b.saleDate || b.createdAt || Date.now());

function groupBy<T>(rows: T[], selector: (row: T) => string): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const k = selector(row);
    (acc[k] = acc[k] || []).push(row);
    return acc;
  }, {});
}

/** Splits the bill value across the tender columns the reports read. */
function tender(b: LegacySale) {
  const method = (b.paymentMethod || 'CASH').trim().toUpperCase();
  const total = Number(b.grandTotal) || 0;
  const zero = { cashAmount: 0, upiAmount: 0, cardAmount: 0, creditAmount: 0 };
  if (method.includes('UPI') || method.includes('ONLINE')) return { ...zero, upiAmount: total, method: 'UPI' };
  if (method.includes('CARD')) return { ...zero, cardAmount: total, method: 'CARD' };
  if (method.includes('CREDIT') || method.includes('UDHAR'))
    return { ...zero, creditAmount: total, method: 'CREDIT' };
  return { ...zero, cashAmount: total, method: 'CASH' };
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(backupDir, 'sales_bills.json'), 'utf-8')) as {
    count: number;
    docs: LegacySale[];
  };
  const legacy = raw.docs;
  const legacyTotal = legacy.reduce((s, b) => s + (b.grandTotal || 0), 0);

  const existing = await prisma.salesBill.findMany({
    select: { id: true, invoiceNumber: true, grandTotal: true, createdAt: true },
  });
  const dbTotal = existing.reduce((s, b) => s + b.grandTotal, 0);

  const distinctLegacyNumbers = new Set(legacy.map((b) => key(b.invoiceNumber))).size;

  console.log(`\nLEGACY EXPORT : ${legacy.length} sales, total ${money(legacyTotal)}`);
  console.log(`                (only ${distinctLegacyNumbers} distinct invoice numbers between them)`);
  console.log(`DATABASE      : ${existing.length} sales, total ${money(dbTotal)}`);
  console.log(`DIFFERENCE    : ${money(legacyTotal - dbTotal)}\n`);

  /*
   * Bills are identified by their exact sale timestamp, NOT by invoice number.
   *
   * Two reasons. Legacy numbers are not unique to begin with (51 sales share 12 numbers), and
   * once the renumbering pass below has run, our copies carry INV-nnnnnn while the export
   * still carries ADG/2607/nnnn — so a number-based match finds nothing on a second run and
   * would happily insert the entire export again as duplicates.
   *
   * The legacy `saleDate` is millisecond-precision and is preserved verbatim as `createdAt`
   * on insert, which makes it a stable identity across exports. Verified: all 44 bills held
   * before this export matched a legacy timestamp exactly.
   */
  const dbByTime = groupBy(existing, (b) => String(b.createdAt.getTime()));
  const legacyByTime = groupBy(legacy, (b) => String(when(b).getTime()));

  const missing: LegacySale[] = [];
  for (const [stamp, group] of Object.entries(legacyByTime)) {
    const pool = (dbByTime[stamp] || []).slice();
    for (const lb of group.slice().sort((a, b) => (b.grandTotal || 0) - (a.grandTotal || 0))) {
      if (pool.length === 0) {
        missing.push(lb);
        continue;
      }
      // Same instant on more than one bill is possible; take the closest value.
      pool.sort(
        (x, y) =>
          Math.abs(x.grandTotal - (lb.grandTotal || 0)) - Math.abs(y.grandTotal - (lb.grandTotal || 0))
      );
      pool.shift();
    }
  }

  const missingTotal = missing.reduce((s, b) => s + (b.grandTotal || 0), 0);
  console.log(`--- ${missing.length} SALES ABSENT FROM THE DATABASE ---`);
  missing.forEach((b) =>
    console.log(
      `  ${(b.invoiceNumber || '(none)').padEnd(16).slice(0, 16)} ${money(b.grandTotal || 0).padStart(10)}  ` +
        `${(b.items?.length ?? 0).toString().padStart(3)} items  ${when(b).toISOString().slice(0, 10)}  ` +
        `${(b.customerName || 'Walk-in').slice(0, 22)}`
    )
  );
  console.log(`  value of absent sales: ${money(missingTotal)}\n`);

  console.log('--- RECONCILIATION ---');
  console.log(`  database total    : ${money(dbTotal)}`);
  console.log(`  + absent sales    : ${money(missingTotal)}`);
  console.log(`  = projected       : ${money(dbTotal + missingTotal)}`);
  console.log(`  legacy total      : ${money(legacyTotal)}`);
  console.log(`  residual          : ${money(legacyTotal - (dbTotal + missingTotal))}\n`);

  console.log(`--- RENUMBERING ---`);
  console.log(`  ${existing.length + missing.length} sales will be renumbered ${INVOICE_PREFIX}000001 ..`);
  console.log(
    `  ${INVOICE_PREFIX}${String(existing.length + missing.length + 1).padStart(6, '0')} will be the next number the counter issues\n`
  );

  if (!APPLY) {
    console.log('DRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('================ APPLYING ================');

  /** Resolves a line to a catalogue product, creating one if the import never made it. */
  async function resolveProduct(it: LegacySalesItem) {
    const name = (it.productName || '').trim();
    const found = await prisma.product.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, packSize: true },
    });
    if (found) return found;
    const created = await prisma.product.create({
      data: {
        name,
        gstPercent: Number(it.gstPercent) || 0,
        packSize: Number(it.packSize) || 1,
        mrp: Number(it.mrp) || 0,
      },
      select: { id: true, packSize: true },
    });
    console.log(`  created catalogue entry: ${name}`);
    return created;
  }

  /**
   * Every sales line needs a batch to point at. Reuses the matching batch when one exists,
   * otherwise records the batch the legacy bill names with zero quantity — the inventory
   * sync that follows sets the real figure.
   */
  async function resolveBatch(it: LegacySalesItem, productId: string) {
    const batchNumber = (it.batchNumber || '').trim() || 'DEFAULT';
    const found = await prisma.inventoryBatch.findFirst({
      where: { productId, batchNumber },
      select: { id: true },
    });
    if (found) return found.id;
    const created = await prisma.inventoryBatch.create({
      data: {
        productId,
        batchNumber,
        expiryDate: it.expiryDate ? new Date(it.expiryDate) : new Date(Date.now() + 365 * 864e5),
        quantity: 0,
        mrp: Number(it.mrp) || 0,
        purchaseRate: Number(it.rate) || 0,
      },
      select: { id: true },
    });
    return created.id;
  }

  let inserted = 0;
  for (const lb of missing) {
    const items: Prisma.SalesBillItemCreateWithoutSalesBillInput[] = [];
    for (const it of lb.items || []) {
      const product = await resolveProduct(it);
      const batchId = await resolveBatch(it, product.id);
      const qty = Number(it.quantity) || 0;
      const price = Number(it.rate) || 0;
      const disc = Number(it.discountPercent) || 0;
      const gross = qty * price;
      items.push({
        product: { connect: { id: product.id } },
        batch: { connect: { id: batchId } },
        quantity: qty,
        unitPrice: price,
        taxPercent: Number(it.gstPercent) || 0,
        discountPercent: disc,
        totalAmount: gross - gross * (disc / 100),
      });
    }
    if (items.length === 0) continue;

    const t = tender(lb);
    const settled = t.method !== 'CREDIT' || Boolean(lb.isCreditPaid);

    await prisma.salesBill.create({
      data: {
        invoiceNumber: lb.invoiceNumber || null,
        customerName: (lb.customerName || '').trim() || 'Walk-in Customer',
        customerPhone: lb.customerPhone || null,
        doctorName: lb.doctorName || null,
        notes: lb.notes || null,
        subtotal: Number(lb.subtotal) || 0,
        taxTotal: Number(lb.totalGst) || 0,
        discount: Number(lb.schemeDiscountAmount) || 0,
        grandTotal: Number(lb.grandTotal) || 0,
        amountPaid: settled ? Number(lb.grandTotal) || 0 : Number(lb.amountPaid) || 0,
        cashAmount: t.cashAmount,
        upiAmount: t.upiAmount,
        cardAmount: t.cardAmount,
        creditAmount: t.creditAmount,
        paymentMethod: t.method,
        isPaid: settled,
        isSettled: settled,
        isRoundOff: lb.isRoundOff ?? true,
        roundOffAmount: Number(lb.roundOffAmount) || 0,
        // Backdated so the renumbering below follows the real trading order.
        createdAt: when(lb),
        items: { create: items },
      },
    });
    inserted++;
  }
  console.log(`Inserted ${inserted} sales`);

  // ---- Renumber the whole series ---------------------------------------------------------
  const all = await prisma.salesBill.findMany({
    select: { id: true, invoiceNumber: true },
    orderBy: { createdAt: 'asc' },
  });
  let seq = 0;
  for (const bill of all) {
    seq++;
    const next = `${INVOICE_PREFIX}${String(seq).padStart(6, '0')}`;
    if (bill.invoiceNumber !== next) {
      await prisma.salesBill.update({ where: { id: bill.id }, data: { invoiceNumber: next } });
    }
  }
  console.log(`Renumbered ${all.length} sales: ${INVOICE_PREFIX}000001 .. ${INVOICE_PREFIX}${String(seq).padStart(6, '0')}`);

  const after = await prisma.salesBill.aggregate({ _sum: { grandTotal: true }, _count: { _all: true } });
  const dupes = await prisma.salesBill.groupBy({
    by: ['invoiceNumber'],
    _count: { _all: true },
    having: { invoiceNumber: { _count: { gt: 1 } } },
  });
  console.log(`\nDATABASE NOW : ${after._count._all} sales, total ${money(after._sum.grandTotal || 0)}`);
  console.log(`LEGACY       : ${legacy.length} sales, total ${money(legacyTotal)}`);
  console.log(`duplicate invoice numbers remaining: ${dupes.length}`);
  console.log(`next number the counter will issue : ${INVOICE_PREFIX}${String(seq + 1).padStart(6, '0')}`);
  const gap = legacyTotal - (after._sum.grandTotal || 0);
  console.log(Math.abs(gap) < 1 ? 'RECONCILED.\n' : `REMAINING GAP: ${money(gap)}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

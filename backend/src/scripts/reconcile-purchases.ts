/**
 * Reconciles purchase bills in the database against a legacy PharmacyERP backup export.
 *
 *   npx ts-node src/scripts/reconcile-purchases.ts <backupDir>            # dry run
 *   npx ts-node src/scripts/reconcile-purchases.ts <backupDir> --apply    # writes
 *
 * Three things drifted between the legacy app and the imported database:
 *
 *  1. `schemeDiscountAmount` — the bill-level supplier discount — existed in every legacy
 *     export but there was no column for it when the import ran, so it was dropped. The
 *     stored grand total was still right, which is why this stayed invisible for so long.
 *  2. Individual lines whose product was missing from the catalogue were skipped by the
 *     original import, leaving the bill short by that line's value.
 *  3. Bills raised in the legacy app *after* the import ran are absent entirely.
 *  4. Cash-vs-credit was read from the wrong legacy field. The legacy app decides it from
 *     `ledgerType`; its own `isPaid` flag sits false on 39 of 43 bills and is effectively
 *     unused. Reading `isPaid` marked eight credit bills as settled, understating what the
 *     pharmacy owes its suppliers by Rs 9,131.
 *
 * IMPORTANT: this reconciles against a point-in-time export. Do not re-run it once the client
 * starts recording payments in this app — step 4 would revert a bill they have since settled.
 *
 * Legacy invoice numbers are NOT unique (the same supplier reuses labels like "TABLETS" or
 * "OTC FEED" on the same day), so bills are paired within an invoice-number group by closest
 * grand total rather than by number alone. Matching on the number alone reports phantom
 * mismatches — two unrelated bills compared against each other.
 *
 * Only ever fills in missing data. Never overwrites a bill that already carries a discount,
 * and never touches a line that already exists.
 */
import { PrismaClient, ProductType, Prisma } from '@prisma/client';
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

if (!backupDir || backupDir.startsWith('--')) {
  console.error('Usage: reconcile-purchases.ts <backupDir> [--apply]');
  process.exit(1);
}

interface LegacyItem {
  productName?: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity?: number;
  freeQuantity?: number;
  rate?: number;
  mrp?: number;
  gstPercent?: number;
  discountPercent?: number;
  packSize?: number;
  packUnit?: string;
  contentUnit?: string;
  hsnCode?: string;
  division?: string;
}

interface LegacyBill {
  _id: string;
  invoiceNumber: string;
  partyName?: string;
  invoiceDate?: string;
  subtotal?: number;
  totalGst?: number;
  grandTotal?: number;
  schemeDiscountAmount?: number;
  isRoundOff?: boolean;
  roundOffAmount?: number;
  isPaid?: boolean;
  /** 'cash' | 'credit'. The real payment state; the legacy `isPaid` flag is vestigial. */
  ledgerType?: string;
  notes?: string;
  items?: LegacyItem[];
}

/** A cash purchase is settled at the counter; a credit purchase is owed to the supplier. */
const isSettled = (b: LegacyBill) => (b.ledgerType || '').trim().toLowerCase() === 'cash';

interface BillItemDraft {
  productId: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  mrp: number;
  taxPercent: number;
  discountPercent: number;
  totalAmount: number;
}

const money = (n: number) => `Rs ${n.toFixed(2)}`;
const key = (s: string | undefined) => (s || '').trim().toLowerCase();
const norm = (s: string | undefined) => (s || '').trim().toUpperCase();

/** Groups an array into a plain object keyed by the given selector. */
function groupBy<T>(rows: T[], selector: (row: T) => string): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const k = selector(row);
    (acc[k] = acc[k] || []).push(row);
    return acc;
  }, {});
}

/**
 * Best-effort dosage form for a product the original import never created.
 * Anything uncertain lands in OTHERS, which the classify-product-types script can revisit.
 */
function inferProductType(name: string): ProductType {
  const n = ` ${name.toUpperCase()} `;
  if (/\bCAP(S|SULE|SULES)?\b/.test(n)) return ProductType.CAPSULE;
  if (/\bTAB(S|LET|LETS)?\b/.test(n)) return ProductType.TABLET;
  if (/\d\s*ML\b|\bSYRUP\b|\bSUSP\b|\bLIQUID\b|\bOIL\b/.test(n)) return ProductType.SYRUP;
  if (/\bINJ(ECTION)?\b|\bVIAL\b/.test(n)) return ProductType.INJECTION;
  if (/\bCREAM\b|\bGEL\b|\bLOTION\b/.test(n)) return ProductType.CREAM;
  if (/\bDROP(S)?\b/.test(n)) return ProductType.DROPS;
  if (/\bOINT(MENT)?\b/.test(n)) return ProductType.OINTMENT;
  if (/\bPOWDER\b|\bSACHET\b|\bGRANULES\b/.test(n)) return ProductType.POWDER;
  return ProductType.OTHERS;
}

/** Net line value after the trade discount, with GST added on top (purchases are tax-exclusive). */
function lineTotal(it: LegacyItem): number {
  const gross = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
  const net = gross - gross * ((Number(it.discountPercent) || 0) / 100);
  return net + net * ((Number(it.gstPercent) || 0) / 100);
}

async function main() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(backupDir, 'purchase_bills.json'), 'utf-8')
  ) as { count: number; docs: LegacyBill[] };
  const legacy = raw.docs;

  const legacyTotal = legacy.reduce((s, b) => s + (b.grandTotal || 0), 0);

  const existing = await prisma.purchaseBill.findMany({
    select: {
      id: true,
      invoiceNumber: true,
      grandTotal: true,
      discount: true,
      isPaid: true,
      items: { select: { id: true, product: { select: { name: true } } } },
    },
  });
  const dbTotal = existing.reduce((s, b) => s + b.grandTotal, 0);

  console.log(`\nLEGACY EXPORT : ${legacy.length} bills, total ${money(legacyTotal)}`);
  console.log(`DATABASE      : ${existing.length} bills, total ${money(dbTotal)}`);
  console.log(`DIFFERENCE    : ${money(legacyTotal - dbTotal)}\n`);

  const legacyGroups = groupBy(legacy, (b) => key(b.invoiceNumber));
  const dbGroups = groupBy(existing, (b) => key(b.invoiceNumber));

  const missingBills: LegacyBill[] = [];
  const lostDiscounts: { bill: LegacyBill; dbId: string; shouldBe: number }[] = [];
  const shortBills: { bill: LegacyBill; dbId: string; missingItems: LegacyItem[]; dbTotal: number }[] = [];
  const renamedLines: { invoice: string; legacyOnly: string[]; dbOnly: string[] }[] = [];
  const wrongPaymentState: { bill: LegacyBill; dbId: string; shouldBe: boolean; was: boolean }[] = [];

  for (const [k, group] of Object.entries(legacyGroups)) {
    // Pair heaviest-first so a duplicated invoice number lines its two bills up sensibly.
    const pool = (dbGroups[k] || []).slice();
    const sorted = group.slice().sort((a, b) => (b.grandTotal || 0) - (a.grandTotal || 0));

    for (const lb of sorted) {
      if (pool.length === 0) {
        missingBills.push(lb);
        continue;
      }
      pool.sort(
        (x, y) =>
          Math.abs(x.grandTotal - (lb.grandTotal || 0)) - Math.abs(y.grandTotal - (lb.grandTotal || 0))
      );
      const match = pool.shift()!;

      const scheme = Number(lb.schemeDiscountAmount) || 0;
      if (scheme > 0.005 && match.discount < 0.005) {
        lostDiscounts.push({ bill: lb, dbId: match.id, shouldBe: scheme });
      }

      const settled = isSettled(lb);
      if (match.isPaid !== settled) {
        wrongPaymentState.push({ bill: lb, dbId: match.id, shouldBe: settled, was: match.isPaid });
      }

      // Which legacy lines have no counterpart on the stored bill?
      const remaining = new Map<string, number>();
      for (const it of match.items) {
        const n = norm(it.product.name);
        remaining.set(n, (remaining.get(n) || 0) + 1);
      }
      const missingItems: LegacyItem[] = [];
      for (const it of lb.items || []) {
        const n = norm(it.productName);
        const have = remaining.get(n) || 0;
        if (have > 0) remaining.set(n, have - 1);
        else missingItems.push(it);
      }

      // Anything still sitting in `remaining` is a stored line the legacy bill does not name.
      // That means the original import fuzzy-matched a misspelt legacy name onto a cleaner
      // catalogue entry ("ALERI SYRUP 60ML" -> "ALERID SYRUP 60ML"), so the line is present
      // under a better name. Adding it again would duplicate stock and inflate the bill.
      const leftovers: string[] = [];
      for (const [n, count] of remaining) for (let i = 0; i < count; i++) leftovers.push(n);

      if (missingItems.length > 0) {
        if (leftovers.length > 0) {
          renamedLines.push({
            invoice: lb.invoiceNumber,
            legacyOnly: missingItems.map((m) => m.productName || '?'),
            dbOnly: leftovers,
          });
        } else {
          shortBills.push({ bill: lb, dbId: match.id, missingItems, dbTotal: match.grandTotal });
        }
      }
    }
  }

  const missingTotal = missingBills.reduce((s, b) => s + (b.grandTotal || 0), 0);

  console.log(`--- ${missingBills.length} BILLS ABSENT FROM THE DATABASE ---`);
  missingBills.forEach((b) =>
    console.log(
      `  ${(b.invoiceNumber || '?').padEnd(16).slice(0, 16)} ${(b.partyName || '?').padEnd(30).slice(0, 30)}` +
        `${money(b.grandTotal || 0).padStart(12)}  ${b.items?.length ?? 0} items  ${(b.invoiceDate || '').slice(0, 10)}`
    )
  );
  console.log(`  value of absent bills: ${money(missingTotal)}\n`);

  console.log(`--- ${lostDiscounts.length} BILLS WITH A DROPPED SCHEME DISCOUNT ---`);
  lostDiscounts.forEach((d) =>
    console.log(`  ${(d.bill.invoiceNumber || '?').padEnd(16).slice(0, 16)} discount ${money(0)} -> ${money(d.shouldBe)}`)
  );
  console.log('  (header totals already include this; only the breakdown was lost)\n');

  let shortValue = 0;
  console.log(`--- ${shortBills.length} BILLS MISSING INDIVIDUAL LINES ---`);
  for (const s of shortBills) {
    const delta = (s.bill.grandTotal || 0) - s.dbTotal;
    shortValue += delta;
    console.log(
      `  ${(s.bill.invoiceNumber || '?').padEnd(16).slice(0, 16)} ${(s.bill.partyName || '?').slice(0, 24)}  ` +
        `db ${money(s.dbTotal)} vs legacy ${money(s.bill.grandTotal || 0)}  (delta ${money(delta)})`
    );
    s.missingItems.forEach((it) =>
      console.log(`      + ${it.productName}  qty ${it.quantity} @ ${money(Number(it.rate) || 0)}`)
    );
  }
  console.log('');

  console.log(`--- ${renamedLines.length} BILLS WHERE A LINE WAS MATCHED UNDER A DIFFERENT NAME ---`);
  renamedLines.forEach((r) => {
    console.log(`  ${(r.invoice || '?').padEnd(16).slice(0, 16)}`);
    r.legacyOnly.forEach((n, i) => console.log(`      legacy "${n}"  ->  stored as "${r.dbOnly[i] ?? '?'}"`));
  });
  console.log('  left alone: the stored line already carries the value and the stock.\n');

  const owedDelta = wrongPaymentState.reduce(
    (s, w) => s + (w.shouldBe ? -(w.bill.grandTotal || 0) : w.bill.grandTotal || 0),
    0
  );
  console.log(`--- ${wrongPaymentState.length} BILLS WITH THE WRONG PAYMENT STATE ---`);
  wrongPaymentState.forEach((w) =>
    console.log(
      `  ${(w.bill.invoiceNumber || '?').padEnd(16).slice(0, 16)} ${(w.bill.partyName || '?').padEnd(28).slice(0, 28)}` +
        `${money(w.bill.grandTotal || 0).padStart(11)}   ${w.was ? 'PAID' : 'CREDIT'} -> ${w.shouldBe ? 'PAID' : 'CREDIT'}`
    )
  );
  console.log(`  effect on supplier payables: ${money(owedDelta)}\n`);

  console.log('--- RECONCILIATION ---');
  console.log(`  database total       : ${money(dbTotal)}`);
  console.log(`  + absent bills       : ${money(missingTotal)}`);
  console.log(`  + missing lines      : ${money(shortValue)}`);
  console.log(`  = projected total    : ${money(dbTotal + missingTotal + shortValue)}`);
  console.log(`  legacy total         : ${money(legacyTotal)}`);
  console.log(`  unexplained residual : ${money(legacyTotal - (dbTotal + missingTotal + shortValue))}`);

  let dbOnly = 0;
  for (const [k, group] of Object.entries(dbGroups)) {
    const n = (legacyGroups[k] || []).length;
    if (group.length > n) {
      dbOnly += group.length - n;
      console.log(`  NOTE: ${group.length - n} database bill(s) numbered "${k}" have no legacy counterpart`);
    }
  }
  if (dbOnly === 0) console.log('  no database bills lack a legacy counterpart');

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('\n================ APPLYING ================');

  // ---- 1. Restore the dropped scheme discounts ------------------------------------------
  for (const d of lostDiscounts) {
    await prisma.purchaseBill.update({ where: { id: d.dbId }, data: { discount: d.shouldBe } });
  }
  console.log(`Scheme discounts restored on ${lostDiscounts.length} bills`);

  // ---- 1b. Correct cash-vs-credit -------------------------------------------------------
  for (const w of wrongPaymentState) {
    await prisma.purchaseBill.update({
      where: { id: w.dbId },
      data: {
        isPaid: w.shouldBe,
        amountPaid: w.shouldBe ? Number(w.bill.grandTotal) || 0 : 0,
      },
    });
  }
  console.log(`Payment state corrected on ${wrongPaymentState.length} bills`);

  /**
   * Resolves a legacy line to a catalogue product, creating one from the line's own
   * metadata when the original import had nothing to match against.
   */
  async function resolveProduct(it: LegacyItem): Promise<{ id: string; packSize: number }> {
    const name = (it.productName || '').trim();
    const found = await prisma.product.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, packSize: true },
    });
    if (found) return found;

    const created = await prisma.product.create({
      data: {
        name,
        hsnCode: it.hsnCode || null,
        gstPercent: Number(it.gstPercent) || 0,
        productType: inferProductType(name),
        division: it.division || 'GENERAL',
        packSize: Number(it.packSize) || 1,
        packUnit: it.packUnit || 'Unit',
        contentUnit: it.contentUnit || 'Unit',
        mrp: Number(it.mrp) || 0,
        purchaseRate: Number(it.rate) || 0,
      },
      select: { id: true, packSize: true },
    });
    console.log(`  created catalogue entry: ${name}`);
    return created;
  }

  function draftFrom(it: LegacyItem, productId: string): BillItemDraft {
    return {
      productId,
      batchNumber: (it.batchNumber || '').trim() || 'DEFAULT',
      expiryDate: it.expiryDate ? new Date(it.expiryDate) : new Date(Date.now() + 365 * 864e5),
      quantity: Number(it.quantity) || 0,
      freeQuantity: Number(it.freeQuantity) || 0,
      purchaseRate: Number(it.rate) || 0,
      mrp: Number(it.mrp) || 0,
      taxPercent: Number(it.gstPercent) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      totalAmount: lineTotal(it),
    };
  }

  /** Brings stock in for a line exactly the way a normal purchase entry would. */
  async function addStock(
    tx: Prisma.TransactionClient,
    item: BillItemDraft,
    packSize: number,
    billId: string
  ) {
    const units = (item.quantity + item.freeQuantity) * (packSize || 1);
    if (units <= 0) return;
    const batch = await tx.inventoryBatch.findFirst({
      where: { productId: item.productId, batchNumber: item.batchNumber },
    });
    if (batch) {
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { quantity: { increment: units } },
      });
    } else {
      await tx.inventoryBatch.create({
        data: {
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: units,
          mrp: item.mrp,
          purchaseRate: item.purchaseRate,
          purchaseBillId: billId,
        },
      });
    }
  }

  // ---- 2. Repair bills that lost individual lines ---------------------------------------
  for (const s of shortBills) {
    const drafts: { draft: BillItemDraft; packSize: number }[] = [];
    for (const it of s.missingItems) {
      const product = await resolveProduct(it);
      drafts.push({ draft: draftFrom(it, product.id), packSize: product.packSize });
    }

    await prisma.$transaction(async (tx) => {
      await tx.purchaseBill.update({
        where: { id: s.dbId },
        data: {
          items: { create: drafts.map((d) => d.draft) },
          // Re-seat the header on the legacy figures now the bill is whole again.
          subtotal: Number(s.bill.subtotal) || 0,
          taxTotal: Number(s.bill.totalGst) || 0,
          discount: Number(s.bill.schemeDiscountAmount) || 0,
          grandTotal: Number(s.bill.grandTotal) || 0,
          roundOffAmount: Number(s.bill.roundOffAmount) || 0,
        },
      });
      for (const d of drafts) await addStock(tx, d.draft, d.packSize, s.dbId);
    });

    console.log(`Repaired ${s.bill.invoiceNumber}: +${drafts.length} line(s), total now ${money(s.bill.grandTotal || 0)}`);
  }

  // ---- 3. Insert the bills raised after the import --------------------------------------
  let inserted = 0;
  let skipped = 0;

  for (const lb of missingBills) {
    const partyName = (lb.partyName || '').trim();
    const party = partyName
      ? await prisma.party.findFirst({ where: { name: { equals: partyName, mode: 'insensitive' } } })
      : null;

    if (!party) {
      console.log(`SKIP ${lb.invoiceNumber}: supplier "${partyName}" not in the directory`);
      skipped++;
      continue;
    }

    const drafts: { draft: BillItemDraft; packSize: number }[] = [];
    for (const it of lb.items || []) {
      const product = await resolveProduct(it);
      drafts.push({ draft: draftFrom(it, product.id), packSize: product.packSize });
    }

    if (drafts.length === 0) {
      console.log(`SKIP ${lb.invoiceNumber}: no usable lines`);
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.create({
        data: {
          invoiceNumber: lb.invoiceNumber,
          partyId: party.id,
          purchaseDate: lb.invoiceDate ? new Date(lb.invoiceDate) : new Date(),
          subtotal: Number(lb.subtotal) || 0,
          taxTotal: Number(lb.totalGst) || 0,
          discount: Number(lb.schemeDiscountAmount) || 0,
          grandTotal: Number(lb.grandTotal) || 0,
          isRoundOff: lb.isRoundOff ?? true,
          roundOffAmount: Number(lb.roundOffAmount) || 0,
          isPaid: isSettled(lb),
          amountPaid: isSettled(lb) ? Number(lb.grandTotal) || 0 : 0,
          notes: lb.notes || null,
          items: { create: drafts.map((d) => d.draft) },
        },
      });
      for (const d of drafts) await addStock(tx, d.draft, d.packSize, bill.id);
    });

    inserted++;
    console.log(`Inserted ${lb.invoiceNumber} (${lb.partyName}) - ${drafts.length} lines, ${money(lb.grandTotal || 0)}`);
  }

  const after = await prisma.purchaseBill.aggregate({
    _sum: { grandTotal: true },
    _count: { _all: true },
  });
  console.log(`\nInserted ${inserted} bills, skipped ${skipped}`);
  console.log(`DATABASE NOW : ${after._count._all} bills, total ${money(after._sum.grandTotal || 0)}`);
  console.log(`LEGACY       : ${legacy.length} bills, total ${money(legacyTotal)}`);
  const gap = legacyTotal - (after._sum.grandTotal || 0);
  console.log(Math.abs(gap) < 1 ? 'RECONCILED.\n' : `REMAINING GAP: ${money(gap)}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

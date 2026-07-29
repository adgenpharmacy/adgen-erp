/**
 * Pure billing rules, extracted from the route handlers so they can be tested.
 *
 * Everything here is a plain function of its inputs: no database, no clock, no request. Every
 * bug this module exists to prevent shipped because the rule was buried inside an Express
 * handler where the only way to exercise it was to run the whole app and look at a screen.
 */

/** Rounds to paise, clearing binary floating-point dust like 1.05 * 20 = 21.000000000000004. */
export const money = (n: number): number => Math.round(n * 100) / 100;

/** Keeps fractional packs intact (0.5 stays 0.5); only clears float noise. */
export const qty = (n: number): number => Math.round(n * 1000) / 1000;

/** Local calendar date as YYYY-MM-DD. Never use toISOString() for this — that is UTC. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Decides the timestamp a bill should carry.
 *
 * Returns undefined when the row's own default (now, or the existing value) should stand.
 *
 * `new Date('2026-07-29')` is midnight **UTC** — 05:30 in India. Stamping every bill with that
 * put each sale at 05:30 regardless of when it was rung up, so the newest sale sorted below
 * yesterday's and vanished from the top of the list. A bill dated today keeps its real time; a
 * genuinely backdated one carries `reference`'s time of day so several entered in one sitting
 * still order correctly among themselves.
 */
export function resolveBillTimestamp(
  billDate: unknown,
  reference: Date,
  now: Date = new Date()
): Date | undefined {
  if (billDate === null || billDate === undefined) return undefined;
  const raw = String(billDate).trim();
  if (!raw) return undefined;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return undefined;

  const [, ys, ms, ds] = match;
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  const d = parseInt(ds, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;

  // Same calendar day as the reference: leave the timestamp alone.
  if (raw === localDateKey(reference)) return undefined;

  const moved = new Date(y, m - 1, d, reference.getHours(), reference.getMinutes(), reference.getSeconds());
  if (Number.isNaN(moved.getTime())) return undefined;
  // Round-trip guard: rejects 2026-02-31, which Date would roll into March.
  if (moved.getMonth() !== m - 1 || moved.getDate() !== d) return undefined;
  if (moved.getTime() > now.getTime()) return undefined;

  return moved;
}

/**
 * Parses an expiry, returning null rather than an Invalid Date.
 *
 * Accepts an ISO date or MM/YY. A batch with no valid expiry must never reach the database:
 * FEFO ordering depends on it, and an Invalid Date reaches Prisma as a raw driver error.
 */
export function parseExpiry(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const mmYy = /^(\d{1,2})\/(\d{2}(?:\d{2})?)$/.exec(raw);
  if (mmYy) {
    const m = parseInt(mmYy[1], 10);
    if (m < 1 || m > 12) return null;
    const yearPart = mmYy[2];
    const y = yearPart.length === 2 ? 2000 + parseInt(yearPart, 10) : parseInt(yearPart, 10);
    return new Date(Date.UTC(y, m - 1, 1));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Purchase line. Rates are tax-exclusive: discount comes off first, GST is added on top.
 */
export function purchaseLineTotals(input: {
  quantity: number;
  purchaseRate: number;
  discountPercent?: number;
  taxPercent?: number;
}): { gross: number; discount: number; net: number; tax: number; total: number } {
  const quantity = Number(input.quantity) || 0;
  const rate = Number(input.purchaseRate) || 0;
  const discountPercent = Number(input.discountPercent) || 0;
  const taxPercent = Number(input.taxPercent) || 0;

  const gross = quantity * rate;
  const discount = gross * (discountPercent / 100);
  const net = Math.max(0, gross - discount);
  const tax = net * (taxPercent / 100);

  return { gross: money(gross), discount: money(discount), net: money(net), tax: money(tax), total: money(net + tax) };
}

/**
 * Sale line. Indian retail MRP is tax-inclusive, so GST is extracted from the discounted
 * amount actually charged rather than added on top.
 */
export function saleLineTotals(input: {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}): { gross: number; discount: number; total: number; tax: number; subtotal: number } {
  const quantity = Number(input.quantity) || 0;
  const unitPrice = Number(input.unitPrice) || 0;
  const discountPercent = Number(input.discountPercent) || 0;
  const taxPercent = Number(input.taxPercent) || 0;

  const gross = quantity * unitPrice;
  const discount = gross * (discountPercent / 100);
  const total = Math.max(0, gross - discount);

  const rate = taxPercent / 100;
  const tax = rate > 0 ? total - total / (1 + rate) : 0;

  return { gross: money(gross), discount: money(discount), total: money(total), tax: money(tax), subtotal: money(total - tax) };
}

/**
 * Bill total from its line sums, applying the scheme discount then rounding to the rupee.
 * `roundOffAmount` is what was added or removed by rounding, so the stored columns always
 * reproduce the printed figure.
 */
export function billTotals(input: {
  subtotal: number;
  taxTotal: number;
  discount?: number;
  isRoundOff?: boolean;
  roundOffAmount?: number;
}): { grandTotal: number; roundOffAmount: number } {
  const subtotal = Number(input.subtotal) || 0;
  const taxTotal = Number(input.taxTotal) || 0;
  const discount = Math.max(0, Number(input.discount) || 0);
  const raw = Math.max(0, subtotal + taxTotal - discount);

  const shouldRound = input.isRoundOff === undefined ? true : Boolean(input.isRoundOff);
  if (shouldRound) {
    const grandTotal = Math.round(raw);
    return { grandTotal, roundOffAmount: money(grandTotal - raw) };
  }

  const roundOffAmount = Number(input.roundOffAmount) || 0;
  return { grandTotal: money(raw + roundOffAmount), roundOffAmount: money(roundOffAmount) };
}

/**
 * Next number in a series, derived from the highest already issued.
 *
 * Counting rows reuses a number after a deletion; reading the most recent row by date breaks
 * when a bill is backdated. Both produce duplicates, which is not acceptable on a GST series.
 */
export function nextSeriesNumber(existing: (string | null | undefined)[], prefix: string, width = 6): string {
  let highest = 0;
  for (const value of existing) {
    if (!value || !value.startsWith(prefix)) continue;
    const match = /(\d+)\s*$/.exec(value);
    if (!match) continue;
    const n = parseInt(match[1], 10);
    if (!Number.isNaN(n) && n > highest) highest = n;
  }
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

/**
 * Stock a purchase line puts on the shelf, in base units.
 * Free goods are stock received even though nothing was paid for them.
 */
export function unitsReceived(input: { quantity: number; freeQuantity?: number; packSize?: number }): number {
  const quantity = Number(input.quantity) || 0;
  const free = Number(input.freeQuantity) || 0;
  const packSize = Number(input.packSize) || 1;
  return qty((quantity + free) * (packSize > 0 ? packSize : 1));
}

/** Batch identity: product + batch number + expiry month. Case and blanks normalised. */
export function batchKey(productId: string, batchNumber: string | null | undefined, expiry: Date): string {
  const bn = ((batchNumber || '').trim() || 'DEFAULT').toUpperCase();
  const ym = `${expiry.getUTCFullYear()}-${String(expiry.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${productId}|${bn}|${ym}`;
}

/** A batch is sellable only while unexpired; FEFO must never reach for expired stock. */
export function isSellable(batch: { quantity: number; expiryDate: Date }, asOf: Date = new Date()): boolean {
  if (batch.quantity <= 0) return false;
  const startOfDay = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  return batch.expiryDate.getTime() >= startOfDay.getTime();
}

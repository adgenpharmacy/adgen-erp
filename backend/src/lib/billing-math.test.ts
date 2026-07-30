/**
 * Regression suite for the billing rules.
 *
 * Every block below names a bug that reached production. The point of the suite is not
 * coverage for its own sake — it is that each of these was found by the pharmacy owner on a
 * live counter, and none of them can recur silently now.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBillTimestamp,
  localDateKey,
  parseExpiry,
  purchaseLineTotals,
  saleLineTotals,
  billTotals,
  splitInclusiveTax,
  nextSeriesNumber,
  unitsReceived,
  batchKey,
  isSellable,
  money,
  qty,
} from './billing-math';

describe('resolveBillTimestamp — the midnight-UTC bug', () => {
  const now = new Date(2026, 6, 29, 18, 45, 12); // 29 Jul 2026, 18:45 local

  it('leaves today\'s bills alone so they keep the real time of sale', () => {
    // Was: new Date('2026-07-29') => midnight UTC => 05:30 IST on every bill, so the
    // newest sale sorted below yesterday's and disappeared from the top of the list.
    expect(resolveBillTimestamp('2026-07-29', now, now)).toBeUndefined();
  });

  it('backdates to the chosen day while keeping the reference time of day', () => {
    const result = resolveBillTimestamp('2026-07-27', now, now)!;
    expect(localDateKey(result)).toBe('2026-07-27');
    expect(result.getHours()).toBe(18);
    expect(result.getMinutes()).toBe(45);
  });

  it('never lands on midnight UTC', () => {
    const result = resolveBillTimestamp('2026-07-20', now, now)!;
    expect(result.getTime()).not.toBe(Date.UTC(2026, 6, 20));
  });

  it('refuses a future date', () => {
    expect(resolveBillTimestamp('2026-08-30', now, now)).toBeUndefined();
  });

  it('refuses junk, blanks and impossible dates rather than writing them', () => {
    for (const bad of ['', '   ', 'tomorrow', '29-07-2026', '2026-13-01', '2026-02-31', null, undefined, {}]) {
      expect(resolveBillTimestamp(bad, now, now)).toBeUndefined();
    }
  });
});

describe('localDateKey', () => {
  it('uses the local calendar date, not UTC', () => {
    // 00:30 IST on the 29th is still the 28th in UTC; toISOString() would report the wrong day.
    const justAfterMidnight = new Date(2026, 6, 29, 0, 30);
    expect(localDateKey(justAfterMidnight)).toBe('2026-07-29');
  });
});

describe('parseExpiry — invalid dates must never reach the database', () => {
  it('accepts MM/YY as the first of that month', () => {
    const d = parseExpiry('07/27')!;
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(6);
  });

  it('accepts a single-digit month', () => {
    expect(parseExpiry('7/27')!.getUTCMonth()).toBe(6);
  });

  it('accepts December, which the input normaliser used to mangle', () => {
    expect(parseExpiry('12/25')!.getUTCMonth()).toBe(11);
  });

  it('returns null for junk instead of an Invalid Date', () => {
    // Was: `new Date('Invalid Date')` handed straight to Prisma, which failed the whole save
    // and printed the entire bill payload on the counter's screen.
    for (const bad of ['Invalid Date', '', '  ', 'abcd', '13/27', '0/27', null, undefined]) {
      expect(parseExpiry(bad)).toBeNull();
    }
  });
});

describe('purchaseLineTotals — tax-exclusive, discount first', () => {
  it('applies the discount before adding GST', () => {
    const r = purchaseLineTotals({ quantity: 10, purchaseRate: 100, discountPercent: 10, taxPercent: 12 });
    expect(r.net).toBe(900);
    expect(r.tax).toBe(108);
    expect(r.total).toBe(1008);
  });

  it('never applies the discount twice', () => {
    const r = purchaseLineTotals({ quantity: 1, purchaseRate: 100, discountPercent: 10, taxPercent: 0 });
    expect(r.net).toBe(90); // not 81
  });

  it('keeps fractional pack quantities', () => {
    // The client routinely writes 0.5 packs; rounding it to a whole pack loses stock.
    expect(purchaseLineTotals({ quantity: 0.5, purchaseRate: 100, taxPercent: 0 }).net).toBe(50);
  });

  it('clears floating-point dust', () => {
    expect(purchaseLineTotals({ quantity: 1.05, purchaseRate: 20, taxPercent: 0 }).net).toBe(21);
  });
});

describe('saleLineTotals — MRP is tax-inclusive, so GST comes out of the price', () => {
  it('extracts tax rather than adding it', () => {
    const r = saleLineTotals({ quantity: 1, unitPrice: 105, taxPercent: 5 });
    expect(r.total).toBe(105);
    expect(r.tax).toBe(5);
    expect(r.subtotal).toBe(100);
  });

  it('applies the per-item discount before extracting tax', () => {
    // Was: discountPercent was stored but never applied, so a Rs 200 line with 10% off saved
    // at Rs 200. Revenue and output GST were overstated on every discounted sale.
    const r = saleLineTotals({ quantity: 1, unitPrice: 200, discountPercent: 10, taxPercent: 0 });
    expect(r.total).toBe(180);
  });

  it('handles a zero tax rate without dividing by zero', () => {
    expect(saleLineTotals({ quantity: 2, unitPrice: 50, taxPercent: 0 }).tax).toBe(0);
  });
});

describe('splitInclusiveTax — no GST is due on a discount never collected', () => {
  it('taxes each line at its own rate', () => {
    // Was: the counter sent a flat 12% for every line, so a 5% medicine was declared at 12%.
    const r = splitInclusiveTax([
      { total: 105, taxPercent: 5 },
      { total: 112, taxPercent: 12 },
    ]);
    expect(r.taxTotal).toBe(17);
    expect(r.subtotal).toBe(200);
  });

  it('takes the bill-level discount off before extracting tax', () => {
    // Rs 210 of 5% goods with Rs 10 off: tax is on the 200 charged, not on the 210 listed.
    const r = splitInclusiveTax([{ total: 210, taxPercent: 5 }], 10);
    expect(r.netTotal).toBe(200);
    expect(r.taxTotal).toBe(money(200 - 200 / 1.05));
    expect(money(r.subtotal + r.taxTotal)).toBe(200);
  });

  it('spreads the discount across lines in proportion to their value', () => {
    const r = splitInclusiveTax(
      [
        { total: 300, taxPercent: 12 },
        { total: 100, taxPercent: 5 },
      ],
      40
    );
    // 10% off the bill: 270 at 12% and 90 at 5%.
    expect(r.netTotal).toBe(360);
    expect(r.taxTotal).toBe(money(270 - 270 / 1.12 + (90 - 90 / 1.05)));
  });

  it('always reproduces the total actually charged', () => {
    const r = splitInclusiveTax([{ total: 99.99, taxPercent: 18 }, { total: 0.01, taxPercent: 0 }], 7.5);
    expect(money(r.subtotal + r.taxTotal)).toBe(r.netTotal);
  });

  it('never returns a negative total when the discount exceeds the bill', () => {
    const r = splitInclusiveTax([{ total: 100, taxPercent: 12 }], 500);
    expect(r.netTotal).toBe(0);
    expect(r.taxTotal).toBe(0);
  });

  it('leaves untaxed lines untaxed', () => {
    const r = splitInclusiveTax([{ total: 250 }], 0);
    expect(r.taxTotal).toBe(0);
    expect(r.subtotal).toBe(250);
  });
});

describe('billTotals', () => {
  it('subtracts the scheme discount then rounds to the rupee', () => {
    const r = billTotals({ subtotal: 2574.66, taxTotal: 128.73, discount: 174 });
    expect(r.grandTotal).toBe(2529);
    expect(Math.abs(r.roundOffAmount)).toBeLessThan(1);
  });

  it('reproduces the stored figure: subtotal + tax - discount + roundOff', () => {
    const r = billTotals({ subtotal: 100.4, taxTotal: 5.2, discount: 0 });
    expect(money(100.4 + 5.2 - 0 + r.roundOffAmount)).toBe(r.grandTotal);
  });

  it('never goes negative when the discount exceeds the bill', () => {
    expect(billTotals({ subtotal: 100, taxTotal: 0, discount: 500 }).grandTotal).toBe(0);
  });
});

describe('nextSeriesNumber — a GST series must not repeat', () => {
  it('follows the highest issued, not the row count', () => {
    // Counting rows reuses a number after a deletion.
    expect(nextSeriesNumber(['INV-000001', 'INV-000007'], 'INV-')).toBe('INV-000008');
  });

  it('is unaffected by order', () => {
    expect(nextSeriesNumber(['INV-000009', 'INV-000002'], 'INV-')).toBe('INV-000010');
  });

  it('ignores numbers from another series', () => {
    expect(nextSeriesNumber(['PUR-000099', 'INV-000003'], 'INV-')).toBe('INV-000004');
  });

  it('starts at one when nothing has been issued', () => {
    expect(nextSeriesNumber([], 'INV-')).toBe('INV-000001');
    expect(nextSeriesNumber([null, undefined, ''], 'INV-')).toBe('INV-000001');
  });
});

describe('unitsReceived', () => {
  it('multiplies packs by pack size', () => {
    expect(unitsReceived({ quantity: 2, packSize: 15 })).toBe(30);
  });

  it('counts free goods as stock received', () => {
    expect(unitsReceived({ quantity: 10, freeQuantity: 2, packSize: 10 })).toBe(120);
  });

  it('keeps fractional packs', () => {
    expect(unitsReceived({ quantity: 0.5, packSize: 10 })).toBe(5);
  });

  it('treats a missing or zero pack size as one', () => {
    expect(unitsReceived({ quantity: 3 })).toBe(3);
    expect(unitsReceived({ quantity: 3, packSize: 0 })).toBe(3);
  });
});

describe('batchKey — identity must include expiry', () => {
  it('separates the same batch number under different expiries', () => {
    // Matching on batch number alone merged two deliveries into one row and overwrote the
    // earlier expiry, which silently broke FEFO.
    const a = batchKey('p1', 'ANILA', new Date(Date.UTC(2027, 11, 1)));
    const b = batchKey('p1', 'ANILA', new Date(Date.UTC(2028, 0, 1)));
    expect(a).not.toBe(b);
  });

  it('normalises case and blanks so one batch is not stored twice', () => {
    const expiry = new Date(Date.UTC(2027, 5, 1));
    expect(batchKey('p1', 'anila', expiry)).toBe(batchKey('p1', ' ANILA ', expiry));
    expect(batchKey('p1', '', expiry)).toBe(batchKey('p1', 'DEFAULT', expiry));
  });
});

describe('isSellable — FEFO must never reach for expired stock', () => {
  const today = new Date(Date.UTC(2026, 6, 29));

  it('rejects an expired batch', () => {
    // FEFO sorts by expiry ascending, so without this an expired batch sorted to the front
    // and was dispensed first.
    expect(isSellable({ quantity: 10, expiryDate: new Date(Date.UTC(2026, 5, 1)) }, today)).toBe(false);
  });

  it('allows a batch expiring later today', () => {
    expect(isSellable({ quantity: 10, expiryDate: today }, today)).toBe(true);
  });

  it('rejects an empty batch', () => {
    expect(isSellable({ quantity: 0, expiryDate: new Date(Date.UTC(2027, 0, 1)) }, today)).toBe(false);
  });
});

describe('rounding helpers', () => {
  it('money rounds to paise', () => {
    expect(money(21.000000000000004)).toBe(21);
    expect(money(0.1 + 0.2)).toBe(0.3);
  });

  it('qty keeps three decimals so half packs survive', () => {
    expect(qty(0.5)).toBe(0.5);
    expect(qty(20.799999999999997)).toBe(20.8);
  });
});

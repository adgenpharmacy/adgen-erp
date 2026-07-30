/**
 * Every number the reports screen shows, derived in one place.
 *
 * The rule here is that nothing is a bare total: each figure is built from a list of rows that
 * can be shown to the person reading it. A pharmacy owner asked why the profit was what it was
 * and there was no way to answer beyond "the code adds it up" — so the aggregate types below all
 * carry the lines they were computed from.
 *
 * The arithmetic mirrors the server exactly (backend/src/lib/billing-math.ts). Where the two
 * could drift, the server is the authority and this module reproduces it:
 *
 *   - Retail MRP is GST-INCLUSIVE. Tax is extracted from the price, never added to it.
 *   - A per-item discount reduces its line before tax is extracted.
 *   - A bill-level discount is money never collected, so it too comes off before tax, spread
 *     across the lines in proportion to their value.
 *   - Purchase rates are GST-EXCLUSIVE: tax is added on top.
 *
 * Everything then depends on one question: is the shop registered for GST?
 *
 *   REGISTERED   — the tax inside the MRP belongs to the government, so it is not income; and
 *                  the tax paid to suppliers comes back as input credit, so it is not a cost.
 *                  Both sides are counted free of tax.
 *   UNREGISTERED — below the turnover threshold, the shop collects no tax and reclaims none.
 *                  The whole MRP is income, and the tax paid to suppliers is simply part of what
 *                  the stock cost. Both sides are counted inclusive of tax.
 *
 * Either is correct; mixing them is not. Counting the full MRP as income while still treating
 * supplier GST as recoverable overstates profit by the tax paid on purchases — on this shop's
 * data, by about ₹1,228.
 */
import type { Sale, SaleItem, Purchase, PurchaseItem, ReturnRecord, ReturnItem } from '@/types';

/** Rounds to paise, clearing binary floating-point dust like 1.05 * 20 = 21.000000000000004. */
export const money = (n: number): number => Math.round(n * 100) / 100;

const safe = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

// ─── Sale lines ─────────────────────────────────────────────────────────────

export interface SaleLine {
  billId: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  paymentMethod: string;

  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string | null;

  /** Content units (tablets), not packs. */
  quantity: number;
  packSize: number;
  /** Per content unit, GST-inclusive. */
  unitPrice: number;

  /** quantity × unitPrice, before any discount. */
  gross: number;
  itemDiscountPercent: number;
  itemDiscount: number;
  /** This line's share of the bill-level discount. */
  billDiscountShare: number;
  /** What the customer actually paid for this line, GST included. */
  charged: number;

  taxPercent: number;
  /** GST contained in `charged`. */
  tax: number;
  /** charged − tax: the part that is the shop's income. */
  revenueExGst: number;

  /** Purchase rate per content unit, GST-exclusive. */
  unitCost: number;
  cost: number;
  /** False when no purchase rate was ever recorded — the line is then excluded from COGS. */
  costKnown: boolean;

  profit: number;
  marginPercent: number;
}

export type GstMode = 'REGISTERED' | 'UNREGISTERED';

/**
 * True cost of one content unit of a batch, keyed by product + batch number.
 *
 * `batch.purchaseRate` is the bare rate off the supplier's bill: before its discount and before
 * the GST added on top. What the stock actually cost is the whole landed amount — rate, plus
 * tax, less the discount — spread over every unit received, free goods included, because those
 * arrived without adding to the invoice.
 *
 * Built from the purchase lines rather than stored on the batch, so it always reflects the
 * current state of the purchase bills even after one is edited.
 */
export interface LandedCost {
  /** Cost per content unit with the GST paid to the supplier excluded. */
  exTax: number;
  /** Cost per content unit with that GST included. */
  incTax: number;
}

export type LandedCostIndex = Map<string, LandedCost>;

const landedKey = (productId: string, batchNumber?: string | null) =>
  `${productId}|${(batchNumber || '').trim().toUpperCase()}`;

/**
 * Both figures are kept because which one is the true cost depends on registration, and only
 * one basis may be used at a time.
 *
 * Reading the cost off `batch.purchaseRate` instead — the bare printed rate — overstates it:
 * it ignores the supplier's line discount, the scheme discount on the bill, and the free goods
 * that arrived with it. Distributors here give all three, so the printed rate is rarely what
 * the stock cost.
 */
export function buildLandedCostIndex(purchases: Purchase[]): LandedCostIndex {
  const index: LandedCostIndex = new Map();

  for (const bill of purchases) {
    const items = bill.items || [];

    const perLine = items.map((i) => {
      const gross = safe(i.quantity) * safe(i.purchaseRate);
      const net = Math.max(0, gross - gross * (safe(i.discountPercent) / 100));
      const tax = net * (safe(i.taxPercent) / 100);
      return { net, total: net + tax };
    });

    // The supplier's bill-level discount belongs to the goods too, in proportion to their value.
    const billTotal = perLine.reduce((s, v) => s + v.total, 0);
    const billDiscount = Math.min(Math.max(0, safe(bill.discount)), billTotal);
    const factor = billTotal > 0 ? (billTotal - billDiscount) / billTotal : 1;

    items.forEach((i, idx) => {
      const packSize = safe(i.product?.packSize) || 1;
      // Free goods are units received for no extra money, so they pull the unit cost down.
      const packs = safe(i.quantity) + safe(i.freeQuantity);
      if (packs <= 0) return;

      const divisor = packs * packSize;
      // Latest purchase of a batch wins: it is the price that stock is actually sitting at.
      index.set(landedKey(i.productId, i.batchNumber), {
        exTax: (perLine[idx].net * factor) / divisor,
        incTax: (perLine[idx].total * factor) / divisor,
      });
    });
  }

  return index;
}

export interface ExplodeOptions {
  mode: GstMode;
  landedCost?: LandedCostIndex;
}

export interface ExplodedSale {
  bill: Sale;
  lines: SaleLine[];
  /** Proportion of each line that survives the bill-level discount (1 when there is none). */
  billDiscountFactor: number;
  gross: number;
  itemDiscount: number;
  billDiscount: number;
  charged: number;
  tax: number;
  revenueExGst: number;
  cost: number;
  profit: number;
  /** Difference between the lines' total and the bill's stored grandTotal (rounding, mostly). */
  roundOff: number;
  hasUnknownCost: boolean;
}

/**
 * Breaks one bill into its lines with the full derivation of every figure.
 *
 * `unitPrice` is per content unit and `purchaseRate` is per pack, so the cost side is divided by
 * packSize. Getting that wrong makes COGS packSize times too large and reports a phantom loss —
 * it is the single easiest mistake to make in this codebase.
 */
export function explodeSale(bill: Sale, options: ExplodeOptions = { mode: 'REGISTERED' }): ExplodedSale {
  const { mode, landedCost } = options;
  const registered = mode === 'REGISTERED';
  const items = bill.items || [];

  const lineCharges = items.map((i: SaleItem) => {
    const gross = safe(i.quantity) * safe(i.unitPrice);
    const itemDiscount = gross * (safe(i.discountPercent) / 100);
    return Math.max(0, gross - itemDiscount);
  });

  const afterItemDiscounts = lineCharges.reduce((s, v) => s + v, 0);
  const billDiscount = Math.min(Math.max(0, safe(bill.discount)), afterItemDiscounts);
  const billDiscountFactor = afterItemDiscounts > 0 ? (afterItemDiscounts - billDiscount) / afterItemDiscounts : 1;

  const lines: SaleLine[] = items.map((i: SaleItem, idx: number) => {
    const quantity = safe(i.quantity);
    const unitPrice = safe(i.unitPrice);
    const packSize = safe(i.product?.packSize) || 1;

    const gross = quantity * unitPrice;
    const itemDiscountPercent = safe(i.discountPercent);
    const itemDiscount = gross * (itemDiscountPercent / 100);
    const afterItem = lineCharges[idx];
    const charged = afterItem * billDiscountFactor;
    const billDiscountShare = afterItem - charged;

    const taxPercent = safe(i.taxPercent);
    const rate = taxPercent / 100;
    /*
     * The tax sitting inside the price is always worked out — it is shown as information even
     * when the shop is not registered — but it is only taken off income when it is genuinely
     * owed to the government.
     */
    const tax = rate > 0 ? charged - charged / (1 + rate) : 0;
    const revenueExGst = registered ? charged - tax : charged;

    /*
     * Cost. Preference order:
     *   1. the landed cost worked out from the supplier's own bill (rate + GST − discount),
     *   2. the batch rate grossed up by the GST paid on it,
     *   3. the product's default rate, likewise grossed up.
     * When registered, that tax comes back as input credit, so the bare rate is the cost.
     */
    const landed = landedCost?.get(landedKey(i.productId, i.batch?.batchNumber));
    const landedPerUnit = registered ? landed?.exTax : landed?.incTax;
    const packRate = i.batch?.purchaseRate ?? i.product?.purchaseRate ?? null;
    const costTaxRate = safe(i.batch?.taxPercent ?? i.product?.gstPercent) / 100;

    let unitCost = 0;
    let costKnown = false;
    if (landedPerUnit && landedPerUnit > 0) {
      unitCost = landedPerUnit;
      costKnown = true;
    } else if (packRate !== null && packRate !== undefined && safe(packRate) > 0) {
      // No purchase line to trace back to — fall back to the batch's rate, grossed up when the
      // tax on it cannot be reclaimed.
      const bare = safe(packRate) / packSize;
      unitCost = registered ? bare : bare * (1 + costTaxRate);
      costKnown = true;
    }

    const cost = quantity * unitCost;
    const profit = costKnown ? revenueExGst - cost : 0;

    return {
      billId: bill.id,
      invoiceNumber: bill.invoiceNumber || bill.id.slice(0, 8),
      date: bill.createdAt,
      customerName: bill.customerName || bill.customer?.name || 'Walk-in Customer',
      paymentMethod: String(bill.paymentMethod || 'CASH'),

      productId: i.productId,
      productName: i.product?.name || 'Unnamed medicine',
      batchNumber: i.batch?.batchNumber || '—',
      expiryDate: i.batch?.expiryDate || null,

      quantity,
      packSize,
      unitPrice,

      gross: money(gross),
      itemDiscountPercent,
      itemDiscount: money(itemDiscount),
      billDiscountShare: money(billDiscountShare),
      charged: money(charged),

      taxPercent,
      tax: money(tax),
      revenueExGst: money(revenueExGst),

      unitCost: money(unitCost),
      cost: money(cost),
      costKnown,

      profit: money(profit),
      marginPercent: revenueExGst > 0 && costKnown ? (profit / revenueExGst) * 100 : 0,
    };
  });

  const sum = (pick: (l: SaleLine) => number) => money(lines.reduce((s, l) => s + pick(l), 0));
  const charged = sum((l) => l.charged);

  return {
    bill,
    lines,
    billDiscountFactor,
    gross: sum((l) => l.gross),
    itemDiscount: sum((l) => l.itemDiscount),
    billDiscount: money(billDiscount),
    charged,
    tax: sum((l) => l.tax),
    revenueExGst: sum((l) => l.revenueExGst),
    cost: sum((l) => (l.costKnown ? l.cost : 0)),
    profit: sum((l) => l.profit),
    roundOff: money(safe(bill.grandTotal) - charged),
    hasUnknownCost: lines.some((l) => !l.costKnown),
  };
}

// ─── Purchase lines ─────────────────────────────────────────────────────────

export interface PurchaseLine {
  billId: string;
  invoiceNumber: string;
  date: string;
  supplierName: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string | null;
  /** Packs, plus any free goods received alongside. */
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  mrp: number;
  gross: number;
  discountPercent: number;
  discount: number;
  /** Taxable value: what the tax is charged on. */
  net: number;
  taxPercent: number;
  tax: number;
  total: number;
}

export interface ExplodedPurchase {
  bill: Purchase;
  lines: PurchaseLine[];
  gross: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
  billDiscount: number;
  roundOff: number;
}

/** Purchase rates are tax-exclusive: the discount comes off first, then GST is added on top. */
export function explodePurchase(bill: Purchase): ExplodedPurchase {
  const items = bill.items || [];

  const lines: PurchaseLine[] = items.map((i: PurchaseItem) => {
    const quantity = safe(i.quantity);
    const purchaseRate = safe(i.purchaseRate);
    const gross = quantity * purchaseRate;
    const discountPercent = safe(i.discountPercent);
    const discount = gross * (discountPercent / 100);
    const net = Math.max(0, gross - discount);
    const taxPercent = safe(i.taxPercent);
    const tax = net * (taxPercent / 100);

    return {
      billId: bill.id,
      invoiceNumber: bill.invoiceNumber,
      date: bill.purchaseDate || bill.createdAt,
      supplierName: bill.party?.name || 'Unnamed supplier',
      productId: i.productId,
      productName: i.product?.name || 'Unnamed medicine',
      batchNumber: i.batchNumber || '—',
      expiryDate: i.expiryDate || null,
      quantity,
      freeQuantity: safe(i.freeQuantity),
      purchaseRate,
      mrp: safe(i.mrp),
      gross: money(gross),
      discountPercent,
      discount: money(discount),
      net: money(net),
      taxPercent,
      tax: money(tax),
      total: money(net + tax),
    };
  });

  const sum = (pick: (l: PurchaseLine) => number) => money(lines.reduce((s, l) => s + pick(l), 0));
  const total = sum((l) => l.total);
  const billDiscount = money(safe(bill.discount));

  return {
    bill,
    lines,
    gross: sum((l) => l.gross),
    discount: sum((l) => l.discount),
    net: sum((l) => l.net),
    tax: sum((l) => l.tax),
    total,
    billDiscount,
    roundOff: money(safe(bill.grandTotal) - (total - billDiscount)),
  };
}

// ─── Returns ────────────────────────────────────────────────────────────────

export interface ReturnLine {
  returnId: string;
  returnNumber: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  /** GST-inclusive value credited back to the customer. */
  refunded: number;
  taxPercent: number;
  /** GST reversed — no longer owed to the government. */
  tax: number;
  revenueReversed: number;
  restocked: boolean;
  /** Cost that came back into stock; only restocked goods can. */
  costReversed: number;
}

/**
 * Credit notes, valued at the rate the goods were originally sold at.
 *
 * A return reverses the sale including the tax on it. Reporting revenue net of returns while
 * leaving output GST untouched charges the shop for tax it no longer owes, and takes the same
 * money off profit twice.
 */
export function explodeReturns(
  returns: ReturnRecord[],
  rateByProduct: Map<string, number>,
  costByProduct: Map<string, number>
): ReturnLine[] {
  const lines: ReturnLine[] = [];

  for (const r of returns) {
    for (const i of (r.items || []) as ReturnItem[]) {
      const quantity = safe(i.quantity);
      const refunded = safe(i.totalAmount) || quantity * safe(i.unitPrice);
      const taxPercent = rateByProduct.get(i.productId) || 0;
      const rate = taxPercent / 100;
      const tax = rate > 0 ? refunded - refunded / (1 + rate) : 0;
      const restocked = !i.condition || i.condition === 'RESTOCK';
      const unitCost = costByProduct.get(i.productId) || 0;

      lines.push({
        returnId: r.id,
        returnNumber: r.returnNumber,
        date: r.createdAt,
        productId: i.productId,
        productName: i.product?.name || i.productName || 'Unnamed medicine',
        quantity,
        refunded: money(refunded),
        taxPercent,
        tax: money(tax),
        revenueReversed: money(refunded - tax),
        restocked,
        costReversed: money(restocked ? quantity * unitCost : 0),
      });
    }
  }

  return lines;
}

// ─── Aggregations ───────────────────────────────────────────────────────────

export interface DayRow {
  day: string;
  label: string;
  bills: number;
  gross: number;
  itemDiscount: number;
  billDiscount: number;
  charged: number;
  tax: number;
  revenueExGst: number;
  cost: number;
  profit: number;
  marginPercent: number;
  saleIds: string[];
}

/** Local calendar day. Never toISOString(): that is UTC and rolls the date over at 05:30 in IST. */
export function dayKeyOf(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function aggregateByDay(sales: ExplodedSale[]): DayRow[] {
  const byDay = new Map<string, DayRow>();

  for (const s of sales) {
    const day = dayKeyOf(s.bill.createdAt);
    let row = byDay.get(day);
    if (!row) {
      const [y, m, d] = day.split('-').map(Number);
      row = {
        day,
        label: Number.isNaN(y)
          ? 'Unknown date'
          : new Date(y, m - 1, d).toLocaleDateString('en-IN', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
        bills: 0,
        gross: 0,
        itemDiscount: 0,
        billDiscount: 0,
        charged: 0,
        tax: 0,
        revenueExGst: 0,
        cost: 0,
        profit: 0,
        marginPercent: 0,
        saleIds: [],
      };
      byDay.set(day, row);
    }

    row.bills += 1;
    row.gross += s.gross;
    row.itemDiscount += s.itemDiscount;
    row.billDiscount += s.billDiscount;
    row.charged += s.charged;
    row.tax += s.tax;
    row.revenueExGst += s.revenueExGst;
    row.cost += s.cost;
    row.profit += s.profit;
    row.saleIds.push(s.bill.id);
  }

  return [...byDay.values()]
    .map((r) => ({
      ...r,
      gross: money(r.gross),
      itemDiscount: money(r.itemDiscount),
      billDiscount: money(r.billDiscount),
      charged: money(r.charged),
      tax: money(r.tax),
      revenueExGst: money(r.revenueExGst),
      cost: money(r.cost),
      profit: money(r.profit),
      marginPercent: r.revenueExGst > 0 ? (r.profit / r.revenueExGst) * 100 : 0,
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export interface ProductRow {
  productId: string;
  productName: string;
  quantity: number;
  bills: number;
  charged: number;
  tax: number;
  revenueExGst: number;
  cost: number;
  profit: number;
  marginPercent: number;
  costKnown: boolean;
  lines: SaleLine[];
}

export function aggregateByProduct(sales: ExplodedSale[]): ProductRow[] {
  const byProduct = new Map<string, ProductRow>();

  for (const s of sales) {
    for (const line of s.lines) {
      let row = byProduct.get(line.productId);
      if (!row) {
        row = {
          productId: line.productId,
          productName: line.productName,
          quantity: 0,
          bills: 0,
          charged: 0,
          tax: 0,
          revenueExGst: 0,
          cost: 0,
          profit: 0,
          marginPercent: 0,
          costKnown: true,
          lines: [],
        };
        byProduct.set(line.productId, row);
      }
      row.quantity += line.quantity;
      row.charged += line.charged;
      row.tax += line.tax;
      row.revenueExGst += line.revenueExGst;
      row.cost += line.costKnown ? line.cost : 0;
      row.profit += line.profit;
      if (!line.costKnown) row.costKnown = false;
      row.lines.push(line);
    }
  }

  return [...byProduct.values()]
    .map((r) => ({
      ...r,
      bills: new Set(r.lines.map((l) => l.billId)).size,
      charged: money(r.charged),
      tax: money(r.tax),
      revenueExGst: money(r.revenueExGst),
      cost: money(r.cost),
      profit: money(r.profit),
      marginPercent: r.revenueExGst > 0 ? (r.profit / r.revenueExGst) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);
}

export interface GstSlabRow {
  taxPercent: number;
  /** Value the tax was charged on, tax excluded. */
  taxableValue: number;
  tax: number;
  /** Tax-inclusive value, for reconciling against the bills. */
  inclusiveValue: number;
  lineCount: number;
}

/** Output tax by rate slab — the shape GSTR-1 is filed in. */
export function salesByGstSlab(sales: ExplodedSale[]): GstSlabRow[] {
  const slabs = new Map<number, GstSlabRow>();

  for (const s of sales) {
    for (const l of s.lines) {
      const key = l.taxPercent;
      const row = slabs.get(key) || { taxPercent: key, taxableValue: 0, tax: 0, inclusiveValue: 0, lineCount: 0 };
      row.taxableValue += l.revenueExGst;
      row.tax += l.tax;
      row.inclusiveValue += l.charged;
      row.lineCount += 1;
      slabs.set(key, row);
    }
  }

  return [...slabs.values()]
    .map((r) => ({
      ...r,
      taxableValue: money(r.taxableValue),
      tax: money(r.tax),
      inclusiveValue: money(r.inclusiveValue),
    }))
    .sort((a, b) => a.taxPercent - b.taxPercent);
}

/** Input tax by rate slab — what can be claimed back against the output tax above. */
export function purchasesByGstSlab(purchases: ExplodedPurchase[]): GstSlabRow[] {
  const slabs = new Map<number, GstSlabRow>();

  for (const p of purchases) {
    for (const l of p.lines) {
      const key = l.taxPercent;
      const row = slabs.get(key) || { taxPercent: key, taxableValue: 0, tax: 0, inclusiveValue: 0, lineCount: 0 };
      row.taxableValue += l.net;
      row.tax += l.tax;
      row.inclusiveValue += l.total;
      row.lineCount += 1;
      slabs.set(key, row);
    }
  }

  return [...slabs.values()]
    .map((r) => ({
      ...r,
      taxableValue: money(r.taxableValue),
      tax: money(r.tax),
      inclusiveValue: money(r.inclusiveValue),
    }))
    .sort((a, b) => a.taxPercent - b.taxPercent);
}

// ─── Period summary ─────────────────────────────────────────────────────────

export interface PeriodSummary {
  mode: GstMode;
  billCount: number;
  gross: number;
  itemDiscount: number;
  billDiscount: number;
  /** Sum of the bills' stored grandTotal — cash through the till, GST included. */
  charged: number;
  roundOff: number;

  returnedInclusive: number;
  returnedTax: number;
  returnedRevenue: number;
  returnedCost: number;

  outputTax: number;
  netRevenueExGst: number;

  cogs: number;
  cogsCoveragePercent: number;
  revenueWithoutCost: number;

  grossProfit: number;
  marginPercent: number;

  purchaseCount: number;
  purchaseNet: number;
  /** Claimable input credit — zero when not registered. */
  inputTax: number;
  /** GST actually handed to suppliers. Information when registered, a real cost when not. */
  supplierTaxPaid: number;
  purchaseTotal: number;

  netGstPayable: number;
  inputCreditCarried: number;

  cash: number;
  upi: number;
  card: number;
  credit: number;
}

export function summarise(
  sales: ExplodedSale[],
  purchases: ExplodedPurchase[],
  returnLines: ReturnLine[],
  mode: GstMode = 'REGISTERED'
): PeriodSummary {
  const registered = mode === 'REGISTERED';
  const add = (n: number[]) => n.reduce((s, v) => s + v, 0);

  const gross = add(sales.map((s) => s.gross));
  const itemDiscount = add(sales.map((s) => s.itemDiscount));
  const billDiscount = add(sales.map((s) => s.billDiscount));
  const charged = add(sales.map((s) => safe(s.bill.grandTotal)));
  const roundOff = add(sales.map((s) => s.roundOff));
  const outputTaxGross = add(sales.map((s) => s.tax));

  const returnedInclusive = add(returnLines.map((l) => l.refunded));
  const returnedTax = add(returnLines.map((l) => l.tax));
  const returnedRevenue = add(returnLines.map((l) => l.revenueReversed));
  const returnedCost = add(returnLines.map((l) => l.costReversed));

  /*
   * Unregistered: no tax is owed on a sale and none is reclaimable on a purchase, so both
   * liabilities are nil. The tax figures are still computed above and shown as information —
   * "this much of your MRP is tax the manufacturer already paid" — but they never move profit.
   */
  const outputTax = registered ? Math.max(0, outputTaxGross - returnedTax) : 0;
  const netRevenueExGst = add(sales.map((s) => s.revenueExGst)) - returnedRevenue;

  const cogsGross = add(sales.map((s) => s.cost));
  const cogs = Math.max(0, cogsGross - returnedCost);

  const coveredRevenue = add(
    sales.map((s) => add(s.lines.filter((l) => l.costKnown).map((l) => l.revenueExGst)))
  );
  const uncoveredRevenue = add(
    sales.map((s) => add(s.lines.filter((l) => !l.costKnown).map((l) => l.revenueExGst)))
  );
  const totalLineRevenue = coveredRevenue + uncoveredRevenue;

  const grossProfit = netRevenueExGst - cogs;

  const purchaseNet = add(purchases.map((p) => p.net));
  // Input tax is only a credit when registered; otherwise it is part of what the stock cost.
  const inputTax = registered ? add(purchases.map((p) => p.tax)) : 0;
  const supplierTaxPaid = add(purchases.map((p) => p.tax));
  const purchaseTotal = add(purchases.map((p) => safe(p.bill.grandTotal)));

  const tender = (field: 'cashAmount' | 'upiAmount' | 'cardAmount' | 'creditAmount', method: string) =>
    add(
      sales.map((s) =>
        String(s.bill.paymentMethod) === 'SPLIT'
          ? safe(s.bill[field])
          : String(s.bill.paymentMethod) === method
            ? safe(s.bill.grandTotal)
            : 0
      )
    );

  return {
    mode,
    billCount: sales.length,
    gross: money(gross),
    itemDiscount: money(itemDiscount),
    billDiscount: money(billDiscount),
    charged: money(charged),
    roundOff: money(roundOff),

    returnedInclusive: money(returnedInclusive),
    returnedTax: money(returnedTax),
    returnedRevenue: money(returnedRevenue),
    returnedCost: money(returnedCost),

    outputTax: money(outputTax),
    netRevenueExGst: money(netRevenueExGst),

    cogs: money(cogs),
    cogsCoveragePercent: totalLineRevenue > 0 ? (coveredRevenue / totalLineRevenue) * 100 : 100,
    revenueWithoutCost: money(uncoveredRevenue),

    grossProfit: money(grossProfit),
    marginPercent: netRevenueExGst > 0 ? (grossProfit / netRevenueExGst) * 100 : 0,

    purchaseCount: purchases.length,
    purchaseNet: money(purchaseNet),
    inputTax: money(inputTax),
    supplierTaxPaid: money(supplierTaxPaid),
    purchaseTotal: money(purchaseTotal),

    netGstPayable: money(Math.max(0, outputTax - inputTax)),
    inputCreditCarried: money(Math.max(0, inputTax - outputTax)),

    cash: money(tender('cashAmount', 'CASH')),
    upi: money(tender('upiAmount', 'UPI')),
    card: money(tender('cardAmount', 'CARD')),
    credit: money(tender('creditAmount', 'CREDIT')),
  };
}

/** Sale-line tax rates and unit costs, keyed by product — used to value credit notes. */
export function referenceRates(sales: ExplodedSale[]) {
  const rateByProduct = new Map<string, number>();
  const costByProduct = new Map<string, number>();

  for (const s of sales) {
    for (const l of s.lines) {
      if (l.taxPercent > 0) rateByProduct.set(l.productId, l.taxPercent);
      if (l.costKnown) costByProduct.set(l.productId, l.unitCost);
    }
  }

  return { rateByProduct, costByProduct };
}

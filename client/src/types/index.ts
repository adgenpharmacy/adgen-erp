/**
 * API response types.
 *
 * These describe what the Express/Prisma backend actually sends over the wire, which is not
 * always the same as the Prisma model:
 *   - `DateTime` columns arrive as ISO strings, never `Date` objects.
 *   - Several endpoints return a hand-built projection with computed fields
 *     (`systemStock`, `creditBalance`, `outstandingBalance`, `outstandingAmount`) and omit
 *     columns the model has. Those differences are called out on each type.
 *
 * Prefer these over `any` so a mistyped field is a build error rather than a silently
 * wrong number on an invoice.
 */

/** ISO-8601 timestamp string, e.g. "2026-07-27T18:56:13.262Z". */
export type IsoDate = string;

export type Role = 'OWNER' | 'EMPLOYEE';

export type ProductType =
  | 'TABLET' | 'CAPSULE' | 'SYRUP' | 'INJECTION'
  | 'CREAM' | 'DROPS' | 'OINTMENT' | 'POWDER' | 'OTHERS';

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';

export type LedgerTransactionType = 'DEBIT' | 'CREDIT';

// ─── Users ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation?: string | null;
  isApproved?: boolean;
  isActive?: boolean;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  genericName?: string | null;
  companyName?: string | null;
  hsnCode?: string | null;
  gstPercent: number;
  productType: ProductType;
  division?: string | null;
  packSize: number;
  packUnit?: string | null;
  contentUnit?: string | null;
  requiresColdStorage: boolean;
  lowStockThreshold: number;
  isActive: boolean;
  mrp?: number | null;
  purchaseRate?: number | null;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
  /** GET /products includes only the single newest batch. */
  batches?: InventoryBatch[];
}

export interface InventoryBatch {
  id: string;
  productId: string;
  batchNumber: string;
  expiryDate: IsoDate;
  quantity: number;
  mrp: number;
  purchaseRate: number;
  /** GST rate from the supplier bill that brought this batch in; sales are taxed at this rate. */
  taxPercent?: number;
  purchaseDate?: IsoDate;
  purchaseBillId?: string | null;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
}

/**
 * GET /inventory — a hand-built projection, not the Product model.
 *
 * Note it does NOT include `hsnCode`, `requiresColdStorage`, `gstPercent`, `division`
 * or `isActive`. Reading those off an inventory row always yields undefined.
 */
export interface InventoryItem {
  id: string;
  productId: string;
  name: string;
  productName: string;
  genericName?: string | null;
  companyName?: string | null;
  productType: ProductType;
  packSize: number;
  packUnit: string;
  contentUnit: string;
  mrp: number;
  purchaseRate: number;
  /** The product's configured GST rate — only a fallback when a batch carries none. */
  gstPercent?: number;
  lowStockThreshold: number;
  /** Total quantity in content units (tablets), summed across every batch. */
  systemStock: number;
  totalMrpValue: number;
  /** Valued at the bare supplier rate — the cost basis for a GST-registered shop. */
  totalCostValue: number;
  /** Valued at rate plus the GST paid on it — the cost basis when that tax cannot be reclaimed. */
  totalCostValueInclGst?: number;
  /** Every batch, ordered by expiry ascending (FEFO). */
  batches: InventoryBatch[];
}

// ─── Directory ──────────────────────────────────────────────────────────────

export interface Party {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  dlNumber?: string | null;
  isActive?: boolean;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
  /** Computed by GET /parties: unpaid total across this supplier's purchase bills. */
  outstandingBalance?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  doctorName?: string | null;
  gstNumber?: string | null;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
  /** Computed by GET /customers: unpaid credit net of unlinked credit notes. */
  creditBalance?: number;
}

// ─── Sales ──────────────────────────────────────────────────────────────────

/**
 * Nested product on a LIST response line (GET /sales, GET /purchases) — a narrow `select`,
 * so it carries no id and only these columns.
 *
 * The DETAIL endpoints (GET /sales/:id, GET /purchases/:id) `include` the full product
 * instead; see `SaleDetail` / `PurchaseDetail`.
 */
export interface SaleItemProduct {
  name: string;
  /** Required on a printed GST tax invoice. */
  genericName?: string | null;
  hsnCode?: string | null;
  gstPercent?: number;
  /** Default pack purchase rate — the COGS fallback when a batch has none recorded. */
  purchaseRate?: number | null;
  packSize: number;
  packUnit?: string | null;
  contentUnit?: string | null;
}

/** Nested batch on a sales line — a narrow `select`, so it carries no id. */
export interface SaleItemBatch {
  batchNumber: string;
  expiryDate: IsoDate;
  purchaseRate: number;
  mrp: number;
  /** GST rate this stock was purchased at. Part of the cost when it cannot be reclaimed. */
  taxPercent?: number;
}

export interface SaleItem {
  id: string;
  salesBillId: string;
  productId: string;
  batchId: string;
  /** Quantity in content units (tablets), not packs. */
  quantity: number;
  /** Price per content unit, i.e. pack MRP ÷ packSize. */
  unitPrice: number;
  taxPercent: number;
  discountPercent: number;
  totalAmount: number;
  product?: SaleItemProduct;
  batch?: SaleItemBatch;
}

export interface Sale {
  id: string;
  invoiceNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  doctorName?: string | null;
  notes?: string | null;
  userId?: string | null;
  subtotal: number;
  taxTotal: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  creditAmount: number;
  paymentMethod: PaymentMethod | string;
  isPaid: boolean;
  isSettled: boolean;
  isRoundOff: boolean;
  roundOffAmount: number;
  createdAt: IsoDate;
  updatedAt?: IsoDate;
  customer?: Customer | null;
  user?: Pick<User, 'id' | 'name'> | null;
  items?: SaleItem[];
}

/** GET /sales/:id — items carry the FULL product and batch, not the narrow list select. */
export interface SaleDetailItem extends Omit<SaleItem, 'product' | 'batch'> {
  product?: Product;
  batch?: InventoryBatch;
}

export interface SaleDetail extends Omit<Sale, 'items'> {
  items?: SaleDetailItem[];
}

// ─── Purchases ──────────────────────────────────────────────────────────────

export interface PurchaseItem {
  id: string;
  purchaseBillId: string;
  productId: string;
  batchNumber: string;
  expiryDate: IsoDate;
  /** Quantity in packs (strips). */
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  mrp: number;
  taxPercent: number;
  discountPercent: number;
  totalAmount: number;
  product?: SaleItemProduct;
}

export interface Purchase {
  id: string;
  invoiceNumber: string;
  partyId: string;
  purchaseDate: IsoDate;
  subtotal: number;
  taxTotal: number;
  /** Bill-level (scheme) discount from the supplier, on top of per-item discounts. */
  discount: number;
  grandTotal: number;
  amountPaid: number;
  isPaid: boolean;
  isRoundOff: boolean;
  roundOffAmount: number;
  notes?: string | null;
  createdAt: IsoDate;
  updatedAt?: IsoDate;
  party?: Party | null;
  items?: PurchaseItem[];
}

/** GET /purchases/:id — items carry the FULL product. */
export interface PurchaseDetailItem extends Omit<PurchaseItem, 'product'> {
  product?: Product;
}

export interface PurchaseDetail extends Omit<Purchase, 'items'> {
  items?: PurchaseDetailItem[];
}

// ─── Returns ────────────────────────────────────────────────────────────────

export interface ReturnItem {
  id?: string;
  productId: string;
  batchNumber?: string | null;
  quantity: number;
  /** Present on sales-return lines. */
  unitPrice?: number;
  /** Present on purchase-return lines. */
  purchaseRate?: number;
  totalAmount?: number;
  condition?: 'RESTOCK' | 'DAMAGED' | string;
  reason?: string | null;
  product?: Pick<SaleItemProduct, 'name'> & { name: string };
  productName?: string;
}

export interface ReturnRecord {
  id: string;
  returnNumber: string;
  totalReturnAmount: number;
  refundMethod?: string | null;
  notes?: string | null;
  createdAt: IsoDate;
  updatedAt?: IsoDate;
  items?: ReturnItem[];
}

// ─── Ledger ─────────────────────────────────────────────────────────────────

/**
 * GET /ledger merges real `ledger_entries` rows with synthetic rows built from unpaid
 * credit sales and unpaid purchase bills. Synthetic rows have an id prefixed `synth-`
 * and must not be sent back as a `ledgerId`.
 */
export interface LedgerEntry {
  id: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyId?: string | null;
  customerId?: string | null;
  transactionType: LedgerTransactionType;
  /** What was originally owed. */
  amount: number;
  /** Live balance recomputed against the linked bill's payments — show this, not `amount`. */
  outstandingAmount: number;
  paymentMethod?: string | null;
  purchaseBillId?: string | null;
  salesBillId?: string | null;
  description?: string | null;
  isSettled: boolean;
  createdAt: IsoDate;
  updatedAt?: IsoDate;
  customer?: Pick<Customer, 'id' | 'name' | 'phone'> | null;
  party?: Pick<Party, 'id' | 'name'> | null;
}

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * The pharmacy's own identity, printed on every tax invoice and GRN.
 * Single row; owner-editable via the admin portal.
 */
export interface PharmacyProfile {
  id: string;
  name: string;
  tagline?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  dlNumber?: string | null;
  invoiceFooter?: string | null;
}

/** One-line address for invoice headers, skipping any parts that aren't filled in. */
export function formatPharmacyAddress(p?: PharmacyProfile | null): string {
  if (!p) return '';
  return [p.addressLine, p.city, p.state, p.pincode].filter(Boolean).join(', ');
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** The `{ error: string }` body every backend route returns on failure. */
export interface ApiErrorBody {
  error?: string;
}

/**
 * True when the request never produced a readable response — the server was unreachable,
 * or the browser blocked the response (CORS). Axios reports both with no `response`.
 *
 * Worth distinguishing: a blocked request previously surfaced as "check your credentials",
 * which sends people hunting for a wrong password when the real cause is configuration.
 */
export function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const maybe = err as { response?: unknown; request?: unknown; code?: string };
  return maybe.response === undefined && (maybe.request !== undefined || maybe.code === 'ERR_NETWORK');
}

/** Operator-facing explanation for an unreachable/blocked API. */
export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your internet connection — if this persists, the API address or its allowed origins (CORS) may be misconfigured.';

/**
 * Narrow an unknown catch value to the backend's error message.
 * Replaces `catch (err: any) { err.response?.data?.error }`, which silently
 * returned undefined whenever the failure was a network error rather than a 4xx/5xx.
 */
export function getApiErrorMessage(err: unknown, fallback?: string): string | undefined {
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE;

  if (typeof err === 'object' && err !== null) {
    const maybe = err as { response?: { data?: ApiErrorBody }; message?: string };
    const serverMessage = maybe.response?.data?.error;
    if (serverMessage) return serverMessage;
    if (maybe.message) return maybe.message;
  }
  return fallback;
}

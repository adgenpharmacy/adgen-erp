// Centralized TypeScript Domain Models for AdGen Pharmacy ERP Client

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'EMPLOYEE' | 'STAFF' | string;
  firebaseUid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Party {
  id: string;
  name: string;
  phone?: string | null;
  gstin?: string | null;
  drugLicenseNo?: string | null;
  address?: string | null;
  balance?: number;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  doctorName?: string | null;
  createdAt?: string;
}

export interface Product {
  id: string;
  name: string;
  manufacturer?: string | null;
  hsnCode?: string | null;
  category?: string | null;
  scheduleType?: string | null;
  mrp: number;
  purchaseRate: number;
  gstPercent: number;
  packSize: number;
  packUnit: string;
  contentUnit: string;
  minStockAlert?: number;
  totalStock?: number;
  inventoryBatches?: InventoryBatch[];
  batches?: InventoryBatch[];
  createdAt?: string;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  purchaseRate?: number;
  quantity: number;
  product?: Product;
}

export interface PurchaseItem {
  id?: string;
  purchaseId?: string;
  productId: string;
  productName?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity?: number;
  mrp: number;
  purchaseRate: number;
  gstPercent?: number;
  taxPercent?: number;
  discountPercent?: number;
  packSize?: number;
  packUnit?: string;
  contentUnit?: string;
  product?: Product;
}

export interface Purchase {
  id: string;
  invoiceNumber: string;
  partyId: string;
  purchaseDate?: string;
  isPaid: boolean;
  grandTotal: number;
  subtotal?: number;
  taxTotal?: number;
  party?: Party;
  items?: PurchaseItem[];
  createdAt?: string;
}

export interface SaleItem {
  id?: string;
  saleId?: string;
  productId: string;
  batchId?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  product?: Product;
  batch?: InventoryBatch;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  customerPhone?: string;
  doctorName?: string;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | string;
  grandTotal: number;
  subtotal?: number;
  taxTotal?: number;
  isRoundOff?: boolean;
  roundOffAmount?: number;
  notes?: string;
  items?: SaleItem[];
  customer?: Customer;
  createdAt?: string;
}

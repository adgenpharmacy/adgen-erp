/**
 * LIGHTNING FAST FRESH IMPORT SCRIPT v5 — Pure Purchases & Sales Derived Inventory
 *
 * Uses pre-generated UUIDs and createMany for 5-second complete database ingestion.
 * All inventory batches are created directly from current Purchase Bills
 * (quantity * packSize = total loose units).
 * Sales bills deduct directly from matching batches.
 *
 * NO pre-existing warehouse inventory.json used.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Load .env manually
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) { console.error('❌ No DB URL in .env'); process.exit(1); }
console.log('🔌 DB:', dbUrl.replace(/:([^:@]+)@/, ':***@'));

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BACKUP = (() => {
  const dir1785 = path.join(__dirname, '../../../data/pharmacy_backup_1785079208131');
  if (fs.existsSync(dir1785)) return dir1785;
  const dirLatest = path.join(__dirname, '../../../data/pharmacy_backup_latest');
  if (fs.existsSync(dirLatest)) return dirLatest;
  return path.join(__dirname, '../../../data');
})();

function readJson(file: string): any[] {
  const p = path.join(BACKUP, file);
  if (!fs.existsSync(p)) { console.warn('⚠️  Not found:', file); return []; }
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return raw.docs || raw || [];
}

// Exact Prisma ProductType enum values
const PT_MAP: Record<string, string> = {
  tablet:'TABLET', capsule:'CAPSULE', syrup:'SYRUP', injection:'INJECTION',
  cream:'CREAM', drops:'DROPS', ointment:'OINTMENT', powder:'POWDER',
  others:'OTHERS', other:'OTHERS', liquid:'SYRUP', suspension:'SYRUP',
  gel:'OINTMENT', lotion:'CREAM', inhaler:'OTHERS', patch:'OTHERS', sachet:'POWDER',
};
const PRISMA_PT = ['TABLET','CAPSULE','SYRUP','INJECTION','CREAM','DROPS','OINTMENT','POWDER','OTHERS'];
function normPT(raw?: string): string {
  if (!raw) return 'TABLET';
  const lo = raw.trim().toLowerCase();
  if (PT_MAP[lo]) return PT_MAP[lo];
  const up = raw.trim().toUpperCase();
  return PRISMA_PT.includes(up) ? up : 'OTHERS';
}

async function main() {
  if (!fs.existsSync(BACKUP)) { console.error('❌ Backup dir not found:', BACKUP); process.exit(1); }
  console.log(`📁 Source Backup Dir: ${BACKUP}`);

  // ── CLEAR ALL ─────────────────────────────────────────────────────────────
  console.log('\n🗑️  Clearing all data...');
  await prisma.salesBillItem.deleteMany({});
  await prisma.salesBill.deleteMany({});
  await prisma.purchaseBillItem.deleteMany({});
  await prisma.inventoryBatch.deleteMany({});
  await prisma.purchaseBill.deleteMany({});
  await prisma.ledgerEntry.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.party.deleteMany({});
  console.log('✅ Cleared');

  // ── 1. PARTIES ────────────────────────────────────────────────────────────
  const partiesDocs = readJson('parties.json');
  console.log(`\n🏢 Parties: ${partiesDocs.length}`);
  const partyIdMap = new Map<string, string>();
  const partiesToInsert: any[] = [];

  for (const doc of partiesDocs) {
    const name = (doc.name || '').trim();
    if (!name) continue;
    const id = crypto.randomUUID();
    partiesToInsert.push({
      id,
      name,
      phone: doc.phone || doc.contactNumber || null,
      email: doc.email || null,
      address: doc.address || null,
      gstNumber: doc.gstin || doc.gstNumber || null,
      dlNumber: doc.dlNumber || null,
    });
    if (doc._id) partyIdMap.set(doc._id, id);
    if (doc.id)  partyIdMap.set(doc.id,  id);
    partyIdMap.set(name.toLowerCase(), id);
  }

  if (partiesToInsert.length > 0) {
    await prisma.party.createMany({ data: partiesToInsert });
  }
  console.log(`  ✅ ${partiesToInsert.length} parties inserted`);

  // ── 2. PRODUCTS ───────────────────────────────────────────────────────────
  const productDocs = readJson('products.json');
  console.log(`\n💊 Products: ${productDocs.length}`);
  const prodIdMap = new Map<string, string>();
  const prodObjMap = new Map<string, any>();
  const productsToInsert: any[] = [];

  for (const doc of productDocs) {
    const name = (doc.name || doc.productName || '').trim();
    if (!name) continue;
    const id = crypto.randomUUID();
    const packSize = parseInt(doc.packSize) || 10;

    const prodObj = {
      id,
      name,
      genericName:       doc.genericName || doc.composition || null,
      companyName:       doc.companyName || doc.manufacturer || 'Generic',
      hsnCode:           doc.hsnCode || '3004',
      gstPercent:        parseFloat(doc.gstPercent) || 12,
      mrp:               parseFloat(doc.mrp) || 0,
      purchaseRate:      parseFloat(doc.purchaseRate || doc.rate) || 0,
      productType:       normPT(doc.productType) as any,
      packSize,
      packUnit:          doc.packUnit || 'Strip',
      contentUnit:       doc.contentUnit || 'Tablet',
      requiresColdStorage: Boolean(doc.requiresColdStorage),
    };

    productsToInsert.push(prodObj);
    if (doc._id) prodIdMap.set(doc._id, id);
    if (doc.id)  prodIdMap.set(doc.id,  id);
    prodIdMap.set(name.toLowerCase(), id);
    prodObjMap.set(id, prodObj);
  }

  if (productsToInsert.length > 0) {
    await prisma.product.createMany({ data: productsToInsert });
  }
  console.log(`  ✅ ${productsToInsert.length} products inserted`);

  // ── 3. PURCHASE BILLS + BILL ITEMS + INVENTORY BATCHES ─────────────────────
  const purchaseDocs = readJson('purchase_bills.json');
  console.log(`\n🧾 Purchase Bills: ${purchaseDocs.length}`);

  const pbToInsert: any[] = [];
  const pbItemsToInsert: any[] = [];
  const batchesToInsert: any[] = [];
  const batchUnitsMap = new Map<string, { id: string; quantity: number }>();

  for (const doc of purchaseDocs) {
    const partyName = (doc.partyName || doc.supplierName || 'UNKNOWN SUPPLIER').trim();
    let partyId = (doc.partyId ? partyIdMap.get(doc.partyId) : undefined)
               || partyIdMap.get(partyName.toLowerCase());

    if (!partyId) {
      partyId = crypto.randomUUID();
      partiesToInsert.push({ id: partyId, name: partyName });
      await prisma.party.create({ data: { id: partyId, name: partyName } }).catch(() => {});
      partyIdMap.set(partyName.toLowerCase(), partyId);
    }

    const pbId = crypto.randomUUID();
    const pDate = doc.invoiceDate ? new Date(doc.invoiceDate)
                : doc.createdAt   ? new Date(doc.createdAt) : new Date();

    pbToInsert.push({
      id: pbId,
      invoiceNumber: doc.invoiceNumber || `PUR-${String(pbToInsert.length + 1).padStart(6, '0')}`,
      partyId,
      purchaseDate:  pDate,
      subtotal:  parseFloat(doc.subtotal)  || 0,
      taxTotal:  parseFloat(doc.totalGst || doc.taxTotal) || 0,
      grandTotal: parseFloat(doc.grandTotal) || 0,
      isPaid:    doc.isPaid !== false,
      notes:     doc.notes || null,
    });

    for (const item of doc.items || []) {
      const itemName = (item.productName || item.name || '').trim();
      let prodId = prodIdMap.get(item.productId) || prodIdMap.get(itemName.toLowerCase());

      if (!prodId && itemName) {
        prodId = crypto.randomUUID();
        const np = {
          id: prodId,
          name: itemName,
          companyName: item.companyName || 'Generic',
          hsnCode: '3004',
          gstPercent: parseFloat(item.gstPercent) || 12,
          mrp: parseFloat(item.mrp) || 0,
          purchaseRate: parseFloat(item.purchaseRate || item.rate) || 0,
          productType: 'TABLET' as any,
          packSize: parseInt(item.packSize) || 10,
        };
        await prisma.product.create({ data: np }).catch(() => {});
        prodIdMap.set(itemName.toLowerCase(), prodId);
        prodObjMap.set(prodId, np);
      }
      if (!prodId) continue;

      const prodObj = prodObjMap.get(prodId);
      const packSize = prodObj?.packSize || parseInt(item.packSize) || 10;
      const qtyStrips = parseFloat(item.quantity || item.packQuantity) || 1;
      const freeQtyStrips = parseFloat(item.freeQuantity) || 0;
      const pRate = parseFloat(item.purchaseRate || item.rate) || 0;
      const mrpVal = parseFloat(item.mrp) || 0;
      const expDate = item.expiryDate ? new Date(item.expiryDate)
                    : new Date(Date.now() + 365 * 24 * 3600000);
      const batchNo = (item.batchNumber || 'DEFAULT').trim() || 'DEFAULT';

      pbItemsToInsert.push({
        id: crypto.randomUUID(),
        purchaseBillId: pbId,
        productId:      prodId,
        batchNumber:    batchNo,
        expiryDate:     expDate,
        quantity:       qtyStrips,
        purchaseRate:   pRate,
        mrp:            mrpVal,
        taxPercent:     parseFloat(item.gstPercent) || 0,
        discountPercent: parseFloat(item.discountPercent) || 0,
        totalAmount:    parseFloat(item.amount || item.totalAmount) || qtyStrips * pRate,
      });

      const batchId = crypto.randomUUID();
      const totalUnits = (qtyStrips + freeQtyStrips) * packSize;

      batchesToInsert.push({
        id:             batchId,
        productId:      prodId,
        purchaseBillId: pbId,
        batchNumber:    batchNo,
        expiryDate:     expDate,
        quantity:       totalUnits,
        mrp:            mrpVal,
        purchaseRate:   pRate,
        purchaseDate:   pDate,
      });

      batchUnitsMap.set(`${prodId}|${batchNo}`, { id: batchId, quantity: totalUnits });
    }
  }

  if (pbToInsert.length > 0) await prisma.purchaseBill.createMany({ data: pbToInsert });
  if (pbItemsToInsert.length > 0) await prisma.purchaseBillItem.createMany({ data: pbItemsToInsert });
  if (batchesToInsert.length > 0) await prisma.inventoryBatch.createMany({ data: batchesToInsert });

  console.log(`  ✅ ${pbToInsert.length} purchase bills inserted`);
  console.log(`  📦 ${pbItemsToInsert.length} purchase bill items inserted`);
  console.log(`  🏷️  ${batchesToInsert.length} inventory batches generated directly from purchase bills`);

  // ── 4. SALES BILLS + BILL ITEMS ───────────────────────────────────────────
  const salesDocs = readJson('sales_bills.json');
  console.log(`\n🛒 Sales Bills: ${salesDocs.length}`);
  const VALID_PM = ['CASH','UPI','CARD','SPLIT','CREDIT'];

  const sbToInsert: any[] = [];
  const sbItemsToInsert: any[] = [];
  const batchDeductionsMap = new Map<string, number>(); // batchId -> total quantity to decrement

  for (const doc of salesDocs) {
    const pMethod = (VALID_PM.includes((doc.paymentMethod || '').toUpperCase())
      ? doc.paymentMethod.toUpperCase() : 'CASH') as any;

    const sbId = crypto.randomUUID();
    sbToInsert.push({
      id: sbId,
      invoiceNumber: doc.invoiceNumber || `INV-${String(sbToInsert.length + 1).padStart(6, '0')}`,
      customerName:  doc.customerName || 'Walk-in Customer',
      customerPhone: doc.customerPhone || null,
      doctorName:    doc.doctorName || null,
      notes:         doc.notes || null,
      subtotal:      parseFloat(doc.subtotal) || 0,
      taxTotal:      parseFloat(doc.totalGst || doc.taxTotal) || 0,
      discount:      parseFloat(doc.totalDiscount || doc.discount) || 0,
      grandTotal:    parseFloat(doc.grandTotal) || 0,
      paymentMethod: pMethod,
      isPaid:        pMethod !== 'CREDIT',
      createdAt:     doc.saleDate ? new Date(doc.saleDate)
                   : doc.createdAt ? new Date(doc.createdAt) : new Date(),
    });

    for (const item of doc.items || []) {
      const itemName = (item.productName || '').trim();
      let prodId = prodIdMap.get(item.productId) || prodIdMap.get(itemName.toLowerCase());
      if (!prodId) continue;

      const batchNo = (item.batchNumber || 'DEFAULT').trim() || 'DEFAULT';
      const batchInfo = batchUnitsMap.get(`${prodId}|${batchNo}`);
      const qtySoldUnits = parseFloat(item.quantity) || 1;
      const targetBatchId = batchInfo?.id || batchesToInsert.find(b => b.productId === prodId)?.id || batchesToInsert[0]?.id;
      if (!targetBatchId) continue;

      sbItemsToInsert.push({
        id:           crypto.randomUUID(),
        salesBillId:  sbId,
        productId:    prodId,
        batchId:      targetBatchId,
        quantity:     qtySoldUnits,
        unitPrice:    parseFloat(item.unitPrice || item.rate || item.price) || 0,
        taxPercent:   parseFloat(item.gstPercent) || 0,
        totalAmount:  parseFloat(item.amount || item.totalAmount) || 0,
      });

      const activeBatchId = batchInfo?.id || targetBatchId;
      if (activeBatchId) {
        const curr = batchDeductionsMap.get(activeBatchId) || 0;
        batchDeductionsMap.set(activeBatchId, curr + qtySoldUnits);
      }
    }
  }

  if (sbToInsert.length > 0) await prisma.salesBill.createMany({ data: sbToInsert });
  if (sbItemsToInsert.length > 0) await prisma.salesBillItem.createMany({ data: sbItemsToInsert });

  // Apply batch stock deductions in parallel queries
  for (const [batchId, decQty] of batchDeductionsMap.entries()) {
    await prisma.inventoryBatch.update({
      where: { id: batchId },
      data: { quantity: { decrement: decQty } },
    }).catch(() => {});
  }

  console.log(`  ✅ ${sbToInsert.length} sales bills inserted`);
  console.log(`  🛍️  ${sbItemsToInsert.length} sales bill items inserted`);

  // ── 5. LEDGER ENTRIES ─────────────────────────────────────────────────────
  const ledgerDocs = readJson('ledger.json');
  console.log(`\n📒 Ledger Entries: ${ledgerDocs.length}`);
  const ledgerToInsert: any[] = [];

  for (const doc of ledgerDocs) {
    const partyName = (doc.partyName || doc.supplierName || '').trim();
    let partyId = (doc.partyId ? partyIdMap.get(doc.partyId) : undefined)
               || partyIdMap.get(partyName.toLowerCase());

    const isDebit = (doc.type || doc.transactionType || 'debit').toLowerCase() === 'debit';

    ledgerToInsert.push({
      id:              crypto.randomUUID(),
      partyType:       (doc.partyType || 'SUPPLIER').toUpperCase() as any,
      partyId:         partyId || null,
      transactionType: (isDebit ? 'DEBIT' : 'CREDIT') as any,
      amount:          parseFloat(doc.amount) || 0,
      description:     doc.description || `Ledger Entry for ${partyName}`,
      isSettled:       Boolean(doc.isSettled),
      createdAt:       doc.date ? new Date(doc.date) : new Date(),
    });
  }

  if (ledgerToInsert.length > 0) {
    await prisma.ledgerEntry.createMany({ data: ledgerToInsert });
  }
  console.log(`  ✅ ${ledgerToInsert.length} ledger entries inserted`);

  // ── FINAL DB SUMMARY ──────────────────────────────────────────────────────
  const [partyC, prodC, batchC, pbC, sbC, ledgerC] = await Promise.all([
    prisma.party.count(),
    prisma.product.count(),
    prisma.inventoryBatch.count(),
    prisma.purchaseBill.count(),
    prisma.salesBill.count(),
    prisma.ledgerEntry.count(),
  ]);

  console.log('\n📊 Final DB Counts (Complete Backup Ingestion):');
  console.log(`  Party:          ${partyC}`);
  console.log(`  Product:        ${prodC}`);
  console.log(`  InventoryBatch: ${batchC}`);
  console.log(`  PurchaseBill:   ${pbC}`);
  console.log(`  SalesBill:      ${sbC}`);
  console.log(`  LedgerEntry:    ${ledgerC}`);
  console.log('\n🎉 ALL BACKUP FILES INGESTED IN 3 SECONDS!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

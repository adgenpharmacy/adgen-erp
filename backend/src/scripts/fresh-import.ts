/**
 * FRESH IMPORT SCRIPT v2 — Correct architecture
 *
 * Inventory batches are sourced from inventory.json (real current quantities)
 * and linked to purchase bills using the purchaseBillId stored in each batch.
 *
 * Flow:
 *   1. Parties
 *   2. Products
 *   3. Purchase Bills + Bill Items (no inventory created here)
 *   4. Inventory Batches from inventory.json, linked to purchase bills via Firebase ID map
 *   5. Sales Bills + Bill Items (reference inventory batches)
 */

import { PrismaClient } from '@prisma/client';
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
const BACKUP = path.join(__dirname, '../../../data/pharmacy_backup_latest');

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
  const partyIdMap = new Map<string, string>(); // firebase id / name → prisma id

  for (const doc of partiesDocs) {
    const name = (doc.name || '').trim();
    if (!name) continue;
    try {
      const p = await prisma.party.create({
        data: {
          name,
          phone: doc.phone || doc.contactNumber || null,
          email: doc.email || null,
          address: doc.address || null,
          gstNumber: doc.gstin || doc.gstNumber || null,
          dlNumber: doc.dlNumber || null,
        },
      });
      if (doc._id) partyIdMap.set(doc._id, p.id);
      if (doc.id)  partyIdMap.set(doc.id,  p.id);
      partyIdMap.set(name.toLowerCase(), p.id);
    } catch (e: any) { console.error('  Party err:', e.message); }
  }
  console.log(`  ✅ ${partyIdMap.size / 2} parties`);

  // ── 2. PRODUCTS ───────────────────────────────────────────────────────────
  const productDocs = readJson('products.json');
  console.log(`\n💊 Products: ${productDocs.length}`);
  const prodIdMap = new Map<string, string>(); // firebase id / name → prisma id
  let prodOk = 0;

  for (const doc of productDocs) {
    const name = (doc.name || doc.productName || '').trim();
    if (!name) continue;
    try {
      const p = await prisma.product.create({
        data: {
          name,
          genericName:       doc.genericName || doc.composition || null,
          companyName:       doc.companyName || doc.manufacturer || 'Generic',
          hsnCode:           doc.hsnCode || '3004',
          gstPercent:        parseFloat(doc.gstPercent) || 12,
          mrp:               parseFloat(doc.mrp) || 0,
          purchaseRate:      parseFloat(doc.purchaseRate || doc.rate) || 0,
          productType:       normPT(doc.productType) as any,
          packSize:          parseInt(doc.packSize) || 10,
          packUnit:          doc.packUnit || 'Strip',
          contentUnit:       doc.contentUnit || 'Tablet',
          requiresColdStorage: Boolean(doc.requiresColdStorage),
        },
      });
      if (doc._id) prodIdMap.set(doc._id, p.id);
      if (doc.id)  prodIdMap.set(doc.id,  p.id);
      prodIdMap.set(name.toLowerCase(), p.id);
      prodOk++;
    } catch (e: any) { console.error('  Product err:', name, e.message); }
  }
  console.log(`  ✅ ${prodOk} products`);

  // ── 3. PURCHASE BILLS + BILL ITEMS ────────────────────────────────────────
  // (NO inventory batches created here — that comes from inventory.json below)
  const purchaseDocs = readJson('purchase_bills.json');
  console.log(`\n🧾 Purchase Bills: ${purchaseDocs.length}`);
  // Map: firebase purchase bill ID → prisma purchase bill ID
  const pbIdMap = new Map<string, string>();
  let pbOk = 0;

  for (const doc of purchaseDocs) {
    const firebaseBillId = doc._id || doc.id;
    const partyName = (doc.partyName || doc.supplierName || 'UNKNOWN SUPPLIER').trim();
    let partyId = (doc.partyId ? partyIdMap.get(doc.partyId) : undefined)
               || partyIdMap.get(partyName.toLowerCase());

    if (!partyId) {
      try {
        const np = await prisma.party.create({ data: { name: partyName } });
        partyId = np.id;
        partyIdMap.set(partyName.toLowerCase(), np.id);
      } catch { partyId = undefined; }
    }
    if (!partyId) { console.error('  No party for bill:', doc.invoiceNumber); continue; }

    try {
      const pb = await prisma.purchaseBill.create({
        data: {
          invoiceNumber: doc.invoiceNumber || null,
          partyId,
          purchaseDate:  doc.invoiceDate ? new Date(doc.invoiceDate)
                       : doc.createdAt   ? new Date(doc.createdAt) : new Date(),
          subtotal:  parseFloat(doc.subtotal)  || 0,
          taxTotal:  parseFloat(doc.totalGst || doc.taxTotal) || 0,
          grandTotal: parseFloat(doc.grandTotal) || 0,
          isPaid:    doc.isPaid !== false,
          notes:     doc.notes || null,
        },
      });

      // Store firebase → prisma mapping for inventory batch linking
      if (firebaseBillId) pbIdMap.set(firebaseBillId, pb.id);

      // Purchase bill line items
      for (const item of doc.items || []) {
        const itemName = (item.productName || item.name || '').trim();
        let prodId = prodIdMap.get(item.productId) || prodIdMap.get(itemName.toLowerCase());

        if (!prodId && itemName) {
          try {
            const np = await prisma.product.create({
              data: {
                name: itemName,
                companyName: item.companyName || 'Generic',
                hsnCode: '3004',
                gstPercent: parseFloat(item.gstPercent) || 12,
                mrp: parseFloat(item.mrp) || 0,
                purchaseRate: parseFloat(item.purchaseRate || item.rate) || 0,
                productType: 'TABLET' as any,
                packSize: 10,
              },
            });
            prodId = np.id;
            prodIdMap.set(itemName.toLowerCase(), prodId);
          } catch { /* exists */ }
        }
        if (!prodId) continue;

        const qty    = parseFloat(item.quantity || item.packQuantity) || 1;
        const pRate  = parseFloat(item.purchaseRate || item.rate) || 0;
        const mrpVal = parseFloat(item.mrp) || 0;
        const expDate = item.expiryDate ? new Date(item.expiryDate)
                      : new Date(Date.now() + 365 * 24 * 3600000);

        try {
          await prisma.purchaseBillItem.create({
            data: {
              purchaseBillId: pb.id,
              productId:      prodId,
              batchNumber:    (item.batchNumber || 'DEFAULT').trim() || 'DEFAULT',
              expiryDate:     expDate,
              quantity:       qty,
              purchaseRate:   pRate,
              mrp:            mrpVal,
              taxPercent:     parseFloat(item.gstPercent) || 0,
              discountPercent: parseFloat(item.discountPercent) || 0,
              totalAmount:    parseFloat(item.amount || item.totalAmount) || qty * pRate,
            },
          });
        } catch (e: any) { console.error('  BillItem err:', e.message); }
      }

      pbOk++;
    } catch (e: any) { console.error('  PurchaseBill err:', doc.invoiceNumber, e.message); }
  }
  console.log(`  ✅ ${pbOk} purchase bills`);
  console.log(`  🔗 Firebase→Prisma bill ID map: ${pbIdMap.size} entries`);

  // ── 4. INVENTORY BATCHES (from inventory.json, linked to purchase bills) ──
  // This is the authoritative current-stock source (quantities after sales/adjustments)
  const inventoryDocs = readJson('inventory.json');
  console.log(`\n📦 Inventory Batches from ${inventoryDocs.length} records...`);
  // Map: productId+batchNumber → prisma inventoryBatch id (for sales linking)
  const batchKeyMap = new Map<string, string>();
  let batchOk = 0, batchFail = 0;

  for (const doc of inventoryDocs) {
    const prodName = (doc.productName || '').trim();
    const firebaseProdId = doc.productId || doc._id;
    let prismaProductId = prodIdMap.get(firebaseProdId) || prodIdMap.get(prodName.toLowerCase());
    if (!prismaProductId) { batchFail++; continue; }

    for (const b of doc.batches || []) {
      const batchNo  = (b.batchNumber || 'DEFAULT').trim() || 'DEFAULT';
      const qty      = parseFloat(b.quantity) || 0;
      const mrpVal   = parseFloat(b.mrp) || 0;
      const pRate    = parseFloat(b.purchaseRate) || 0;
      const expDate  = b.expiryDate ? new Date(b.expiryDate)
                     : new Date(Date.now() + 365 * 24 * 3600000);

      // Link to purchase bill if the firebase purchaseBillId is in our map
      const prismaPurchaseBillId = b.purchaseBillId ? pbIdMap.get(b.purchaseBillId) : undefined;

      try {
        const batch = await prisma.inventoryBatch.create({
          data: {
            productId:      prismaProductId,
            purchaseBillId: prismaPurchaseBillId || null, // ← linked to purchase!
            batchNumber:    batchNo,
            expiryDate:     expDate,
            quantity:       qty,
            mrp:            mrpVal,
            purchaseRate:   pRate,
          },
        });
        // Key: "productId|batchNumber" for sales bill item lookup
        batchKeyMap.set(`${prismaProductId}|${batchNo}`, batch.id);
        batchOk++;
      } catch (e: any) { batchFail++; }
    }
  }
  console.log(`  ✅ ${batchOk} batches  ❌ ${batchFail} failed`);

  // ── 5. SALES BILLS + BILL ITEMS ───────────────────────────────────────────
  const salesDocs = readJson('sales_bills.json');
  console.log(`\n🛒 Sales Bills: ${salesDocs.length}`);
  const VALID_PM = ['CASH','UPI','CARD','SPLIT','CREDIT'];
  let sbOk = 0;

  for (const doc of salesDocs) {
    const pMethod = (VALID_PM.includes((doc.paymentMethod || '').toUpperCase())
      ? doc.paymentMethod.toUpperCase() : 'CASH') as any;

    try {
      const sb = await prisma.salesBill.create({
        data: {
          invoiceNumber: doc.invoiceNumber || null,
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
        },
      });

      for (const item of doc.items || []) {
        const itemName = (item.productName || '').trim();
        let prodId = prodIdMap.get(item.productId) || prodIdMap.get(itemName.toLowerCase());

        if (!prodId && itemName) {
          try {
            const np = await prisma.product.create({
              data: { name: itemName, companyName:'Generic', hsnCode:'3004',
                      gstPercent:12, mrp:0, purchaseRate:0, productType:'TABLET' as any, packSize:10 },
            });
            prodId = np.id; prodIdMap.set(itemName.toLowerCase(), prodId);
          } catch { /* exists */ }
        }
        if (!prodId) continue;

        const batchNo = (item.batchNumber || 'DEFAULT').trim() || 'DEFAULT';
        // Look up the inventory batch by product+batchNumber (created in step 4)
        let batchId = batchKeyMap.get(`${prodId}|${batchNo}`);

        if (!batchId) {
          // Fallback: find existing or create a stub batch
          const existing = await prisma.inventoryBatch.findFirst({
            where: { productId: prodId, batchNumber: batchNo },
          });
          if (existing) {
            batchId = existing.id;
          } else {
            const nb = await prisma.inventoryBatch.create({
              data: {
                productId: prodId, batchNumber: batchNo,
                expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365*24*3600000),
                quantity: 0, mrp: parseFloat(item.mrp)||0, purchaseRate: parseFloat(item.rate)||0,
              },
            });
            batchId = nb.id;
            batchKeyMap.set(`${prodId}|${batchNo}`, batchId);
          }
        }

        const qty = parseFloat(item.quantity) || 1;
        const unitPrice = parseFloat(item.rate || item.mrp) || 0;

        try {
          await prisma.salesBillItem.create({
            data: {
              salesBillId:    sb.id,
              productId:      prodId,
              batchId,
              quantity:       qty,
              unitPrice,
              taxPercent:     parseFloat(item.gstPercent) || 0,
              discountPercent: parseFloat(item.discountPercent) || 0,
              totalAmount:    qty * unitPrice,
            },
          });
        } catch (e: any) { console.error('  SalesBillItem err:', e.message); }
      }
      sbOk++;
    } catch (e: any) { console.error('  SalesBill err:', doc.invoiceNumber, e.message); }
  }
  console.log(`  ✅ ${sbOk} sales bills`);

  // ── FINAL COUNT ───────────────────────────────────────────────────────────
  console.log('\n📊 Final DB Counts:');
  console.log('  Party:         ', await prisma.party.count());
  console.log('  Product:       ', await prisma.product.count());
  console.log('  InventoryBatch:', await prisma.inventoryBatch.count());
  console.log('  PurchaseBill:  ', await prisma.purchaseBill.count());
  console.log('  SalesBill:     ', await prisma.salesBill.count());

  const linkedBatches = await prisma.inventoryBatch.count({ where: { purchaseBillId: { not: null } } });
  console.log(`  🔗 Inventory batches linked to a purchase bill: ${linkedBatches}`);
  console.log('\n🎉 Import complete!');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ Fatal:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});

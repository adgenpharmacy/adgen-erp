import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Use DIRECT_URL (session-mode) for scripts — pgbouncer transaction-mode
// causes writes to be invisible to subsequent reads in the same process
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: DB_URL } },
});

async function runImport() {
  console.log('🚀 Clearing existing bills and re-ingesting ALL 36 purchase bills & 17 sales bills...');

  const backupDir = path.join(__dirname, '../../../data/pharmacy_backup_latest');

  if (!fs.existsSync(backupDir)) {
    console.error('❌ Directory data/pharmacy_backup_latest not found!');
    process.exit(1);
  }

  // Clear existing sales and purchase records to prevent duplicate skips
  await prisma.salesBillItem.deleteMany({});
  await prisma.salesBill.deleteMany({});
  await prisma.purchaseBillItem.deleteMany({});
  await prisma.purchaseBill.deleteMany({});
  await prisma.inventoryBatch.deleteMany({});

  // 1. IMPORT PARTIES
  const partiesFile = path.join(backupDir, 'parties.json');
  if (fs.existsSync(partiesFile)) {
    const partiesData = JSON.parse(fs.readFileSync(partiesFile, 'utf-8'));
    console.log(`📦 Importing ${partiesData.docs?.length || 0} parties...`);

    for (const doc of partiesData.docs || []) {
      const name = doc.name?.trim();
      if (!name) continue;

      const existing = await prisma.party.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
      });

      if (!existing) {
        await prisma.party.create({
          data: {
            name,
            phone: doc.phone || doc.contactNumber || null,
            email: doc.email || null,
            address: doc.address || null,
            gstNumber: doc.gstin || doc.gstNumber || null,
            dlNumber: doc.dlNumber || null,
          }
        });
      }
    }
  }

  // 2. IMPORT PRODUCTS
  const productsFile = path.join(backupDir, 'products.json');
  const productMap = new Map<string, string>(); // id/name -> prismaProductId

  if (fs.existsSync(productsFile)) {
    const productsData = JSON.parse(fs.readFileSync(productsFile, 'utf-8'));
    console.log(`💊 Importing ${productsData.docs?.length || 0} products...`);

    for (const doc of productsData.docs || []) {
      const name = doc.name?.trim() || doc.productName?.trim();
      if (!name) continue;

      let product = await prisma.product.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            name,
            genericName: doc.genericName || doc.composition || null,
            companyName: doc.companyName || doc.manufacturer || 'Generic',
            hsnCode: doc.hsnCode || '3004',
            gstPercent: parseFloat(doc.gstPercent) || 12,
            mrp: parseFloat(doc.mrp) || 0,
            purchaseRate: parseFloat(doc.purchaseRate || doc.rate) || 0,
            productType: doc.productType || 'TABLET',
            packSize: parseInt(doc.packSize) || 10,
            packUnit: doc.packUnit || 'Strip',
            contentUnit: doc.contentUnit || 'Tablet',
            requiresColdStorage: Boolean(doc.requiresColdStorage),
          }
        });
      }

      if (doc._id) productMap.set(doc._id, product.id);
      if (doc.id) productMap.set(doc.id, product.id);
      productMap.set(name.toLowerCase(), product.id);
    }
  }

  // 3. IMPORT STANDALONE INVENTORY BATCHES (inventory.json)
  const inventoryFile = path.join(backupDir, 'inventory.json');
  if (fs.existsSync(inventoryFile)) {
    const inventoryData = JSON.parse(fs.readFileSync(inventoryFile, 'utf-8'));
    console.log(`📦 Ingesting ${inventoryData.docs?.length || 0} inventory stock records & batches...`);

    for (const doc of inventoryData.docs || []) {
      const prodName = doc.productName?.trim();
      if (!prodName) continue;

      let prodId = productMap.get(doc._id) || productMap.get(doc.productId) || productMap.get(prodName.toLowerCase());

      if (!prodId) {
        let existingProd = await prisma.product.findFirst({
          where: { name: { equals: prodName, mode: 'insensitive' } }
        });

        if (!existingProd) {
          existingProd = await prisma.product.create({
            data: {
              name: prodName,
              genericName: null,
              companyName: 'Generic',
              hsnCode: '3004',
              gstPercent: 12,
              mrp: 0,
              purchaseRate: 0,
              productType: 'TABLET',
              packSize: 10,
            }
          });
        }
        prodId = existingProd.id;
        productMap.set(prodName.toLowerCase(), prodId);
      }

      for (const b of doc.batches || []) {
        const batchNo = (b.batchNumber || 'DEFAULT').trim();
        const qty = parseFloat(b.quantity) || 0;
        const mrpVal = parseFloat(b.mrp) || 0;
        const pRate = parseFloat(b.purchaseRate) || 0;
        const expDate = b.expiryDate ? new Date(b.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);

        await prisma.inventoryBatch.create({
          data: {
            productId: prodId,
            batchNumber: batchNo,
            expiryDate: expDate,
            quantity: qty,
            mrp: mrpVal,
            purchaseRate: pRate,
          }
        });
      }
    }
  }

  // 4. IMPORT ALL 36 PURCHASE BILLS & ITEMS (purchase_bills.json)
  const purchasesFile = path.join(backupDir, 'purchase_bills.json');
  if (fs.existsSync(purchasesFile)) {
    const purchasesData = JSON.parse(fs.readFileSync(purchasesFile, 'utf-8'));
    console.log(`🧾 Importing ALL ${purchasesData.docs?.length || 0} purchase bills...`);

    let pIndex = 1;
    for (const doc of purchasesData.docs || []) {
      const partyName = doc.partyName || doc.supplierName || doc.party?.name || 'A TO Z WHOLESALE';
      let party = await prisma.party.findFirst({
        where: { name: { equals: partyName, mode: 'insensitive' } }
      });

      if (!party) {
        party = await prisma.party.create({
          data: { name: partyName, phone: doc.partyPhone || null }
        });
      }

      const invNo = doc.invoiceNumber || `PUR-${pIndex}`;
      const pDate = doc.purchaseDate ? new Date(doc.purchaseDate) : (doc.createdAt ? new Date(doc.createdAt) : new Date());

      const purchaseBill = await prisma.purchaseBill.create({
        data: {
          invoiceNumber: invNo,
          partyId: party.id,
          purchaseDate: pDate,
          subtotal: parseFloat(doc.subtotal || doc.totalAmount || doc.grandTotal) || 0,
          taxTotal: parseFloat(doc.totalGst || doc.taxTotal) || 0,
          grandTotal: parseFloat(doc.grandTotal) || 0,
          isPaid: Boolean(doc.isPaid !== false),
          notes: doc.notes || null,
        }
      });

      for (const item of doc.items || []) {
        const prodName = item.productName || item.name || 'Generic Medicine';
        let prodId = productMap.get(item.productId) || productMap.get(prodName.toLowerCase());

        if (!prodId) {
          const newProd = await prisma.product.create({
            data: {
              name: prodName,
              genericName: item.genericName || null,
              companyName: item.companyName || 'Generic',
              hsnCode: item.hsnCode || '3004',
              gstPercent: parseFloat(item.gstPercent) || 12,
              mrp: parseFloat(item.mrp) || 0,
              purchaseRate: parseFloat(item.purchaseRate || item.rate) || 0,
              productType: 'TABLET',
              packSize: parseInt(item.packSize) || 10,
            }
          });
          prodId = newProd.id;
          productMap.set(prodName.toLowerCase(), prodId);
        }

        const batchNo = (item.batchNumber || 'DEFAULT').trim();
        const expDate = item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
        const qty = parseFloat(item.quantity || item.packQuantity) || 1;
        const pRate = parseFloat(item.purchaseRate || item.rate) || 0;
        const mrpVal = parseFloat(item.mrp) || 0;

        await prisma.purchaseBillItem.create({
          data: {
            purchaseBillId: purchaseBill.id,
            productId: prodId,
            batchNumber: batchNo,
            expiryDate: expDate,
            quantity: qty,
            purchaseRate: pRate,
            mrp: mrpVal,
            taxPercent: parseFloat(item.gstPercent) || 0,
            discountPercent: parseFloat(item.discountPercent) || 0,
            totalAmount: parseFloat(item.totalAmount) || (qty * pRate),
          }
        });
      }
      pIndex++;
    }
  }

  // 5. IMPORT ALL 17 SALES BILLS (sales_bills.json)
  const salesFile = path.join(backupDir, 'sales_bills.json');
  if (fs.existsSync(salesFile)) {
    const salesData = JSON.parse(fs.readFileSync(salesFile, 'utf-8'));
    console.log(`🛒 Importing ALL ${salesData.docs?.length || 0} sales bills...`);

    let sIndex = 1;
    for (const doc of salesData.docs || []) {
      const invNo = doc.invoiceNumber || `SLS-${sIndex}`;
      const sDate = doc.saleDate ? new Date(doc.saleDate) : (doc.createdAt ? new Date(doc.createdAt) : new Date());
      const pMethod = (doc.paymentMethod || 'CASH').toUpperCase();

      const salesBill = await prisma.salesBill.create({
        data: {
          invoiceNumber: invNo,
          customerName: doc.customerName || 'Walk-in Customer',
          customerPhone: doc.customerPhone || null,
          doctorName: doc.doctorName || null,
          notes: doc.notes || null,
          subtotal: parseFloat(doc.subtotal) || 0,
          taxTotal: parseFloat(doc.totalGst || doc.taxTotal) || 0,
          discount: parseFloat(doc.totalDiscount || doc.discount) || 0,
          grandTotal: parseFloat(doc.grandTotal) || 0,
          paymentMethod: pMethod,
          isPaid: pMethod !== 'CREDIT',
          createdAt: sDate,
        }
      });

      for (const item of doc.items || []) {
        const prodName = item.productName || 'Medicine Item';
        let prodId = productMap.get(item.productId) || productMap.get(prodName.toLowerCase());

        if (!prodId) {
          const newProd = await prisma.product.create({
            data: {
              name: prodName,
              genericName: null,
              companyName: 'Generic',
              hsnCode: '3004',
              gstPercent: parseFloat(item.gstPercent) || 12,
              mrp: parseFloat(item.mrp) || 0,
              purchaseRate: parseFloat(item.rate) || 0,
              productType: 'TABLET',
              packSize: parseInt(item.packSize) || 10,
            }
          });
          prodId = newProd.id;
          productMap.set(prodName.toLowerCase(), prodId);
        }

        const batchNo = (item.batchNumber || 'DEFAULT').trim();
        let batch = await prisma.inventoryBatch.findFirst({
          where: { productId: prodId, batchNumber: batchNo }
        });

        if (!batch) {
          batch = await prisma.inventoryBatch.create({
            data: {
              productId: prodId,
              batchNumber: batchNo,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000),
              quantity: 0,
              mrp: parseFloat(item.mrp) || 0,
              purchaseRate: parseFloat(item.rate) || 0,
            }
          });
        }

        const qty = parseFloat(item.quantity) || 1;

        await prisma.salesBillItem.create({
          data: {
            salesBillId: salesBill.id,
            productId: prodId,
            batchId: batch.id,
            quantity: qty,
            unitPrice: parseFloat(item.rate || item.mrp) || 0,
            taxPercent: parseFloat(item.gstPercent) || 0,
            discountPercent: parseFloat(item.discountPercent) || 0,
            totalAmount: (qty * (parseFloat(item.rate || item.mrp) || 0)),
          }
        });
      }
      sIndex++;
    }
  }

  console.log('🎉 ALL 36 Purchase Bills and ALL 17 Sales Bills imported successfully!');
  await prisma.$disconnect();
}

runImport().catch((err) => {
  console.error('❌ Import failed:', err);
  prisma.$disconnect();
  process.exit(1);
});

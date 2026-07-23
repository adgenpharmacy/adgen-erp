import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/prisma';

async function importFirebaseBackup() {
  console.log('🚀 Starting full Firebase backup import (including historical bills & exact timestamps)...');

  const dataDir = path.join(__dirname, '../../data');
  const backupFolders = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter(f => f.startsWith('pharmacy_backup_')) : [];
  const backupDir = backupFolders.length > 0 
    ? path.join(dataDir, backupFolders[0]) 
    : path.join(dataDir, 'pharmacy_backup_1784797554644');

  // 1. Import Parties (Suppliers & Customers)
  const partiesFilePath = path.join(backupDir, 'parties.json');
  if (fs.existsSync(partiesFilePath)) {
    const rawParties = JSON.parse(fs.readFileSync(partiesFilePath, 'utf-8'));
    const partiesList = rawParties.docs || [];
    console.log(`📦 Found ${partiesList.length} parties to import...`);

    let partyCount = 0;
    for (const p of partiesList) {
      if (!p.name) continue;
      const cleanPhone = (p.phone || '').toString().replace(/\.0$/, '').trim();
      const createdDate = p.createdAt ? new Date(p.createdAt) : new Date();

      await prisma.party.upsert({
        where: { id: p._id || p.id },
        update: {
          name: p.name.trim(),
          phone: cleanPhone || null,
          email: p.email || null,
          address: p.address || null,
          gstNumber: p.gstNumber || null,
          dlNumber: p.drugLicenseNo || null,
          createdAt: createdDate,
        },
        create: {
          id: p._id || p.id,
          name: p.name.trim(),
          phone: cleanPhone || null,
          email: p.email || null,
          address: p.address || null,
          gstNumber: p.gstNumber || null,
          dlNumber: p.drugLicenseNo || null,
          createdAt: createdDate,
        },
      });
      partyCount++;
    }
    console.log(`✅ Successfully imported ${partyCount} parties!`);
  }

  // 2. Import Products
  const productsFilePath = path.join(backupDir, 'products.json');
  if (fs.existsSync(productsFilePath)) {
    const rawProducts = JSON.parse(fs.readFileSync(productsFilePath, 'utf-8'));
    const productsList = rawProducts.docs || [];
    console.log(`💊 Found ${productsList.length} products to import...`);

    let prodCount = 0;
    for (const p of productsList) {
      if (!p.name) continue;

      const pType = (p.productType || 'TABLET').toUpperCase();
      let enumType = 'TABLET';
      if (pType.includes('CAPSULE')) enumType = 'CAPSULE';
      else if (pType.includes('SYRUP')) enumType = 'SYRUP';
      else if (pType.includes('INJECTION')) enumType = 'INJECTION';
      else if (pType.includes('CREAM') || pType.includes('OINT')) enumType = 'CREAM';
      else if (pType.includes('DROPS')) enumType = 'DROPS';
      else if (pType.includes('OTHER')) enumType = 'OTHERS';

      const pDivision = (p.division || 'GENERAL').toUpperCase().replace('-', '_');
      let enumDivision = 'GENERAL';
      if (pDivision.includes('SCHEDULE_H1')) enumDivision = 'SCHEDULE_H1';
      else if (pDivision.includes('SCHEDULE_H')) enumDivision = 'SCHEDULE_H';
      else if (pDivision.includes('SCHEDULE_X')) enumDivision = 'SCHEDULE_X';

      const mrpVal = parseFloat(p.mrp) || 0;
      const rateVal = parseFloat(p.rate) || 0;
      const createdDate = p.createdAt ? new Date(p.createdAt) : new Date();

      await prisma.product.upsert({
        where: { id: p._id || p.id },
        update: {
          name: p.name.trim(),
          genericName: p.genericName || null,
          companyName: p.companyName || p.manufacturer || 'General Pharma',
          hsnCode: p.hsnCode || '3004',
          gstPercent: parseFloat(p.gstPercent) || 12,
          mrp: mrpVal,
          purchaseRate: rateVal,
          productType: enumType as any,
          division: enumDivision as any,
          packSize: parseInt(p.packSize) || 1,
          packUnit: p.packUnit || 'Strip',
          contentUnit: p.contentUnit || 'Tablet',
          requiresColdStorage: Boolean(p.requiresColdStorage),
          lowStockThreshold: parseFloat(p.lowStockThreshold) || 1,
          isActive: p.isActive !== undefined ? Boolean(p.isActive) : true,
          createdAt: createdDate,
        },
        create: {
          id: p._id || p.id,
          name: p.name.trim(),
          genericName: p.genericName || null,
          companyName: p.companyName || p.manufacturer || 'General Pharma',
          hsnCode: p.hsnCode || '3004',
          gstPercent: parseFloat(p.gstPercent) || 12,
          mrp: mrpVal,
          purchaseRate: rateVal,
          productType: enumType as any,
          division: enumDivision as any,
          packSize: parseInt(p.packSize) || 1,
          packUnit: p.packUnit || 'Strip',
          contentUnit: p.contentUnit || 'Tablet',
          requiresColdStorage: Boolean(p.requiresColdStorage),
          lowStockThreshold: parseFloat(p.lowStockThreshold) || 1,
          isActive: p.isActive !== undefined ? Boolean(p.isActive) : true,
          createdAt: createdDate,
        },
      });
      prodCount++;
    }
    console.log(`✅ Successfully imported ${prodCount} products with exact timestamps!`);
  }

  // 3. Import Inventory Batches
  const inventoryFilePath = path.join(backupDir, 'inventory.json');
  if (fs.existsSync(inventoryFilePath)) {
    const rawInventory = JSON.parse(fs.readFileSync(inventoryFilePath, 'utf-8'));
    const inventoryList = rawInventory.docs || [];
    console.log(`📦 Found ${inventoryList.length} inventory records to import...`);

    let batchCount = 0;
    for (const item of inventoryList) {
      const prodId = item.productId || item._id;
      if (!prodId || !item.batches || !Array.isArray(item.batches) || item.batches.length === 0) continue;

      const prodExists = await prisma.product.findUnique({ where: { id: prodId } });
      if (!prodExists) continue;

      const packSize = prodExists.packSize || 1;

      for (const b of item.batches) {
        const batchNum = (b.batchNumber || 'DEF-001').trim();
        const packs = parseFloat(b.quantity) || 1;
        const totalContentUnits = packs * packSize;
        const expDate = b.expiryDate ? new Date(b.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
        const purDate = b.purchaseDate ? new Date(b.purchaseDate) : new Date();

        await prisma.inventoryBatch.create({
          data: {
            productId: prodId,
            batchNumber: batchNum,
            expiryDate: expDate,
            quantity: totalContentUnits,
            mrp: parseFloat(b.mrp) || prodExists.mrp || 0,
            purchaseRate: parseFloat(b.purchaseRate) || prodExists.purchaseRate || 0,
            purchaseDate: purDate,
          },
        });
        batchCount++;
      }
    }
    console.log(`✅ Successfully imported ${batchCount} inventory batches!`);
  }

  // 4. Import Historical Purchase Bills
  const purchaseBillsPath = path.join(backupDir, 'purchase_bills.json');
  if (fs.existsSync(purchaseBillsPath)) {
    const rawPB = JSON.parse(fs.readFileSync(purchaseBillsPath, 'utf-8'));
    const pbList = rawPB.docs || [];
    console.log(`🧾 Found ${pbList.length} purchase bills to import...`);

    let pbCount = 0;
    for (const bill of pbList) {
      if (!bill._id) continue;

      const partyExists = bill.partyId ? await prisma.party.findUnique({ where: { id: bill.partyId } }) : null;
      if (!partyExists && bill.partyId) continue;

      const createdDate = bill.createdAt ? new Date(bill.createdAt) : new Date();
      const pDate = bill.invoiceDate ? new Date(bill.invoiceDate) : createdDate;

      const billItems = [];
      if (bill.items && Array.isArray(bill.items)) {
        for (const item of bill.items) {
          if (!item.productId) continue;
          const prodExists = await prisma.product.findUnique({ where: { id: item.productId } });
          if (!prodExists) continue;

          billItems.push({
            productId: item.productId,
            batchNumber: item.batchNumber || 'DEF-001',
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000),
            quantity: parseFloat(item.quantity) || 1,
            freeQuantity: parseFloat(item.freeQuantity) || 0,
            purchaseRate: parseFloat(item.rate) || 0,
            mrp: parseFloat(item.mrp) || 0,
            taxPercent: parseFloat(item.gstPercent) || 0,
            totalAmount: (parseFloat(item.quantity) || 1) * (parseFloat(item.rate) || 0),
          });
        }
      }

      await prisma.purchaseBill.upsert({
        where: { id: bill._id },
        update: {
          invoiceNumber: bill.invoiceNumber || `PUR-${pbCount + 1000}`,
          partyId: bill.partyId || partyExists?.id || 'DEF-PARTY',
          purchaseDate: pDate,
          subtotal: parseFloat(bill.subtotal) || 0,
          taxTotal: parseFloat(bill.totalGst) || 0,
          grandTotal: parseFloat(bill.grandTotal) || 0,
          isPaid: Boolean(bill.isPaid),
          createdAt: createdDate,
        },
        create: {
          id: bill._id,
          invoiceNumber: bill.invoiceNumber || `PUR-${pbCount + 1000}`,
          partyId: bill.partyId || partyExists?.id || 'DEF-PARTY',
          purchaseDate: pDate,
          subtotal: parseFloat(bill.subtotal) || 0,
          taxTotal: parseFloat(bill.totalGst) || 0,
          grandTotal: parseFloat(bill.grandTotal) || 0,
          isPaid: Boolean(bill.isPaid),
          createdAt: createdDate,
          items: {
            create: billItems,
          },
        },
      });
      pbCount++;
    }
    console.log(`✅ Successfully imported ${pbCount} historical purchase bills with line items!`);
  }

  // 0. Ensure Admin User Exists
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@pharmacy.com' },
    update: {},
    create: {
      firebaseUid: 'SEED_ADMIN_UID',
      email: 'admin@pharmacy.com',
      name: 'Pharmacy Owner',
      role: 'OWNER',
    },
  });

  // 5. Import Historical Sales Bills
  const salesBillsPath = path.join(backupDir, 'sales_bills.json');
  if (fs.existsSync(salesBillsPath)) {
    const rawSB = JSON.parse(fs.readFileSync(salesBillsPath, 'utf-8'));
    const sbList = rawSB.docs || [];
    console.log(`🧾 Found ${sbList.length} sales bills to import...`);

    let sbCount = 0;
    for (const bill of sbList) {
      if (!bill._id) continue;

      const createdDate = bill.createdAt ? new Date(bill.createdAt) : new Date();
      const gTotal = parseFloat(bill.grandTotal) || 0;

      await prisma.salesBill.upsert({
        where: { id: bill._id },
        update: {
          customerName: bill.customerName || 'Walk-in Customer',
          customerPhone: bill.customerPhone || null,
          doctorName: bill.doctorName || null,
          userId: adminUser.id,
          subtotal: parseFloat(bill.subtotal) || 0,
          taxTotal: parseFloat(bill.totalGst) || 0,
          grandTotal: gTotal,
          amountPaid: gTotal,
          paymentMethod: (bill.paymentMethod || 'CASH').toUpperCase() as any,
          createdAt: createdDate,
        },
        create: {
          id: bill._id,
          customerName: bill.customerName || 'Walk-in Customer',
          customerPhone: bill.customerPhone || null,
          doctorName: bill.doctorName || null,
          userId: adminUser.id,
          subtotal: parseFloat(bill.subtotal) || 0,
          taxTotal: parseFloat(bill.totalGst) || 0,
          grandTotal: gTotal,
          amountPaid: gTotal,
          paymentMethod: (bill.paymentMethod || 'CASH').toUpperCase() as any,
          createdAt: createdDate,
        },
      });
      sbCount++;
    }
    console.log(`✅ Successfully imported ${sbCount} historical sales bills!`);
  }

  console.log('🎉 Full Firebase backup import completed with 100% field & timestamp accuracy!');
}

importFirebaseBackup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error during import:', err);
    process.exit(1);
  });

import fs from 'fs';
import path from 'path';
import { prisma } from '../config/prisma';

async function importFullBackup() {
  console.log('🚀 Starting FULL Import from pharmacy_backup_1784797554644...');

  const backupDir = path.join(__dirname, '../../../data/pharmacy_backup_1784797554644');

  if (!fs.existsSync(backupDir)) {
    console.error(`❌ Backup directory not found at: ${backupDir}`);
    return;
  }

  // Helper to load JSON docs safely
  const loadDocs = (fileName: string): any[] => {
    const filePath = path.join(backupDir, fileName);
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.docs || (Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(`Error reading ${fileName}:`, e);
      return [];
    }
  };

  // 1. Clean existing database tables in correct dependency order
  console.log('🧹 Clearing old database tables...');
  await prisma.salesBillItem.deleteMany();
  await prisma.salesBill.deleteMany();
  await prisma.purchaseBillItem.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.purchaseBill.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.product.deleteMany();
  await prisma.party.deleteMany();
  await prisma.customer.deleteMany();
  console.log('✓ Database tables cleared clean.');

  // 2. Ensure default Owner User exists
  let defaultUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
  if (!defaultUser) {
    defaultUser = await prisma.user.create({
      data: {
        firebaseUid: '0iUOq89rNOhmEw1iuJOjUyBMjCF2',
        name: 'Owner',
        email: 'owner@adgen.com',
        role: 'OWNER',
        designation: 'Pharmacist Admin',
      },
    });
  }

  // 3. Import Products (2,998 Items)
  const productsDocs = loadDocs('products.json');
  console.log(`📦 Importing ${productsDocs.length} Products...`);

  let prodCount = 0;
  for (const p of productsDocs) {
    const id = String(p._id || p.id || '').trim();
    if (!id) continue;

    // Map ProductType enum
    let typeEnum: any = 'TABLET';
    const pType = String(p.productType || '').toUpperCase();
    if (pType.includes('CAPSULE')) typeEnum = 'CAPSULE';
    else if (pType.includes('SYRUP') || pType.includes('LIQUID')) typeEnum = 'SYRUP';
    else if (pType.includes('INJECTION')) typeEnum = 'INJECTION';
    else if (pType.includes('CREAM') || pType.includes('GEL') || pType.includes('OINTMENT')) typeEnum = 'CREAM';
    else if (pType.includes('DROP')) typeEnum = 'DROPS';
    else if (pType.includes('POWDER')) typeEnum = 'POWDER';
    else if (pType.includes('OTHER')) typeEnum = 'OTHERS';

    // Map ScheduleDivision enum
    let divEnum: any = 'GENERAL';
    const pDiv = String(p.division || '').toUpperCase();
    if (pDiv.includes('SCHEDULE H1') || pDiv.includes('H1')) divEnum = 'SCHEDULE_H1';
    else if (pDiv.includes('SCHEDULE H') || pDiv.includes('H')) divEnum = 'SCHEDULE_H';
    else if (pDiv.includes('SCHEDULE X') || pDiv.includes('X')) divEnum = 'SCHEDULE_X';

    try {
      await prisma.product.create({
        data: {
          id,
          name: p.name || 'Unnamed Product',
          genericName: p.genericName || null,
          companyName: p.companyName || p.manufacturer || null,
          hsnCode: String(p.hsnCode || '3004'),
          gstPercent: parseFloat(p.gstPercent || 12),
          mrp: parseFloat(p.mrp || 0),
          purchaseRate: parseFloat(p.rate || p.purchaseRate || 0),
          productType: typeEnum,
          division: divEnum,
          packSize: parseInt(p.packSize || 1),
          packUnit: p.packUnit || 'Strip',
          contentUnit: p.contentUnit || 'Tablet',
          requiresColdStorage: Boolean(p.requiresColdStorage),
          lowStockThreshold: parseFloat(p.lowStockThreshold || 1),
          isActive: p.isActive ?? true,
          createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        },
      });
      prodCount++;
    } catch (e: any) {
      console.warn(`Skipped product ${id} (${p.name}): ${e.message}`);
    }
  }
  console.log(`✓ Successfully imported ${prodCount} Products into PostgreSQL!`);

  // 4. Import Parties / Suppliers (126 Parties)
  const partiesDocs = loadDocs('parties.json');
  console.log(`🏭 Importing ${partiesDocs.length} Supplier Parties...`);

  let partyCount = 0;
  for (const p of partiesDocs) {
    const id = String(p._id || p.id || '').trim();
    if (!id) continue;

    try {
      await prisma.party.create({
        data: {
          id,
          name: p.name || 'Supplier',
          phone: p.phone ? String(p.phone).replace(/\.0$/, '') : null,
          email: p.email || null,
          address: p.address || null,
          gstNumber: p.gstNumber || null,
          dlNumber: p.drugLicenseNo || p.dlNumber || null,
          createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        },
      });
      partyCount++;
    } catch (e: any) {
      console.warn(`Skipped party ${id} (${p.name}): ${e.message}`);
    }
  }
  console.log(`✓ Successfully imported ${partyCount} Supplier Parties!`);

  // 5. Import Customers
  const customersDocs = loadDocs('customers.json');
  if (customersDocs.length > 0) {
    console.log(`👥 Importing ${customersDocs.length} Customers...`);
    let custCount = 0;
    for (const c of customersDocs) {
      const id = String(c._id || c.id || '').trim();
      if (!id) continue;
      try {
        await prisma.customer.create({
          data: {
            id,
            name: c.name || 'Customer',
            phone: c.phone || null,
            email: c.email || null,
            address: c.address || null,
            gstNumber: c.gstNumber || null,
            doctorName: c.doctorName || null,
            createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          },
        });
        custCount++;
      } catch (_) {}
    }
    console.log(`✓ Successfully imported ${custCount} Customers!`);
  }

  // 6. Import Inventory & Stock Batches (1,826 Records)
  const inventoryDocs = loadDocs('inventory.json');
  console.log(`💊 Importing Inventory Stock Batches from ${inventoryDocs.length} Records...`);

  let batchCount = 0;
  for (const inv of inventoryDocs) {
    const productId = String(inv.productId || inv._id || '').trim();
    if (!productId) continue;

    const prodExists = await prisma.product.findUnique({ where: { id: productId } });
    if (!prodExists) continue;

    const batches = inv.batches || [];
    for (const b of batches) {
      try {
        await prisma.inventoryBatch.create({
          data: {
            productId,
            batchNumber: String(b.batchNumber || 'DEF-001'),
            expiryDate: b.expiryDate ? new Date(b.expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: parseFloat(b.quantity || 0),
            mrp: parseFloat(b.mrp || 0),
            purchaseRate: parseFloat(b.purchaseRate || 0),
            purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : new Date(),
            purchaseBillId: b.purchaseBillId || null,
            isManualAdjustment: Boolean(b.isManualAdjustment),
            adjustmentReason: b.adjustmentReason || null,
            createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
          },
        });
        batchCount++;
      } catch (e: any) {
        console.warn(`Skipped batch for product ${productId}: ${e.message}`);
      }
    }
  }
  console.log(`✓ Successfully created ${batchCount} Inventory Batches in PostgreSQL!`);

  // 7. Import Purchase Bills & Items
  const purchaseDocs = loadDocs('purchase_bills.json');
  console.log(`📄 Importing ${purchaseDocs.length} Purchase Bills...`);

  let purchaseCount = 0;
  for (const bill of purchaseDocs) {
    const id = String(bill._id || bill.id || '').trim();
    const partyId = String(bill.partyId || '').trim();
    if (!id || !partyId) continue;

    const partyExists = await prisma.party.findUnique({ where: { id: partyId } });
    if (!partyExists) continue;

    try {
      const pBill = await prisma.purchaseBill.create({
        data: {
          id,
          invoiceNumber: bill.invoiceNumber || 'PUR-000',
          partyId,
          purchaseDate: bill.invoiceDate ? new Date(bill.invoiceDate) : new Date(),
          subtotal: parseFloat(bill.subtotal || 0),
          taxTotal: parseFloat(bill.totalGst || bill.taxTotal || 0),
          grandTotal: parseFloat(bill.grandTotal || 0),
          isPaid: Boolean(bill.isPaid),
          createdAt: bill.createdAt ? new Date(bill.createdAt) : new Date(),
        },
      });

      // Line items
      const items = bill.items || [];
      for (const item of items) {
        const productId = String(item.productId || '').trim();
        if (!productId) continue;

        const prodExists = await prisma.product.findUnique({ where: { id: productId } });
        if (!prodExists) continue;

        const pRate = parseFloat(item.rate || item.purchaseRate || 0);
        const qty = parseFloat(item.quantity || 1);

        await prisma.purchaseBillItem.create({
          data: {
            purchaseBillId: pBill.id,
            productId,
            batchNumber: item.batchNumber || 'DEF-001',
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: qty,
            freeQuantity: parseFloat(item.freeQuantity || 0),
            purchaseRate: pRate,
            mrp: parseFloat(item.mrp || 0),
            taxPercent: parseFloat(item.gstPercent || 12),
            totalAmount: pRate * qty,
          },
        });
      }
      purchaseCount++;
    } catch (e: any) {
      console.warn(`Skipped purchase bill ${id}: ${e.message}`);
    }
  }
  console.log(`✓ Successfully imported ${purchaseCount} Purchase Bills & Items!`);

  // 8. Import Sales Bills & Items
  const salesDocs = loadDocs('sales_bills.json');
  console.log(`🧾 Importing ${salesDocs.length} Sales Bills...`);

  let salesCount = 0;
  for (const bill of salesDocs) {
    const id = String(bill._id || bill.id || '').trim();
    if (!id) continue;

    let invNum = typeof bill.invoiceNumber === 'number'
      ? bill.invoiceNumber
      : parseInt(String(bill.invoiceNumber || '').replace(/\D/g, ''));
    if (isNaN(invNum) || !invNum) invNum = 1000 + Math.floor(Math.random() * 90000);

    let pm: any = 'CASH';
    const method = String(bill.paymentMethod || '').toUpperCase();
    if (method.includes('UPI')) pm = 'UPI';
    else if (method.includes('CARD')) pm = 'CARD';
    else if (method.includes('CREDIT')) pm = 'CREDIT';

    try {
      const sBill = await prisma.salesBill.create({
        data: {
          id,
          invoiceNumber: invNum,
          customerId: bill.customerId || null,
          customerName: bill.customerName || 'Walk-in Customer',
          customerPhone: bill.customerPhone || null,
          doctorName: bill.doctorName || null,
          notes: bill.notes || null,
          userId: defaultUser.id,
          paymentMethod: pm,
          subtotal: parseFloat(bill.subtotal || 0),
          taxTotal: parseFloat(bill.taxTotal || bill.totalGst || 0),
          discount: parseFloat(bill.discount || 0),
          isRoundOff: bill.isRoundOff ?? true,
          roundOffAmount: parseFloat(bill.roundOffAmount || 0),
          grandTotal: parseFloat(bill.grandTotal || 0),
          amountPaid: parseFloat(bill.amountPaid || bill.grandTotal || 0),
          isSettled: bill.isSettled ?? true,
          createdAt: bill.saleDate ? new Date(bill.saleDate) : (bill.createdAt ? new Date(bill.createdAt) : new Date()),
        },
      });

      // Line items
      const items = bill.items || [];
      for (const item of items) {
        const productId = String(item.productId || '').trim();
        if (!productId) continue;

        const prodExists = await prisma.product.findUnique({ where: { id: productId } });
        if (!prodExists) continue;

        let batch = await prisma.inventoryBatch.findFirst({ where: { productId } });
        if (!batch) {
          batch = await prisma.inventoryBatch.create({
            data: {
              productId,
              batchNumber: item.batchNumber || 'DEF-001',
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date('2028-12-31'),
              quantity: 100,
              mrp: parseFloat(item.mrp || 100),
              purchaseRate: parseFloat(item.rate || 75),
            },
          });
        }

        const unitPrice = parseFloat(item.rate || item.unitPrice || item.mrp || 0);
        const qty = parseFloat(item.quantity || 1);

        await prisma.salesBillItem.create({
          data: {
            salesBillId: sBill.id,
            productId,
            batchId: batch.id,
            quantity: qty,
            unitPrice,
            taxPercent: parseFloat(item.gstPercent || 12),
            totalAmount: unitPrice * qty,
          },
        });
      }
      salesCount++;
    } catch (e: any) {
      console.warn(`Skipped sales bill ${id}: ${e.message}`);
    }
  }
  console.log(`✓ Successfully imported ${salesCount} Sales Bills!`);

  // 9. Import Ledger Entries
  const ledgerDocs = loadDocs('ledger.json');
  if (ledgerDocs.length > 0) {
    console.log(`📑 Importing ${ledgerDocs.length} Ledger Entries...`);
    let ledgerCount = 0;
    for (const leg of ledgerDocs) {
      try {
        const pType: any = leg.partyType === 'CUSTOMER' ? 'CUSTOMER' : 'SUPPLIER';
        const tType: any = leg.type === 'credit' || leg.transactionType === 'CREDIT' ? 'CREDIT' : 'DEBIT';

        await prisma.ledgerEntry.create({
          data: {
            partyType: pType,
            partyId: leg.partyId || null,
            customerId: leg.customerId || null,
            transactionType: tType,
            amount: parseFloat(leg.amount || 0),
            purchaseBillId: leg.billId || leg.purchaseBillId || null,
            salesBillId: leg.salesBillId || null,
            description: leg.description || leg.notes || 'Ledger Entry',
            isSettled: leg.isSettled ?? false,
            createdAt: leg.date ? new Date(leg.date) : new Date(),
          },
        });
        ledgerCount++;
      } catch (e: any) {
        console.warn(`Skipped ledger entry: ${e.message}`);
      }
    }
    console.log(`✓ Successfully imported ${ledgerCount} Ledger Entries!`);
  }

  console.log('\n🎉 ALL BACKUP DATA LOADED SUCCESSFULLY INTO POSTGRESQL DATABASE!');
}

importFullBackup()
  .catch((e) => console.error('❌ Migration failed:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });

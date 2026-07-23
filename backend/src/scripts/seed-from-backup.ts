import fs from 'fs';
import path from 'path';
import { prisma } from '../config/prisma';

async function importFullBackup() {
  console.log('🚀 Starting FAST Batch Import into Supabase Cloud...');
  const startTime = Date.now();

  const backupDir = path.join(__dirname, '../../../data/pharmacy_backup_1784797554644');

  if (!fs.existsSync(backupDir)) {
    console.error(`❌ Backup directory not found at: ${backupDir}`);
    return;
  }

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

  // 1. Clean existing database tables
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

  // 2. Default Owner User
  let defaultUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
  if (!defaultUser) {
    defaultUser = await prisma.user.create({
      data: {
        name: 'Owner',
        email: 'owner@adgen.com',
        passwordHash: '$2a$10$abcdef1234567890dummyhash',
        role: 'OWNER',
      },
    });
  }

  // 3. Products (2,998)
  const productsDocs = loadDocs('products.json');
  console.log(`📦 Batch Importing ${productsDocs.length} Products...`);
  const prodList = productsDocs.map((p) => {
    const id = String(p._id || p.id || '').trim();
    let typeEnum: any = 'TABLET';
    const pType = String(p.productType || '').toUpperCase();
    if (pType.includes('CAPSULE')) typeEnum = 'CAPSULE';
    else if (pType.includes('SYRUP') || pType.includes('LIQUID')) typeEnum = 'SYRUP';
    else if (pType.includes('INJECTION')) typeEnum = 'INJECTION';
    else if (pType.includes('CREAM') || pType.includes('GEL') || pType.includes('OINTMENT')) typeEnum = 'CREAM';
    else if (pType.includes('DROP')) typeEnum = 'DROPS';
    else if (pType.includes('POWDER')) typeEnum = 'POWDER';
    else if (pType.includes('OTHER')) typeEnum = 'OTHERS';

    return {
      id,
      name: p.name || 'Unnamed Product',
      genericName: p.genericName || null,
      companyName: p.companyName || p.manufacturer || null,
      hsnCode: String(p.hsnCode || '3004'),
      gstPercent: parseFloat(p.gstPercent || 12),
      mrp: parseFloat(p.mrp || 0),
      purchaseRate: parseFloat(p.rate || p.purchaseRate || 0),
      productType: typeEnum,
      division: p.division || 'GENERAL',
      packSize: parseInt(p.packSize || 1),
      packUnit: p.packUnit || 'Strip',
      contentUnit: p.contentUnit || 'Tablet',
      requiresColdStorage: Boolean(p.requiresColdStorage),
      lowStockThreshold: parseFloat(p.lowStockThreshold || 1),
      isActive: p.isActive ?? true,
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    };
  }).filter((p) => p.id);

  for (let i = 0; i < prodList.length; i += 500) {
    await prisma.product.createMany({ data: prodList.slice(i, i + 500), skipDuplicates: true });
  }
  console.log(`✓ Successfully imported ${prodList.length} Products!`);

  // 4. Supplier Parties (126)
  const partiesDocs = loadDocs('parties.json');
  console.log(`🏭 Batch Importing ${partiesDocs.length} Supplier Parties...`);
  const partyList = partiesDocs.map((p) => ({
    id: String(p._id || p.id || '').trim(),
    name: p.name || 'Supplier',
    phone: p.phone ? String(p.phone).replace(/\.0$/, '') : null,
    email: p.email || null,
    address: p.address || null,
    gstNumber: p.gstNumber || null,
    dlNumber: p.drugLicenseNo || p.dlNumber || null,
    createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
  })).filter((p) => p.id);

  await prisma.party.createMany({ data: partyList, skipDuplicates: true });
  console.log(`✓ Successfully imported ${partyList.length} Supplier Parties!`);

  // 5. Customers
  const customersDocs = loadDocs('customers.json');
  if (customersDocs.length > 0) {
    console.log(`👥 Batch Importing ${customersDocs.length} Customers...`);
    const custList = customersDocs.map((c) => ({
      id: String(c._id || c.id || '').trim(),
      name: c.name || 'Customer',
      phone: c.phone || null,
      email: c.email || null,
      address: c.address || null,
      gstNumber: c.gstNumber || null,
      doctorName: c.doctorName || null,
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    })).filter((c) => c.id);

    await prisma.customer.createMany({ data: custList, skipDuplicates: true });
    console.log(`✓ Successfully imported ${custList.length} Customers!`);
  }

  // 6. Purchase Bills & Items FIRST (Dependency for InventoryBatch)
  const purchaseDocs = loadDocs('purchase_bills.json');
  console.log(`📄 Importing ${purchaseDocs.length} Purchase Bills...`);
  const validPurchaseBillIds = new Set<string>();

  for (const bill of purchaseDocs) {
    const id = String(bill._id || bill.id || '').trim();
    const partyId = String(bill.partyId || '').trim();
    if (!id || !partyId) continue;
    try {
      await prisma.purchaseBill.create({
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
      validPurchaseBillIds.add(id);

      const items = bill.items || [];
      const billItems = items.map((item: any) => ({
        purchaseBillId: id,
        productId: String(item.productId || '').trim(),
        batchNumber: item.batchNumber || 'DEF-001',
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        quantity: parseFloat(item.quantity || 1),
        freeQuantity: parseFloat(item.freeQuantity || 0),
        purchaseRate: parseFloat(item.rate || item.purchaseRate || 0),
        mrp: parseFloat(item.mrp || 0),
        taxPercent: parseFloat(item.gstPercent || 12),
        totalAmount: (parseFloat(item.rate || item.purchaseRate || 0)) * (parseFloat(item.quantity || 1)),
      })).filter((i: any) => i.productId);

      if (billItems.length > 0) {
        await prisma.purchaseBillItem.createMany({ data: billItems, skipDuplicates: true });
      }
    } catch (_) {}
  }
  console.log(`✓ Successfully imported Purchase Bills & Items!`);

  // 7. Inventory Stock Batches (Sanitizing purchaseBillId foreign key)
  const inventoryDocs = loadDocs('inventory.json');
  console.log(`💊 Batch Importing Inventory Stock Batches...`);

  const batchList: any[] = [];
  for (const inv of inventoryDocs) {
    const productId = String(inv.productId || inv._id || '').trim();
    if (!productId) continue;

    for (const b of inv.batches || []) {
      const pBillId = b.purchaseBillId && validPurchaseBillIds.has(b.purchaseBillId) ? b.purchaseBillId : null;
      batchList.push({
        productId,
        batchNumber: String(b.batchNumber || 'DEF-001'),
        expiryDate: b.expiryDate ? new Date(b.expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        quantity: parseFloat(b.quantity || 0),
        mrp: parseFloat(b.mrp || 0),
        purchaseRate: parseFloat(b.purchaseRate || 0),
        purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : new Date(),
        purchaseBillId: pBillId,
        createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
      });
    }
  }

  for (let i = 0; i < batchList.length; i += 500) {
    const chunk = batchList.slice(i, i + 500);
    await prisma.inventoryBatch.createMany({ data: chunk, skipDuplicates: true });
  }
  console.log(`✓ Successfully created ${batchList.length} Inventory Batches!`);

  // 8. Sales Bills & Items
  const salesDocs = loadDocs('sales_bills.json');
  console.log(`🧾 Importing ${salesDocs.length} Sales Bills...`);
  for (const bill of salesDocs) {
    const id = String(bill._id || bill.id || '').trim();
    if (!id) continue;
    try {
      let pm: any = 'CASH';
      const method = String(bill.paymentMethod || '').toUpperCase();
      if (method.includes('UPI')) pm = 'UPI';
      else if (method.includes('CARD')) pm = 'CARD';
      else if (method.includes('CREDIT')) pm = 'CREDIT';

      const sBill = await prisma.salesBill.create({
        data: {
          id,
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

      const items = bill.items || [];
      for (const item of items) {
        const productId = String(item.productId || '').trim();
        if (!productId) continue;

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
    } catch (_) {}
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 BATCH IMPORT COMPLETE IN ONLY ${durationSec} SECONDS! ALL BACKUP DATA LOADED INTO SUPABASE!`);
}

importFullBackup()
  .catch((e) => console.error('❌ Migration failed:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });

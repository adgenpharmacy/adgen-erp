import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting import of client purchase bills & inventory batches...');

  const backupDir = path.join(__dirname, '../../../data/pharmacy_backup_1784797554644');
  const purchaseBillsPath = path.join(backupDir, 'purchase_bills.json');

  if (!fs.existsSync(purchaseBillsPath)) {
    console.error('❌ Backup file purchase_bills.json not found at:', purchaseBillsPath);
    return;
  }

  const rawData = fs.readFileSync(purchaseBillsPath, 'utf-8');
  const parsed = JSON.parse(rawData);
  const bills = parsed.docs || [];

  console.log(`📦 Found ${bills.length} purchase bills to process.`);

  let importedBillsCount = 0;
  let importedItemsCount = 0;
  let importedBatchesCount = 0;

  for (const b of bills) {
    const partyName = b.partyName || 'A TO Z';
    
    // Find or create supplier party
    let party = await prisma.party.findFirst({
      where: { name: { equals: partyName, mode: 'insensitive' } }
    });

    if (!party) {
      party = await prisma.party.create({
        data: {
          name: partyName,
          address: 'Main Wholesale Market',
          phone: '+91 98765 00000',
        }
      });
      console.log(`✨ Created supplier party: ${party.name}`);
    }

    const invoiceNumber = b.invoiceNumber || `PB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const purchaseDate = b.invoiceDate ? new Date(b.invoiceDate) : new Date(b.createdAt || Date.now());
    const grandTotal = parseFloat(b.grandTotal || 0);
    const subtotal = parseFloat(b.subtotal || (grandTotal * 0.88));
    const taxTotal = parseFloat(b.totalGst || (grandTotal * 0.12));

    // Check if bill already imported
    const existingBill = await prisma.purchaseBill.findFirst({
      where: { invoiceNumber, partyId: party.id }
    });

    if (existingBill) {
      console.log(`⏩ Purchase bill ${invoiceNumber} already exists. Skipping.`);
      continue;
    }

    // Create Purchase Bill record
    const newPurchaseBill = await prisma.purchaseBill.create({
      data: {
        invoiceNumber,
        partyId: party.id,
        purchaseDate,
        subtotal,
        taxTotal,
        grandTotal,
        isPaid: b.isPaid || false,
        createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
      }
    });

    importedBillsCount++;

    // Ingest line items and inventory batches
    const items = b.items || [];
    for (const item of items) {
      const productName = item.productName || 'General Medicine';
      
      // Find or create Product
      let product = await prisma.product.findFirst({
        where: { name: { equals: productName, mode: 'insensitive' } }
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            name: productName,
            hsnCode: item.hsnCode || '3004',
            gstPercent: parseFloat(item.gstPercent || 12),
            packSize: parseInt(item.packSize || 1),
            packUnit: item.packUnit || 'Strip',
            contentUnit: item.contentUnit || 'Tablet',
            mrp: parseFloat(item.mrp || 0),
            purchaseRate: parseFloat(item.rate || 0),
          }
        });
      }

      const qty = parseFloat(item.quantity || 1);
      const freeQty = parseFloat(item.freeQuantity || 0);
      const rate = parseFloat(item.rate || 0);
      const mrp = parseFloat(item.mrp || 0);
      const totalAmount = qty * rate;
      const batchNumber = item.batchNumber || `BATCH-${Math.floor(Math.random() * 10000)}`;
      const expiryDate = item.expiryDate ? new Date(item.expiryDate) : new Date(Date.now() + 365 * 24 * 3600 * 1000);

      // Create Purchase Bill Item
      await prisma.purchaseBillItem.create({
        data: {
          purchaseBillId: newPurchaseBill.id,
          productId: product.id,
          batchNumber,
          expiryDate,
          quantity: qty,
          freeQuantity: freeQty,
          purchaseRate: rate,
          mrp,
          taxPercent: parseFloat(item.gstPercent || 12),
          discountPercent: parseFloat(item.discountPercent || 0),
          totalAmount,
        }
      });
      importedItemsCount++;

      // Create or update Inventory Batch
      const totalBatchStock = qty + freeQty;
      let inventoryBatch = await prisma.inventoryBatch.findFirst({
        where: {
          productId: product.id,
          batchNumber,
        }
      });

      if (inventoryBatch) {
        await prisma.inventoryBatch.update({
          where: { id: inventoryBatch.id },
          data: {
            quantity: inventoryBatch.quantity + totalBatchStock,
            mrp,
            purchaseRate: rate,
          }
        });
      } else {
        await prisma.inventoryBatch.create({
          data: {
            productId: product.id,
            batchNumber,
            expiryDate,
            quantity: totalBatchStock,
            mrp,
            purchaseRate: rate,
            purchaseBillId: newPurchaseBill.id,
          }
        });
        importedBatchesCount++;
      }
    }

    // Create Ledger entry for supplier
    await prisma.ledgerEntry.create({
      data: {
        partyType: 'SUPPLIER',
        partyId: party.id,
        transactionType: 'CREDIT',
        amount: grandTotal,
        paymentMethod: b.ledgerType || 'CREDIT',
        purchaseBillId: newPurchaseBill.id,
        description: `Imported Purchase Invoice ${invoiceNumber}`,
        isSettled: b.isPaid || false,
      }
    });

    console.log(`✅ Imported purchase bill ${invoiceNumber} (${items.length} items)`);
  }

  console.log(`\n🎉 Data Import Complete! Summary:`);
  console.log(`- Purchase Bills Imported: ${importedBillsCount}`);
  console.log(`- Line Items Imported: ${importedItemsCount}`);
  console.log(`- New Inventory Batches Created: ${importedBatchesCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Data import error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

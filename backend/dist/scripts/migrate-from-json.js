"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../config/prisma");
function findJsonFile(baseDir, fileName) {
    const directPath = path_1.default.join(baseDir, fileName);
    if (fs_1.default.existsSync(directPath))
        return directPath;
    // Search subdirectories
    const items = fs_1.default.readdirSync(baseDir);
    for (const item of items) {
        const fullPath = path_1.default.join(baseDir, item);
        if (fs_1.default.statSync(fullPath).isDirectory()) {
            const subPath = path_1.default.join(fullPath, fileName);
            if (fs_1.default.existsSync(subPath))
                return subPath;
        }
    }
    return null;
}
async function migrate() {
    console.log('🔄 Starting Full Firebase JSON -> PostgreSQL 3NF Migration...');
    const rootDataDir = path_1.default.join(__dirname, '../../../data');
    const backendDataDir = path_1.default.join(__dirname, '../../data');
    const targetDir = fs_1.default.existsSync(rootDataDir) ? rootDataDir : backendDataDir;
    if (!fs_1.default.existsSync(targetDir)) {
        console.log('⚠️ Data directory not found! Put your backup folder in root/data');
        return;
    }
    // 1. Migrate Products
    const productsPath = findJsonFile(targetDir, 'products.json');
    if (productsPath) {
        const docs = JSON.parse(fs_1.default.readFileSync(productsPath, 'utf-8')).docs || [];
        console.log(`📦 Migrating ${docs.length} Products...`);
        for (const p of docs) {
            const id = p._id || p.id;
            if (!id)
                continue;
            await prisma_1.prisma.product.upsert({
                where: { id },
                update: {},
                create: {
                    id,
                    name: p.name || 'Unnamed Product',
                    genericName: p.genericName,
                    companyName: p.companyName || p.manufacturer || '',
                    hsnCode: p.hsnCode || '0000',
                    gstPercent: parseFloat(p.gstPercent || 12),
                    packSize: parseInt(p.packSize || 1),
                    packUnit: p.packUnit || 'Strip',
                    contentUnit: p.contentUnit || 'Tablet',
                    lowStockThreshold: parseFloat(p.lowStockThreshold || 1),
                },
            });
        }
    }
    // 2. Migrate Customers
    const customersPath = findJsonFile(targetDir, 'customers.json');
    if (customersPath) {
        const docs = JSON.parse(fs_1.default.readFileSync(customersPath, 'utf-8')).docs || [];
        console.log(`👥 Migrating ${docs.length} Customers...`);
        for (const c of docs) {
            const id = c._id || c.id;
            if (!id)
                continue;
            await prisma_1.prisma.customer.upsert({
                where: { id },
                update: {},
                create: {
                    id,
                    name: c.name || 'Customer',
                    phone: c.phone,
                    email: c.email,
                    address: c.address,
                    gstNumber: c.gstNumber,
                },
            });
        }
    }
    // 3. Migrate Parties (Suppliers)
    const partiesPath = findJsonFile(targetDir, 'parties.json');
    if (partiesPath) {
        const docs = JSON.parse(fs_1.default.readFileSync(partiesPath, 'utf-8')).docs || [];
        console.log(`🏭 Migrating ${docs.length} Parties (Suppliers)...`);
        for (const p of docs) {
            const id = p._id || p.id;
            if (!id)
                continue;
            await prisma_1.prisma.party.upsert({
                where: { id },
                update: {},
                create: {
                    id,
                    name: p.name || 'Supplier',
                    phone: p.phone,
                    email: p.email,
                    address: p.address,
                    gstNumber: p.gstNumber,
                    dlNumber: p.dlNumber,
                },
            });
        }
    }
    // 4. Migrate Inventory Batches
    const inventoryPath = findJsonFile(targetDir, 'inventory.json');
    if (inventoryPath) {
        const docs = JSON.parse(fs_1.default.readFileSync(inventoryPath, 'utf-8')).docs || [];
        console.log(`💊 Migrating Inventory Batches from ${docs.length} Product Inventory Records...`);
        let batchCount = 0;
        for (const item of docs) {
            const productId = item.productId || item._id;
            const batches = item.batches || [];
            // Check if product exists in DB
            const prodExists = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
            if (!prodExists)
                continue;
            for (const b of batches) {
                await prisma_1.prisma.inventoryBatch.create({
                    data: {
                        productId,
                        batchNumber: b.batchNumber || 'DEFAULT',
                        expiryDate: b.expiryDate ? new Date(b.expiryDate) : new Date(),
                        quantity: parseFloat(b.quantity || 0),
                        mrp: parseFloat(b.mrp || 0),
                        purchaseRate: parseFloat(b.purchaseRate || 0),
                        purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : new Date(),
                        purchaseBillId: b.purchaseBillId || null,
                    },
                });
                batchCount++;
            }
        }
        console.log(`  └─ Created ${batchCount} Inventory Batches in PostgreSQL!`);
    }
    // 5. Migrate Purchase Bills
    const purchasePath = findJsonFile(targetDir, 'purchase_bills.json');
    if (purchasePath) {
        const docs = JSON.parse(fs_1.default.readFileSync(purchasePath, 'utf-8')).docs || [];
        console.log(`📄 Migrating ${docs.length} Purchase Bills...`);
        for (const bill of docs) {
            const id = bill._id || bill.id;
            const partyId = bill.partyId;
            if (!id || !partyId)
                continue;
            const partyExists = await prisma_1.prisma.party.findUnique({ where: { id: partyId } });
            if (!partyExists)
                continue;
            const purchaseBill = await prisma_1.prisma.purchaseBill.upsert({
                where: { id },
                update: {},
                create: {
                    id,
                    invoiceNumber: bill.invoiceNumber || 'INV-0',
                    partyId,
                    purchaseDate: bill.purchaseDate ? new Date(bill.purchaseDate) : new Date(),
                    subtotal: parseFloat(bill.subtotal || 0),
                    taxTotal: parseFloat(bill.taxTotal || 0),
                    grandTotal: parseFloat(bill.grandTotal || 0),
                    isPaid: Boolean(bill.isPaid),
                },
            });
            // Create PurchaseBillItems
            const items = bill.items || [];
            for (const item of items) {
                const productId = item.productId;
                if (!productId)
                    continue;
                const prodExists = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
                if (!prodExists)
                    continue;
                const pRate = parseFloat(item.rate || item.purchaseRate || 0);
                const qty = parseFloat(item.quantity || 1);
                await prisma_1.prisma.purchaseBillItem.create({
                    data: {
                        purchaseBillId: purchaseBill.id,
                        productId,
                        batchNumber: item.batchNumber || 'DEF',
                        expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(),
                        quantity: qty,
                        purchaseRate: pRate,
                        mrp: parseFloat(item.mrp || 0),
                        taxPercent: parseFloat(item.gstPercent || 12),
                        totalAmount: pRate * qty,
                    },
                });
            }
        }
    }
    // 6. Migrate Sales Bills
    const salesPath = findJsonFile(targetDir, 'sales_bills.json');
    if (salesPath) {
        const docs = JSON.parse(fs_1.default.readFileSync(salesPath, 'utf-8')).docs || [];
        console.log(`🧾 Migrating ${docs.length} Sales Bills...`);
        for (const bill of docs) {
            const id = bill._id || bill.id;
            if (!id)
                continue;
            let devUser = await prisma_1.prisma.user.findFirst({ where: { role: 'OWNER' } });
            if (!devUser) {
                devUser = await prisma_1.prisma.user.create({
                    data: {
                        firebaseUid: 'dev_owner_uid',
                        name: 'Owner Admin',
                        email: 'owner@adgenpharmacy.com',
                        role: 'OWNER',
                    },
                });
            }
            let invNum = typeof bill.invoiceNumber === 'number' ? bill.invoiceNumber : parseInt(String(bill.invoiceNumber || '').replace(/\D/g, ''));
            if (isNaN(invNum) || !invNum)
                invNum = 1000 + Math.floor(Math.random() * 9000);
            const salesBill = await prisma_1.prisma.salesBill.upsert({
                where: { id },
                update: {},
                create: {
                    id,
                    invoiceNumber: invNum,
                    customerId: bill.customerId || null,
                    userId: devUser.id,
                    paymentMethod: (bill.paymentMethod || 'CASH').toUpperCase(),
                    subtotal: parseFloat(bill.subtotal || 0),
                    taxTotal: parseFloat(bill.taxTotal || 0),
                    discount: parseFloat(bill.discount || 0),
                    grandTotal: parseFloat(bill.grandTotal || 0),
                    amountPaid: parseFloat(bill.amountPaid || bill.grandTotal || 0),
                    isSettled: bill.isSettled ?? true,
                    createdAt: bill.saleDate ? new Date(bill.saleDate) : new Date(),
                },
            });
            // Create SalesBillItems
            const items = bill.items || [];
            for (const item of items) {
                const productId = item.productId;
                if (!productId)
                    continue;
                const prodExists = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
                if (!prodExists)
                    continue;
                // Ensure a batch exists for batchId relation
                let batch = await prisma_1.prisma.inventoryBatch.findFirst({ where: { productId } });
                if (!batch) {
                    batch = await prisma_1.prisma.inventoryBatch.create({
                        data: {
                            productId,
                            batchNumber: item.batchNumber || 'MIG-DEF',
                            expiryDate: new Date('2028-12-31'),
                            quantity: 100,
                            mrp: parseFloat(item.mrp || 100),
                            purchaseRate: parseFloat(item.rate || 75),
                        },
                    });
                }
                const unitPrice = parseFloat(item.rate || item.unitPrice || item.mrp || 0);
                const qty = parseFloat(item.quantity || 1);
                await prisma_1.prisma.salesBillItem.create({
                    data: {
                        salesBillId: salesBill.id,
                        productId,
                        batchId: batch.id,
                        quantity: qty,
                        unitPrice,
                        taxPercent: parseFloat(item.gstPercent || 12),
                        totalAmount: unitPrice * qty,
                    },
                });
            }
        }
    }
    console.log('🎉 Full Data Migration Completed Successfully into PostgreSQL 3NF Tables!');
}
migrate()
    .catch((e) => {
    console.error('❌ Migration failed:', e);
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});

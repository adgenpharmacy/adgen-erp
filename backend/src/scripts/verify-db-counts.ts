import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAll() {
  console.log('🔍 Checking Supabase Database Record Counts...');

  const products = await prisma.product.count();
  const parties = await prisma.party.count();
  const batches = await prisma.inventoryBatch.count();
  const purchases = await prisma.purchaseBill.count();
  const sales = await prisma.salesBill.count();
  const customers = await prisma.customer.count();

  console.log('-------------------------------------------');
  console.log(`💊 Total Products in Catalog: ${products}`);
  console.log(`🏢 Total Supplier Parties: ${parties}`);
  console.log(`📦 Total Inventory Batches: ${batches}`);
  console.log(`🧾 Total Purchase Invoices: ${purchases}`);
  console.log(`🛒 Total Sales Bills: ${sales}`);
  console.log(`👥 Total Customers: ${customers}`);
  console.log('-------------------------------------------');

  await prisma.$disconnect();
}

checkAll().catch(console.error);

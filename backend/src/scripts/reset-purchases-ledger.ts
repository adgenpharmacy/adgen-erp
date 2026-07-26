import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 [AdGen Database Utility] Updating existing purchase bills to CASH (isPaid: true)...');
  
  // 1. Update all existing purchase bills to isPaid = true (CASH)
  const updatedPurchases = await prisma.purchaseBill.updateMany({
    data: { isPaid: true },
  });
  console.log(`✅ Marked ${updatedPurchases.count} Purchase Bills as CASH (isPaid: true).`);

  // 2. Clear stale supplier ledger entries for paid purchase bills
  const deletedLedger = await prisma.ledgerEntry.deleteMany({
    where: {
      partyType: 'SUPPLIER',
    },
  });
  console.log(`✅ Cleared ${deletedLedger.count} stale supplier ledger entries.`);

  console.log('🎉 Database ledger clean & reset completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error executing database reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

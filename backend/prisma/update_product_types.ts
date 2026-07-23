import { prisma } from '../src/config/prisma';

async function updateProductTypes() {
  console.log('🔄 Classifying product forms/types in PostgreSQL...');

  const products = await prisma.product.findMany();
  console.log(`📦 Analyzing ${products.length} products...`);

  let updatedCount = 0;
  for (const p of products) {
    const text = `${p.name} ${p.productType || ''}`.toUpperCase();

    let newType: any = 'OTHERS';

    if (text.includes('TAB') || text.includes('TABLET')) {
      newType = 'TABLET';
    } else if (text.includes('CAP') || text.includes('CAPSULE')) {
      newType = 'CAPSULE';
    } else if (text.includes('SYP') || text.includes('SYRUP') || text.includes('SUSP') || text.includes('LIQUID') || text.includes('SOLUTION') || text.includes('ELIXIR')) {
      newType = 'SYRUP';
    } else if (text.includes('INJ') || text.includes('AMPOULE') || text.includes('RESPULES') || text.includes('INJECTION')) {
      newType = 'INJECTION';
    } else if (text.includes('CREAM') || text.includes('OINT') || text.includes('OINTMENT') || text.includes('GEL') || text.includes('SOAP') || text.includes('RUB') || text.includes('LOTION') || text.includes('SPRAY')) {
      newType = 'CREAM';
    } else if (text.includes('DROP') || text.includes('DROPS') || text.includes('E/D') || text.includes('EYEDROP')) {
      newType = 'DROPS';
    } else if (text.includes('POWDER') || text.includes('SACHET') || text.includes('CHURN') || text.includes('GRANULES')) {
      newType = 'POWDER';
    }

    if (p.productType !== newType) {
      await prisma.product.update({
        where: { id: p.id },
        data: { productType: newType },
      });
      updatedCount++;
    }
  }

  console.log(`✅ Successfully updated ${updatedCount} product categories!`);
}

updateProductTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error updating product types:', err);
    process.exit(1);
  });

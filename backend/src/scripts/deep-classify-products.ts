import { PrismaClient, ProductType } from '@prisma/client';

const prisma = new PrismaClient();

async function deepClassifyProducts() {
  console.log('🧠 Running Deep Intelligence Classifier across 2,988 medicines...');

  const products = await prisma.product.findMany();

  let stats = {
    TABLET: 0,
    CAPSULE: 0,
    SYRUP: 0,
    INJECTION: 0,
    CREAM: 0,
    DROPS: 0,
    POWDER: 0,
    OTHERS: 0,
  };

  for (const prod of products) {
    const name = prod.name.toUpperCase();
    let productType: ProductType = ProductType.TABLET;
    let packUnit = 'Strip';
    let contentUnit = 'Tablet';

    // 1. DROPS (Eye, Ear, Nasal)
    if (
      name.includes('E/D') ||
      name.includes('EYE') ||
      name.includes('EAR DROP') ||
      name.includes('NASAL') ||
      name.includes('DROP') ||
      name.includes('OTRIVIN') ||
      name.includes('NASIVION') ||
      name.includes('CIPLOX D') ||
      name.includes('TEAR') ||
      name.includes('REFRESHINE') ||
      name.includes('I-KUL')
    ) {
      productType = ProductType.DROPS;
      packUnit = 'Bottle';
      contentUnit = 'Bottle';
    }
    // 2. INJECTIONS
    else if (
      name.includes('INJ') ||
      name.includes('INJECTION') ||
      name.includes('VIAL') ||
      name.includes('AMPOULE') ||
      name.includes('INFUSION') ||
      name.includes('500ML NS') ||
      name.includes('RL 500') ||
      name.includes('PFS')
    ) {
      productType = ProductType.INJECTION;
      packUnit = 'Vial';
      contentUnit = 'Vial';
    }
    // 3. CREAMS, OINTMENTS, SPRAYS, BALMS, SHAVING
    else if (
      name.includes('CREAM') ||
      name.includes('OINTMENT') ||
      name.includes('GEL') ||
      name.includes('SPRAY') ||
      name.includes('LOTION') ||
      name.includes('BALM') ||
      name.includes('RUB') ||
      name.includes('MOOV') ||
      name.includes('OMNIGEL') ||
      name.includes('VOLINI') ||
      name.includes('SUMO GEL') ||
      name.includes('SHAVING') ||
      name.includes('VICKS VAPOUR') ||
      name.includes('VICKS BABY') ||
      name.includes('VICKS RUB')
    ) {
      productType = ProductType.CREAM;
      packUnit = name.includes('SPRAY') ? 'Can' : 'Tube';
      contentUnit = name.includes('SPRAY') ? 'Can' : 'Tube';
    }
    // 4. SYRUPS, SUSPENSIONS, ORAL LIQUIDS
    else if (
      name.includes('SYRUP') ||
      name.includes('SYP') ||
      name.includes('SUSPENSION') ||
      name.includes('SUSP') ||
      name.includes('LIQUID') ||
      name.includes('LIQ') ||
      name.includes('SOLUTION') ||
      name.includes('SOLN') ||
      name.includes('ELIXIR') ||
      name.includes('TONIC') ||
      name.includes('200ML') ||
      name.includes('100ML') ||
      name.includes('150ML') ||
      name.includes('225ML') ||
      name.includes('250ML') ||
      name.includes('170ML') ||
      name.includes('60ML') ||
      name.includes('30ML') ||
      name.includes('50ML') ||
      name.includes('BENADRYL') ||
      name.includes('ZINCOVIT') ||
      name.includes('CYPON') ||
      name.includes('ARISTOZYME') ||
      name.includes('SORBILINE') ||
      name.includes('DEXORANGE 200') ||
      name.includes('CREMAFFIN') ||
      name.includes('GRILINCTUS') ||
      name.includes('ALEX') ||
      name.includes('ASCORIL') ||
      name.includes('TUSQ') ||
      name.includes('ZEDEX') ||
      name.includes('BRO ZEDEX')
    ) {
      productType = ProductType.SYRUP;
      packUnit = 'Bottle';
      contentUnit = 'Bottle';
    }
    // 5. POWDERS, BABY FOOD, SUPPLEMENT TINS, SACHETS
    else if (
      name.includes('POWDER') ||
      name.includes('SACHET') ||
      name.includes('GRANULES') ||
      name.includes('ORS') ||
      name.includes('CERELAC') ||
      name.includes('DEXOLAC') ||
      name.includes('LACTOGEN') ||
      name.includes('APTAMIL') ||
      name.includes('SIMILAC') ||
      name.includes('PEDIASURE') ||
      name.includes('ENSURE') ||
      name.includes('PROTINEX') ||
      name.includes('THREPTIN')
    ) {
      productType = ProductType.POWDER;
      packUnit = name.includes('SACHET') ? 'Sachet' : 'Tin';
      contentUnit = name.includes('SACHET') ? 'Sachet' : 'Gram';
    }
    // 6. CAPSULES
    else if (
      name.includes('CAPSULE') ||
      name.includes('CAPS') ||
      name.includes('CAP ') ||
      name.endsWith(' CAP') ||
      name.includes('SOFTGEL') ||
      name.includes('DEXORANGE CAP') ||
      name.includes('BECOSULES') ||
      name.includes('EVION') ||
      name.includes('OMEE') ||
      name.includes('RABEKIND') ||
      name.includes('PENTOCID')
    ) {
      productType = ProductType.CAPSULE;
      packUnit = 'Strip';
      contentUnit = 'Capsule';
    }
    // 7. SURGICALS, DIAPERS, HYGIENE, PERSONAL CARE (OTHERS)
    else if (
      name.includes('SURGICAL') ||
      name.includes('DIAPER') ||
      name.includes('PAMPERS') ||
      name.includes('MAMY') ||
      name.includes('BLADE') ||
      name.includes('RAZOR') ||
      name.includes('PERFUME') ||
      name.includes('WASH') ||
      name.includes('SOAP') ||
      name.includes('COTTON') ||
      name.includes('BANDAGE') ||
      name.includes('PADS') ||
      name.includes('MASK') ||
      name.includes('GLOVES') ||
      name.includes('SYRINGE') ||
      name.includes('NEEDLE')
    ) {
      productType = ProductType.OTHERS;
      packUnit = 'Pack';
      contentUnit = 'Piece';
    }
    // 8. TABLETS (Default solid oral dosage)
    else {
      productType = ProductType.TABLET;
      packUnit = 'Strip';
      contentUnit = 'Tablet';
    }

    stats[productType]++;

    await prisma.product.update({
      where: { id: prod.id },
      data: {
        productType,
        packUnit,
        contentUnit,
      },
    });
  }

  console.log('✅ Deep Classification Completed successfully!');
  console.log('📊 Product Type Breakdown in PostgreSQL:');
  console.table(stats);

  await prisma.$disconnect();
}

deepClassifyProducts().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function classifyProducts() {
    console.log('🤖 Classifying 2,988 product types in PostgreSQL using name pattern matching...');
    const products = await prisma.product.findMany();
    let updatedCount = 0;
    for (const prod of products) {
        const name = prod.name.toUpperCase();
        let productType = client_1.ProductType.TABLET;
        let packUnit = 'Strip';
        let contentUnit = 'Tablet';
        if (name.includes('SYRUP') || name.includes('SYP') || name.includes('SUSPENSION') || name.includes('LIQUID') || name.includes('SOLUTION') || name.includes('ML')) {
            productType = client_1.ProductType.SYRUP;
            packUnit = 'Bottle';
            contentUnit = 'Bottle';
        }
        else if (name.includes('CAPSULE') || name.includes('CAP') || name.includes('CAPS ')) {
            productType = client_1.ProductType.CAPSULE;
            packUnit = 'Strip';
            contentUnit = 'Capsule';
        }
        else if (name.includes('INJECTION') || name.includes('INJ') || name.includes('VIAL') || name.includes('AMPOULE')) {
            productType = client_1.ProductType.INJECTION;
            packUnit = 'Vial';
            contentUnit = 'Vial';
        }
        else if (name.includes('CREAM') || name.includes('OINTMENT') || name.includes('GEL') || name.includes('TUBE') || name.includes('RUB')) {
            productType = client_1.ProductType.CREAM;
            packUnit = 'Tube';
            contentUnit = 'Tube';
        }
        else if (name.includes('DROP') || name.includes('EYE') || name.includes('EAR') || name.includes('E/D')) {
            productType = client_1.ProductType.DROPS;
            packUnit = 'Bottle';
            contentUnit = 'Bottle';
        }
        else if (name.includes('POWDER') || name.includes('SACHET') || name.includes('GRANULES') || name.includes('GM')) {
            productType = client_1.ProductType.POWDER;
            packUnit = 'Sachet';
            contentUnit = 'Gram';
        }
        else if (name.includes('TABLET') || name.includes('TAB') || name.includes('TABS')) {
            productType = client_1.ProductType.TABLET;
            packUnit = 'Strip';
            contentUnit = 'Tablet';
        }
        if (prod.productType !== productType || prod.packUnit !== packUnit || prod.contentUnit !== contentUnit) {
            await prisma.product.update({
                where: { id: prod.id },
                data: {
                    productType,
                    packUnit,
                    contentUnit,
                },
            });
            updatedCount++;
        }
    }
    console.log(`✅ Automated Product Classification Completed! Updated ${updatedCount} products.`);
    await prisma.$disconnect();
}
classifyProducts().catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});

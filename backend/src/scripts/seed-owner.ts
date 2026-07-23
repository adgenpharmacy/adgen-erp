import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';

async function seedOwner() {
  const email = (process.env.OWNER_EMAIL || 'owner@adgenpharmacy.com').toLowerCase().trim();
  const password = process.env.OWNER_PASSWORD || 'owner123password';
  const name = process.env.OWNER_NAME || 'Pharmacy Owner';

  console.log(`Seeding Owner account for: ${email}...`);

  const hashedPassword = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      isActive: true,
      isApproved: true,
      role: 'OWNER',
    },
    create: {
      firebaseUid: `owner_${Date.now()}`,
      name,
      email,
      passwordHash: hashedPassword,
      role: 'OWNER',
      designation: 'Owner & Chief Pharmacist',
      isActive: true,
      isApproved: true,
    },
  });

  console.log('✅ Owner account seeded successfully!');
  console.log(`ID: ${owner.id}`);
  console.log(`Email: ${owner.email}`);
  console.log(`Role: ${owner.role}`);
}

seedOwner()
  .catch((err) => {
    console.error('❌ Error seeding owner account:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

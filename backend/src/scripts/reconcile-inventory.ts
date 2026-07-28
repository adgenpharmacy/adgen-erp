/**
 * Restores stock on hand from a legacy PharmacyERP backup export.
 *
 *   npx ts-node src/scripts/reconcile-inventory.ts <backupDir>            # dry run
 *   npx ts-node src/scripts/reconcile-inventory.ts <backupDir> --apply    # writes
 *
 * The legacy inventory collection is a snapshot of what is physically on the shelf. It already
 * nets off every purchase and every sale the legacy app recorded, so it is the authority — the
 * figure the client counted and trusts. This script makes our batch quantities agree with it.
 *
 * Run this AFTER reconcile-purchases and reconcile-sales. Those two restore the financial
 * record; neither is allowed to move stock, because the snapshot below already accounts for
 * the goods they describe. Applying both a movement and the snapshot would double-count.
 *
 * Stock is valued the way reports.routes.ts values it: quantity is held in base units (loose
 * tablets) while mrp and purchaseRate are per pack, so the pack size has to be divided out.
 *
 * IMPORTANT: reconciles against a point-in-time export. Do not re-run once the client starts
 * billing in this app — it would restore stock they have since sold.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const envPath = path.join(__dirname, '../../.env');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const APPLY = process.argv.includes('--apply');
const backupDir = process.argv[2];

if (!backupDir || backupDir.startsWith('--')) {
  console.error('Usage: reconcile-inventory.ts <backupDir> [--apply]');
  process.exit(1);
}

interface LegacyBatch {
  batchNumber?: string;
  expiryDate?: string;
  purchaseDate?: string;
  quantity?: number;
  mrp?: number;
  purchaseRate?: number;
}

interface LegacyStock {
  _id: string;
  productId?: string;
  productName?: string;
  systemStock?: number;
  batches?: LegacyBatch[];
}

const money = (n: number) => `Rs ${n.toFixed(2)}`;
/** Legacy leaves the batch number blank where our schema stores the literal 'DEFAULT'. */
const batchKey = (s: string | undefined) => ((s || '').trim() || 'DEFAULT').toUpperCase();

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(backupDir, 'inventory.json'), 'utf-8')) as {
    count: number;
    docs: LegacyStock[];
  };
  const legacy = raw.docs;

  const products = await prisma.product.findMany({ select: { id: true, name: true, packSize: true } });
  const byName = new Map(products.map((p) => [p.name.trim().toUpperCase(), p]));

  const batches = await prisma.inventoryBatch.findMany({
    select: { id: true, productId: true, batchNumber: true, quantity: true, mrp: true, purchaseRate: true },
  });
  const byProduct = new Map<string, typeof batches>();
  for (const b of batches) {
    const list = byProduct.get(b.productId) || [];
    list.push(b);
    byProduct.set(b.productId, list);
  }

  const packOf = new Map(products.map((p) => [p.id, p.packSize > 0 ? p.packSize : 1]));
  const value = (rows: { productId: string; quantity: number; mrp: number; purchaseRate: number }[]) => {
    let cost = 0;
    let mrp = 0;
    let units = 0;
    for (const b of rows) {
      const size = packOf.get(b.productId) || 1;
      cost += b.quantity * (b.purchaseRate / size);
      mrp += b.quantity * (b.mrp / size);
      units += b.quantity;
    }
    return { cost, mrp, units };
  };

  const before = value(batches);
  console.log(`\nDATABASE NOW : ${money(before.cost)} at cost, ${money(before.mrp)} at MRP, ${before.units.toFixed(2)} units`);

  // Plan the changes without touching anything.
  const updates: { id: string; from: number; to: number }[] = [];
  const creates: { productId: string; batchNumber: string; expiryDate: Date; quantity: number; mrp: number; purchaseRate: number }[] = [];
  const zeroed: { id: string; from: number }[] = [];
  const unmatched: string[] = [];
  let missingProducts = 0;

  for (const doc of legacy) {
    const name = (doc.productName || '').trim();
    const product = byName.get(name.toUpperCase());
    if (!product) {
      if ((doc.batches || []).some((b) => (Number(b.quantity) || 0) > 0)) {
        unmatched.push(name);
        missingProducts++;
      }
      continue;
    }

    // Several legacy batches can share a number; the shelf only cares about the total.
    const wanted = new Map<string, { qty: number; mrp: number; rate: number; expiry: string | undefined }>();
    for (const b of doc.batches || []) {
      const k = batchKey(b.batchNumber);
      const prev = wanted.get(k);
      const qty = Number(b.quantity) || 0;
      if (prev) prev.qty += qty;
      else
        wanted.set(k, {
          qty,
          mrp: Number(b.mrp) || 0,
          rate: Number(b.purchaseRate) || 0,
          expiry: b.expiryDate,
        });
    }

    const mine = (byProduct.get(product.id) || []).slice();
    const usedIds = new Set<string>();

    for (const [k, w] of wanted) {
      const match = mine.find((b) => batchKey(b.batchNumber) === k && !usedIds.has(b.id));
      if (match) {
        usedIds.add(match.id);
        if (Math.abs(match.quantity - w.qty) > 0.0001) {
          updates.push({ id: match.id, from: match.quantity, to: w.qty });
        }
      } else if (w.qty > 0) {
        creates.push({
          productId: product.id,
          batchNumber: k === 'DEFAULT' ? 'DEFAULT' : k,
          expiryDate: w.expiry ? new Date(w.expiry) : new Date(Date.now() + 365 * 864e5),
          quantity: w.qty,
          mrp: w.mrp,
          purchaseRate: w.rate,
        });
      }
    }

    // A stored batch the snapshot does not list is stock the legacy app no longer has.
    for (const b of mine) {
      if (!usedIds.has(b.id) && b.quantity !== 0) zeroed.push({ id: b.id, from: b.quantity });
    }
  }

  // Project the result of applying everything above.
  const projected = batches.map((b) => ({ ...b }));
  const idx = new Map(projected.map((b) => [b.id, b]));
  updates.forEach((u) => { const r = idx.get(u.id); if (r) r.quantity = u.to; });
  zeroed.forEach((z) => { const r = idx.get(z.id); if (r) r.quantity = 0; });
  const after = value([...projected, ...creates]);

  console.log(`\n--- PLANNED CHANGES ---`);
  console.log(`  batch quantities corrected : ${updates.length}`);
  console.log(`  batches created            : ${creates.length}`);
  console.log(`  batches emptied            : ${zeroed.length}`);
  console.log(`  legacy products not in our catalogue: ${missingProducts}`);
  unmatched.slice(0, 10).forEach((n) => console.log(`      ${n}`));

  console.log(`\n--- RESULT ---`);
  console.log(`  stock @ cost : ${money(before.cost)}  ->  ${money(after.cost)}`);
  console.log(`  stock @ MRP  : ${money(before.mrp)}  ->  ${money(after.mrp)}`);
  console.log(`  units        : ${before.units.toFixed(2)}  ->  ${after.units.toFixed(2)}`);
  console.log(`  legacy screen reads Rs 2,86,584.50 at cost and Rs 4,53,149.38 at MRP`);

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('\n================ APPLYING ================');

  for (const u of updates) {
    await prisma.inventoryBatch.update({ where: { id: u.id }, data: { quantity: u.to } });
  }
  console.log(`Corrected ${updates.length} batch quantities`);

  if (creates.length > 0) {
    await prisma.inventoryBatch.createMany({ data: creates });
  }
  console.log(`Created ${creates.length} batches`);

  for (const z of zeroed) {
    await prisma.inventoryBatch.update({ where: { id: z.id }, data: { quantity: 0 } });
  }
  console.log(`Emptied ${zeroed.length} batches`);

  const finalRows = await prisma.inventoryBatch.findMany({
    select: { productId: true, quantity: true, mrp: true, purchaseRate: true },
  });
  const final = value(finalRows);
  console.log(`\nSTOCK NOW : ${money(final.cost)} at cost, ${money(final.mrp)} at MRP, ${final.units.toFixed(2)} units\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

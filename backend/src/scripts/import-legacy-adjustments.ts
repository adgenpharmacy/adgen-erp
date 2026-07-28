/**
 * Imports the stock adjustments the owner made in the legacy Firebase app.
 *
 *   npx ts-node src/scripts/import-legacy-adjustments.ts <backupDir>            # dry run
 *   npx ts-node src/scripts/import-legacy-adjustments.ts <backupDir> --apply    # writes
 *
 * These are recorded as history only: every row is written with quantityDelta = 0 and does
 * NOT move stock.
 *
 * The reason is that the legacy batch stores the quantity it *ended at*, never the change that
 * was made. A delta could only be inferred by subtracting what the bills say from what legacy
 * held — but that difference is dominated by the duplicated stock writes this project has just
 * finished removing, so any delta derived that way would reimport the very corruption we
 * cleared. Current stock is derived from the documents, which the shop's physical count backs,
 * and that stays untouched.
 *
 * What the rows do give you is the audit trail legacy never surfaced: which batches the owner
 * touched, when, and what reason he typed.
 *
 * Safe to re-run: rows already imported are skipped.
 */
import { PrismaClient, AdjustmentSource } from '@prisma/client';
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
  console.error('Usage: import-legacy-adjustments.ts <backupDir> [--apply]');
  process.exit(1);
}

interface LegacyBatch {
  batchNumber?: string;
  expiryDate?: string;
  purchaseDate?: string;
  quantity?: number;
  isManualAdjustment?: boolean;
  adjustedByName?: string | null;
  adjustmentReason?: string | null;
}

interface LegacyStock {
  productName?: string;
  lastUpdated?: string;
  batches?: LegacyBatch[];
}

const bn = (s: string | null | undefined) => ((s || '').trim() || 'DEFAULT').toUpperCase();
const ym = (d: Date) => d.toISOString().slice(0, 7);

async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(backupDir, 'inventory.json'), 'utf-8')) as {
    docs: LegacyStock[];
  };

  const found: { product: string; batch: LegacyBatch; when: Date }[] = [];
  for (const doc of raw.docs) {
    for (const b of doc.batches || []) {
      if (b.isManualAdjustment || b.adjustedByName || b.adjustmentReason) {
        found.push({
          product: (doc.productName || '').trim(),
          batch: b,
          when: new Date(b.purchaseDate || doc.lastUpdated || Date.now()),
        });
      }
    }
  }

  console.log(`\nlegacy rows carrying an adjustment marker: ${found.length}`);

  const existing = await prisma.stockAdjustment.count({ where: { source: AdjustmentSource.LEGACY_IMPORT } });
  console.log(`already imported: ${existing}`);

  const planned: {
    batchId: string;
    productId: string;
    product: string;
    quantity: number;
    reason: string;
    when: Date;
  }[] = [];
  const unmatched: string[] = [];

  for (const row of found) {
    const product = await prisma.product.findFirst({
      where: { name: { equals: row.product, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (!product) {
      unmatched.push(`${row.product} (no such product)`);
      continue;
    }

    // Prefer the batch with the same number and expiry month; fall back to the number alone.
    const candidates = await prisma.inventoryBatch.findMany({
      where: { productId: product.id },
      select: { id: true, batchNumber: true, expiryDate: true },
    });
    const wantExpiry = row.batch.expiryDate ? ym(new Date(row.batch.expiryDate)) : null;
    const batch =
      candidates.find((c) => bn(c.batchNumber) === bn(row.batch.batchNumber) && (!wantExpiry || ym(c.expiryDate) === wantExpiry)) ??
      candidates.find((c) => bn(c.batchNumber) === bn(row.batch.batchNumber));

    if (!batch) {
      unmatched.push(`${row.product} / batch ${bn(row.batch.batchNumber)} (no such batch)`);
      continue;
    }

    const qty = Number(row.batch.quantity) || 0;
    const who = (row.batch.adjustedByName || 'Owner').trim();
    const why = (row.batch.adjustmentReason || '').trim();
    // Legacy accepted "?" and "0" as reasons, so say plainly that none was given rather than
    // reprinting a placeholder that tells the reader nothing.
    const statedReason = why && why !== '?' && why !== '0' ? `Reason given: "${why}"` : 'No reason was recorded';

    planned.push({
      batchId: batch.id,
      productId: product.id,
      product: product.name,
      quantity: qty,
      when: row.when,
      reason:
        `[Old app] ${who} adjusted this batch to ${qty} on ` +
        `${row.when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}. ` +
        `${statedReason}. Recorded for history — stock is derived from the bills and was not changed.`,
    });
  }

  console.log(`\nwill import: ${planned.length}`);
  planned.forEach((p) =>
    console.log(`  ${p.product.slice(0, 34).padEnd(34)} qty ${String(p.quantity).padStart(5)}  ${p.when.toISOString().slice(0, 10)}`)
  );
  if (unmatched.length) {
    console.log(`\ncould not match ${unmatched.length}:`);
    unmatched.forEach((u) => console.log(`  ${u}`));
  }

  console.log('\nnote: every row is written with quantityDelta = 0, so stock does not move.');

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  if (existing > 0) {
    console.log('\nLegacy adjustments are already present; nothing to do.\n');
    await prisma.$disconnect();
    return;
  }

  for (const p of planned) {
    const current = await prisma.inventoryBatch.findUnique({
      where: { id: p.batchId },
      select: { quantity: true },
    });
    await prisma.stockAdjustment.create({
      data: {
        batchId: p.batchId,
        productId: p.productId,
        quantityDelta: 0,
        previousQuantity: current?.quantity ?? 0,
        newQuantity: current?.quantity ?? 0,
        reason: p.reason,
        source: AdjustmentSource.LEGACY_IMPORT,
        createdAt: p.when,
      },
    });
  }

  console.log(`\nImported ${planned.length} historical adjustments. Stock unchanged.\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

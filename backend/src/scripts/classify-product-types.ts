/**
 * Infers a product's dosage form from its name and fills in the ones left as OTHERS.
 *
 *   npx ts-node src/scripts/classify-product-types.ts          # dry run, changes nothing
 *   npx ts-node src/scripts/classify-product-types.ts --apply  # writes
 *
 * Safety: only rows currently marked OTHERS are ever touched. A product that already has a
 * specific type was classified deliberately (or by a human) and is left alone, so re-running
 * this can never degrade existing data.
 */
import { PrismaClient, ProductType } from '@prisma/client';
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

/**
 * Surgical goods, devices and consumables. These are stocked and sold but have no dosage
 * form, so they stay OTHERS — which is the correct answer, not a failure to classify.
 *
 * This runs BEFORE the dosage rules because the naming collides badly: "KNEE CAP" is not a
 * capsule, "IV SET" is not an injection, and "INJECTION PLASTER" is a dressing.
 */
const NOT_A_DOSAGE_FORM =
  /\b(set|plaster|bandage|crepe|gauze|cotton|glove|gloves|mask|syringe|needle|catheter|cannula|thermometer|glucometer|lancet|test ?strips?|belt|support|brace|knee ?cap|corn ?cap|elbow|ankle|collar|sling|wheel ?chair|walker|stick|nebuli[sz]er|inhaler|bag|tube ?feed|urinal|diaper|sanitary|napkin|wipes?|soap|shampoo|toothpaste|tooth ?paste|paste|face ?wash|hair ?oil|brush|razor|condom|pregnancy ?kit|bp ?monitor|oximeter|floor ?cleaner|cleaner|repellent|agarbatti)\b/i;

/**
 * FMCG brands stocked by the pharmacy that are not medicines. Needed because their names
 * follow the same "<BRAND> <NUMBER> <COUNT>" shape as a tablet strip — "WHISPER CHOICE XL 20 20"
 * and "DUREX 60 3" both look exactly like a strip of tablets to a pattern matcher.
 */
const NON_MEDICINAL_BRANDS =
  /\b(whisper|stayfree|sofy|durex|kamasutra|skore|moods|manforce ?(strawberry|chocolate|banana|dotted|ribbed)|cerelac|lactogen|pampers|huggies|colgate|sensodyne|sensodent|pepsodent|closeup|oral ?-?b|gillette|veet|nivea|ponds|fair ?& ?lovely|clean ?and ?clear|medimix|lifebuoy|dettol ?soap|santoor|cinthol|glucon ?d|sugar ?free|hajmola ?candy)\b/i;

/**
 * Ordered rules — the FIRST match wins, so the sequence matters.
 * Injectables are tested before liquids because "Tetanus Amp 0.5ml" and "Insugen 10ml"
 * are injections that would otherwise be caught by the millilitre rule.
 */
const RULES: { type: ProductType; label: string; re: RegExp; nameOnly?: boolean }[] = [
  // Injectables first: ampoules, vials and insulins are all measured in ml.
  // Note: no bare "iv"/"im" — they matched "IV SET" and assorted brand fragments.
  { type: 'INJECTION', label: 'injection', re: /\b(inj|injection|ampoule|vial|insulin|insugen|humalog|lantus|actrapid|mixtard)\b|\bamp\b(?!\w)/i },

  // Drops before syrups: "Eye Drop 10ml" is not a syrup.
  { type: 'DROPS', label: 'drops', re: /\b(drops?|e\/d|eye ?drop|ear ?drop|nasal ?spray|opthal|ophthalmic)\b/i },

  // "cap" only counts as a capsule when spelled out, or immediately followed by a count/strength
  // ("CAP 10", "CAP 500MG"). Bare "CAP" is usually a knee cap or corn cap.
  { type: 'CAPSULE', label: 'capsule', re: /\b(capsules?|softgel)\b|\bcaps?\b(?=\s*\d)/i },

  { type: 'TABLET', label: 'tablet', re: /\b(tablets?|tabs?|dt|chewable|dispersible)\b/i },

  // Indian strip convention: "<BRAND> <STRENGTH> <COUNT>" e.g. "MAHACEF 200MG 10",
  // "MEDIMOL 500 10", "CTD 6.25 15". A dose strength plus a trailing strip count and no
  // other form word is an oral solid. Capsules almost always say CAP, so this lands on
  // TABLET — the common case — rather than guessing between the two.
  // `nameOnly` because this rule is anchored to the END of the string: the strip count is the
  // last token of the product NAME, and appending the generic name would move the anchor.
  { type: 'TABLET', label: 'tablet (strip pattern)', re: /\d\s*(mg|mcg)?\s+\d{1,3}$/i, nameOnly: true },

  { type: 'OINTMENT', label: 'ointment', re: /\b(oint|ointment)\b/i },
  // "rub" and "vaporub" are topical balms (VICKS VAPOUR RUB).
  { type: 'CREAM',    label: 'cream',    re: /\b(cream|crm|gel|lotion|balm|salve|liniment|rub|vaporub|moisturi[sz]er)\b/i },

  // Explicit powder words only — a bare "GM" also describes creams and ointments.
  { type: 'POWDER', label: 'powder', re: /\b(powder|pdr|sachet|granules?)\b/i },

  // Liquids last — anything oral measured in ml that is not an injection or drop.
  //
  // The unit must be matched as `\d+\s*ml`, NOT `\bml\b`: there is no word boundary between
  // a digit and a letter, so `\bml\b` silently failed on the common "150ML" form and left
  // hundreds of syrups unclassified.
  { type: 'SYRUP', label: 'syrup/liquid', re: /\b(syp|syrup|susp|suspension|liquid|elixir|tonic|gargle|gargal|mouth ?wash|oral ?sol|solution|ors)\b|\d\s*ml\b/i },
];

export function classify(name: string, generic?: string | null): { type: ProductType; label: string } | null {
  const cleanName = name.trim();
  const haystack = `${cleanName} ${generic ?? ''}`.trim();

  // Devices, consumables and FMCG have no dosage form; leave them alone.
  if (NOT_A_DOSAGE_FORM.test(haystack)) return null;
  if (NON_MEDICINAL_BRANDS.test(haystack)) return null;

  for (const rule of RULES) {
    if (rule.re.test(rule.nameOnly ? cleanName : haystack)) {
      return { type: rule.type, label: rule.label };
    }
  }
  return null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { productType: 'OTHERS' },
    select: { id: true, name: true, genericName: true },
  });

  console.log(`\nCandidates (currently OTHERS): ${products.length}`);

  const buckets = new Map<ProductType, { id: string; name: string }[]>();
  let unmatched = 0;

  for (const p of products) {
    const hit = classify(p.name, p.genericName);
    if (!hit) {
      unmatched++;
      continue;
    }
    if (!buckets.has(hit.type)) buckets.set(hit.type, []);
    buckets.get(hit.type)!.push({ id: p.id, name: p.name });
  }

  console.log('\nProposed reclassification:');
  const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [type, rows] of sorted) {
    console.log(`\n  ${type}  ->  ${rows.length}`);
    rows.slice(0, 4).forEach((r) => console.log(`      ${r.name}`));
    if (rows.length > 4) console.log(`      … and ${rows.length - 4} more`);
  }
  console.log(`\n  stays OTHERS (no confident match): ${unmatched}`);

  const willChange = [...buckets.values()].reduce((s, r) => s + r.length, 0);
  console.log(`\nTotal to update: ${willChange} of ${products.length}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('\nApplying…');
  let done = 0;
  for (const [type, rows] of sorted) {
    // Chunked so one oversized IN (...) can't blow the statement limit.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await prisma.product.updateMany({
        where: { id: { in: chunk.map((r) => r.id) } },
        data: { productType: type },
      });
      done += chunk.length;
      process.stdout.write(`\r  updated ${done}/${willChange}`);
    }
  }

  console.log('\n\nFinal distribution:');
  const after = await prisma.product.groupBy({
    by: ['productType'],
    _count: { _all: true },
    orderBy: { _count: { productType: 'desc' } },
  });
  after.forEach((r) => console.log(`  ${String(r.productType).padEnd(10)} ${String(r._count._all).padStart(5)}`));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * Copy the whole database from one Supabase project to another (region move).
 *
 * The counter must be closed while this runs: the dump is a snapshot, so a bill written to the
 * source after it is taken exists nowhere afterwards. Put the API in maintenance mode first
 * (MAINTENANCE_MODE=1) rather than relying on nobody being logged in.
 *
 * Source is read with DIRECT_URL from backend/.env; target with NEW_DIRECT_URL from
 * backend/.env.new. Both must be session-mode connections (port 5432) — pg_restore needs session
 * state that the transaction pooler on 6543 does not keep.
 *
 * Credentials are handed to the tools through PGPASSWORD and discrete flags, so the password
 * never appears in a command line or in this repository.
 *
 *   npx ts-node src/scripts/migrate-region.ts            # dump + restore
 *   npx ts-node src/scripts/migrate-region.ts --dump-only
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const BACKEND_DIR = path.resolve(__dirname, '../..');

const source = dotenv.config({ path: path.join(BACKEND_DIR, '.env') }).parsed || {};
const target = dotenv.config({ path: path.join(BACKEND_DIR, '.env.new') }).parsed || {};

const OLD_DIRECT_URL = process.env.OLD_DIRECT_URL || source.DIRECT_URL;
const NEW_DIRECT_URL = process.env.NEW_DIRECT_URL || target.NEW_DIRECT_URL;

if (!OLD_DIRECT_URL || !NEW_DIRECT_URL) {
  console.error('Need DIRECT_URL in backend/.env and NEW_DIRECT_URL in backend/.env.new');
  process.exit(1);
}

/**
 * Supabase runs PostgreSQL 17, so the client tools must be 17 or newer — an older pg_dump refuses
 * to read a newer server outright. Neither version installed here is on PATH.
 */
function findPgBin(): string {
  const candidates = [
    process.env.PG_BIN,
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    '/usr/lib/postgresql/17/bin',
    '/usr/local/bin',
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    const exe = path.join(dir, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
    if (existsSync(exe)) return dir;
  }
  console.error('pg_dump 17+ not found. Set PG_BIN to the folder containing it.');
  process.exit(1);
}

const PG_BIN = findPgBin();
const exe = (name: string) => path.join(PG_BIN, process.platform === 'win32' ? `${name}.exe` : name);

/** Splits a connection string into flags plus a password kept out of argv. */
function connection(url: string) {
  const u = new URL(url);
  return {
    flags: [
      '--host', u.hostname,
      '--port', u.port || '5432',
      '--username', decodeURIComponent(u.username),
      '--dbname', u.pathname.replace(/^\//, '') || 'postgres',
    ],
    password: decodeURIComponent(u.password),
    label: `${u.hostname}:${u.port}`,
  };
}

const from = connection(OLD_DIRECT_URL);
const to = connection(NEW_DIRECT_URL);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dumpFile = process.env.DUMP_FILE || path.join(BACKEND_DIR, `pharmacy-erp-${stamp}.dump`);

function run(command: string, args: string[], password: string, label: string) {
  console.log(`\n==> ${label}`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: password },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) {
    console.error(`    failed to start: ${result.error.message}`);
    process.exit(1);
  }
  console.log(`    exit ${result.status} after ${seconds}s`);
  return result.status ?? 1;
}

const dumpStatus = run(
  exe('pg_dump'),
  [...from.flags, '--format=custom', '--no-owner', '--no-acl', '--schema=public', '--file', dumpFile],
  from.password,
  `Dumping ${from.label} -> ${dumpFile}`
);

if (dumpStatus !== 0) {
  console.error('\nDump failed. Nothing has been written to the target. Stop here.');
  process.exit(1);
}

if (process.argv.includes('--dump-only')) {
  console.log('\n--dump-only: stopping before restore.');
  process.exit(0);
}

/*
 * Ownership and grants belong to the source project's roles, which do not exist in the target;
 * --no-owner/--no-acl keeps the objects and drops those statements. A non-zero exit is not
 * treated as fatal here: Supabase pre-creates a few objects and those collisions are expected
 * noise. compare-databases.ts is what actually decides whether the copy is good.
 */
const restoreStatus = run(
  exe('pg_restore'),
  [...to.flags, '--no-owner', '--no-acl', '--schema=public', dumpFile],
  to.password,
  `Restoring into ${to.label}`
);

if (restoreStatus !== 0) {
  console.log('\npg_restore reported errors (often harmless). Verify before trusting the copy.');
}

console.log('\n==> Now verify, and do not switch the app over unless it prints "Identical":');
console.log('    npx ts-node src/scripts/compare-databases.ts');

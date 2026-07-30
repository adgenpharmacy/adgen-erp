#!/usr/bin/env bash
#
# Copy the whole database from the old Supabase project to a new one in another region.
#
# The counter must be closed while this runs: bills written to the old database after the dump
# is taken do not exist in the new one, and there is no way to merge them afterwards.
#
# Usage (from backend/):
#   OLD_DIRECT_URL="postgresql://…:5432/postgres" \
#   NEW_DIRECT_URL="postgresql://…:5432/postgres" \
#   bash src/scripts/migrate-region.sh
#
# Both must be the DIRECT connections (port 5432). The pooler (6543) cannot run a restore:
# pg_restore needs session state that PgBouncer's transaction pooling does not keep.
set -euo pipefail

# Supabase runs PostgreSQL 17, so the client tools must be 17 or newer — an older pg_dump refuses
# to read a newer server. 18 is installed on this machine but is not on PATH.
PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/18/bin}"
DUMP_FILE="${DUMP_FILE:-./pharmacy-erp-$(date +%Y%m%d-%H%M%S).dump}"

: "${OLD_DIRECT_URL:?set OLD_DIRECT_URL (source, port 5432)}"
: "${NEW_DIRECT_URL:?set NEW_DIRECT_URL (target, port 5432)}"

echo "==> Dumping source database"
"$PG_BIN/pg_dump" "$OLD_DIRECT_URL" \
  --format=custom \
  --no-owner --no-acl \
  --schema=public \
  --file="$DUMP_FILE"
echo "    wrote $DUMP_FILE"

echo "==> Restoring into target database"
# Ownership and grants belong to the old project's roles, which do not exist in the new one;
# --no-owner/--no-acl keeps the objects and drops those statements. Restore is not run with
# --exit-on-error: Supabase pre-creates a few objects, and those collisions are expected noise.
# The row counts printed afterwards are what actually decides whether this worked.
"$PG_BIN/pg_restore" \
  --dbname="$NEW_DIRECT_URL" \
  --no-owner --no-acl \
  --schema=public \
  "$DUMP_FILE" || echo "    (pg_restore reported errors — check the counts below before trusting it)"

echo "==> Done. Verify with:"
echo "    DATABASE_URL=\"\$NEW_DIRECT_URL\" DIRECT_URL=\"\$NEW_DIRECT_URL\" npx ts-node src/scripts/verify-db-counts.ts"

#!/usr/bin/env bash
# Runs the migrations and the security/workflow checks on a throwaway plain
# PostgreSQL database (no Docker or Supabase needed).
#
# Usage: supabase/sql-tests/run-on-plain-postgres.sh "postgresql://postgres@127.0.0.1:5432/postgres"
# The URL must point at a server where you can create and drop databases.
set -euo pipefail

ADMIN_URL="${1:?Pass a PostgreSQL connection URL for a superuser}"
DB="cne_sql_tests"
HERE="$(cd "$(dirname "$0")" && pwd)"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql "$ADMIN_URL" -qX -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB"
psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$HERE/supabase-stub.sql"
for migration in "$HERE"/../migrations/*.sql; do
  echo "Applying $(basename "$migration")"
  psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$migration"
done
psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$HERE/security_and_workflow.test.sql"
psql "$ADMIN_URL" -qX -c "drop database $DB"

#!/usr/bin/env bash
# Runs supabase/tests/rls_rbac_assertions.sql against the database
# prepared by db-test-setup.sh and fails (non-zero exit) if any
# assertion inside it raises. Separate from setup so a developer can
# re-run just the assertions after tweaking a policy without reseeding.
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=njala_test}"
export PGHOST PGPORT PGUSER PGDATABASE

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

psql -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/rls_rbac_assertions.sql"

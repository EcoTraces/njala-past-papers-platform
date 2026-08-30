#!/usr/bin/env bash
# Applies a minimal Supabase-shaped stub (auth/storage schemas, the
# anon/authenticated roles, and the default table privileges Supabase
# itself grants those roles) to a plain Postgres instance, then runs
# every migration and the seed file against it. This lets the RLS
# policies in supabase/migrations/*_rls_policies.sql - which reference
# auth.uid(), auth.users and storage.objects - be exercised for real in
# CI and locally, without needing a full Supabase stack.
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=njala_test}"
export PGHOST PGPORT PGUSER PGDATABASE

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Creating Supabase-shaped stub schema (auth, storage, roles)"
psql -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Mirrors Supabase's real auth.uid()/auth.role(): both read GUCs that
-- our test harness sets per-simulated-request via SET LOCAL.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public, auth, storage to anon, authenticated;
SQL

echo "==> Applying migrations"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "   - $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "==> Applying default table privileges (mirrors Supabase's own grants to anon/authenticated - RLS does the real filtering)"
psql -v ON_ERROR_STOP=1 <<'SQL'
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
SQL

echo "==> Applying seed data"
psql -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/seed/seed.sql" >/dev/null

echo "==> Database ready at $PGDATABASE"

# Contributing

## Workflow

1. Branch from `main`.
2. Make your change. Keep it scoped - don't mix an unrelated refactor
   into a feature/fix branch.
3. Run the relevant checks locally before opening a PR (see below and
   TESTING.md). CI runs all of them again, but catching a failure
   locally is faster.
4. Open a PR. Describe *why*, not just *what* - the diff already shows
   what changed.
5. Address review feedback with new commits; don't force-push over
   history reviewers have already commented on unless asked to.

## Local setup

See README.md "Getting started". You'll need a Supabase project (or the
Supabase CLI's local stack) to run the API against real data; the unit
test suites (`npm run test`) don't need one.

## Before opening a PR

```bash
npm run typecheck    # apps/api, apps/web, packages/shared
npm run lint          # apps/api, apps/web
npm run test           # unit tests across all three Node packages
npm run build          # confirms production builds still succeed
```

If you touched `supabase/migrations/` or `supabase/tests/`, also run
the RLS/RBAC suite (see TESTING.md) - a migration that "looks right"
but breaks a policy is exactly what that suite exists to catch.

If you touched `apps/document-service`, run `ruff check` and `pytest`
there too.

## Commit messages

Explain the reasoning, not a restatement of the diff. If you fixed a
bug, say what was actually broken and how you confirmed the fix (which
test, or what you manually verified).

## Conventions

See CODING_RULES.md for the specifics this codebase enforces (defense
in depth for authorization, no service-role client outside its narrow
allowed uses, no fabricated/mocked data pretending to be real, etc).

## Adding a new table

1. Add a migration under `supabase/migrations/` (new file, next
   timestamp - never edit an already-applied migration).
2. Enable RLS on it and write explicit policies - there is no
   "authenticated users can do everything" policy anywhere in this
   project and there shouldn't be one in your addition either.
3. Add matching TypeScript types/Zod schemas to `packages/shared` if
   the API or frontend will touch it.
4. If the table has any role-sensitive visibility rule, add a scenario
   to `supabase/tests/rls_rbac_assertions.sql` proving it - see
   TESTING.md for the pattern (`SET ROLE`, `set_config('request.jwt.claim.sub', ...)`).

## Adding a new API route

1. Add the Zod input schema to `packages/shared/src/validation/` if it
   doesn't already exist there.
2. Register the route with an explicit `preHandler` chain
   (`authenticate`, then `requireRole`/`requirePermission` as needed) -
   never rely on RLS alone to reject unauthorized requests at the API
   layer; the two layers are meant to be independently correct.
3. Use `request.db` (the caller's RLS-scoped client) for ordinary
   reads/writes. Only reach for `supabaseAdmin` for the specific,
   narrow cases already documented in `apps/api/src/lib/supabase.ts`.
4. Add an OpenAPI `schema.tags` entry so it shows up sensibly grouped
   in `/api/docs`, and add it to API.md's table.
5. Call `recordAuditEvent()` for anything security-relevant (creation,
   status changes, deletion, role/permission changes).

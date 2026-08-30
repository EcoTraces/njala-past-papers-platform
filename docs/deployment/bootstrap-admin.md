# Bootstrapping the first SUPER_ADMIN

By design, no code path creates a privileged account automatically:
`/api/auth/signup` always creates a STUDENT, and `/api/admin/staff`
(the only way to create a LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN)
itself requires being logged in as an ADMIN/SUPER_ADMIN already. The
very first privileged account has to be created by hand, once, directly
against the database - deliberately, so it can never be an
accidentally-reachable API surface.

## Steps

1. Sign up a normal student account through the app (or the API) with
   the email/details you want the first admin to use. This creates the
   `auth.users` row and a `profiles` row with the `STUDENT` role.

   If you'd rather not have a stray STUDENT profile lying around,
   create the auth user directly instead via the Supabase dashboard
   (Authentication → Users → Add user) or the Admin API, then insert a
   matching `profiles` row yourself with a `staff_id` (not
   `student_id`) - mirror what `apps/api/src/routes/admin.routes.ts`'s
   `POST /staff` handler does.

2. In the Supabase SQL editor (or `psql` against `SUPABASE_DB_URL`),
   find the user's id and grant SUPER_ADMIN:

   ```sql
   -- Find the user
   select id, student_id, staff_id, full_name from profiles
   where student_id = 'THEIR_STUDENT_ID' or staff_id = 'THEIR_STAFF_ID';

   -- Grant SUPER_ADMIN (run as the postgres/service role user, which
   -- bypasses RLS - this is exactly the one place that's expected and
   -- correct)
   insert into user_roles (user_id, role_id)
   select '<the-uuid-from-above>', id from roles where name = 'SUPER_ADMIN';
   ```

3. If you went the "convert a student profile" route and want to clear
   the STUDENT role and/or the `student_id`, that's optional - holding
   multiple roles is supported by the schema (`user_roles` is a
   many-to-many table). Cleaner is to convert `student_id` to `null`
   and set a `staff_id`, matching how `POST /admin/staff` provisions
   real staff accounts - but this is not required for the account to
   function as SUPER_ADMIN.

4. Log in as that account. You can now use `POST /api/admin/staff` to
   provision every other privileged account normally, and never need to
   touch SQL directly again.

## Why this isn't a script

A script that ships in version control and can mint a SUPER_ADMIN is
itself a privilege-escalation surface if it's ever runnable against a
live database by the wrong person (a compromised CI credential, a
misconfigured cron job, etc). Keeping this a documented, manual, one-
time DBA action - using credentials that already have full database
access - avoids adding that surface. See SECURITY.md.

# Clinic CRM

Staff app for one multispeciality clinic in India: patient registry, calendar and
front-desk queue, consultation with department panels, prescriptions, labs, GST
billing with manual payments, WhatsApp/SMS reminders and analytics.

Next.js 16 (App Router, server actions) + Supabase (Postgres, Auth, Storage).

## How access works

Every request is checked twice:

1. **In the app.** Pages call `requirePermission()` and server actions call
   `assertPermission()` (`src/lib/auth/session.ts`). The browser never talks to
   Supabase; the Supabase keys are server-only environment variables.
2. **In the database.** Row-level security on every table checks the same
   permission keys (`app.has_permission()`), the clinic, and for restricted
   doctors, whether they have seen the patient. Owners and doctors get no
   permissions until they finish two-step sign-in (`aal2`).

Roles (owner, doctor, nurse, receptionist, billing) map to permissions in
`public.role_permissions`; the owner edits the matrix in Settings → Roles. The key
list lives in `src/lib/auth/permissions.ts` and a test keeps it equal to the
database.

Other rules enforced in Postgres: MRN and invoice numbers from per-clinic
counters; no double booking (exclusion constraints); the appointment status
flow; visits lock when signed or after 24 hours (later changes are addenda);
invoice totals and balances are computed, payments cannot exceed the balance,
refunds cannot exceed what was paid, and payments, refunds, notes and the
audit log cannot be edited or deleted.

## Layout

```
supabase/migrations/   schema, RLS, functions (the single source of truth)
src/lib/database.types.ts  generated from the migrations: npm run gen:types
src/modules/<area>/    server actions, queries, schemas and components per area
src/app/(app)/         staff pages        src/app/(print)/  prescription, invoice, receipt
src/app/api/           document links, CSV export, message job, WhatsApp webhook
tests/db/              RLS and rule tests that sign in as each role (PGlite)
scripts/               gen-types, seed
```

## Run it

1. Create a Supabase project (Pro, region Mumbai `ap-south-1`) and apply the migrations:
   `supabase link --project-ref <ref> && supabase db push` (or paste the files in order into the SQL editor).
2. In Supabase Auth: turn on **TOTP MFA**, turn off public sign-ups, set the Site URL to your
   app URL, and change the **Invite** and **Reset password** email templates to link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
   (use `type=recovery` for the reset template).
3. `cp .env.example .env.local` and fill in the Supabase URL, anon key and service-role key.
4. `npm install && npm run dev`, open http://localhost:3000. The first visit goes to
   `/setup`, which creates the clinic and you as its owner (it works once).
5. Optional demo data for staging: `SEED_PASSWORD=... npm run seed` (with the same env vars).

## Checks

```
npm test              # 80+ tests: RLS per role, billing rules, locking, slots, growth charts…
npm run typecheck
npx eslint .
npm run gen:types -- --check
```

CI runs all of these on every pull request.

## Messaging

`/api/jobs/run` (Vercel Cron every 10 minutes, `Authorization: Bearer $CRON_SECRET`)
queues reminders, follow-ups, vaccination dues, birthdays, recalls and feedback
requests, then sends them. WhatsApp needs approved templates: put each template's
name in Settings → Messages; its variables are filled in the order the
placeholders appear. SMS goes through MSG91 with a DLT template. Without provider
keys, messages are marked *skipped*, never faked. Point the WhatsApp webhook at
`/api/webhooks/whatsapp` for delivery receipts and STOP opt-outs.

## Not in this version

Online payments, the patient mobile app (phase 6; the schema already has
`patients.auth_user_id`), inventory, ABDM/ABHA integration, Sentry, Playwright
end-to-end tests, and the full ICD-10 list (a common starter set is seeded).

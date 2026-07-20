# Household Bills Tracker

A shared-bills tracker for a household: log bills, split them fairly by
per-category ratios that can change over time, track who's paid whom, and
see the full financial picture — trends, benchmarks, and a running
statement — in one place.

Built with Next.js (App Router) + Supabase (Postgres, Auth, Storage) +
Tailwind, deployed on Vercel as an installable PWA. See `roadmap.md` for
the full build history, what's done, and what's next.

## What's in the app

- **Bills** — log one-off bills with a receipt photo, or set up recurring
  templates (rent, subscriptions) that generate themselves monthly. Photo
  receipts can auto-fill amount/payee/date via OCR (Claude via the Vercel
  AI Gateway).
- **Fair splitting** — a date-slicing algorithm applies whatever ratio was
  actually in effect for each part of a bill's period, so a mid-period
  ratio change or membership change splits correctly without manual
  re-entry.
- **Dashboard** — what's owed to external creditors, what's owed between
  household members (with quick links into a pre-scoped Settle Up), and
  what needs attention (missing ratios, unlogged recurring bills, bills
  missing a receipt).
- **Settle Up** — pick specific categories or bulk-settle everything
  between two members, with optional proof-of-payment attachment.
- **Ledger** — every bill and every settlement in one chronological,
  month-grouped statement.
- **Analytics** — spend trends by category with spike callouts, a running
  balance-over-time chart, and a spend-vs-UK-average comparison.
- **Household** — manage members' joined/left dates and category ratios;
  each member has a profile page with their balance, ratios, and recent
  activity. New members join via a self-serve invite link (no manual SQL).
- **PWA** — installable, with an offline-viewing service worker for the
  dashboard and bill list.

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (pick a region
   close to you).
2. **Authentication → Providers** — confirm **Email** is enabled (magic
   links, no password required to start).
3. **Authentication → URL Configuration** — set **Site URL** to your
   deployed app's URL (or `http://localhost:3000` while only running
   locally), and add it to the **Redirect URLs** allow list along with any
   other origins you'll sign in from (e.g. `https://your-app.vercel.app/**`,
   `http://localhost:3000/**`). If this is misconfigured, magic links
   silently redirect to whatever Site URL is set instead of where the app
   actually asked — this has bitten this project before.
4. **SQL Editor → New query** — run each file below in this order (each
   file's own header comment explains what it does and what it depends
   on):

   ```
   supabase-schema.sql
   supabase-storage.sql
   supabase-recurring.sql
   supabase-splits.sql
   supabase-delete-bills.sql
   supabase-balances.sql
   supabase-settlements.sql
   supabase-balances-fix.sql
   supabase-ratio-integrity.sql
   supabase-activity.sql
   supabase-flags.sql
   supabase-invites.sql
   supabase-ledger.sql
   supabase-split-durability-fix.sql
   supabase-analytics.sql
   supabase-mark-unpaid.sql
   ```

   (`scripts/run-sql.mjs <file>` applies a file via the Supabase
   Management API instead, if you'd rather not paste into the SQL Editor —
   it needs `SUPABASE_ACCESS_TOKEN` set, see below.)

5. **Project Settings → API** — note the **Project URL** and **anon
   public** key for the next step.

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Required | Where it's used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | The app (client + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The app (client + server) |
| `AI_GATEWAY_API_KEY` | Only for OCR receipt extraction, locally | `app/api/extract-receipt` — not needed in production on Vercel, which authenticates to the Gateway via OIDC automatically |
| `SUPABASE_ACCESS_TOKEN` | Only for maintenance scripts | `scripts/run-sql.mjs` (Supabase Management API token, from your Supabase account settings) |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for maintenance scripts | `scripts/delete-storage-object.mjs`, and anything else needing to bypass RLS directly (Project Settings → API) |

### 3. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` — you'll be redirected to `/login`. Sign in
with a magic link (or switch to password sign-up).

### 4. Create your household

There's still one manual step for the very first member and household —
after that, every other member joins via the in-app invite flow, not SQL.

In Supabase's SQL Editor:

```sql
insert into households (name) values ('Our Household') returning id;
-- copy the returned id, then, using the user id from Authentication → Users
-- for the account you just signed in with:
insert into household_members (household_id, user_id, name, joined_date)
values ('<household-id-from-above>', '<your-user-id>', 'You', current_date);
```

Then, from `/household` in the app: **+ Add a member** to create an
unlinked placeholder for each additional household member, and **Generate
invite link** to send them a join link — no further SQL required.

### 5. Deploy to Vercel

1. Push to GitHub, then **Add New → Project** on [vercel.com](https://vercel.com),
   pointing at the repo.
2. Add the environment variables from step 2 that apply in production
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` at minimum).
3. Deploy. Go back to Supabase's **Authentication → URL Configuration**
   and make sure the deployed URL is in the Site URL / redirect allow list
   (step 1.3 above) — easy to miss, and the app will otherwise look broken
   only for magic links, not for anything else.
4. For OCR receipt extraction, make sure your Vercel team has a payment
   method on file under **AI Gateway** — the Gateway blocks all requests
   without one, independent of any usage budget you've set.

From here, every `git push` to `main` auto-deploys.

## What's next

See `roadmap.md` for the full history and current status.

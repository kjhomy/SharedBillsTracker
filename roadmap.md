# Roadmap — Household Bills Tracker

**Stack:** Next.js (PWA) + Vercel + Supabase (Postgres + Auth)
**Reference:** see `household-bills-tracker-spec.md` for the full data model and rationale behind each decision below.

---

## ✅ Done

- [x] Data model spec locked (core/household layered architecture, so this can fork into a personal finance tracker later)
- [x] Wireframes for the 5 core screens (Dashboard, Add Bill, Bill Detail, Members & Ratios, Settlements)
- [x] Supabase project created, full schema applied (`supabase-schema.sql`) — all 9 tables + RLS policies
- [x] Next.js project scaffolded, deployed structure ready for Vercel
- [x] Auth working end-to-end: magic link sign-in, session middleware, protected home route
- [x] Fixed Next.js 16 async `cookies()` breaking change in the Supabase server client
- [x] Household + both members created manually in Supabase

---

## Phase 1 — Core bill logging

Goal: you can log a real bill and see it stored, no splitting logic yet.

- [x] Build **Add Bill** form as a real page (`/bills/new`) — category, payee, amount, period dates, due date — writing to the `transactions` table
- [x] Build **category picker** pulling from the seeded `categories` table rather than a hardcoded list
- [x] Wire up **attachment upload** — Supabase Storage bucket for receipts/screenshots, linked via `attachments.transaction_id`
- [x] Build a simple **bill list page** (no dashboard yet) just to confirm bills are saving and readable

**Definition of done:** you can add a bill with a receipt photo on your phone and see it appear in a list. ✅ Click-tested — added a real bill with a photo and it worked end to end.
- [x] PDF receipts — turned out to already work (file input accepts PDFs, storage bucket has no mime restriction, receipt link opens PDFs fine in browser); no build needed
- [x] **Delete bill** — added `supabase-delete-bills.sql` (missing RLS delete policies on `transactions`, `attachments`, and the `receipts` storage bucket — none existed before) and applied it directly to the project via the Supabase Management API, plus a delete button on the bill list that removes the receipt file then the transaction row. ✅ Click-tested — deleted a bill through the running app (real RLS-authenticated path, not just the admin bypass used to apply the migration), confirmed in the DB that the transaction, attachment, and storage file were all removed cleanly

---

## Added outside the original phases — Recurring bills

Not originally planned as its own item (Phase 4 assumed recurring-bill detection existed
without specifying how). Added because manually re-entering a fixed bill like rent every
month isn't realistic.

- [x] `recurring_bills` table — fixed-amount templates only (due day of month, perpetual or end-dated), `supabase-recurring.sql`
- [x] Daily-scheduled Postgres function (`pg_cron`) generates the month's `transactions` row when a template's clamped due day matches today
- [x] `/bills/recurring` list + `/bills/recurring/new` form (category, payee, amount, due day, perpetual checkbox)

**Deliberately out of scope:** variable-amount bills (energy, water) — those still get logged manually via Add Bill, since auto-generating with a guessed amount would be actively wrong.

**One-time manual step:** run `supabase-recurring.sql` in the Supabase SQL Editor.

---

## Phase 2 — Split calculation (the tricky part)

Goal: every bill automatically calculates who owes what, based on membership + ratios at the time.

- [x] Implement the **date-slicing split algorithm** — `supabase-splits.sql`, three Postgres functions (`compute_split`, `save_transaction_split`, `recompute_household_splits`), applied directly via the Supabase Management API. Slices a bill's period wherever membership or a category ratio changes, applies the ratio in effect per slice, sums per member with largest-remainder penny-rounding so shares always sum exactly to the bill amount
- [x] Written as Postgres functions (not an Edge Function or server action) — matches the existing `supabase-recurring.sql` precedent, callable via `supabase.rpc()`, keeps the app at zero server actions
- [x] `save_transaction_split` / `recompute_household_splits` populate `transaction_splits` automatically, re-runnable idempotently (verified: repeated calls don't duplicate rows)
- [x] Handle the **0%-until-configured** fallback — an active member with no ratio row is treated as 0% for that slice, not redistributed to others; the resulting gap (split sum < bill amount) is left visible for Phase 4's flags to surface later, not silently patched now
- [x] **Household members** page (`/household`) — edit joined/left dates per member, saving triggers `recompute_household_splits` automatically. Ratio editor (per-category, with effective-date history) still to build.
- [x] Wired into the **Add Bill** form: period is now required, a debounced live preview calls `compute_split` via RPC as soon as category/amount/period are filled in (with a warning if shares don't sum to the full amount), and `save_transaction_split` runs via RPC right after the transaction/attachment save. ✅ Click-tested — form saves correctly and preview renders (showing £0.00/0% as expected, since no ratios are configured yet)
- [x] Built the **ratio editor** half of Members & Ratios (`app/household/edit-ratios-form.js`) — one card per expense category, percentage input per member, editable "effective from" date (defaults to today, backdatable), running total flagged if it's not 100%. Same-day edits update the ratio in place; a different date closes out the old version and creates a new one, preserving history; either way triggers `recompute_household_splits`. Smart auto-fill: once exactly one member's field is left untouched, it auto-fills with whatever's needed to reach 100% and keeps recalculating until directly edited. ✅ Click-tested and confirmed working, including a fix for a bug where changing only the effective-from date (same percentage) didn't enable Save — that now correctly updates the existing ratio's start date in place rather than being a no-op

**Definition of done:** adding a bill shows a correct live split preview, and changing a ratio or member's dates recalculates historical splits correctly. ✅ All click-tested and confirmed working end to end — Phase 2 complete.

**Verified during testing:** the algorithm correctly produces intentional gaps (not fabricated splits) when a bill's period predates a member's `joined_date` — this surfaced that the 8 existing "Joseph Adeyemi" £2000/month rent bills (Nov 2025–Jul 2026) all predated both members' recorded join dates. Fixed via the Household members page — join dates corrected, `recompute_household_splits` ran automatically, all 8 rent bills now have real splits.

---

## Phase 3 — Dashboard, balances, settlements

Goal: the app answers "who owes who, and for what" at a glance.

- [x] Added **`paid_by_member_id`** to `transactions` — the schema had no way to record who actually fronted the money for a bill, which blocked balance calculation entirely (`transaction_splits` only ever recorded fair *shares*, not who was owed)
- [x] **Balance engine** (`supabase-balances.sql`) — `household_balances(household_id)` returns itemized pairwise-per-category unsettled amounts (nets out anything already paid back via `settlement_allocations`); `net_balances(household_id)` sums each member's overall position
- [x] **Debt simplification** (`lib/debtSimplification.js`) — plain client-side JS (greedy array matching over `net_balances` output), not a Postgres function, since it's pure post-processing with no RLS/data-access concerns of its own. Built generally even though it's trivial at 2 people, per the original plan
- [x] Build **Dashboard** (`app/page.js`, replacing the old placeholder home page) — "Owed to creditors" (external debt, aggregated by category + payee — e.g. "Rent — Joseph Adeyemi: £16,000"), "Between household members" (simplified net + per-category detail), itemized unpaid-bills detail list, and a "Recent activity" placeholder pending Settle Up
- [x] Build **Settle Up** screen (`/settle`) — itemized checklist per debtor/creditor pair, select whole categories or bulk-select everything, writes via `record_settlement` RPC to `settlements` + `settlement_allocations` (`supabase-settlements.sql`, applied to the live project). ✅ Click-tested in the running app
- [x] Attachment support on settlements (payment screenshots), reusing the same Storage bucket/table as bill receipts — optional file input on the Settle Up form, uploads to the existing `receipts` bucket at `<household_id>/<settlement_id>/<filename>` and links via `attachments.settlement_id` (no new SQL needed, the schema/RLS already supported it). Also added a "Recent settlements" list on `/settle` (previously no way to see settlement history at all) with a signed "Proof" link when attached. ✅ Click-tested
- [ ] Generate **activity feed entries** from Settlement + SettlementAllocation data (per-category text vs bulk text) — the "earlier decision" the roadmap referenced lived in the spec doc, which doesn't actually exist in this repo (confirmed missing). Proposed default: single-category settlement reads "X settled [Category] with Y — £N"; multi-category reads "X settled up with Y — £N across N categories"

**Course correction (caught by you, not by testing):** the first version of this defaulted `paid_by_member_id` to whoever logged the bill (`created_by`) and backfilled all 8 historical rent bills that way — wrongly assuming "logged it" means "paid it out of pocket." You corrected the model: logging a bill only records an obligation to an *external* creditor; it creates **no debt between household members** until a payment is explicitly recorded. Fixed via `supabase-balances-fix.sql` — cleared the incorrect backfill, added `paid_status = 'paid'` to `household_balances`'s filter, reverted the recurring-bill generator to not assume a payer (and dropped `paid_by_member_id` from `recurring_bills` entirely, since a template-level default would reintroduce the same mistake) — and added the actual explicit mechanism: a "Mark as paid by…" control on the bill list (`app/bills/mark-paid-control.js`) that's now the *only* path that can ever set a payer. Also fixed a grammar bug you caught after: "You owes Kofi" — the debtor/creditor sentence now conjugates "owe" vs "owes" based on whether the debtor is the signed-in user.

**Bug found and fixed during this work (unrelated to the above, caught while pulling real ratio data for balance testing):** the ratio editor's "effective from" date always defaulted to today instead of the existing ratio's start date, so opening an already-configured category and clicking Save (without touching anything) would silently shift that ratio's start date to today. This had already corrupted one real row (Council Tax, `effective_to` ended up before `effective_from`). Fixed the default in `edit-ratios-form.js`, deleted the corrupted row, and added a `category_ratios_effective_range_valid` check constraint (`supabase-ratio-integrity.sql`) so this class of bug can't silently corrupt data again — it'll error loudly instead.

**Definition of done:** the dashboard replaces your Excel tracker for day-to-day use — you can see, log, and settle balances without leaving the app. *(Owed-to-creditors, between-member balances, Settle Up, and settlement attachments are all live and click-tested; the activity feed is still to build.)*

---

## Phase 4 — Missing-data flags & polish

Goal: the app tells you when something needs attention instead of silently guessing.

- [ ] Computed (not stored) flags: member with no ratio set for an active category, recurring bill not yet logged this period, bill missing an attachment
- [ ] Surface flags consistently across Dashboard, Bill Detail, and Ratios screens (shared query, not duplicated logic)
- [ ] General UI polish pass against the wireframe (spacing, empty states, loading states)

**Definition of done:** nothing is silently wrong — if a split is 0% because a ratio's missing, you see it before it causes a dispute.

---

## Phase 5 — PWA

Goal: installable, app-like, works offline for viewing.

- [ ] Add proper app icons + complete `manifest.json` (currently a skeleton)
- [ ] Add service worker for offline caching of dashboard/bill list views (viewing only — no offline write-queueing, per earlier decision)
- [ ] Test "Add to Home Screen" flow on your phone

**Definition of done:** the app installs on your phone's home screen and looks/feels native.

---

## Phase 6 — Self-invite & access lifecycle

Goal: a new member can join without you manually touching Supabase.

- [ ] Build invite link/code generation, tied to `household_id`
- [ ] Build sign-up flow that links a new Supabase auth user to an existing (or new) `household_members` row
- [ ] Build "remove member" flow: sets `left_date` + flips `auth_active` to false, revoking login without deleting historical data

**Definition of done:** Kofi (or a future flatmate) can join by clicking a link, no manual SQL required.

---

## Later / not scheduled yet

These were flagged during spec but deliberately deferred — revisit once the above is solid:

- **Full ledger/statement view** (Option C) — upgrade from settlement-only balances to a full transaction-by-transaction statement feed
- **OCR/auto-extract** from bill and receipt photos into pre-filled Add Bill fields
- **Analytics** — spend spikes (e.g. energy usage jump), balance build-up trends between members, UK average benchmark comparison (needs new `BenchmarkRate` table)
- **Personal finance fork** — reuse the Core layer (Transaction, Category, Attachment) standalone, without household tables, once the core app is proven

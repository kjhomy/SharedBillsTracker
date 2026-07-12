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

## Phase 1 — Core bill logging (next up)

Goal: you can log a real bill and see it stored, no splitting logic yet.

- [x] Build **Add Bill** form as a real page (`/bills/new`) — category, payee, amount, period dates, due date — writing to the `transactions` table
- [x] Build **category picker** pulling from the seeded `categories` table rather than a hardcoded list
- [x] Wire up **attachment upload** — Supabase Storage bucket for receipts/screenshots, linked via `attachments.transaction_id`
- [x] Build a simple **bill list page** (no dashboard yet) just to confirm bills are saving and readable

**One-time manual step before this works:** run `supabase-storage.sql` in the Supabase SQL Editor (same way `supabase-schema.sql` was run) — it creates the private `receipts` bucket and its RLS policies. Confirmed via the API that this bucket doesn't exist yet in your project.

**Definition of done:** you can add a bill with a receipt photo on your phone and see it appear in a list. *(Code is in place and builds cleanly; not yet click-tested in a browser — do that after running the storage SQL.)*

---

## Phase 2 — Split calculation (the tricky part)

Goal: every bill automatically calculates who owes what, based on membership + ratios at the time.

- [ ] Implement the **date-slicing split algorithm** from the spec: slice bill period wherever membership or ratio changes, apply ratios per slice, sum per member
- [ ] Write this as a Supabase Edge Function or a Next.js server action — triggered on bill creation/edit
- [ ] Populate `transaction_splits` automatically from this calculation
- [ ] Build **Members & Ratios** screen — add/edit members (joined/left dates), configure per-category ratios with effective-date history
- [ ] Handle the **0%-until-configured** fallback and surface it as a warning (ties into Phase 4 flags)

**Definition of done:** adding a bill shows a correct live split preview, and changing a ratio or member's dates recalculates historical splits correctly.

---

## Phase 3 — Dashboard, balances, settlements

Goal: the app answers "who owes who, and for what" at a glance.

- [ ] Build **Dashboard** — itemized pairwise balance breakdown (per category, not just one number), external unpaid-bills list, activity feed
- [ ] Implement **debt simplification** for 3+ members (net each person's position, greedily match creditors to debtors) — trivial at 2 people, needed once extensible
- [ ] Build **Settle Up** screen — itemized checklist to settle per-category or in bulk, writing to `settlements` + `settlement_allocations`
- [ ] Attachment support on settlements (payment screenshots), reusing the same Storage bucket/table as bill receipts
- [ ] Generate **activity feed entries** from Settlement + SettlementAllocation data (per-category text vs bulk text, per earlier decision)

**Definition of done:** the dashboard replaces your Excel tracker for day-to-day use — you can see, log, and settle balances without leaving the app.

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

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
- [x] Generate **activity feed entries** from Settlement + SettlementAllocation data (per-category text vs bulk text) — the "earlier decision" the roadmap referenced lived in the spec doc, which doesn't actually exist in this repo (confirmed missing). Used the proposed default: single-category settlement reads "X settled [Category] with Y — £N"; multi-category reads "X settled up with Y — £N across N categories". Built as `settlement_activity(household_id)` (`supabase-activity.sql`, applied to the live project), one row per settlement with the distinct category count (+ category name when exactly one), wired into the Dashboard's "Recent activity" section (was a static placeholder before). ✅ Click-tested — real settlements from earlier testing render correctly (e.g. "...settled Rent with... — £1,000.00")

**Course correction (caught by you, not by testing):** the first version of this defaulted `paid_by_member_id` to whoever logged the bill (`created_by`) and backfilled all 8 historical rent bills that way — wrongly assuming "logged it" means "paid it out of pocket." You corrected the model: logging a bill only records an obligation to an *external* creditor; it creates **no debt between household members** until a payment is explicitly recorded. Fixed via `supabase-balances-fix.sql` — cleared the incorrect backfill, added `paid_status = 'paid'` to `household_balances`'s filter, reverted the recurring-bill generator to not assume a payer (and dropped `paid_by_member_id` from `recurring_bills` entirely, since a template-level default would reintroduce the same mistake) — and added the actual explicit mechanism: a "Mark as paid by…" control on the bill list (`app/bills/mark-paid-control.js`) that's now the *only* path that can ever set a payer. Also fixed a grammar bug you caught after: "You owes Kofi" — the debtor/creditor sentence now conjugates "owe" vs "owes" based on whether the debtor is the signed-in user.

**Bug found and fixed during this work (unrelated to the above, caught while pulling real ratio data for balance testing):** the ratio editor's "effective from" date always defaulted to today instead of the existing ratio's start date, so opening an already-configured category and clicking Save (without touching anything) would silently shift that ratio's start date to today. This had already corrupted one real row (Council Tax, `effective_to` ended up before `effective_from`). Fixed the default in `edit-ratios-form.js`, deleted the corrupted row, and added a `category_ratios_effective_range_valid` check constraint (`supabase-ratio-integrity.sql`) so this class of bug can't silently corrupt data again — it'll error loudly instead.

**Definition of done:** the dashboard replaces your Excel tracker for day-to-day use — you can see, log, and settle balances without leaving the app. ✅ All click-tested and confirmed working end to end — Phase 3 complete.

---

## Phase 4 — Missing-data flags & polish

Goal: the app tells you when something needs attention instead of silently guessing.

- [x] Computed (not stored) flags: member with no ratio set for an active category, recurring bill not yet logged this period, bill missing an attachment — `household_flags()` RPC (`supabase-flags.sql`)
- [x] Surface flags consistently across Dashboard, Bill Detail, and Ratios screens (shared query, not duplicated logic) — every screen calls the same `household_flags` RPC and filters client-side by `flag_type`
- [x] General UI polish pass against the wireframe (spacing, empty states, loading states) — full responsive redesign, not just a polish pass. Built a shared design system (`tailwind.config.js` pastel accent palette + shadow tokens, `app/globals.css` `@layer components` for `.card`/`.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.input-field`/`.pill`, `lib/style.js` for deterministic category color+emoji and member-initial avatars via `app/avatar.js`). Every page moved off the single `max-w-md` mobile-only column onto responsive breakpoints (card grids on Bills/Recurring, two-column layouts on Dashboard/Household/Settle). `NavHeader` rebuilt with inline nav links + active-route highlighting on desktop, hamburger retained for mobile. Verified by injecting a real Supabase session's SSR cookie (built via `@supabase/ssr`'s own `createServerClient`, not hand-guessed) into a headless-Chromium session and screenshotting every authenticated page at mobile/tablet/desktop widths against live household data — confirmed layouts, colors, and data all render correctly, no console errors.

**Definition of done:** nothing is silently wrong — if a split is 0% because a ratio's missing, you see it before it causes a dispute. ✅ All three items done — Phase 4 complete.

---

## Phase 5 — PWA

Goal: installable, app-like, works offline for viewing.

- [x] Add proper app icons + complete `manifest.json` (currently a skeleton) — vector icon source (`scripts/icon-source.svg` / `icon-source-maskable.svg`) rasterized via `sharp` (`scripts/generate-icons.mjs`) into Next's `icon.png`/`apple-icon.png` convention plus 192/512/maskable-512 for `manifest.json`. Also added `appleWebApp` metadata (standalone title, status bar style) for a proper iOS install.
- [x] Add service worker for offline caching of dashboard/bill list views (viewing only — no offline write-queueing, per earlier decision) — hand-written `public/sw.js` (no `next-pwa` dependency): network-first-with-cache-fallback for page navigations, cache-first for hashed `_next/static` assets, same-origin GET only so Supabase calls and mutations are never touched. Registered in production only via `app/register-sw.js`.
- [x] Test "Add to Home Screen" flow on your phone — confirmed working

**Bug found and fixed during this work:** the auth middleware's matcher predated Next's `icon.png`/`apple-icon.png` file convention (it only excluded the old `favicon.ico`) and didn't know about `sw.js` at all — both were being redirected to `/login` for signed-out requests. A redirected-to-HTML response would have made the browser reject the service worker registration outright and broken the installed icon. Fixed the matcher regex in `middleware.js`; verified via a local production build that `/sw.js`, `/icon.png`, `/apple-icon.png`, and `/manifest.json` all now return 200 with correct content types, and that the rendered `<head>` includes the manifest link, favicon, apple-touch-icon, and Apple PWA meta tags.

**Definition of done:** the app installs on your phone's home screen and looks/feels native. ✅ Confirmed on-device — Phase 5 complete.

---

## Phase 6 — Self-invite & access lifecycle

Goal: a new member can join without you manually touching Supabase.

- [x] Build invite link/code generation, tied to `household_id` — `household_invites` table (`supabase-invites.sql`, applied to the live project): token, household_id, member_id, expiry (7 days), redeemed_at. RLS insert policy only allows creating an invite for a member row that's still unlinked (`user_id is null`), so an invite can never be used to hijack an already-active member. Added a name-only **add member** form (`app/household/add-member-form.js`) so a brand-new flatmate (not just Kofi's pre-existing placeholder) can get an unlinked row without manual SQL, plus a **generate invite link** action per unlinked member (`app/household/invite-member-button.js`) on `/household`.
- [x] Build sign-up flow that links a new Supabase auth user to an existing (or new) `household_members` row — public `/join/[token]` landing page (excluded from the auth middleware) previews the invite via a `get_invite_preview` RPC (anon-callable, read-only), then reuses the existing magic-link/password sign-up UI with `emailRedirectTo` carrying the token through to `/auth/callback`. The callback route now calls `accept_invite(token)` — a `security definer` RPC, required because at the moment it runs the caller isn't a household member yet, so the normal RLS policies would otherwise block it — which links `auth.uid()` to the invite's member row and marks the invite redeemed. Race-safe: the link only succeeds if the member row's `user_id` is still null at update time, so an invite can only ever be claimed once.
- [x] Build "remove member" flow: sets `left_date` + flips `auth_active` to false, revoking login without deleting historical data — wired into the existing "Has left the household" checkbox on `/household` (`edit-members-form.js`); saving now also sets `auth_active = !hasLeft`, and unchecking it (rejoining) restores access. No new UI needed, since the checkbox already existed for split-calculation purposes.

**Verified:** local production build compiles cleanly with the new `/join/[token]` route; confirmed `/join/<bogus-token>` returns 200 (not redirected to `/login` — the middleware exclusion works) and correctly renders "Invite not valid"; confirmed a real invite renders the correct household/member name preview; confirmed `accept_invite` rejects unauthenticated calls (`not_authenticated` guard fires correctly). Test fixtures (throwaway member + invite row) created and cleaned up directly in Supabase — not left in the live household.

**Still needs a live test (can't be done headlessly):** actually clicking a generated invite link, completing sign-up via a real email inbox, and confirming the invitee lands on the dashboard with correct access — the magic-link email round trip needs a real inbox, same as the Phase 5 on-device install check.

**Definition of done:** Kofi (or a future flatmate) can join by clicking a link, no manual SQL required. Code side is done and verified as far as possible without a live email round trip.

---

## Full ledger/statement view

Goal: a bank-statement-style, transaction-by-transaction feed — every bill logged and every settlement made, chronologically — instead of only current-snapshot balances.

- [x] `household_ledger()` RPC (`supabase-ledger.sql`, applied to the live project) — unions every `transaction` and every `settlement` into one feed (`entry_type` discriminator), each bill row carrying its per-member split breakdown as a `jsonb` array. Not `security definer`, same as `settlement_activity()`/`household_balances()` — relies on the underlying tables' own RLS, so a household_id the caller isn't a member of just yields nothing.
- [x] New `/ledger` page — month-grouped chronological feed, bill entries (category icon, split-by-member line, paid status) and settlement entries (avatar pair, category text, mint-tinted card) visually distinct. Linked from the nav bar and from the Dashboard's "Recent activity" section.

**Bug found and fixed while building this (unrelated to the ledger itself, but it directly corrupted the data the ledger surfaces):** `save_transaction_split()` recalculated a bill's split by deleting all its `transaction_splits` rows and reinserting fresh ones, every time `recompute_household_splits()` ran (which fires automatically on any joined/left-date or ratio edit). `settlement_allocations` references `transaction_splits` `ON DELETE CASCADE`, so any settlement that had already paid off a split silently lost its link and got cascade-deleted the moment a later edit regenerated that split row — even though the `settlements` record itself survived. `household_balances()`/`unsettled_splits()` then treated the (identical-looking, new-id) split as never having been paid, so an already-settled debt would quietly reappear as outstanding. This had already happened for real: two genuine settlements (£37.50 Energy, £1,000 Rent, both "You" paying Kofi back) had lost their allocation rows, and the Dashboard was overstating "You owe Kofi" by £1,037.50 as a result. Fixed via `supabase-split-durability-fix.sql` — `save_transaction_split()` now upserts by `(transaction_id, member_id)` (new unique constraint) instead of delete-and-reinsert, so a split's row identity survives a recompute when a member's share is merely recalculated rather than removed outright; only genuinely-dropped members (e.g. left before the bill's period) still cascade, which is correct there. Also repaired the two already-broken settlements by re-linking them to their current split rows (identified unambiguously: paid bill + matching amount + matching debtor/creditor pair). Verified: `net_balances()` now returns £0 for both members, and both settlements now show correctly in Recent Activity and the Ledger.

**Definition of done:** you can see, for any point in time, exactly what was logged and what was paid, without the dashboard's current-balance math ever silently drifting from reality again. ✅ Done and verified against live data.

---

## OCR/auto-extract from bill and receipt photos

Goal: a receipt photo pre-fills the Add Bill form instead of typing everything by hand. The schema already had `extracted_amount`/`extracted_date`/`extracted_payee` columns on `attachments` sitting unused since Phase 1 — this is what they were for.

- [x] `POST /api/extract-receipt` route — authenticated-only (rejects signed-out requests before spending anything), takes the image via `FormData`, calls `claude-haiku-4.5` through the Vercel AI Gateway (`generateText` with `Output.object()` and a Zod schema for `{ amount, payee, date }`, all nullable — the model is instructed to return null rather than guess). PDFs are rejected client- and server-side (extraction is images-only; PDFs still work as plain attachments, unchanged).
- [x] Wired into `AddBillForm` (`app/bills/new/add-bill-form.js`) — an "✨ Fill in details from this photo" button appears once an image is selected, only fills fields that are still empty (never clobbers something the user already typed), and everything stays editable before saving. The raw extraction is persisted onto the `attachments` row's `extracted_*` columns on save, regardless of what the user ends up entering, giving an audit trail of what the model actually read vs. what was confirmed.
- [x] Model access set up: installed the `ai` SDK, confirmed against its bundled docs (not memory) that this version's structured-output API is `generateText({ output: Output.object() })`, not the deprecated `generateObject`. Created a dedicated AI Gateway API key via `vercel ai-gateway api-keys create` (`$5/month` budget cap) for local testing, since the project had none configured; production deploys authenticate to the Gateway automatically via OIDC with no key needed.

**Blocked on your end, not code:** live end-to-end testing (synthetic receipt image → real API call) hit `AI Gateway requires a valid credit card on file to service requests` — an account-level billing gate, separate from the budget cap, that only you can clear (`vercel.com` → your team → AI Gateway → add a card). The route correctly reached the Gateway and got a real structured error back, so the wiring itself is confirmed correct up to that point — the actual vision extraction quality is unverified until a card's on file.

**Definition of done:** you can photograph a bill and have amount/payee/due-date show up pre-filled, review, and save. Code complete; needs a card on the Vercel account before it can run for real.

---

## Analytics

Goal: spend spikes, a balance build-up trend between members, and a UK-average benchmark comparison — turning the raw ledger data into charts instead of just lists.

- [x] `supabase-analytics.sql` (applied to the live project): `benchmark_rates` table (illustrative placeholder UK averages for Energy/Water/Council Tax/Internet — explicitly not live data, with an in-app editor to correct them; Rent deliberately not seeded, varies too much by region/size to have one meaningful "UK average"), `category_spend_by_month()` RPC, `balance_trend()` RPC (raw signed events — paid bill splits `+`, settlements `-` — client canonicalizes into one running line for "what you owe the household," since that's simpler to get right in JS than in one aggregate query).
- [x] Chart palette: the app's existing accent colors (used for category icon backgrounds) failed the dataviz skill's colorblind-safety validator when tried as chart series colors — too low chroma, they're background tints, not data-ink. Used the skill's separately-validated default 8-hue categorical palette instead (re-validated against this app's actual white card surface), kept as `lib/chartPalette.js`, with a fixed alphabetical-by-category slot assignment (never cycled) and an "Other" fold past 8 series.
- [x] Two hand-rolled SVG chart components (no new charting library): `LineChart` (multi-series band mode for the spend trend, single-series time mode with zero-baseline + area wash for the balance trend — crosshair-driven tooltip, direct end-label, table-view toggle) and `BenchmarkChart` (horizontal diverging bar per category, blue = below benchmark / red = above, per-bar hover detail, direct value labels so nothing is hover-only).
- [x] `/analytics` page — spend-spike callouts (≥25% month-over-month increase per category), the three chart sections, and an inline benchmark editor. Linked from the nav bar.

**Verified in a real browser** against live household data (session-cookie injection + headless Chromium, same technique as the responsive redesign): confirmed the crosshair/tooltip interaction, the table-view accessibility toggle, and responsive layout at mobile and desktop widths, with no console errors. One real bug caught and fixed along the way: the server page was passing a function (`formatAmount`) as a prop into the `'use client'` chart component, which Next.js correctly rejects (functions can't cross the server/client boundary) — fixed by defining the formatter inside the client component instead.

**Definition of done:** you can see spend spikes, whether the balance between you and Kofi is trending up or down, and whether you're paying more or less than a typical UK household per category. ✅ Done and verified.

---

## Out of scope

- **Personal finance fork** (reusing the Core layer standalone, without household tables) — decided against; this app is staying household-focused.

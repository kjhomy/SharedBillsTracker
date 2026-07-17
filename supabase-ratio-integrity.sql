-- Household Bills Tracker — category_ratios integrity fix
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- A bug in the ratio editor's date-default logic (effectiveFrom always
-- defaulting to today, even when a card had existing history) let a save
-- move an already-open row's effective_from forward without touching its
-- effective_to, producing an impossible range (effective_to before
-- effective_from). Fixed client-side in edit-ratios-form.js; this cleans
-- up the one corrupted row it produced and adds a check constraint so no
-- future bug can write that shape of row again.

delete from category_ratios
where effective_to is not null and effective_to < effective_from;

alter table category_ratios
  add constraint category_ratios_effective_range_valid
  check (effective_to is null or effective_to >= effective_from);

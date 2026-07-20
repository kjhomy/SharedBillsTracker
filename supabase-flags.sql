-- Household Bills Tracker — Missing-data flags (Phase 4)
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs. Must run after supabase-recurring.sql
-- (uses clamped_due_date_for_month).
--
-- household_flags() is the single source of truth for "what counts as
-- something needing attention" — computed fresh every call, nothing
-- stored. Every screen that surfaces a flag (Dashboard, Bills list,
-- Recurring bills list, Ratios editor) calls this same function and
-- filters/matches client-side by flag_type + the relevant id column,
-- so the definition of each gap only ever lives here.
--
-- Three flag types:
--   missing_ratio       — an active member with no category_ratios row
--                         covering today, for an expense category.
--                         (member_id, category_id set; transaction_id,
--                         recurring_bill_id null)
--   unlogged_recurring  — an active recurring bill whose clamped due
--                         date for the current month has passed, but no
--                         transaction was generated for it. Normally the
--                         daily generator prevents this; this flag is a
--                         safety net for a missed cron run or a deleted row.
--                         (recurring_bill_id set; others null)
--   missing_attachment  — a paid bill with no attachments row. Unpaid
--                         bills are excluded — a receipt only exists
--                         once someone's actually paid, so flagging it
--                         before then would be flagging something that
--                         can't be true yet.
--                         (transaction_id set; others null)

create or replace function household_flags(p_household_id uuid)
returns table(
  flag_type text,
  message text,
  member_id uuid,
  category_id uuid,
  transaction_id uuid,
  recurring_bill_id uuid
)
language sql
stable
as $$
  select
    'missing_ratio'::text as flag_type,
    hm.name || ' has no ratio set for ' || c.name as message,
    hm.id as member_id,
    c.id as category_id,
    null::uuid as transaction_id,
    null::uuid as recurring_bill_id
  from household_members hm
  cross join categories c
  where hm.household_id = p_household_id
    and (hm.left_date is null or hm.left_date >= current_date)
    and c.type = 'expense'
    and not exists (
      select 1 from category_ratios cr
      where cr.household_id = p_household_id
        and cr.member_id = hm.id
        and cr.category_id = c.id
        and cr.effective_from <= current_date
        and (cr.effective_to is null or cr.effective_to >= current_date)
    )

  union all

  select
    'unlogged_recurring'::text,
    coalesce(rb.payee, c.name) || ' — not yet logged for ' || to_char(current_date, 'Mon YYYY'),
    null::uuid,
    null::uuid,
    null::uuid,
    rb.id
  from recurring_bills rb
  join categories c on c.id = rb.category_id
  where rb.household_id = p_household_id
    and rb.active = true
    and rb.start_date <= current_date
    and (rb.end_date is null or rb.end_date >= current_date)
    and clamped_due_date_for_month(rb.due_day_of_month, date_trunc('month', current_date)::date) <= current_date
    and not exists (
      select 1 from transactions t
      where t.recurring_bill_id = rb.id
        and t.period_start = date_trunc('month', current_date)::date
    )

  union all

  select
    'missing_attachment'::text,
    coalesce(t.payee, c.name, 'Uncategorised') || ' — no receipt attached',
    null::uuid,
    null::uuid,
    t.id,
    null::uuid
  from transactions t
  left join categories c on c.id = t.category_id
  where t.household_id = p_household_id
    and t.paid_status = 'paid'
    and not exists (select 1 from attachments a where a.transaction_id = t.id)
$$;

revoke all on function household_flags(uuid) from public;
grant execute on function household_flags(uuid) to authenticated;

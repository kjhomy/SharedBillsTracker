-- Household Bills Tracker — Payer tracking + balance engine (Phase 3)
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- Adds paid_by_member_id — the piece the schema was missing to answer
-- "who owes who": transaction_splits already recorded each member's fair
-- share of a bill, but nothing recorded who actually fronted the money
-- for it. Nullable at the DB level (same approach as period_start/end in
-- Phase 1/2) — required going forward via the Add Bill form, not a DB
-- constraint.

alter table transactions
  add column if not exists paid_by_member_id uuid references household_members(id);

alter table recurring_bills
  add column if not exists paid_by_member_id uuid references household_members(id);

-- Backfill existing bills: assume whoever's auth account logged the bill
-- also paid it. Correct for this household's history unless told
-- otherwise — overridable per-bill afterward via the bill list.
update transactions t
set paid_by_member_id = hm.id
from household_members hm
where hm.household_id = t.household_id
  and hm.user_id = t.created_by
  and t.paid_by_member_id is null;

-- ============================================================
-- Recurring-bill generation needs to carry the template's payer onto
-- each generated transaction. Redefining both functions from
-- supabase-recurring.sql with paid_by_member_id added to the insert —
-- everything else about them is unchanged.
-- ============================================================

create or replace function generate_due_recurring_bills()
returns void as $$
declare
  r record;
  target_month_start date;
  clamped_due_date date;
begin
  for r in
    select * from recurring_bills
    where active = true
      and start_date <= current_date
      and (end_date is null or end_date >= current_date)
  loop
    target_month_start := date_trunc('month', current_date)::date;
    clamped_due_date := clamped_due_date_for_month(r.due_day_of_month, target_month_start);

    if clamped_due_date = current_date then
      if not exists (
        select 1 from transactions
        where recurring_bill_id = r.id
          and period_start = target_month_start
      ) then
        insert into transactions (
          created_by, household_id, category_id, amount, payee,
          period_start, period_end, due_date, recurring_bill_id, paid_by_member_id
        ) values (
          r.created_by, r.household_id, r.category_id, r.amount, r.payee,
          target_month_start, (target_month_start + interval '1 month - 1 day')::date, clamped_due_date, r.id, r.paid_by_member_id
        );
      end if;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

create or replace function backfill_recurring_bill(p_recurring_bill_id uuid)
returns void as $$
declare
  r record;
  month_cursor date;
  clamped_due_date date;
begin
  select * into r from recurring_bills where id = p_recurring_bill_id;

  if r is null then
    raise exception 'recurring bill not found';
  end if;

  if not is_household_member(r.household_id) then
    raise exception 'not authorized';
  end if;

  month_cursor := date_trunc('month', r.start_date)::date;

  while month_cursor <= date_trunc('month', current_date)::date loop
    clamped_due_date := clamped_due_date_for_month(r.due_day_of_month, month_cursor);

    if clamped_due_date >= r.start_date
       and clamped_due_date <= current_date
       and (r.end_date is null or clamped_due_date <= r.end_date)
    then
      if not exists (
        select 1 from transactions
        where recurring_bill_id = r.id
          and period_start = month_cursor
      ) then
        insert into transactions (
          created_by, household_id, category_id, amount, payee,
          period_start, period_end, due_date, recurring_bill_id, paid_by_member_id
        ) values (
          r.created_by, r.household_id, r.category_id, r.amount, r.payee,
          month_cursor, (month_cursor + interval '1 month - 1 day')::date, clamped_due_date, r.id, r.paid_by_member_id
        );
      end if;
    end if;

    month_cursor := (month_cursor + interval '1 month')::date;
  end loop;
end;
$$ language plpgsql security definer;

revoke all on function backfill_recurring_bill(uuid) from public;
grant execute on function backfill_recurring_bill(uuid) to authenticated;

-- ============================================================
-- household_balances — itemized pairwise-per-category balance.
-- Plain SQL, security invoker (relies on the caller's own RLS read
-- access to transaction_splits/transactions/settlement_allocations,
-- same pattern as compute_split).
--
-- For every split, nets out whatever's already been paid back via
-- settlement_allocations. Rows that net to exactly zero are dropped
-- (fully settled); nonzero rows (including negative, which would mean
-- over-settlement — a real bug worth seeing, not hiding) are returned
-- as-is.
-- ============================================================

create or replace function household_balances(p_household_id uuid)
returns table(debtor_id uuid, creditor_id uuid, category_id uuid, amount numeric)
language sql
stable
as $$
  select
    ts.member_id as debtor_id,
    t.paid_by_member_id as creditor_id,
    t.category_id,
    sum(ts.share_amount - coalesce(sa.allocated, 0)) as amount
  from transaction_splits ts
  join transactions t on t.id = ts.transaction_id
  left join (
    select transaction_split_id, sum(amount_allocated) as allocated
    from settlement_allocations
    group by transaction_split_id
  ) sa on sa.transaction_split_id = ts.id
  where t.household_id = p_household_id
    and t.paid_by_member_id is not null
    and ts.member_id <> t.paid_by_member_id
  group by ts.member_id, t.paid_by_member_id, t.category_id
  having sum(ts.share_amount - coalesce(sa.allocated, 0)) <> 0
$$;

revoke all on function household_balances(uuid) from public;
grant execute on function household_balances(uuid) to authenticated;

-- ============================================================
-- net_balances — each member's overall position (positive = owed
-- money, negative = owes money), summed across every category and
-- counterparty. Feeds the client-side debt-simplification step (a
-- greedy creditor/debtor match), which is plain array logic with no
-- data-access concerns of its own, so it doesn't need to be a Postgres
-- function the way household_balances does.
-- ============================================================

create or replace function net_balances(p_household_id uuid)
returns table(member_id uuid, net_amount numeric)
language sql
stable
as $$
  with hb as (
    select * from household_balances(p_household_id)
  ),
  credits as (
    select creditor_id as member_id, sum(amount) as amt from hb group by creditor_id
  ),
  debits as (
    select debtor_id as member_id, sum(amount) as amt from hb group by debtor_id
  )
  select
    hm.id as member_id,
    coalesce(c.amt, 0) - coalesce(d.amt, 0) as net_amount
  from household_members hm
  left join credits c on c.member_id = hm.id
  left join debits d on d.member_id = hm.id
  where hm.household_id = p_household_id
$$;

revoke all on function net_balances(uuid) from public;
grant execute on function net_balances(uuid) to authenticated;

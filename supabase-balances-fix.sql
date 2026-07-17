-- Household Bills Tracker — correct the payment-assumption bug from
-- supabase-balances.sql
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- The original design was wrong: it assumed whoever logged a bill had
-- already paid it out of pocket (paid_by_member_id defaulted to
-- created_by), so every logged bill immediately created inter-member
-- debt. That's backwards. Logging a bill only records an obligation to
-- an EXTERNAL creditor (the payee), split fairly via transaction_splits.
-- It creates no debt between household members — that only happens once
-- someone explicitly records that they actually paid. Every bill in this
-- household is currently paid_status = 'unpaid', so household_balances
-- should be showing nothing right now, not £8037.50.

-- Undo the incorrect backfill — nothing was actually, explicitly paid.
update transactions
set paid_by_member_id = null
where paid_by_member_id is not null;

-- household_balances now only counts bills explicitly marked paid.
-- Unconfirmed bills stay purely in the "external unpaid bills" list —
-- shared awareness of what's owed out, not a guess at who fronted it.
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
    and t.paid_status = 'paid'
    and t.paid_by_member_id is not null
    and ts.member_id <> t.paid_by_member_id
  group by ts.member_id, t.paid_by_member_id, t.category_id
  having sum(ts.share_amount - coalesce(sa.allocated, 0)) <> 0
$$;

-- recurring_bills.paid_by_member_id doesn't fit the corrected model —
-- generating a bill still isn't paying it, so a template-level "usual
-- payer" default would reintroduce the same mistake. Revert generation
-- back to not setting a payer; every bill (recurring or manual) starts
-- unpaid with no payer until explicitly marked paid.
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
          period_start, period_end, due_date, recurring_bill_id
        ) values (
          r.created_by, r.household_id, r.category_id, r.amount, r.payee,
          target_month_start, (target_month_start + interval '1 month - 1 day')::date, clamped_due_date, r.id
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
          period_start, period_end, due_date, recurring_bill_id
        ) values (
          r.created_by, r.household_id, r.category_id, r.amount, r.payee,
          month_cursor, (month_cursor + interval '1 month - 1 day')::date, clamped_due_date, r.id
        );
      end if;
    end if;

    month_cursor := (month_cursor + interval '1 month')::date;
  end loop;
end;
$$ language plpgsql security definer;

revoke all on function backfill_recurring_bill(uuid) from public;
grant execute on function backfill_recurring_bill(uuid) to authenticated;

alter table recurring_bills drop column if exists paid_by_member_id;

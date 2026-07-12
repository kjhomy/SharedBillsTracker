-- Household Bills Tracker — Recurring bills
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- after supabase-schema.sql. Adds "recurring bill templates" (e.g. "Rent,
-- due on the 25th, forever") that auto-generate a real transactions row
-- each month via a scheduled Postgres function. Safe to re-run — every
-- statement here is idempotent.
--
-- Scope note: amount is required on the template, so this only fits
-- fixed-amount bills (Rent, Council Tax, subscriptions). Variable bills
-- (Energy, Water) shouldn't be auto-generated with a guessed amount —
-- log those manually via the Add Bill form instead.

create table if not exists recurring_bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  category_id uuid references categories(id) not null,
  payee text,
  amount numeric(10,2) not null,
  due_day_of_month int not null check (due_day_of_month between 1 and 31),
  start_date date not null default current_date,
  end_date date, -- null = perpetual, keeps generating indefinitely
  active boolean not null default true,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

alter table transactions
  add column if not exists recurring_bill_id uuid references recurring_bills(id) on delete set null;

alter table recurring_bills enable row level security;

drop policy if exists "members can view recurring bills" on recurring_bills;
create policy "members can view recurring bills" on recurring_bills
  for select using (is_household_member(household_id));

drop policy if exists "members can add recurring bills" on recurring_bills;
create policy "members can add recurring bills" on recurring_bills
  for insert with check (is_household_member(household_id));

drop policy if exists "members can update recurring bills" on recurring_bills;
create policy "members can update recurring bills" on recurring_bills
  for update using (is_household_member(household_id));

drop policy if exists "members can delete recurring bills" on recurring_bills;
create policy "members can delete recurring bills" on recurring_bills
  for delete using (is_household_member(household_id));

-- Shared by both the daily generator and the backfill function below,
-- so the "which day does this bill actually land on" logic only lives
-- in one place. Clamps to the last day of the month for short months.
create or replace function clamped_due_date_for_month(due_day int, month_start date)
returns date as $$
  select least(month_start + (due_day - 1), (month_start + interval '1 month - 1 day')::date);
$$ language sql immutable;

-- ============================================================
-- GENERATION — runs daily, creates a transactions row for any
-- active template whose (month-length-clamped) due day is today
-- and that doesn't already have a transaction for this month.
-- Runs as security definer so it doesn't need an authenticated
-- session/RLS bypass workaround.
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

-- ============================================================
-- BACKFILL — called once, right after a template is created, to
-- generate every month it already missed (e.g. a start_date from
-- 4 months ago). Only generates occurrences that have actually
-- passed (clamped due date <= today) — never generates ahead of
-- schedule. Callable by any authenticated household member for
-- their own household; the household_id check below is what keeps
-- that safe despite running as security definer.
-- ============================================================

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

create extension if not exists pg_cron;

select cron.unschedule('generate-recurring-bills')
where exists (select 1 from cron.job where jobname = 'generate-recurring-bills');

select cron.schedule(
  'generate-recurring-bills',
  '0 6 * * *', -- daily at 06:00 UTC
  $$select generate_due_recurring_bills();$$
);

-- Household Bills Tracker — Recurring bills
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- after supabase-schema.sql. Adds "recurring bill templates" (e.g. "Rent,
-- due on the 25th, forever") that auto-generate a real transactions row
-- each month via a scheduled Postgres function.
--
-- Scope note: amount is required on the template, so this only fits
-- fixed-amount bills (Rent, Council Tax, subscriptions). Variable bills
-- (Energy, Water) shouldn't be auto-generated with a guessed amount —
-- log those manually via the Add Bill form instead.

create table recurring_bills (
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
  add column recurring_bill_id uuid references recurring_bills(id) on delete set null;

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
  target_month_end date;
  clamped_due_date date;
begin
  for r in
    select * from recurring_bills
    where active = true
      and start_date <= current_date
      and (end_date is null or end_date >= current_date)
  loop
    target_month_start := date_trunc('month', current_date)::date;
    target_month_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    clamped_due_date := least(target_month_start + (r.due_day_of_month - 1), target_month_end);

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
          target_month_start, target_month_end, clamped_due_date, r.id
        );
      end if;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

create extension if not exists pg_cron;

select cron.unschedule('generate-recurring-bills')
where exists (select 1 from cron.job where jobname = 'generate-recurring-bills');

select cron.schedule(
  'generate-recurring-bills',
  '0 6 * * *', -- daily at 06:00 UTC
  $$select generate_due_recurring_bills();$$
);

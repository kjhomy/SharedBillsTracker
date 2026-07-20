-- Household Bills Tracker — Analytics
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- Three pieces:
--   benchmark_rates          reference table for "vs UK average" comparison
--   category_spend_by_month  monthly spend per category, for trend charts
--                            and spend-spike detection (computed client-side)
--   balance_trend            raw signed balance deltas over time (paid bill
--                            splits +, settlements -), for a running-balance
--                            chart. Returns raw events rather than a
--                            pre-summed running total — the client already
--                            has member names and needs to canonicalize
--                            pair direction into one signed line ("You" vs
--                            "them"), which is simpler to get right in JS
--                            than in a single aggregate query.

-- ============================================================
-- benchmark_rates
-- ============================================================
--
-- Seed values below are ILLUSTRATIVE placeholders (rounded, order-of-
-- magnitude UK averages), not live or authoritative figures — there's no
-- data source wired up to fetch real ones. They exist so the comparison
-- chart has something to render on day one; the editor UI on /analytics
-- lets you overwrite them with numbers from a source you actually trust
-- (Ofgem, Ofwat, ONS, your council's band D figure, etc.). Rent is
-- deliberately not seeded — it varies too much by region and property
-- size for a single "UK average" to mean anything useful.

create table benchmark_rates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) not null unique,
  monthly_amount numeric(10,2) not null check (monthly_amount >= 0),
  note text,
  updated_at timestamptz default now()
);

alter table benchmark_rates enable row level security;

-- Not household-scoped — it's shared reference data, not anyone's
-- financial data, so any signed-in user of this app instance can view or
-- correct it (same trust boundary as the shared system categories).
create policy "authenticated can view benchmarks" on benchmark_rates
  for select using (auth.role() = 'authenticated');
create policy "authenticated can add benchmarks" on benchmark_rates
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update benchmarks" on benchmark_rates
  for update using (auth.role() = 'authenticated');

insert into benchmark_rates (category_id, monthly_amount, note)
select id, v.amount, 'Illustrative placeholder — edit to your own reference source'
from categories c
join (values
  ('Energy', 150.00),
  ('Water', 45.00),
  ('Council Tax', 175.00),
  ('Internet', 30.00)
) as v(name, amount) on v.name = c.name
where c.user_id is null
on conflict (category_id) do nothing;

revoke all on table benchmark_rates from anon;
grant select, insert, update on table benchmark_rates to authenticated;

-- ============================================================
-- category_spend_by_month
-- ============================================================

create or replace function category_spend_by_month(p_household_id uuid)
returns table(
  category_id uuid,
  category_name text,
  month date,
  total_amount numeric
)
language sql
stable
as $$
  select
    t.category_id,
    coalesce(c.name, 'Uncategorised') as category_name,
    date_trunc('month', coalesce(t.period_start, t.created_at::date))::date as month,
    sum(t.amount) as total_amount
  from transactions t
  left join categories c on c.id = t.category_id
  where t.household_id = p_household_id
  group by t.category_id, c.name, date_trunc('month', coalesce(t.period_start, t.created_at::date))
  order by month, category_name
$$;

revoke all on function category_spend_by_month(uuid) from public;
grant execute on function category_spend_by_month(uuid) to authenticated;

-- ============================================================
-- balance_trend
-- ============================================================

create or replace function balance_trend(p_household_id uuid)
returns table(
  event_date date,
  debtor_id uuid,
  creditor_id uuid,
  delta_amount numeric
)
language sql
stable
as $$
  select
    t.created_at::date as event_date,
    ts.member_id as debtor_id,
    t.paid_by_member_id as creditor_id,
    ts.share_amount as delta_amount
  from transaction_splits ts
  join transactions t on t.id = ts.transaction_id
  where t.household_id = p_household_id
    and t.paid_status = 'paid'
    and t.paid_by_member_id is not null
    and ts.member_id <> t.paid_by_member_id

  union all

  select
    s.date,
    s.from_member_id,
    s.to_member_id,
    -s.amount
  from settlements s
  where s.household_id = p_household_id

  order by event_date
$$;

revoke all on function balance_trend(uuid) from public;
grant execute on function balance_trend(uuid) to authenticated;

-- Household Bills Tracker — Activity feed (Phase 3)
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- settlement_activity() turns Settlement + SettlementAllocation rows into
-- one row per settlement, with the distinct category count (and the
-- single category name, when there's exactly one) so the app can render
-- "X settled [Category] with Y — £N" for a single-category settlement vs
-- "X settled up with Y — £N across N categories" for a bulk one. No
-- explicit membership check needed — it only joins tables that already
-- have "members can view" RLS policies (settlements, settlement_allocations,
-- transaction_splits, transactions), same pattern as household_balances()
-- and unsettled_splits().

create or replace function settlement_activity(p_household_id uuid)
returns table(
  settlement_id uuid,
  from_member_id uuid,
  to_member_id uuid,
  amount numeric,
  date date,
  created_at timestamptz,
  category_count bigint,
  category_name text
)
language sql
stable
as $$
  select
    s.id as settlement_id,
    s.from_member_id,
    s.to_member_id,
    s.amount,
    s.date,
    s.created_at,
    count(distinct t.category_id) as category_count,
    case when count(distinct t.category_id) = 1 then min(c.name) end as category_name
  from settlements s
  join settlement_allocations sa on sa.settlement_id = s.id
  join transaction_splits ts on ts.id = sa.transaction_split_id
  join transactions t on t.id = ts.transaction_id
  left join categories c on c.id = t.category_id
  where s.household_id = p_household_id
  group by s.id, s.from_member_id, s.to_member_id, s.amount, s.date, s.created_at
  order by s.date desc, s.created_at desc
$$;

revoke all on function settlement_activity(uuid) from public;
grant execute on function settlement_activity(uuid) to authenticated;

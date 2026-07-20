-- Household Bills Tracker — Full ledger/statement view
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- household_ledger() merges every bill logged and every settlement made
-- into one chronological feed — a bank-statement-style view of the
-- household's financial history, as opposed to the Dashboard's
-- current-snapshot balances or the Settle Up page's unsettled-only view.
--
-- Not SECURITY DEFINER: like settlement_activity() and household_balances(),
-- it only joins tables that already have "members can view" RLS policies,
-- so passing a household_id the caller isn't a member of just yields an
-- empty result via normal row-level security — no explicit membership
-- check needed here.

create or replace function household_ledger(p_household_id uuid)
returns table(
  entry_type text,           -- 'bill' | 'settlement'
  entry_id uuid,
  event_date date,
  sort_ts timestamptz,
  amount numeric,
  category_name text,
  payee text,                -- bills only
  paid_status text,          -- bills only
  paid_by_member_id uuid,    -- bills only
  from_member_id uuid,       -- settlements only
  to_member_id uuid,         -- settlements only
  category_count bigint,     -- settlements only (distinct categories covered)
  splits jsonb                -- bills only: [{member_id, share_amount, share_percentage}]
)
language sql
stable
as $$
  select
    'bill'::text as entry_type,
    t.id as entry_id,
    t.created_at::date as event_date,
    t.created_at as sort_ts,
    t.amount,
    c.name as category_name,
    t.payee,
    t.paid_status,
    t.paid_by_member_id,
    null::uuid as from_member_id,
    null::uuid as to_member_id,
    null::bigint as category_count,
    (
      select jsonb_agg(
        jsonb_build_object(
          'member_id', ts.member_id,
          'share_amount', ts.share_amount,
          'share_percentage', ts.share_percentage
        )
        order by ts.share_amount desc
      )
      from transaction_splits ts
      where ts.transaction_id = t.id
    ) as splits
  from transactions t
  left join categories c on c.id = t.category_id
  where t.household_id = p_household_id

  union all

  select
    'settlement'::text,
    s.id,
    s.date,
    s.created_at,
    s.amount,
    case when count(distinct t2.category_id) = 1 then min(c2.name) end,
    null::text,
    null::text,
    null::uuid,
    s.from_member_id,
    s.to_member_id,
    count(distinct t2.category_id),
    null::jsonb
  from settlements s
  join settlement_allocations sa on sa.settlement_id = s.id
  join transaction_splits ts on ts.id = sa.transaction_split_id
  join transactions t2 on t2.id = ts.transaction_id
  left join categories c2 on c2.id = t2.category_id
  where s.household_id = p_household_id
  group by s.id, s.from_member_id, s.to_member_id, s.amount, s.date, s.created_at

  order by sort_ts desc, entry_type
$$;

revoke all on function household_ledger(uuid) from public;
grant execute on function household_ledger(uuid) to authenticated;

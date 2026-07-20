-- Household Bills Tracker — settlement durability fix
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs. Must run after supabase-settlements.sql.
--
-- Bug found while building the ledger view: save_transaction_split()
-- recalculates a bill's split by deleting all its transaction_splits rows
-- and re-inserting fresh ones, every time recompute_household_splits()
-- runs (which fires automatically on any joined/left-date or ratio edit).
-- settlement_allocations.transaction_split_id references transaction_splits
-- ON DELETE CASCADE, so the moment those rows get regenerated, any
-- settlement that had already paid off that split silently loses its link
-- and gets cascade-deleted — even though the settlements row itself
-- survives. household_balances()/unsettled_splits() then treat the
-- (new, identical-looking) split as never having been paid, so an
-- already-settled debt quietly reappears as outstanding.
--
-- This had already happened in the live household: two real settlements
-- (£37.50 for an Energy bill, £1,000 for a Rent bill, both "You" paying
-- Kofi back) had their settlement_allocations rows destroyed by a later
-- recompute, so the Dashboard was showing "You owe Kofi £1,037.50" for
-- debts that were, in fact, already paid.

-- 1. Fix going forward: upsert transaction_splits by (transaction_id,
--    member_id) instead of delete-and-reinsert, so a split's row identity
--    — and therefore any settlement_allocations pointing at it — survives
--    a recompute when that member's share is merely recalculated, not
--    removed outright.
alter table transaction_splits
  add constraint transaction_splits_transaction_member_unique
  unique (transaction_id, member_id);

create or replace function save_transaction_split(p_transaction_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_txn record;
begin
  select * into v_txn from transactions where id = p_transaction_id;

  if v_txn is null then
    raise exception 'transaction not found';
  end if;

  if not is_household_member(v_txn.household_id) then
    raise exception 'not authorized';
  end if;

  if v_txn.period_start is null or v_txn.period_end is null then
    delete from transaction_splits where transaction_id = p_transaction_id;
    return; -- legacy bill with no period — nothing to split yet
  end if;

  insert into transaction_splits (transaction_id, member_id, share_amount, share_percentage)
  select p_transaction_id, s.member_id, s.share_amount, s.share_percentage
  from compute_split(v_txn.household_id, v_txn.category_id, v_txn.amount, v_txn.period_start, v_txn.period_end) s
  on conflict (transaction_id, member_id)
  do update set
    share_amount = excluded.share_amount,
    share_percentage = excluded.share_percentage;

  -- Only removes members no longer in the computed set at all (e.g. they
  -- left before this bill's period) — settlement_allocations legitimately
  -- cascades away here, since a member being dropped from a bill entirely
  -- invalidates any settlement tied to that share.
  delete from transaction_splits ts
  where ts.transaction_id = p_transaction_id
    and not exists (
      select 1
      from compute_split(v_txn.household_id, v_txn.category_id, v_txn.amount, v_txn.period_start, v_txn.period_end) s
      where s.member_id = ts.member_id
    );
end;
$$;

-- 2. Repair the two settlements this already broke: re-link them to the
-- current transaction_splits rows for the same (transaction, debtor) pair
-- the original allocation was for. Identified by matching the settlement
-- amount to a paid bill's "You" share where paid_by was Kofi — both are
-- unambiguous (only one bill each of that amount for that pair).
insert into settlement_allocations (settlement_id, transaction_split_id, amount_allocated)
select s.id, ts.id, s.amount
from settlements s
join transaction_splits ts on ts.share_amount = s.amount
join transactions t on t.id = ts.transaction_id
where s.household_id = '79ff8e7c-b7eb-4b07-ac99-1da9ed539462'
  and s.amount in (37.50, 1000.00)
  and t.paid_status = 'paid'
  and t.paid_by_member_id = s.to_member_id
  and ts.member_id = s.from_member_id
  and not exists (
    select 1 from settlement_allocations sa where sa.settlement_id = s.id
  );

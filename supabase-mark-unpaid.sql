-- Household Bills Tracker — allow cancelling a "mark as paid"
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- mark_transaction_unpaid() undoes "Mark as paid by…" — clears paid_status
-- and paid_by_member_id. Blocked if any of the bill's transaction_splits
-- already have settlement_allocations against them: those represent real
-- money that changed hands to settle this bill, so silently un-paying it
-- would orphan that settlement record exactly the way the bug fixed in
-- supabase-split-durability-fix.sql did — the debt would look outstanding
-- again even though it was actually paid off. If that happens, the
-- settlement itself needs to be dealt with first, not silently discarded
-- here.
--
-- security definer (like record_settlement) so the settlement-allocation
-- check is enforced server-side rather than trusted to client-side JS.

create or replace function mark_transaction_unpaid(p_transaction_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_household_id uuid;
  v_settled_count int;
begin
  select household_id into v_household_id from transactions where id = p_transaction_id;

  if v_household_id is null then
    raise exception 'transaction not found';
  end if;

  if not is_household_member(v_household_id) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_settled_count
  from settlement_allocations sa
  join transaction_splits ts on ts.id = sa.transaction_split_id
  where ts.transaction_id = p_transaction_id;

  if v_settled_count > 0 then
    raise exception 'this bill has already been settled — undo or edit that settlement first';
  end if;

  update transactions
  set paid_status = 'unpaid', paid_by_member_id = null
  where id = p_transaction_id;
end;
$$;

revoke all on function mark_transaction_unpaid(uuid) from public;
grant execute on function mark_transaction_unpaid(uuid) to authenticated;

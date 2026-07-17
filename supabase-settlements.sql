-- Household Bills Tracker — Settle Up engine (Phase 3)
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- unsettled_splits() is the granular version of household_balances() —
-- one row per still-outstanding transaction_split rather than an
-- aggregate. household_balances() is refactored to aggregate on top of
-- it, so the "what counts as unsettled" logic lives in exactly one
-- place. record_settlement() is what the Settle Up screen actually
-- calls: given a debtor, a creditor, and a set of transaction_split ids
-- to pay off in full, it writes one settlements row plus one
-- settlement_allocations row per split, computing amounts fresh from the
-- DB rather than trusting whatever the client last rendered.

create or replace function unsettled_splits(p_household_id uuid)
returns table(
  transaction_split_id uuid,
  transaction_id uuid,
  debtor_id uuid,
  creditor_id uuid,
  category_id uuid,
  payee text,
  remaining_amount numeric
)
language sql
stable
as $$
  select
    ts.id as transaction_split_id,
    ts.transaction_id,
    ts.member_id as debtor_id,
    t.paid_by_member_id as creditor_id,
    t.category_id,
    t.payee,
    ts.share_amount - coalesce(sa.allocated, 0) as remaining_amount
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
    and (ts.share_amount - coalesce(sa.allocated, 0)) <> 0
$$;

revoke all on function unsettled_splits(uuid) from public;
grant execute on function unsettled_splits(uuid) to authenticated;

create or replace function household_balances(p_household_id uuid)
returns table(debtor_id uuid, creditor_id uuid, category_id uuid, amount numeric)
language sql
stable
as $$
  select debtor_id, creditor_id, category_id, sum(remaining_amount) as amount
  from unsettled_splits(p_household_id)
  group by debtor_id, creditor_id, category_id
$$;

revoke all on function household_balances(uuid) from public;
grant execute on function household_balances(uuid) to authenticated;

create or replace function record_settlement(
  p_household_id uuid,
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_transaction_split_ids uuid[]
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_settlement_id uuid;
  v_total numeric;
begin
  if not is_household_member(p_household_id) then
    raise exception 'not authorized';
  end if;

  select sum(us.remaining_amount) into v_total
  from unsettled_splits(p_household_id) us
  where us.transaction_split_id = any(p_transaction_split_ids)
    and us.debtor_id = p_from_member_id
    and us.creditor_id = p_to_member_id;

  if v_total is null or v_total <= 0 then
    raise exception 'nothing to settle for the given splits';
  end if;

  insert into settlements (household_id, from_member_id, to_member_id, amount, date)
  values (p_household_id, p_from_member_id, p_to_member_id, v_total, current_date)
  returning id into v_settlement_id;

  insert into settlement_allocations (settlement_id, transaction_split_id, amount_allocated)
  select v_settlement_id, us.transaction_split_id, us.remaining_amount
  from unsettled_splits(p_household_id) us
  where us.transaction_split_id = any(p_transaction_split_ids)
    and us.debtor_id = p_from_member_id
    and us.creditor_id = p_to_member_id;

  return v_settlement_id;
end;
$$;

revoke all on function record_settlement(uuid, uuid, uuid, uuid[]) from public;
grant execute on function record_settlement(uuid, uuid, uuid, uuid[]) to authenticated;

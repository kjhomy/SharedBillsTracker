-- Household Bills Tracker — Split calculation engine (Phase 2)
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- Three functions:
--   compute_split(...)             pure calculation, no writes. Slices a
--                                   bill's period wherever membership or a
--                                   category ratio changes, applies the
--                                   ratio in effect per slice, sums per
--                                   member. Used for the live preview on
--                                   the Add Bill form before a transaction
--                                   row exists, and internally by
--                                   save_transaction_split below.
--   save_transaction_split(id)     persists compute_split's result into
--                                   transaction_splits for a real bill.
--   recompute_household_splits(id) re-runs save_transaction_split over
--                                   every split-eligible bill in a
--                                   household — called whenever a ratio or
--                                   a member's joined/left date changes,
--                                   since that can retroactively change
--                                   historical splits.
--
-- A member active during a slice but with no category_ratios row covering
-- it is treated as 0% for that slice — not an error, not redistributed to
-- other members. That gap is intentionally visible (splits can sum to
-- less than the bill amount) rather than silently guessed; Phase 4's flag
-- system is what's meant to surface it to the user.
--
-- Bills with no period_start/period_end (legacy manually-entered ones —
-- the Add Bill form now requires both going forward) are left unsplit by
-- save_transaction_split rather than guessing a period.

-- ============================================================
-- compute_split — plain SQL, security invoker (relies on the
-- caller's own RLS read access to household_members/category_ratios;
-- a caller who isn't a member of p_household_id simply gets no rows
-- back for that household, same as querying those tables directly).
-- ============================================================

create or replace function compute_split(
  p_household_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_period_start date,
  p_period_end date
)
returns table(member_id uuid, share_amount numeric, share_percentage numeric)
language sql
stable
as $$
  with breakpoints as (
    select p_period_start as d
    union select p_period_end + 1
    union select joined_date from household_members
      where household_id = p_household_id
        and joined_date > p_period_start and joined_date <= p_period_end
    union select left_date + 1 from household_members
      where household_id = p_household_id and left_date is not null
        and left_date + 1 > p_period_start and left_date + 1 <= p_period_end
    union select effective_from from category_ratios
      where household_id = p_household_id and category_id = p_category_id
        and effective_from > p_period_start and effective_from <= p_period_end
    union select effective_to + 1 from category_ratios
      where household_id = p_household_id and category_id = p_category_id
        and effective_to is not null
        and effective_to + 1 > p_period_start and effective_to + 1 <= p_period_end
  ),
  slices as (
    select d as slice_start, lead(d) over (order by d) as slice_end
    from breakpoints
  ),
  slices_final as (
    select slice_start, slice_end, (slice_end - slice_start) as slice_days
    from slices
    where slice_end is not null
  ),
  slice_shares as (
    select
      hm.id as member_id,
      sf.slice_days,
      coalesce((
        select cr.percentage from category_ratios cr
        where cr.household_id = p_household_id
          and cr.category_id = p_category_id
          and cr.member_id = hm.id
          and cr.effective_from <= sf.slice_start
          and (cr.effective_to is null or cr.effective_to >= sf.slice_end - 1)
        order by cr.effective_from desc
        limit 1
      ), 0) as ratio
    from slices_final sf
    join household_members hm
      on hm.household_id = p_household_id
      and hm.joined_date <= sf.slice_start
      and (hm.left_date is null or hm.left_date >= sf.slice_end - 1)
  ),
  exact_shares as (
    select
      member_id,
      sum(p_amount * (slice_days::numeric / (p_period_end - p_period_start + 1)) * (ratio / 100)) as exact_amount
    from slice_shares
    group by member_id
  ),
  -- every member active at any point in the period gets a row, even if
  -- their computed share is zero (unconfigured ratio) — so "this member
  -- was active but paid nothing" stays visible rather than disappearing
  period_members as (
    select id as member_id from household_members
    where household_id = p_household_id
      and joined_date <= p_period_end
      and (left_date is null or left_date >= p_period_start)
  ),
  seeded as (
    select pm.member_id, coalesce(es.exact_amount, 0) as exact_amount
    from period_members pm
    left join exact_shares es using (member_id)
  ),
  rounded as (
    select
      member_id,
      floor(exact_amount * 100)::bigint as pennies,
      (exact_amount * 100) - floor(exact_amount * 100) as remainder
    from seeded
  ),
  totals as (
    -- total_pennies is the rounded sum of what was actually allocated
    -- across slices (seeded.exact_amount), NOT round(p_amount * 100).
    -- Those only match when every slice has full ratio coverage; when a
    -- slice has no active members or an unconfigured ratio, that portion
    -- is a genuine unclaimed gap and must stay a gap, not get papered
    -- over by padding pennies onto whoever happens to have a share.
    select
      round((select coalesce(sum(exact_amount), 0) from seeded) * 100)::bigint as total_pennies,
      coalesce(sum(pennies), 0) as allocated_pennies
    from rounded
  ),
  -- largest-remainder rounding: distribute the leftover (or excess)
  -- pennies from float->cent rounding to the members with the largest
  -- (or smallest) fractional remainder. This only ever corrects the
  -- floor()-vs-exact drift (at most one penny per member), so the
  -- allocated total still matches the sum of exact shares exactly —
  -- it never fabricates money for slices nobody was configured to cover.
  adjusted as (
    select
      r.member_id,
      r.pennies + case
        when t.total_pennies > t.allocated_pennies
          and r.member_id in (
            select member_id from rounded
            order by remainder desc, member_id
            limit (t.total_pennies - t.allocated_pennies)
          ) then 1
        when t.total_pennies < t.allocated_pennies
          and r.member_id in (
            select member_id from rounded
            order by remainder asc, member_id
            limit (t.allocated_pennies - t.total_pennies)
          ) then -1
        else 0
      end as pennies
    from rounded r, totals t
  )
  select
    member_id,
    (pennies::numeric / 100) as share_amount,
    case when p_amount = 0 then 0::numeric else round((pennies::numeric / 100) / p_amount * 100, 2) end as share_percentage
  from adjusted;
$$;

revoke all on function compute_split(uuid, uuid, numeric, date, date) from public;
grant execute on function compute_split(uuid, uuid, numeric, date, date) to authenticated;

-- ============================================================
-- save_transaction_split / recompute_household_splits — security
-- definer, like backfill_recurring_bill: transaction_splits has no
-- delete policy (deliberately — splits should only ever be written
-- by this calculation engine, never edited directly by a client), so
-- these need elevated privileges plus an explicit auth check in place
-- of RLS.
-- ============================================================

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

  delete from transaction_splits where transaction_id = p_transaction_id;

  if v_txn.period_start is null or v_txn.period_end is null then
    return; -- legacy bill with no period — nothing to split yet
  end if;

  insert into transaction_splits (transaction_id, member_id, share_amount, share_percentage)
  select p_transaction_id, s.member_id, s.share_amount, s.share_percentage
  from compute_split(v_txn.household_id, v_txn.category_id, v_txn.amount, v_txn.period_start, v_txn.period_end) s;
end;
$$;

revoke all on function save_transaction_split(uuid) from public;
grant execute on function save_transaction_split(uuid) to authenticated;

create or replace function recompute_household_splits(p_household_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  if not is_household_member(p_household_id) then
    raise exception 'not authorized';
  end if;

  for r in
    select id from transactions
    where household_id = p_household_id
      and period_start is not null
      and period_end is not null
  loop
    perform save_transaction_split(r.id);
  end loop;
end;
$$;

revoke all on function recompute_household_splits(uuid) from public;
grant execute on function recompute_household_splits(uuid) to authenticated;

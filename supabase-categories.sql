-- Household Bills Tracker — manage categories (add / archive / delete)
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- or apply via scripts/run-sql.mjs.
--
-- Categories were previously seed-only, with no in-app way to add one or
-- retire one. Adds:
--   - archived_at: archived categories drop out of "pick a category" lists
--     for new bills/recurring bills/ratios, but stay resolvable by name for
--     every historical row that already references them — nothing is hidden
--     from past data, only from new entry.
--   - delete_category(): a real delete, only permitted when nothing
--     references the category (transactions, recurring_bills,
--     category_ratios, benchmark_rates) — otherwise archiving is the only
--     option, same as this app's other "can't undo without corrupting
--     history" guards (mark_transaction_unpaid, the settlement-durability
--     fix).
--
-- Categories are shared household reference data in practice (not
-- per-user), same trust boundary as benchmark_rates: any authenticated
-- user can add, archive, or delete one. The existing user_id column is
-- left as-is (nullable, unused by anything the app's own UI writes going
-- forward) rather than reworked, since the personal-finance-fork idea it
-- was for is explicitly out of scope now.

alter table categories add column archived_at timestamptz;

-- The existing insert policy only allows user_id = auth.uid(), which
-- would make an app-created category visible only to its creator. Add a
-- second insert policy for the shared (user_id is null) categories the
-- UI actually creates; the old policy is left in place, just unused.
create policy "authenticated can add shared categories" on categories
  for insert with check (user_id is null);

create policy "authenticated can update categories" on categories
  for update using (auth.role() = 'authenticated');

create or replace function delete_category(p_category_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_in_use boolean;
begin
  select
    exists(select 1 from transactions where category_id = p_category_id)
    or exists(select 1 from recurring_bills where category_id = p_category_id)
    or exists(select 1 from category_ratios where category_id = p_category_id)
    or exists(select 1 from benchmark_rates where category_id = p_category_id)
  into v_in_use;

  if v_in_use then
    raise exception 'this category is in use — archive it instead of deleting it';
  end if;

  delete from categories where id = p_category_id;
end;
$$;

revoke all on function delete_category(uuid) from public;
grant execute on function delete_category(uuid) to authenticated;

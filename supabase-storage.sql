-- Household Bills Tracker — Storage setup
-- Paste this whole file into Supabase → SQL Editor → New Query → Run,
-- after supabase-schema.sql. Sets up a private bucket for bill/settlement
-- attachments (receipts, payment screenshots) and locks access down to
-- members of the household the file belongs to.
--
-- Files are expected to be uploaded under the path:
--   <household_id>/<transaction_or_settlement_id>/<filename>
-- so storage.foldername(name)[1] is always the owning household's id —
-- that's what the policies below check against.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "household members can upload receipts" on storage.objects;
create policy "household members can upload receipts"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and is_household_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "household members can view receipts" on storage.objects;
create policy "household members can view receipts"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and is_household_member((storage.foldername(name))[1]::uuid)
);

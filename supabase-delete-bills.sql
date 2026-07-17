-- Household Bills Tracker — Delete-bill support
-- Paste this whole file into Supabase → SQL Editor → New Query → Run.
-- Adds the missing RLS policies needed to delete a bill: the schema had
-- view/insert/update on transactions and attachments, but no delete policy
-- anywhere, and no delete policy on the receipts storage bucket either.

drop policy if exists "members can delete transactions" on transactions;
create policy "members can delete transactions" on transactions
  for delete using (is_household_member(household_id));

drop policy if exists "members can delete attachments" on attachments;
create policy "members can delete attachments" on attachments
  for delete using (
    (transaction_id is not null and exists (
      select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id)
    )) or
    (settlement_id is not null and exists (
      select 1 from settlements s where s.id = settlement_id and is_household_member(s.household_id)
    ))
  );

drop policy if exists "household members can delete receipts" on storage.objects;
create policy "household members can delete receipts"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and is_household_member((storage.foldername(name))[1]::uuid)
);

-- Household Bills Tracker — Self-invite & access lifecycle (Phase 6)
-- Paste this whole file into Supabase -> SQL Editor -> New Query -> Run,
-- or apply via scripts/run-sql.mjs.
--
-- Invite flow:
--   1. An existing member adds an unlinked placeholder row to
--      household_members (name only, user_id null) if one doesn't
--      already exist for the person they want to invite.
--   2. They generate a household_invites row for that member_id. The
--      token is shareable as a link: /join/<token>.
--   3. The invitee opens the link (no auth required to preview it),
--      signs up or signs in, and accept_invite() links their new
--      auth.uid() to that household_members row.
--
-- accept_invite() has to be SECURITY DEFINER: at the moment it runs, the
-- caller is NOT yet a household member (that's what it's creating), so
-- the normal is_household_member() RLS policies on household_members
-- would block a plain client-side update.

create table household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  member_id uuid references household_members(id) on delete cascade not null,
  token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_at timestamptz
);

alter table household_invites enable row level security;

create policy "members can view their household's invites" on household_invites
  for select using (is_household_member(household_id));

-- Only lets you invite a member row that isn't linked to a login yet,
-- so an invite can never be used to hijack an already-active member.
create policy "members can create invites for unlinked members" on household_invites
  for insert with check (
    is_household_member(household_id)
    and exists (
      select 1 from household_members hm
      where hm.id = member_id and hm.household_id = household_id and hm.user_id is null
    )
  );

-- Callable by anon: lets the /join/<token> landing page show "You've been
-- invited to join {household}" before the visitor has signed in at all.
-- Deliberately returns nothing beyond household/member name and validity.
create or replace function get_invite_preview(p_token text)
returns table(household_name text, member_name text, valid boolean)
language sql
security definer
stable
as $$
  select
    h.name,
    hm.name,
    (hi.redeemed_at is null and hi.expires_at > now() and hm.user_id is null)
  from household_invites hi
  join households h on h.id = hi.household_id
  join household_members hm on hm.id = hi.member_id
  where hi.token = p_token
$$;

revoke all on function get_invite_preview(text) from public;
grant execute on function get_invite_preview(text) to anon, authenticated;

-- Links the signed-in caller (auth.uid()) to the invite's member row.
-- Race-safe: the "user_id is null" guard on the update means only the
-- first caller to redeem a given invite can ever claim the member row.
create or replace function accept_invite(p_token text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_invite household_invites%rowtype;
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_invite from household_invites where token = p_token for update;

  if not found or v_invite.redeemed_at is not null or v_invite.expires_at <= now() then
    raise exception 'invalid_invite';
  end if;

  update household_members
    set user_id = auth.uid()
    where id = v_invite.member_id and user_id is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'invalid_invite';
  end if;

  update household_invites set redeemed_at = now() where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function accept_invite(text) from public;
grant execute on function accept_invite(text) to authenticated;

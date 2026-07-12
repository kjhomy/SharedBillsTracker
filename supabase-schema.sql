-- Household Bills Tracker — full schema
-- Paste this whole file into Supabase → SQL Editor → New Query → Run.
-- Safe to run once on a fresh project. Re-running will error on
-- "already exists" — that's fine, it means it already worked.

-- ============================================================
-- CORE LAYER (generic — this is what a personal-finance fork
-- would keep; household_id on transactions is nullable so a
-- fork just never sets it)
-- ============================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('expense', 'income')),
  user_id uuid references auth.users(id), -- null = shared system default
  created_at timestamptz default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) not null,
  household_id uuid, -- fk added below, after households exists
  category_id uuid references categories(id),
  amount numeric(10,2) not null,
  payee text,
  period_start date,
  period_end date,
  due_date date,
  paid_status text not null default 'unpaid' check (paid_status in ('unpaid', 'paid')),
  notes text,
  created_at timestamptz default now()
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  settlement_id uuid, -- fk added below, after settlements exists
  file_url text not null,
  uploaded_at timestamptz default now(),
  extracted_amount numeric(10,2),
  extracted_date date,
  extracted_payee text,
  check (transaction_id is not null or settlement_id is not null)
);

-- ============================================================
-- HOUSEHOLD LAYER (adds multi-person splitting on top of Core)
-- ============================================================

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table transactions
  add constraint transactions_household_fk
  foreign key (household_id) references households(id) on delete cascade;

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id), -- null until they self-invite/sign up
  name text not null,
  joined_date date not null default current_date,
  left_date date,
  auth_active boolean not null default true,
  created_at timestamptz default now()
);

create table category_ratios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  category_id uuid references categories(id) not null,
  member_id uuid references household_members(id) not null,
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  effective_from date not null,
  effective_to date, -- null = currently in effect
  created_at timestamptz default now()
);

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade not null,
  member_id uuid references household_members(id) not null,
  share_amount numeric(10,2) not null,
  share_percentage numeric(5,2) not null
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  from_member_id uuid references household_members(id) not null,
  to_member_id uuid references household_members(id) not null,
  amount numeric(10,2) not null,
  date date not null default current_date,
  note text,
  created_at timestamptz default now()
);

alter table attachments
  add constraint attachments_settlement_fk
  foreign key (settlement_id) references settlements(id) on delete cascade;

create table settlement_allocations (
  settlement_id uuid references settlements(id) on delete cascade not null,
  transaction_split_id uuid references transaction_splits(id) on delete cascade not null,
  amount_allocated numeric(10,2) not null,
  primary key (settlement_id, transaction_split_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Rule: a signed-in user can only see/write data for households
-- they're an active member of.
-- ============================================================

create or replace function is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid
      and user_id = auth.uid()
      and auth_active = true
  );
$$ language sql security definer stable;

alter table households enable row level security;
alter table household_members enable row level security;
alter table transactions enable row level security;
alter table attachments enable row level security;
alter table category_ratios enable row level security;
alter table transaction_splits enable row level security;
alter table settlements enable row level security;
alter table settlement_allocations enable row level security;
alter table categories enable row level security;

create policy "members can view their households" on households
  for select using (is_household_member(id));

create policy "members can view household members" on household_members
  for select using (is_household_member(household_id));
create policy "members can manage household members" on household_members
  for insert with check (is_household_member(household_id));
create policy "members can update household members" on household_members
  for update using (is_household_member(household_id));

create policy "members can view transactions" on transactions
  for select using (is_household_member(household_id));
create policy "members can add transactions" on transactions
  for insert with check (is_household_member(household_id));
create policy "members can update transactions" on transactions
  for update using (is_household_member(household_id));

create policy "members can view attachments" on attachments
  for select using (
    (transaction_id is not null and exists (
      select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id)
    )) or
    (settlement_id is not null and exists (
      select 1 from settlements s where s.id = settlement_id and is_household_member(s.household_id)
    ))
  );
create policy "members can add attachments" on attachments
  for insert with check (
    (transaction_id is not null and exists (
      select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id)
    )) or
    (settlement_id is not null and exists (
      select 1 from settlements s where s.id = settlement_id and is_household_member(s.household_id)
    ))
  );

create policy "members can view ratios" on category_ratios
  for select using (is_household_member(household_id));
create policy "members can manage ratios" on category_ratios
  for insert with check (is_household_member(household_id));
create policy "members can update ratios" on category_ratios
  for update using (is_household_member(household_id));

create policy "members can view splits" on transaction_splits
  for select using (exists (
    select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id)
  ));
create policy "members can add splits" on transaction_splits
  for insert with check (exists (
    select 1 from transactions t where t.id = transaction_id and is_household_member(t.household_id)
  ));

create policy "members can view settlements" on settlements
  for select using (is_household_member(household_id));
create policy "members can add settlements" on settlements
  for insert with check (is_household_member(household_id));

create policy "members can view allocations" on settlement_allocations
  for select using (exists (
    select 1 from settlements s where s.id = settlement_id and is_household_member(s.household_id)
  ));
create policy "members can add allocations" on settlement_allocations
  for insert with check (exists (
    select 1 from settlements s where s.id = settlement_id and is_household_member(s.household_id)
  ));

create policy "everyone can view categories" on categories
  for select using (user_id is null or user_id = auth.uid());
create policy "users can add their own categories" on categories
  for insert with check (user_id = auth.uid());

-- ============================================================
-- SEED DATA — default categories, and your own household
-- ============================================================

insert into categories (name, type) values
  ('Rent', 'expense'),
  ('Energy', 'expense'),
  ('Water', 'expense'),
  ('Council Tax', 'expense'),
  ('Internet', 'expense');

-- Create your household manually after this script runs — see README
-- "Step: create your household" for the two-line SQL to run once you
-- know your own auth.users id (visible in Supabase → Authentication).

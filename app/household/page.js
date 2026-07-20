import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import EditMembersForm from './edit-members-form';
import EditRatiosForm from './edit-ratios-form';
import AddMemberForm from './add-member-form';

export default async function HouseholdPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const { data: members } = await supabase
    .from('household_members')
    .select('id, name, joined_date, left_date, user_id')
    .eq('household_id', household.household_id)
    .order('joined_date');

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .eq('type', 'expense')
    .order('name');

  const { data: currentRatios } = await supabase
    .from('category_ratios')
    .select('id, category_id, member_id, percentage, effective_from')
    .eq('household_id', household.household_id)
    .is('effective_to', null);

  const { data: flags } = await supabase.rpc('household_flags', { p_household_id: household.household_id });
  const missingRatioFlags = (flags ?? []).filter((f) => f.flag_type === 'missing_ratio');

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-5xl">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1">Household</h1>
          <p className="text-sm text-ink/60 mb-8">
            Who's in the household, when, and what share of each bill category they cover.
          </p>

          <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink mb-1">Members</h2>
              <p className="text-sm text-ink/60 mb-4">
                Joined/left dates control who a bill's split applies to — changing one recalculates
                every bill's split automatically.
              </p>
              <EditMembersForm members={members ?? []} householdId={household.household_id} />
              <div className="mt-4">
                <AddMemberForm householdId={household.household_id} />
              </div>
            </div>

            <div className="mt-10 lg:mt-0">
              <h2 className="font-display text-xl font-semibold text-ink mb-1">Category ratios</h2>
              <p className="text-sm text-ink/60 mb-4">
                Who pays what share of each category. Changing a ratio keeps the old one on record
                (so past bills still use what was in effect then) and recalculates every bill's split.
              </p>
              <EditRatiosForm
                categories={categories ?? []}
                members={members ?? []}
                currentRatios={currentRatios ?? []}
                missingRatioFlags={missingRatioFlags}
                householdId={household.household_id}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

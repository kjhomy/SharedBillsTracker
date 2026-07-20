import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import EditMembersForm from './edit-members-form';
import EditRatiosForm from './edit-ratios-form';

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
    .select('id, name, joined_date, left_date')
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
    <div className="min-h-screen">
      <NavHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="font-display text-2xl font-semibold text-ink mb-2">Household members</h1>
          <p className="text-sm text-ink/60 mb-6">
            Joined/left dates control who a bill's split applies to. Changing a date recalculates
            every bill's split automatically.
          </p>
          <EditMembersForm members={members ?? []} householdId={household.household_id} />

          <h2 className="font-display text-xl font-semibold text-ink mt-10 mb-2">Category ratios</h2>
          <p className="text-sm text-ink/60 mb-6">
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
  );
}

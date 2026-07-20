import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import AddBillForm from './add-bill-form';
import NavHeader from '../../nav-header';

export default async function NewBillPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .eq('type', 'expense')
    .is('archived_at', null)
    .order('name');

  const { data: members } = await supabase
    .from('household_members')
    .select('id, name')
    .eq('household_id', household.household_id);

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-lg">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1">Add a bill</h1>
          <p className="text-sm text-ink/70 mb-6">
            Log a bill so it's tracked for the household. You can attach a receipt now or add it later.
          </p>
          <div className="card">
            <AddBillForm
              categories={categories ?? []}
              members={members ?? []}
              householdId={household.household_id}
              userId={user.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

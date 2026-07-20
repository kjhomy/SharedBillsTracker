import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import AddRecurringForm from './add-recurring-form';
import NavHeader from '../../../nav-header';

export default async function NewRecurringBillPage() {
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
    .order('name');

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-lg">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1">Add a recurring bill</h1>
          <p className="text-sm text-ink/70 mb-6">
            For fixed-amount bills due on the same day every month, like rent. A new bill is
            generated automatically each month — variable-amount bills (energy, water) should
            still be logged manually.
          </p>
          <div className="card">
            <AddRecurringForm
              categories={categories ?? []}
              householdId={household.household_id}
              userId={user.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

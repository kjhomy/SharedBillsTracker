import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import AddRecurringForm from './add-recurring-form';

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
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-md mx-auto">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Add a recurring bill</h1>
        <p className="text-sm text-ink/70 mb-6">
          For fixed-amount bills due on the same day every month, like rent. A new bill is
          generated automatically each month — variable-amount bills (energy, water) should
          still be logged manually.
        </p>
        <AddRecurringForm
          categories={categories ?? []}
          householdId={household.household_id}
          userId={user.id}
        />
      </div>
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import AddBillForm from './add-bill-form';

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
    .order('name');

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-md mx-auto">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Add a bill</h1>
        <p className="text-sm text-ink/70 mb-6">
          Log a bill so it's tracked for the household. You can attach a receipt now or add it later.
        </p>
        <AddBillForm
          categories={categories ?? []}
          householdId={household.household_id}
          userId={user.id}
        />
      </div>
    </div>
  );
}

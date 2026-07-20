import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../../nav-header';
import DeleteRecurringButton from './delete-recurring-button';

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function nextDueDate(dueDay) {
  const now = new Date();
  const clampToMonth = (year, month) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(dueDay, lastDay));
  };
  const thisMonth = clampToMonth(now.getFullYear(), now.getMonth());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return thisMonth >= today ? thisMonth : clampToMonth(now.getFullYear(), now.getMonth() + 1);
}

export default async function RecurringBillsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const { data: recurringBills } = await supabase
    .from('recurring_bills')
    .select('id, payee, amount, due_day_of_month, end_date, active, categories(name)')
    .eq('household_id', household.household_id)
    .order('due_day_of_month');

  const { data: flags } = await supabase.rpc('household_flags', { p_household_id: household.household_id });
  const unloggedIds = new Set(
    (flags ?? []).filter((f) => f.flag_type === 'unlogged_recurring').map((f) => f.recurring_bill_id)
  );

  return (
    <div className="min-h-screen">
      <NavHeader />
      <div className="px-6 py-10">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-semibold text-ink">Recurring bills</h1>
          <Link
            href="/bills/recurring/new"
            className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium"
          >
            Add recurring
          </Link>
        </div>

        {(!recurringBills || recurringBills.length === 0) ? (
          <div className="border border-line rounded-xl p-4 bg-white">
            <p className="text-sm text-ink/70">
              No recurring bills set up yet. Rent, subscriptions, or anything else with a fixed
              amount due on the same day each month can be automated here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {recurringBills.map((bill) => (
              <li key={bill.id} className="border border-line rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {bill.categories?.name ?? 'Uncategorised'}
                      {bill.payee ? ` — ${bill.payee}` : ''}
                    </p>
                    <p className="text-xs text-ink/60 mt-0.5">
                      Due on the {bill.due_day_of_month}
                      {bill.end_date ? ` · ends ${formatDate(new Date(bill.end_date))}` : ' · perpetual'}
                    </p>
                    {bill.active && (
                      <p className="text-xs text-ink/60">
                        Next: {formatDate(nextDueDate(bill.due_day_of_month))}
                      </p>
                    )}
                    {unloggedIds.has(bill.id) && (
                      <p className="text-xs text-amber mt-0.5">Not yet logged this month</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-ink whitespace-nowrap">
                    {formatAmount(bill.amount)}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  {!bill.active ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-line text-ink/70">
                      paused
                    </span>
                  ) : <span />}
                  <DeleteRecurringButton
                    id={bill.id}
                    label={bill.categories?.name ?? bill.payee}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}

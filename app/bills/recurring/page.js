import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../../nav-header';
import DeleteRecurringButton from './delete-recurring-button';
import MarkPaidControl from '../mark-paid-control';
import { categoryStyle } from '@/lib/style';

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

  const { data: members } = await supabase
    .from('household_members')
    .select('id, name')
    .eq('household_id', household.household_id);

  const now = new Date();
  // Build the date string from local y/m/d directly — toISOString() converts
  // to UTC first, which rolls back a day for any timezone ahead of UTC
  // (e.g. BST) right at local midnight.
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data: currentTransactions } = await supabase
    .from('transactions')
    .select('id, recurring_bill_id, paid_status, paid_by:paid_by_member_id(name)')
    .eq('household_id', household.household_id)
    .eq('period_start', monthStart)
    .not('recurring_bill_id', 'is', null);

  const currentTxByRecurringId = new Map((currentTransactions ?? []).map((t) => [t.recurring_bill_id, t]));

  const { data: flags } = await supabase.rpc('household_flags', { p_household_id: household.household_id });
  const unloggedIds = new Set(
    (flags ?? []).filter((f) => f.flag_type === 'unlogged_recurring').map((f) => f.recurring_bill_id)
  );

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3 mb-8">
            <h1 className="font-display text-3xl font-semibold text-ink">Recurring bills</h1>
            <Link href="/bills/recurring/new" className="btn-primary">
              Add recurring
            </Link>
          </div>

          {(!recurringBills || recurringBills.length === 0) ? (
            <div className="card">
              <p className="text-sm text-ink/70">
                No recurring bills set up yet. Rent, subscriptions, or anything else with a fixed
                amount due on the same day each month can be automated here.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recurringBills.map((bill) => {
                const style = categoryStyle(bill.categories?.name);
                const currentTx = currentTxByRecurringId.get(bill.id);
                return (
                  <li key={bill.id} className="card-interactive flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${style.bg}`}>
                          {style.emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate">
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
                      </div>
                      <p className="text-sm font-semibold text-ink whitespace-nowrap">
                        {formatAmount(bill.amount)}
                      </p>
                    </div>
                    {currentTx && (
                      <div className="mt-3 pt-3 border-t border-line/70">
                        <p className="text-xs text-ink/50 mb-1.5">This month</p>
                        <MarkPaidControl
                          billId={currentTx.id}
                          paidStatus={currentTx.paid_status}
                          paidByName={currentTx.paid_by?.name}
                          members={members ?? []}
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/70">
                      {!bill.active ? (
                        <span className="pill bg-line text-ink/70">paused</span>
                      ) : <span />}
                      <DeleteRecurringButton
                        id={bill.id}
                        label={bill.categories?.name ?? bill.payee}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

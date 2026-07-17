import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import SetPasswordForm from './set-password-form';
import NavHeader from './nav-header';
import { simplifyDebts } from '@/lib/debtSimplification';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    return (
      <div className="min-h-screen">
        <NavHeader />
        <div className="px-6 py-10">
          <p className="text-sm text-ink/70">
            Signed in as {user.email}, but no household is set up for this account yet.
          </p>
        </div>
      </div>
    );
  }

  const [
    { data: members },
    { data: categories },
    { data: balances },
    { data: netBalances },
    { data: unpaidBills },
  ] = await Promise.all([
    supabase.from('household_members').select('id, name').eq('household_id', household.household_id),
    supabase.from('categories').select('id, name'),
    supabase.rpc('household_balances', { p_household_id: household.household_id }),
    supabase.rpc('net_balances', { p_household_id: household.household_id }),
    supabase
      .from('transactions')
      .select('id, payee, amount, due_date, categories(name)')
      .eq('household_id', household.household_id)
      .eq('paid_status', 'unpaid')
      .order('due_date'),
  ]);

  const memberName = (id) => members?.find((m) => m.id === id)?.name ?? 'Unknown';
  const categoryName = (id) => categories?.find((c) => c.id === id)?.name ?? 'Uncategorised';
  const owesVerb = (debtorId) => (debtorId === household.id ? 'owe' : 'owes');

  const suggestions = simplifyDebts(netBalances ?? []);

  const grouped = new Map(); // "debtor|creditor" -> [{ category_id, amount }]
  for (const b of balances ?? []) {
    const key = `${b.debtor_id}|${b.creditor_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(b);
  }

  // Total owed to each external creditor — grouped by category + payee,
  // regardless of who in the household eventually pays it. This is
  // separate from (and exists whether or not there's) any inter-member
  // debt, since nothing here has been paid by anyone yet.
  const owedToCreditors = new Map(); // "category|payee" -> { categoryName, payee, amount }
  for (const bill of unpaidBills ?? []) {
    const catName = bill.categories?.name ?? 'Uncategorised';
    const payee = bill.payee ?? 'Unknown';
    const key = `${catName}|${payee}`;
    if (!owedToCreditors.has(key)) {
      owedToCreditors.set(key, { categoryName: catName, payee, amount: 0 });
    }
    owedToCreditors.get(key).amount += Number(bill.amount);
  }

  return (
    <div className="min-h-screen">
      <NavHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Dashboard</h1>
          <p className="text-sm text-ink/60 mb-6">Signed in as {user.email}</p>

          <h2 className="text-sm font-medium text-ink/70 mb-2">Owed to creditors</h2>
          {owedToCreditors.size === 0 ? (
            <div className="border border-line rounded-xl p-4 bg-white mb-6">
              <p className="text-sm text-ink/70">Nothing outstanding.</p>
            </div>
          ) : (
            <ul className="space-y-2 mb-6">
              {[...owedToCreditors.values()].map((row) => (
                <li key={`${row.categoryName}|${row.payee}`} className="border border-line rounded-xl p-4 bg-white flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">
                    {row.categoryName} — {row.payee}
                  </p>
                  <p className="text-sm font-semibold text-ink">{formatAmount(row.amount)}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-ink/70">Between household members</h2>
            {suggestions.length > 0 && (
              <Link href="/settle" className="text-xs text-ink/60 underline">
                Settle up
              </Link>
            )}
          </div>
          {suggestions.length === 0 ? (
            <div className="border border-line rounded-xl p-4 bg-white mb-6">
              <p className="text-sm text-ink/70">Nobody owes anybody — no payments recorded yet.</p>
            </div>
          ) : (
            <ul className="space-y-2 mb-6">
              {suggestions.map((s, i) => (
                <li key={i} className="border border-line rounded-xl p-4 bg-white">
                  <p className="text-sm font-medium text-ink">
                    {memberName(s.from_member_id)} {owesVerb(s.from_member_id)} {memberName(s.to_member_id)} {formatAmount(s.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {grouped.size > 0 && (
            <>
              <h2 className="text-sm font-medium text-ink/70 mb-2">Between members, by category</h2>
              <ul className="space-y-3 mb-6">
                {[...grouped.entries()].map(([key, rows]) => {
                  const [debtorId, creditorId] = key.split('|');
                  return (
                    <li key={key} className="border border-line rounded-xl p-4 bg-white">
                      <p className="text-sm font-medium text-ink mb-2">
                        {memberName(debtorId)} {owesVerb(debtorId)} {memberName(creditorId)}
                      </p>
                      <ul className="space-y-1">
                        {rows.map((r) => (
                          <li key={r.category_id} className="flex items-center justify-between text-sm">
                            <span className="text-ink/70">{categoryName(r.category_id)}</span>
                            <span className="text-ink">{formatAmount(r.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h2 className="text-sm font-medium text-ink/70 mb-2">Unpaid bills (detail)</h2>
          {(unpaidBills ?? []).length === 0 ? (
            <div className="border border-line rounded-xl p-4 bg-white mb-6">
              <p className="text-sm text-ink/70">Nothing outstanding.</p>
            </div>
          ) : (
            <ul className="space-y-2 mb-6">
              {unpaidBills.map((bill) => (
                <li key={bill.id} className="border border-line rounded-xl p-4 bg-white flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {bill.categories?.name ?? 'Uncategorised'}{bill.payee ? ` — ${bill.payee}` : ''}
                    </p>
                    {bill.due_date && <p className="text-xs text-ink/60">Due {formatDate(bill.due_date)}</p>}
                  </div>
                  <p className="text-sm font-semibold text-ink">{formatAmount(bill.amount)}</p>
                </li>
              ))}
            </ul>
          )}

          <h2 className="text-sm font-medium text-ink/70 mb-2">Recent activity</h2>
          <div className="border border-line rounded-xl p-4 bg-white mb-6">
            <p className="text-sm text-ink/70">Nothing yet — this fills in once settlements exist.</p>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/bills"
              className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium"
            >
              View bills
            </Link>
          </div>
          <SetPasswordForm />
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import SetPasswordForm from './set-password-form';
import NavHeader from './nav-header';
import Avatar from './avatar';
import { categoryStyle } from '@/lib/style';
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
      <div className="page-shell">
        <NavHeader />
        <div className="page-container">
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
    { data: activity },
    { data: flags },
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
    supabase.rpc('settlement_activity', { p_household_id: household.household_id }),
    supabase.rpc('household_flags', { p_household_id: household.household_id }),
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

  const activityLines = (activity ?? []).slice(0, 10).map((a) => {
    const fromName = memberName(a.from_member_id);
    const toName = memberName(a.to_member_id);
    const text = Number(a.category_count) === 1
      ? `${fromName} settled ${a.category_name ?? 'Uncategorised'} with ${toName} — ${formatAmount(a.amount)}`
      : `${fromName} settled up with ${toName} — ${formatAmount(a.amount)} across ${a.category_count} categories`;
    return { id: a.settlement_id, text, date: a.date };
  });

  const flagCounts = { missing_ratio: 0, unlogged_recurring: 0, missing_attachment: 0 };
  for (const f of flags ?? []) flagCounts[f.flag_type] = (flagCounts[f.flag_type] ?? 0) + 1;
  const attentionItems = [
    flagCounts.missing_ratio > 0 && {
      key: 'missing_ratio',
      text: `${flagCounts.missing_ratio} ratio gap${flagCounts.missing_ratio === 1 ? '' : 's'} — a bill could split incorrectly`,
      href: '/household',
    },
    flagCounts.unlogged_recurring > 0 && {
      key: 'unlogged_recurring',
      text: `${flagCounts.unlogged_recurring} recurring bill${flagCounts.unlogged_recurring === 1 ? '' : 's'} not yet logged this month`,
      href: '/bills/recurring',
    },
    flagCounts.missing_attachment > 0 && {
      key: 'missing_attachment',
      text: `${flagCounts.missing_attachment} bill${flagCounts.missing_attachment === 1 ? '' : 's'} missing a receipt`,
      href: '/bills',
    },
  ].filter(Boolean);

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink mb-1">Dashboard</h1>
              <p className="text-sm text-ink/60">Signed in as {user.email}</p>
            </div>
            <Link href="/bills/new" className="btn-primary hidden sm:inline-flex">
              Add bill
            </Link>
          </div>

          {attentionItems.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-amber mb-2">Needs attention</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {attentionItems.map((item) => (
                  <li key={item.key} className="rounded-2xl border border-amber/30 bg-amber/10 p-4">
                    <Link href={item.href} className="text-sm text-ink underline decoration-amber/50 underline-offset-2 hover:decoration-amber">
                      {item.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="text-sm font-medium text-ink/70 mb-3">Owed to creditors</h2>
          {owedToCreditors.size === 0 ? (
            <div className="card mb-8">
              <p className="text-sm text-ink/70">Nothing outstanding.</p>
            </div>
          ) : (
            <ul className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
              {[...owedToCreditors.values()].map((row) => {
                const style = categoryStyle(row.categoryName);
                return (
                  <li key={`${row.categoryName}|${row.payee}`} className={`flex min-h-[128px] flex-col justify-between rounded-3xl p-4 sm:p-5 ${style.bg}`}>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/50 text-lg">
                      {style.emoji}
                    </span>
                    <div className="mt-4">
                      <p className={`text-lg font-semibold ${style.text}`}>{formatAmount(row.amount)}</p>
                      <p className="mt-0.5 truncate text-xs text-ink/60">{row.categoryName} · {row.payee}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-8">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink/70">Between household members</h2>
                {suggestions.length > 0 && (
                  <Link href="/settle" className="btn-ghost">
                    Settle up
                  </Link>
                )}
              </div>
              {suggestions.length === 0 ? (
                <div className="card mb-8">
                  <p className="text-sm text-ink/70">Nobody owes anybody — no payments recorded yet.</p>
                </div>
              ) : (
                <ul className="space-y-2 mb-8">
                  {suggestions.map((s, i) => (
                    <li key={i} className="card flex items-center gap-3">
                      <Avatar name={memberName(s.from_member_id)} />
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
                  <ul className="space-y-3 mb-8">
                    {[...grouped.entries()].map(([key, rows]) => {
                      const [debtorId, creditorId] = key.split('|');
                      return (
                        <li key={key} className="card">
                          <div className="mb-3 flex items-center gap-2">
                            <Avatar name={memberName(debtorId)} size="sm" />
                            <p className="text-sm font-medium text-ink">
                              {memberName(debtorId)} {owesVerb(debtorId)} {memberName(creditorId)}
                            </p>
                          </div>
                          <ul className="space-y-1.5">
                            {rows.map((r) => (
                              <li key={r.category_id} className="flex items-center justify-between text-sm">
                                <span className="text-ink/70">{categoryName(r.category_id)}</span>
                                <span className="text-ink font-medium">{formatAmount(r.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            <div>
              <h2 className="text-sm font-medium text-ink/70 mb-2">Unpaid bills (detail)</h2>
              {(unpaidBills ?? []).length === 0 ? (
                <div className="card mb-8">
                  <p className="text-sm text-ink/70">Nothing outstanding.</p>
                </div>
              ) : (
                <ul className="space-y-2 mb-8">
                  {unpaidBills.map((bill) => {
                    const style = categoryStyle(bill.categories?.name);
                    return (
                      <li key={bill.id} className="card flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${style.bg}`}>
                            {style.emoji}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">
                              {bill.categories?.name ?? 'Uncategorised'}{bill.payee ? ` — ${bill.payee}` : ''}
                            </p>
                            {bill.due_date && <p className="text-xs text-ink/60">Due {formatDate(bill.due_date)}</p>}
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-ink whitespace-nowrap">{formatAmount(bill.amount)}</p>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink/70">Recent activity</h2>
                <Link href="/ledger" className="btn-ghost">
                  Full ledger
                </Link>
              </div>
              {activityLines.length === 0 ? (
                <div className="card mb-8">
                  <p className="text-sm text-ink/70">Nothing yet — this fills in once settlements exist.</p>
                </div>
              ) : (
                <ul className="space-y-2 mb-8">
                  {activityLines.map((line) => (
                    <li key={line.id} className="card">
                      <p className="text-sm text-ink">{line.text}</p>
                      <p className="text-xs text-ink/60 mt-0.5">{formatDate(line.date)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <Link href="/bills" className="btn-secondary">
              View bills
            </Link>
            <Link href="/bills/new" className="btn-primary sm:hidden">
              Add bill
            </Link>
          </div>
          <SetPasswordForm />
        </div>
      </div>
    </div>
  );
}

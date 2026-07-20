import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../../nav-header';
import Avatar from '../../avatar';
import InviteMemberButton from '../invite-member-button';
import { categoryStyle } from '@/lib/style';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function MemberProfilePage({ params }) {
  const { memberId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const { data: member } = await supabase
    .from('household_members')
    .select('id, name, joined_date, left_date, user_id')
    .eq('id', memberId)
    .eq('household_id', household.household_id)
    .single();

  if (!member) {
    redirect('/household');
  }

  const [
    { data: members },
    { data: ratios },
    { data: balances },
    { data: ledgerRows },
  ] = await Promise.all([
    supabase.from('household_members').select('id, name').eq('household_id', household.household_id),
    supabase
      .from('category_ratios')
      .select('percentage, effective_from, categories(name)')
      .eq('household_id', household.household_id)
      .eq('member_id', memberId)
      .is('effective_to', null),
    supabase.rpc('household_balances', { p_household_id: household.household_id }),
    supabase.rpc('household_ledger', { p_household_id: household.household_id }),
  ]);

  const memberName = (id) => members?.find((m) => m.id === id)?.name ?? 'Unknown';
  const isYou = member.id === household.id;

  const sortedRatios = (ratios ?? [])
    .map((r) => ({ name: r.categories?.name ?? 'Uncategorised', percentage: r.percentage }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pairs involving this member, aggregated by counterpart (across categories)
  const pairTotals = new Map(); // counterpartId -> { theyOweMe: bool, amount }
  for (const b of balances ?? []) {
    if (b.debtor_id !== memberId && b.creditor_id !== memberId) continue;
    const counterpartId = b.debtor_id === memberId ? b.creditor_id : b.debtor_id;
    const memberOwesCounterpart = b.debtor_id === memberId;
    const key = `${counterpartId}|${memberOwesCounterpart}`;
    pairTotals.set(key, {
      counterpartId,
      memberOwesCounterpart,
      amount: (pairTotals.get(key)?.amount ?? 0) + Number(b.amount),
    });
  }

  const activity = (ledgerRows ?? [])
    .filter((e) =>
      e.entry_type === 'bill'
        ? e.paid_by_member_id === memberId || (e.splits ?? []).some((s) => s.member_id === memberId)
        : e.from_member_id === memberId || e.to_member_id === memberId
    )
    .slice(0, 10);

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-3xl">
          <Link href="/household" className="btn-ghost inline-block mb-4">
            ← Household
          </Link>

          <div className="card mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={member.name} size="lg" />
              <div>
                <h1 className="font-display text-2xl font-semibold text-ink">
                  {member.name}
                  {isYou && <span className="text-sm font-normal text-ink/50"> (you)</span>}
                </h1>
                <p className="text-sm text-ink/60">
                  Joined {formatDate(member.joined_date)}
                  {member.left_date ? ` · Left ${formatDate(member.left_date)}` : ''}
                </p>
              </div>
            </div>
            {!member.user_id && <span className="pill bg-amber/15 text-amber shrink-0">No login yet</span>}
          </div>

          {!member.user_id && (
            <div className="mb-8">
              <InviteMemberButton member={member} householdId={household.household_id} />
            </div>
          )}

          <section className="mb-8">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Balance</h2>
            {pairTotals.size === 0 ? (
              <div className="card">
                <p className="text-sm text-ink/70">All settled up.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {[...pairTotals.values()].map((p) => {
                  const debtorId = p.memberOwesCounterpart ? memberId : p.counterpartId;
                  const creditorId = p.memberOwesCounterpart ? p.counterpartId : memberId;
                  return (
                    <li key={`${p.counterpartId}|${p.memberOwesCounterpart}`} className="card flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={memberName(debtorId)} size="sm" />
                        <p className="text-sm text-ink">
                          {p.memberOwesCounterpart ? member.name : memberName(p.counterpartId)}
                          {' '}{debtorId === household.id ? 'owe' : 'owes'}{' '}
                          {p.memberOwesCounterpart ? memberName(p.counterpartId) : member.name}
                          {' '}<span className="font-medium">{formatAmount(p.amount)}</span>
                        </p>
                      </div>
                      <Link href={`/settle?debtor=${debtorId}&creditor=${creditorId}`} className="btn-ghost shrink-0">
                        Settle
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mb-8">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Category ratios</h2>
            {sortedRatios.length === 0 ? (
              <div className="card">
                <p className="text-sm text-ink/70">No ratios set for {member.name} yet.</p>
              </div>
            ) : (
              <ul className="card divide-y divide-line/70">
                {sortedRatios.map((r) => (
                  <li key={r.name} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 text-sm">
                    <span className="text-ink/70">{r.name}</span>
                    <span className="text-ink font-medium">{r.percentage}%</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/household" className="btn-ghost inline-block mt-2">
              Edit ratios
            </Link>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-ink">Recent activity</h2>
              <Link href="/ledger" className="btn-ghost">
                Full ledger
              </Link>
            </div>
            {activity.length === 0 ? (
              <div className="card">
                <p className="text-sm text-ink/70">Nothing yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {activity.map((entry) =>
                  entry.entry_type === 'bill' ? (
                    <li key={`bill-${entry.entry_id}`} className="card !p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${categoryStyle(entry.category_name).bg}`}>
                          {categoryStyle(entry.category_name).emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">
                            {entry.category_name}{entry.payee ? ` — ${entry.payee}` : ''}
                          </p>
                          <p className="text-xs text-ink/60">{formatDate(entry.event_date)}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-ink whitespace-nowrap">{formatAmount(entry.amount)}</span>
                    </li>
                  ) : (
                    <li key={`settlement-${entry.entry_id}`} className="card !p-3.5 bg-accent-mint-bg/40 flex items-center justify-between gap-3">
                      <p className="text-sm text-ink truncate">
                        {memberName(entry.from_member_id)} → {memberName(entry.to_member_id)}
                      </p>
                      <span className="text-sm font-medium text-accent-mint-text whitespace-nowrap">{formatAmount(entry.amount)}</span>
                    </li>
                  )
                )}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

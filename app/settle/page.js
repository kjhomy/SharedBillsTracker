import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import SettleForm from './settle-form';
import Avatar from '../avatar';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function SettlePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const [
    { data: members },
    { data: categories },
    { data: unsettled },
    { data: settlements },
  ] = await Promise.all([
    supabase.from('household_members').select('id, name').eq('household_id', household.household_id),
    supabase.from('categories').select('id, name'),
    supabase.rpc('unsettled_splits', { p_household_id: household.household_id }),
    supabase
      .from('settlements')
      .select('id, from_member_id, to_member_id, amount, date, attachments(id, file_url)')
      .eq('household_id', household.household_id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  const memberName = (id) => members?.find((m) => m.id === id)?.name ?? 'Unknown';

  const recentSettlements = await Promise.all(
    (settlements ?? []).map(async (s) => {
      const attachment = s.attachments?.[0];
      let receiptUrl = null;

      if (attachment) {
        const { data: signed } = await supabase.storage
          .from('receipts')
          .createSignedUrl(attachment.file_url, 60 * 60);
        receiptUrl = signed?.signedUrl ?? null;
      }

      return { ...s, receiptUrl };
    })
  );

  // pair "debtor|creditor" -> category_id -> [{ transaction_split_id, payee, remaining_amount }]
  const pairs = new Map();
  for (const row of unsettled ?? []) {
    const pairKey = `${row.debtor_id}|${row.creditor_id}`;
    if (!pairs.has(pairKey)) pairs.set(pairKey, new Map());
    const byCategory = pairs.get(pairKey);
    if (!byCategory.has(row.category_id)) byCategory.set(row.category_id, []);
    byCategory.get(row.category_id).push(row);
  }

  const pairsData = [...pairs.entries()].map(([pairKey, byCategory]) => {
    const [debtorId, creditorId] = pairKey.split('|');
    const categoriesData = [...byCategory.entries()].map(([categoryId, splits]) => ({
      categoryId,
      categoryName: categories?.find((c) => c.id === categoryId)?.name ?? 'Uncategorised',
      splits,
      total: splits.reduce((sum, s) => sum + Number(s.remaining_amount), 0),
    }));
    return {
      debtorId,
      creditorId,
      debtorName: members?.find((m) => m.id === debtorId)?.name ?? 'Unknown',
      creditorName: members?.find((m) => m.id === creditorId)?.name ?? 'Unknown',
      categories: categoriesData,
    };
  });

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-5xl">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1">Settle up</h1>
          <p className="text-sm text-ink/60 mb-8">
            Pick categories to settle in full, or select everything for a bulk payment. Only bills
            marked "paid" by someone show up here — that's what creates a debt to settle.
          </p>

          {pairsData.length === 0 ? (
            <div className="card">
              <p className="text-sm text-ink/70">Nothing to settle right now.</p>
            </div>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {pairsData.map((pair) => (
                <SettleForm
                  key={`${pair.debtorId}|${pair.creditorId}`}
                  householdId={household.household_id}
                  currentMemberId={household.id}
                  pair={pair}
                />
              ))}
            </ul>
          )}

          <h2 className="text-sm font-medium text-ink/70 mt-10 mb-3">Recent settlements</h2>
          {recentSettlements.length === 0 ? (
            <div className="card">
              <p className="text-sm text-ink/70">No settlements recorded yet.</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {recentSettlements.map((s) => (
                <li key={s.id} className="card flex items-center justify-between gap-3 !p-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex -space-x-2">
                      <Avatar name={memberName(s.from_member_id)} size="sm" className="ring-2 ring-white" />
                      <Avatar name={memberName(s.to_member_id)} size="sm" className="ring-2 ring-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">
                        {memberName(s.from_member_id)} → {memberName(s.to_member_id)}
                      </p>
                      <p className="text-xs text-ink/60">{formatDate(s.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-ink whitespace-nowrap">{formatAmount(s.amount)}</span>
                    {s.receiptUrl && (
                      <a
                        href={s.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost"
                      >
                        Proof
                      </a>
                    )}
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

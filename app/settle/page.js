import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import SettleForm from './settle-form';

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
  ] = await Promise.all([
    supabase.from('household_members').select('id, name').eq('household_id', household.household_id),
    supabase.from('categories').select('id, name'),
    supabase.rpc('unsettled_splits', { p_household_id: household.household_id }),
  ]);

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
    <div className="min-h-screen">
      <NavHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="font-display text-2xl font-semibold text-ink mb-1">Settle up</h1>
          <p className="text-sm text-ink/60 mb-6">
            Pick categories to settle in full, or select everything for a bulk payment. Only bills
            marked "paid" by someone show up here — that's what creates a debt to settle.
          </p>

          {pairsData.length === 0 ? (
            <div className="border border-line rounded-xl p-4 bg-white">
              <p className="text-sm text-ink/70">Nothing to settle right now.</p>
            </div>
          ) : (
            <ul className="space-y-4">
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
        </div>
      </div>
    </div>
  );
}

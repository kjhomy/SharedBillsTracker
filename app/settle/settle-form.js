'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

export default function SettleForm({ householdId, currentMemberId, pair }) {
  const router = useRouter();
  const [checked, setChecked] = useState({}); // category_id -> boolean
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  const allChecked = pair.categories.every((c) => checked[c.categoryId]);
  const selectedTotal = pair.categories
    .filter((c) => checked[c.categoryId])
    .reduce((sum, c) => sum + c.total, 0);
  const selectedSplitIds = pair.categories
    .filter((c) => checked[c.categoryId])
    .flatMap((c) => c.splits.map((s) => s.transaction_split_id));

  function toggleCategory(categoryId) {
    setChecked((c) => ({ ...c, [categoryId]: !c[categoryId] }));
  }

  function toggleAll() {
    const next = !allChecked;
    const nextChecked = {};
    for (const c of pair.categories) nextChecked[c.categoryId] = next;
    setChecked(nextChecked);
  }

  async function handleSettle() {
    if (selectedSplitIds.length === 0) return;

    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.rpc('record_settlement', {
      p_household_id: householdId,
      p_from_member_id: pair.debtorId,
      p_to_member_id: pair.creditorId,
      p_transaction_split_ids: selectedSplitIds,
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('idle');
    setChecked({});
    router.refresh();
  }

  return (
    <li className="border border-line rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          {pair.debtorName} {pair.debtorId === currentMemberId ? 'owe' : 'owes'} {pair.creditorName}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          Select all
        </label>
      </div>

      <ul className="space-y-1">
        {pair.categories.map((c) => (
          <li key={c.categoryId} className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-ink/80">
              <input
                type="checkbox"
                checked={Boolean(checked[c.categoryId])}
                onChange={() => toggleCategory(c.categoryId)}
              />
              {c.categoryName}
            </label>
            <span className="text-ink">{formatAmount(c.total)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-2 border-t border-line">
        <span className="text-sm text-ink/70">Selected</span>
        <span className="text-sm font-semibold text-ink">{formatAmount(selectedTotal)}</span>
      </div>

      <button
        type="button"
        onClick={handleSettle}
        disabled={selectedSplitIds.length === 0 || status === 'saving'}
        className="w-full bg-ink text-paper rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
      >
        {status === 'saving' ? 'Settling…' : 'Settle selected'}
      </button>

      {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
    </li>
  );
}

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
  const [file, setFile] = useState(null);
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

    const { data: settlementId, error } = await supabase.rpc('record_settlement', {
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

    if (file) {
      const path = `${householdId}/${settlementId}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, file);

      if (uploadError) {
        setStatus('error');
        setErrorMessage(`Settlement saved, but the attachment upload failed: ${uploadError.message}`);
        return;
      }

      const { error: attachmentError } = await supabase
        .from('attachments')
        .insert({ settlement_id: settlementId, file_url: path });

      if (attachmentError) {
        setStatus('error');
        setErrorMessage(`Settlement saved, but the attachment couldn't be linked: ${attachmentError.message}`);
        return;
      }
    }

    setStatus('idle');
    setChecked({});
    setFile(null);
    router.refresh();
  }

  return (
    <li className="card space-y-3">
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

      <div>
        <label className="block text-xs text-ink/60 mb-1">Proof of payment (optional)</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
      </div>

      <button
        type="button"
        onClick={handleSettle}
        disabled={selectedSplitIds.length === 0 || status === 'saving'}
        className="btn-primary w-full"
      >
        {status === 'saving' ? 'Settling…' : 'Settle selected'}
      </button>

      {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
    </li>
  );
}

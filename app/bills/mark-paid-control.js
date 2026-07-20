'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function MarkPaidControl({ billId, paidStatus, paidByName, members }) {
  const router = useRouter();
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  if (paidStatus === 'paid') {
    return <span className="text-xs text-ink/60">Paid by {paidByName ?? 'unknown'}</span>;
  }

  async function handleSelect(e) {
    const memberId = e.target.value;
    if (!memberId) return;

    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase
      .from('transactions')
      .update({ paid_status: 'paid', paid_by_member_id: memberId })
      .eq('id', billId);

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <select
        defaultValue=""
        onChange={handleSelect}
        disabled={status === 'saving'}
        className="text-xs border border-line rounded-lg px-2.5 py-1.5 bg-white text-ink/70 transition hover:border-ink/30 focus:outline-none focus:ring-2 focus:ring-ink/10"
      >
        <option value="" disabled>Mark as paid by…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {status === 'error' && <p className="text-xs text-red-700 mt-1">{errorMessage}</p>}
    </div>
  );
}

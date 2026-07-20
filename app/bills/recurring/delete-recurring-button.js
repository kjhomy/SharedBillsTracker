'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DeleteRecurringButton({ id, label }) {
  const router = useRouter();
  const [status, setStatus] = useState('idle'); // idle | deleting | error

  async function handleDelete() {
    if (!confirm(`Stop this recurring bill${label ? ` (${label})` : ''}? Bills already logged from it are kept.`)) {
      return;
    }

    setStatus('deleting');
    const supabase = createClient();
    const { error } = await supabase.from('recurring_bills').delete().eq('id', id);

    if (error) {
      setStatus('error');
      alert(`Couldn't delete: ${error.message}`);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={status === 'deleting'}
      className="text-xs font-medium text-red-700/80 underline decoration-red-700/30 underline-offset-2 transition hover:text-red-700 disabled:opacity-60"
    >
      {status === 'deleting' ? 'Deleting…' : 'Delete'}
    </button>
  );
}

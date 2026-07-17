'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DeleteBillButton({ id, label, attachmentPath }) {
  const router = useRouter();
  const [status, setStatus] = useState('idle'); // idle | deleting | error

  async function handleDelete() {
    if (!confirm(`Delete this bill${label ? ` (${label})` : ''}? This can't be undone.`)) {
      return;
    }

    setStatus('deleting');
    const supabase = createClient();

    if (attachmentPath) {
      const { error: storageError } = await supabase.storage.from('receipts').remove([attachmentPath]);
      if (storageError) {
        setStatus('error');
        alert(`Couldn't delete: ${storageError.message}`);
        return;
      }
    }

    const { error } = await supabase.from('transactions').delete().eq('id', id);

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
      className="text-xs text-red-700 underline disabled:opacity-60"
    >
      {status === 'deleting' ? 'Deleting…' : 'Delete'}
    </button>
  );
}

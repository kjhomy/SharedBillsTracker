'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AddMemberForm({ householdId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.from('household_members').insert({
      household_id: householdId,
      name: name.trim(),
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setName('');
    setStatus('idle');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-ink/60 underline">
        Add a member
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line rounded-xl p-4 bg-white space-y-3">
      <div>
        <label className="block text-sm text-ink/70 mb-1">Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kofi"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
        <p className="text-xs text-ink/60 mt-1">
          Creates a member with no login yet — generate an invite link for them next.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {status === 'saving' ? 'Adding…' : 'Add member'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ink/60 underline"
        >
          Cancel
        </button>
      </div>

      {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
    </form>
  );
}

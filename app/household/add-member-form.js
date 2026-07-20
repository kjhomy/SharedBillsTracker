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
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
        + Add a member
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <div>
        <label className="field-label">Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kofi"
          className="input-field"
        />
        <p className="text-xs text-ink/60 mt-1">
          Creates a member with no login yet — generate an invite link for them next.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? 'Adding…' : 'Add member'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>

      {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
    </form>
  );
}

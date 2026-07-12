'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SetPasswordForm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | done | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('done');
    setPassword('');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink/60 underline"
      >
        Set a password
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 max-w-xs">
      <input
        type="password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
      />
      <button
        type="submit"
        disabled={status === 'saving'}
        className="border border-line rounded-lg px-3 py-1.5 text-sm text-ink disabled:opacity-60"
      >
        {status === 'saving' ? 'Saving…' : 'Save password'}
      </button>
      {status === 'done' && <p className="text-xs text-ink/70">Password set — you can sign in with it next time.</p>}
      {status === 'error' && <p className="text-xs text-red-700">{errorMessage}</p>}
    </form>
  );
}

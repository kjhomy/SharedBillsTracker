'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function InviteMemberButton({ member, householdId }) {
  const [status, setStatus] = useState('idle'); // idle | generating | ready | error
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleGenerate() {
    setStatus('generating');
    setErrorMessage('');
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('household_invites')
      .insert({ household_id: householdId, member_id: member.id, created_by: user.id })
      .select('token')
      .single();

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setLink(`${window.location.origin}/join/${data.token}`);
    setCopied(false);
    setStatus('ready');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (status === 'idle' || status === 'generating' || status === 'error') {
    return (
      <div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="text-xs text-ink/60 underline disabled:opacity-60"
        >
          {status === 'generating' ? 'Generating link…' : 'Generate invite link'}
        </button>
        {status === 'error' && <p className="text-xs text-red-700 mt-1">{errorMessage}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-ink/60">Share this link — expires in 7 days:</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="flex-1 border border-line rounded-lg px-2 py-1.5 text-xs bg-paper"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-ink underline whitespace-nowrap"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function MemberRow({ member, householdId }) {
  const router = useRouter();
  const [joinedDate, setJoinedDate] = useState(member.joined_date ?? '');
  const [hasLeft, setHasLeft] = useState(Boolean(member.left_date));
  const [leftDate, setLeftDate] = useState(member.left_date ?? '');
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  const dirty =
    joinedDate !== (member.joined_date ?? '') ||
    (hasLeft ? leftDate : '') !== (member.left_date ?? '');

  async function handleSave() {
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from('household_members')
      .update({
        joined_date: joinedDate,
        left_date: hasLeft ? leftDate : null,
      })
      .eq('id', member.id);

    if (updateError) {
      setStatus('error');
      setErrorMessage(updateError.message);
      return;
    }

    const { error: recomputeError } = await supabase.rpc('recompute_household_splits', {
      p_household_id: householdId,
    });

    if (recomputeError) {
      setStatus('error');
      setErrorMessage(`Dates saved, but recalculating splits failed: ${recomputeError.message}`);
      return;
    }

    setStatus('idle');
    router.refresh();
  }

  return (
    <li className="border border-line rounded-xl p-4 bg-white space-y-3">
      <p className="text-sm font-medium text-ink">{member.name}</p>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Joined</label>
        <input
          type="date"
          required
          value={joinedDate}
          onChange={(e) => setJoinedDate(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input
          type="checkbox"
          checked={hasLeft}
          onChange={(e) => {
            setHasLeft(e.target.checked);
            if (!e.target.checked) setLeftDate('');
          }}
        />
        Has left the household
      </label>

      {hasLeft && (
        <div>
          <label className="block text-sm text-ink/70 mb-1">Left</label>
          <input
            type="date"
            required
            value={leftDate}
            onChange={(e) => setLeftDate(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || status === 'saving'}
        className="w-full bg-ink text-paper rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
      >
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>

      {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
    </li>
  );
}

export default function EditMembersForm({ members, householdId }) {
  if (members.length === 0) {
    return (
      <div className="border border-line rounded-xl p-4 bg-white">
        <p className="text-sm text-ink/70">No members found.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {members.map((member) => (
        <MemberRow key={member.id} member={member} householdId={householdId} />
      ))}
    </ul>
  );
}

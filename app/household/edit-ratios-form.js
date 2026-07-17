'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dayBefore(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function CategoryRatioCard({ category, members, currentRatios, householdId }) {
  const router = useRouter();
  // Default to an existing row's start date rather than today, so simply
  // opening an already-configured category and clicking Save (without
  // touching the date) doesn't register as "the date changed" just
  // because today's date differs from history.
  const [effectiveFrom, setEffectiveFrom] = useState(
    () => currentRatios[0]?.effective_from ?? todayISO()
  );
  // touched = member ids the user has explicitly typed a value into this
  // session (as opposed to values pre-filled from the DB or auto-filled
  // below). Once exactly one member is left untouched, its field auto-fills
  // with whatever's needed to bring the total to 100%, and keeps
  // recalculating as the touched fields change — until the user types into
  // it directly too, at which point it locks in like any other field.
  const [{ values, touched }, setRatioState] = useState(() => {
    const initialValues = {};
    for (const m of members) {
      const row = currentRatios.find((r) => r.member_id === m.id);
      initialValues[m.id] = row ? String(row.percentage) : '';
    }
    return { values: initialValues, touched: {} };
  });
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  function handlePercentageChange(memberId, rawValue) {
    setRatioState(({ values: prevValues, touched: prevTouched }) => {
      const nextValues = { ...prevValues, [memberId]: rawValue };
      const nextTouched = { ...prevTouched };
      if (rawValue === '') {
        delete nextTouched[memberId];
      } else {
        nextTouched[memberId] = true;
      }

      const untouched = members.filter((m) => !nextTouched[m.id]);
      if (untouched.length === 1 && members.length > 1) {
        const touchedSum = members
          .filter((m) => nextTouched[m.id])
          .reduce((sum, m) => sum + (Number(nextValues[m.id]) || 0), 0);
        const remainder = Math.max(0, Math.min(100, Math.round((100 - touchedSum) * 100) / 100));
        nextValues[untouched[0].id] = String(remainder);
      }

      return { values: nextValues, touched: nextTouched };
    });
  }

  const total = Math.round(members.reduce((sum, m) => sum + (Number(values[m.id]) || 0), 0) * 100) / 100;

  const dirty = members.some((m) => {
    const row = currentRatios.find((r) => r.member_id === m.id);
    const before = row ? String(row.percentage) : '';
    const percentageChanged = before !== (values[m.id] ?? '');
    const dateChanged = row ? row.effective_from !== effectiveFrom : false;
    return percentageChanged || dateChanged;
  });

  async function handleSave() {
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    for (const m of members) {
      const newValue = values[m.id];
      const existing = currentRatios.find((r) => r.member_id === m.id);
      const before = existing ? String(existing.percentage) : '';
      const percentageChanged = newValue !== before;
      const dateChanged = existing ? existing.effective_from !== effectiveFrom : false;

      if (!percentageChanged && !dateChanged) continue; // nothing to do for this member
      if (newValue === '') continue; // left blank, leave unconfigured

      if (!percentageChanged && dateChanged) {
        // same percentage, just correcting when it started — no new version
        const { error } = await supabase
          .from('category_ratios')
          .update({ effective_from: effectiveFrom })
          .eq('id', existing.id);

        if (error) {
          setStatus('error');
          setErrorMessage(error.message);
          return;
        }
        continue;
      }

      if (existing && existing.effective_from === effectiveFrom) {
        // same-day correction — update in place, no new version
        const { error } = await supabase
          .from('category_ratios')
          .update({ percentage: Number(newValue) })
          .eq('id', existing.id);

        if (error) {
          setStatus('error');
          setErrorMessage(error.message);
          return;
        }
      } else {
        if (existing) {
          const { error: closeError } = await supabase
            .from('category_ratios')
            .update({ effective_to: dayBefore(effectiveFrom) })
            .eq('id', existing.id);

          if (closeError) {
            setStatus('error');
            setErrorMessage(closeError.message);
            return;
          }
        }

        const { error: insertError } = await supabase
          .from('category_ratios')
          .insert({
            household_id: householdId,
            category_id: category.id,
            member_id: m.id,
            percentage: Number(newValue),
            effective_from: effectiveFrom,
            effective_to: null,
          });

        if (insertError) {
          setStatus('error');
          setErrorMessage(insertError.message);
          return;
        }
      }
    }

    const { error: recomputeError } = await supabase.rpc('recompute_household_splits', {
      p_household_id: householdId,
    });

    if (recomputeError) {
      setStatus('error');
      setErrorMessage(`Ratios saved, but recalculating splits failed: ${recomputeError.message}`);
      return;
    }

    setStatus('idle');
    router.refresh();
  }

  return (
    <li className="border border-line rounded-xl p-4 bg-white space-y-3">
      <p className="text-sm font-medium text-ink">{category.name}</p>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Effective from</label>
        <input
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      {members.map((m) => {
        const existing = currentRatios.find((r) => r.member_id === m.id);
        return (
          <div key={m.id}>
            <label className="block text-sm text-ink/70 mb-1">{m.name} (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={values[m.id]}
              onChange={(e) => handlePercentageChange(m.id, e.target.value)}
              placeholder="0"
              className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
            />
            {existing && (
              <p className="text-xs text-ink/50 mt-1">
                Currently {existing.percentage}%, effective since {existing.effective_from}
              </p>
            )}
          </div>
        );
      })}

      <p className={`text-xs ${total === 100 ? 'text-ink/50' : 'text-amber'}`}>
        Total: {total}%{total !== 100 && ' — doesn\'t add up to 100%'}
      </p>

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

export default function EditRatiosForm({ categories, members, currentRatios, householdId }) {
  if (categories.length === 0) {
    return (
      <div className="border border-line rounded-xl p-4 bg-white">
        <p className="text-sm text-ink/70">No categories found.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {categories.map((category) => (
        <CategoryRatioCard
          key={category.id}
          category={category}
          members={members}
          currentRatios={currentRatios.filter((r) => r.category_id === category.id)}
          householdId={householdId}
        />
      ))}
    </ul>
  );
}

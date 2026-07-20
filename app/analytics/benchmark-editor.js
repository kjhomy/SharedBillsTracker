'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function BenchmarkRow({ benchmark }) {
  const router = useRouter();
  const [value, setValue] = useState(String(benchmark.monthly_amount));
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  const dirty = value !== String(benchmark.monthly_amount);

  async function handleSave() {
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase
      .from('benchmark_rates')
      .update({ monthly_amount: Number(value), updated_at: new Date().toISOString() })
      .eq('id', benchmark.id);

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('idle');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-ink/70">{benchmark.category_name}</span>
      <span className="text-sm text-ink/50">£</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input-field !py-1.5 w-28"
      />
      <span className="text-xs text-ink/50">/mo</span>
      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || status === 'saving'}
        className="btn-ghost disabled:opacity-40"
      >
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {status === 'error' && <p className="text-xs text-red-700">{errorMessage}</p>}
    </div>
  );
}

export default function BenchmarkEditor({ benchmarks }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
        Edit benchmark figures
      </button>
    );
  }

  return (
    <div className="card space-y-3">
      <p className="text-xs text-ink/60">
        These are illustrative placeholders, not live data — replace them with numbers from a
        source you trust (Ofgem, Ofwat, ONS, your council's band D figure, etc).
      </p>
      {benchmarks.map((b) => (
        <BenchmarkRow key={b.id} benchmark={b} />
      ))}
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Done
      </button>
    </div>
  );
}

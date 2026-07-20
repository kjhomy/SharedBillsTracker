'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const initialForm = {
  category_id: '',
  payee: '',
  amount: '',
  period_start: '',
  period_end: '',
  due_date: '',
  notes: '',
};

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

export default function AddBillForm({ categories, members, householdId, userId }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  const [preview, setPreview] = useState(null);
  const [previewStatus, setPreviewStatus] = useState('idle'); // idle | loading | error | ready
  const [previewError, setPreviewError] = useState('');

  const [extraction, setExtraction] = useState(null); // { amount, payee, date } from the receipt, kept for the attachment row
  const [extractStatus, setExtractStatus] = useState('idle'); // idle | loading | error | done
  const [extractError, setExtractError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const memberName = (id) => members.find((m) => m.id === id)?.name ?? 'Unknown';

  // Live split preview — recomputed whenever the fields it depends on are
  // all filled in. Debounced slightly so it doesn't fire on every keystroke.
  useEffect(() => {
    const ready = form.category_id && form.amount && form.period_start && form.period_end;

    if (!ready) {
      setPreview(null);
      setPreviewStatus('idle');
      return;
    }

    if (form.period_end < form.period_start) {
      setPreview(null);
      setPreviewStatus('error');
      setPreviewError('Period end is before period start.');
      return;
    }

    setPreviewStatus('loading');
    const timeout = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('compute_split', {
        p_household_id: householdId,
        p_category_id: form.category_id,
        p_amount: form.amount,
        p_period_start: form.period_start,
        p_period_end: form.period_end,
      });

      if (error) {
        setPreview(null);
        setPreviewStatus('error');
        setPreviewError(error.message);
        return;
      }

      setPreview(data ?? []);
      setPreviewStatus('ready');
    }, 400);

    return () => clearTimeout(timeout);
  }, [form.category_id, form.amount, form.period_start, form.period_end, householdId]);

  async function handleExtract() {
    if (!file) return;

    setExtractStatus('loading');
    setExtractError('');

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/extract-receipt', { method: 'POST', body });
      const data = await res.json();

      if (!res.ok) {
        setExtractStatus('error');
        setExtractError(data.error ?? 'Something went wrong.');
        return;
      }

      setExtraction(data);
      setForm((f) => ({
        ...f,
        payee: f.payee || data.payee || '',
        amount: f.amount || (data.amount != null ? String(data.amount) : ''),
        due_date: f.due_date || data.date || '',
      }));
      setExtractStatus('done');
    } catch {
      setExtractStatus('error');
      setExtractError('Something went wrong.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        created_by: userId,
        household_id: householdId,
        category_id: form.category_id || null,
        payee: form.payee || null,
        amount: form.amount,
        period_start: form.period_start,
        period_end: form.period_end,
        due_date: form.due_date || null,
        notes: form.notes || null,
      })
      .select('id')
      .single();

    if (insertError) {
      setStatus('error');
      setErrorMessage(insertError.message);
      return;
    }

    if (file) {
      const path = `${householdId}/${transaction.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(path, file);

      if (uploadError) {
        setStatus('error');
        setErrorMessage(`Bill saved, but the receipt upload failed: ${uploadError.message}`);
        return;
      }

      const { error: attachmentError } = await supabase.from('attachments').insert({
        transaction_id: transaction.id,
        file_url: path,
        extracted_amount: extraction?.amount ?? null,
        extracted_date: extraction?.date ?? null,
        extracted_payee: extraction?.payee ?? null,
      });

      if (attachmentError) {
        setStatus('error');
        setErrorMessage(`Bill saved, but the receipt couldn't be linked: ${attachmentError.message}`);
        return;
      }
    }

    const { error: splitError } = await supabase.rpc('save_transaction_split', {
      p_transaction_id: transaction.id,
    });

    if (splitError) {
      setStatus('error');
      setErrorMessage(`Bill saved, but the split couldn't be calculated: ${splitError.message}`);
      return;
    }

    router.push('/bills');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="field-label">Category</label>
        <select
          required
          value={form.category_id}
          onChange={update('category_id')}
          className="input-field"
        >
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label">Payee</label>
        <input
          type="text"
          value={form.payee}
          onChange={update('payee')}
          placeholder="e.g. British Gas"
          className="input-field"
        />
      </div>

      <div>
        <label className="field-label">Amount (£)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={form.amount}
          onChange={update('amount')}
          placeholder="0.00"
          className="input-field"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Period start</label>
          <input
            type="date"
            required
            value={form.period_start}
            onChange={update('period_start')}
            className="input-field"
          />
        </div>
        <div>
          <label className="field-label">Period end</label>
          <input
            type="date"
            required
            value={form.period_end}
            onChange={update('period_end')}
            className="input-field"
          />
        </div>
      </div>

      {previewStatus !== 'idle' && (
        <div className="rounded-xl bg-paper p-4">
          <p className="text-sm font-medium text-ink mb-2">Split preview</p>
          {previewStatus === 'loading' && <p className="text-sm text-ink/60">Calculating…</p>}
          {previewStatus === 'error' && <p className="text-sm text-red-700">{previewError}</p>}
          {previewStatus === 'ready' && preview.length === 0 && (
            <p className="text-sm text-ink/60">
              Nobody was an active member during this period — nothing to split.
            </p>
          )}
          {previewStatus === 'ready' && preview.length > 0 && (
            <ul className="space-y-1">
              {preview.map((row) => (
                <li key={row.member_id} className="flex items-center justify-between text-sm">
                  <span className="text-ink/80">{memberName(row.member_id)}</span>
                  <span className="text-ink font-medium">
                    {formatAmount(row.share_amount)} ({row.share_percentage}%)
                  </span>
                </li>
              ))}
              {preview.reduce((sum, r) => sum + Number(r.share_amount), 0) < Number(form.amount) - 0.005 && (
                <li className="text-xs text-amber pt-1">
                  Splits don't add up to the full amount — a member may be missing a ratio for this category.
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <div>
        <label className="field-label">Due date</label>
        <input
          type="date"
          value={form.due_date}
          onChange={update('due_date')}
          className="input-field"
        />
      </div>

      <div>
        <label className="field-label">Notes</label>
        <textarea
          value={form.notes}
          onChange={update('notes')}
          rows={2}
          className="input-field"
        />
      </div>

      <div>
        <label className="field-label">Receipt (optional)</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setExtraction(null);
            setExtractStatus('idle');
            setExtractError('');
          }}
          className="w-full text-sm"
        />
        {file?.type?.startsWith('image/') && extractStatus !== 'done' && (
          <button
            type="button"
            onClick={handleExtract}
            disabled={extractStatus === 'loading'}
            className="btn-ghost mt-2 disabled:opacity-60"
          >
            {extractStatus === 'loading' ? 'Reading receipt…' : '✨ Fill in details from this photo'}
          </button>
        )}
        {extractStatus === 'done' && (
          <p className="text-xs text-ink/60 mt-2">Filled in from the receipt — check the fields above before saving.</p>
        )}
        {extractStatus === 'error' && <p className="text-xs text-red-700 mt-2">{extractError}</p>}
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="btn-primary w-full"
      >
        {status === 'saving' ? 'Saving…' : 'Save bill'}
      </button>

      {status === 'error' && (
        <p className="text-sm text-red-700">{errorMessage}</p>
      )}
    </form>
  );
}

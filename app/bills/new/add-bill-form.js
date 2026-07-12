'use client';

import { useState } from 'react';
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

export default function AddBillForm({ categories, householdId, userId }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
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
        period_start: form.period_start || null,
        period_end: form.period_end || null,
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

      const { error: attachmentError } = await supabase
        .from('attachments')
        .insert({ transaction_id: transaction.id, file_url: path });

      if (attachmentError) {
        setStatus('error');
        setErrorMessage(`Bill saved, but the receipt couldn't be linked: ${attachmentError.message}`);
        return;
      }
    }

    router.push('/bills');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm text-ink/70 mb-1">Category</label>
        <select
          required
          value={form.category_id}
          onChange={update('category_id')}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        >
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Payee</label>
        <input
          type="text"
          value={form.payee}
          onChange={update('payee')}
          placeholder="e.g. British Gas"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Amount (£)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={form.amount}
          onChange={update('amount')}
          placeholder="0.00"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-ink/70 mb-1">Period start</label>
          <input
            type="date"
            value={form.period_start}
            onChange={update('period_start')}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-sm text-ink/70 mb-1">Period end</label>
          <input
            type="date"
            value={form.period_end}
            onChange={update('period_end')}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Due date</label>
        <input
          type="date"
          value={form.due_date}
          onChange={update('due_date')}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={update('notes')}
          rows={2}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Receipt (optional)</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'saving'}
        className="w-full bg-ink text-paper rounded-lg py-3 text-sm font-medium disabled:opacity-60"
      >
        {status === 'saving' ? 'Saving…' : 'Save bill'}
      </button>

      {status === 'error' && (
        <p className="text-sm text-red-700">{errorMessage}</p>
      )}
    </form>
  );
}

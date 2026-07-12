'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const initialForm = {
  category_id: '',
  payee: '',
  amount: '',
  due_day_of_month: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
};

export default function AddRecurringForm({ categories, householdId, userId }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [perpetual, setPerpetual] = useState(true);
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

    const { error } = await supabase.from('recurring_bills').insert({
      created_by: userId,
      household_id: householdId,
      category_id: form.category_id,
      payee: form.payee || null,
      amount: form.amount,
      due_day_of_month: form.due_day_of_month,
      start_date: form.start_date,
      end_date: perpetual ? null : form.end_date || null,
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    router.push('/bills/recurring');
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
          placeholder="e.g. Landlord"
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

      <div>
        <label className="block text-sm text-ink/70 mb-1">Due day of month</label>
        <input
          type="number"
          min="1"
          max="31"
          required
          value={form.due_day_of_month}
          onChange={update('due_day_of_month')}
          placeholder="e.g. 25"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
        <p className="text-xs text-ink/60 mt-1">
          Falls on the last day of the month for months shorter than this.
        </p>
      </div>

      <div>
        <label className="block text-sm text-ink/70 mb-1">Start date</label>
        <input
          type="date"
          required
          value={form.start_date}
          onChange={update('start_date')}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={perpetual}
          onChange={(e) => setPerpetual(e.target.checked)}
        />
        Perpetual (keeps generating until paused)
      </label>

      {!perpetual && (
        <div>
          <label className="block text-sm text-ink/70 mb-1">End date</label>
          <input
            type="date"
            required
            value={form.end_date}
            onChange={update('end_date')}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving'}
        className="w-full bg-ink text-paper rounded-lg py-3 text-sm font-medium disabled:opacity-60"
      >
        {status === 'saving' ? 'Saving…' : 'Save recurring bill'}
      </button>

      {status === 'error' && (
        <p className="text-sm text-red-700">{errorMessage}</p>
      )}
    </form>
  );
}

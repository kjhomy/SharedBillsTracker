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

    const { data: newBill, error } = await supabase
      .from('recurring_bills')
      .insert({
        created_by: userId,
        household_id: householdId,
        category_id: form.category_id,
        payee: form.payee || null,
        amount: form.amount,
        due_day_of_month: form.due_day_of_month,
        start_date: form.start_date,
        end_date: perpetual ? null : form.end_date || null,
      })
      .select('id')
      .single();

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    const { error: backfillError } = await supabase.rpc('backfill_recurring_bill', {
      p_recurring_bill_id: newBill.id,
    });

    if (backfillError) {
      setStatus('error');
      setErrorMessage(`Saved, but backfilling past months failed: ${backfillError.message}`);
      return;
    }

    router.push('/bills/recurring');
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
          placeholder="e.g. Landlord"
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

      <div>
        <label className="field-label">Due day of month</label>
        <input
          type="number"
          min="1"
          max="31"
          required
          value={form.due_day_of_month}
          onChange={update('due_day_of_month')}
          placeholder="e.g. 25"
          className="input-field"
        />
        <p className="text-xs text-ink/60 mt-1">
          Falls on the last day of the month for months shorter than this.
        </p>
      </div>

      <div>
        <label className="field-label">Start date</label>
        <input
          type="date"
          required
          value={form.start_date}
          onChange={update('start_date')}
          className="input-field"
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
          <label className="field-label">End date</label>
          <input
            type="date"
            required
            value={form.end_date}
            onChange={update('end_date')}
            className="input-field"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving'}
        className="btn-primary w-full"
      >
        {status === 'saving' ? 'Saving…' : 'Save recurring bill'}
      </button>

      {status === 'error' && (
        <p className="text-sm text-red-700">{errorMessage}</p>
      )}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function CategoryRow({ category }) {
  const router = useRouter();
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleToggleArchive() {
    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase
      .from('categories')
      .update({ archived_at: category.archived_at ? null : new Date().toISOString() })
      .eq('id', category.id);

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${category.name}"? This can't be undone.`)) {
      return;
    }

    setStatus('saving');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.rpc('delete_category', { p_category_id: category.id });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-ink truncate">{category.name}</span>
          {category.archived_at && <span className="pill bg-line text-ink/70 shrink-0">archived</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleToggleArchive}
            disabled={status === 'saving'}
            className="btn-ghost disabled:opacity-60"
          >
            {category.archived_at ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={status === 'saving'}
            className="text-xs font-medium text-red-700/80 underline decoration-red-700/30 underline-offset-2 transition hover:text-red-700 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
      {status === 'error' && <p className="text-xs text-red-700 mt-1">{errorMessage}</p>}
    </li>
  );
}

function AddCategoryForm() {
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

    const { error } = await supabase
      .from('categories')
      .insert({ name: name.trim(), type: 'expense', user_id: null });

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
        + Add a category
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
          placeholder="e.g. Cleaning"
          className="input-field"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? 'Adding…' : 'Add category'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
      {status === 'error' && <p className="text-sm text-red-700">{errorMessage}</p>}
    </form>
  );
}

export default function EditCategoriesForm({ categories }) {
  const sorted = [...categories].sort((a, b) => {
    if (Boolean(a.archived_at) !== Boolean(b.archived_at)) return a.archived_at ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      {sorted.length === 0 ? (
        <div className="card mb-3">
          <p className="text-sm text-ink/70">No categories yet.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-line/70 mb-3">
          {sorted.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
      )}
      <AddCategoryForm />
    </div>
  );
}

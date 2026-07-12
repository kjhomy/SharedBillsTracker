'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setStatus(error ? 'error' : 'sent');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Household Bills</h1>
        <p className="text-ink/70 text-sm mb-6">Sign in with your email — we'll send a magic link, no password needed.</p>

        {status === 'sent' ? (
          <div className="border border-line rounded-xl p-4 bg-white">
            <p className="text-sm text-ink">Check your inbox for a sign-in link.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full bg-ink text-paper rounded-lg py-3 text-sm font-medium disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending link…' : 'Send magic link'}
            </button>
            {status === 'error' && (
              <p className="text-sm text-red-700">Something went wrong sending the link. Try again.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AcceptInviteForm({ token }) {
  const [mode, setMode] = useState('magic'); // magic | password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | signup-sent | error
  const [errorMessage, setErrorMessage] = useState('');

  const redirectTo = () => `${window.location.origin}/auth/callback?token=${token}`;

  async function handleMagicLink(e) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });

    setStatus(error ? 'error' : 'sent');
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo() },
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('signup-sent');
  }

  function switchMode(next) {
    setMode(next);
    setStatus('idle');
    setErrorMessage('');
  }

  if (status === 'sent') {
    return (
      <div className="border border-line rounded-xl p-4 bg-white">
        <p className="text-sm text-ink">Check your inbox for a sign-in link.</p>
      </div>
    );
  }

  if (status === 'signup-sent') {
    return (
      <div className="border border-line rounded-xl p-4 bg-white">
        <p className="text-sm text-ink">Check your inbox to confirm your account — that'll finish joining.</p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={mode === 'magic' ? handleMagicLink : handleSignUp} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
        />

        {mode === 'password' && (
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white"
          />
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full bg-ink text-paper rounded-lg py-3 text-sm font-medium disabled:opacity-60"
        >
          {status === 'sending'
            ? 'Sending…'
            : mode === 'magic' ? 'Send magic link' : 'Create account'}
        </button>

        {status === 'error' && (
          <p className="text-sm text-red-700">{errorMessage || 'Something went wrong. Try again.'}</p>
        )}
      </form>

      <button
        type="button"
        onClick={() => switchMode(mode === 'magic' ? 'password' : 'magic')}
        className="w-full text-center text-xs text-ink/60 underline mt-4"
      >
        {mode === 'magic' ? 'Use a password instead' : 'Use a magic link instead'}
      </button>
    </>
  );
}

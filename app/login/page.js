'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('magic'); // magic | password
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | signup-sent | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleMagicLink(e) {
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

  async function handlePasswordSignIn(e) {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    router.push('/');
    router.refresh();
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
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

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Household Bills</h1>
        <p className="text-ink/70 text-sm mb-6">
          {mode === 'magic'
            ? "Sign in with your email — we'll send a magic link, no password needed."
            : 'Sign in with your email and password.'}
        </p>

        {status === 'sent' ? (
          <div className="border border-line rounded-xl p-4 bg-white">
            <p className="text-sm text-ink">Check your inbox for a sign-in link.</p>
          </div>
        ) : status === 'signup-sent' ? (
          <div className="border border-line rounded-xl p-4 bg-white">
            <p className="text-sm text-ink">Check your inbox to confirm your account, then sign in.</p>
          </div>
        ) : (
          <form onSubmit={mode === 'magic' ? handleMagicLink : handlePasswordSignIn} className="space-y-3">
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
                : mode === 'magic' ? 'Send magic link' : 'Sign in'}
            </button>

            {mode === 'password' && (
              <button
                type="button"
                onClick={handleSignUp}
                disabled={status === 'sending'}
                className="w-full border border-line rounded-lg py-2.5 text-sm text-ink disabled:opacity-60"
              >
                Create account
              </button>
            )}

            {status === 'error' && (
              <p className="text-sm text-red-700">{errorMessage || 'Something went wrong. Try again.'}</p>
            )}
          </form>
        )}

        <button
          type="button"
          onClick={() => switchMode(mode === 'magic' ? 'password' : 'magic')}
          className="w-full text-center text-xs text-ink/60 underline mt-4"
        >
          {mode === 'magic' ? 'Use a password instead' : 'Use a magic link instead'}
        </button>
      </div>
    </div>
  );
}

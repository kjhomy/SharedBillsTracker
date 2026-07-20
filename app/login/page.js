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
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-peach-bg text-2xl">
          🏠
        </span>
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Household Bills</h1>
        <p className="text-ink/70 text-sm mb-6">
          {mode === 'magic'
            ? "Sign in with your email — we'll send a magic link, no password needed."
            : 'Sign in with your email and password.'}
        </p>

        <div className="card">
          {status === 'sent' ? (
            <p className="text-sm text-ink">Check your inbox for a sign-in link.</p>
          ) : status === 'signup-sent' ? (
            <p className="text-sm text-ink">Check your inbox to confirm your account, then sign in.</p>
          ) : (
            <form onSubmit={mode === 'magic' ? handleMagicLink : handlePasswordSignIn} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-field"
              />

              {mode === 'password' && (
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="input-field"
                />
              )}

              <button type="submit" disabled={status === 'sending'} className="btn-primary w-full">
                {status === 'sending'
                  ? 'Sending…'
                  : mode === 'magic' ? 'Send magic link' : 'Sign in'}
              </button>

              {mode === 'password' && (
                <button
                  type="button"
                  onClick={handleSignUp}
                  disabled={status === 'sending'}
                  className="btn-secondary w-full"
                >
                  Create account
                </button>
              )}

              {status === 'error' && (
                <p className="text-sm text-red-700">{errorMessage || 'Something went wrong. Try again.'}</p>
              )}
            </form>
          )}
        </div>

        <button
          type="button"
          onClick={() => switchMode(mode === 'magic' ? 'password' : 'magic')}
          className="btn-ghost w-full text-center mt-4"
        >
          {mode === 'magic' ? 'Use a password instead' : 'Use a magic link instead'}
        </button>
      </div>
    </div>
  );
}

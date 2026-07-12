import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SignOutButton from './sign-out-button';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink mb-2">You're in 🎉</h1>
      <p className="text-sm text-ink/70 mb-6">
        Signed in as {user.email}. The full dashboard (balances, activity
        feed) comes in a later phase — for now you can log and browse bills.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/bills"
          className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium"
        >
          View bills
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

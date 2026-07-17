'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NavHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-paper">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="text-ink/70 text-sm"
        >
          ← Back
        </button>
        <Link href="/" className="text-ink/70 text-sm">
          Home
        </Link>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Menu"
          className="border border-line rounded-lg px-3 py-1.5 text-sm text-ink"
        >
          Menu
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-white border border-line rounded-lg shadow-sm py-1 z-10">
            <Link
              href="/bills"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 text-sm text-ink hover:bg-paper"
            >
              Bills
            </Link>
            <Link
              href="/bills/recurring"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 text-sm text-ink hover:bg-paper"
            >
              Recurring bills
            </Link>
            <Link
              href="/household"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 text-sm text-ink hover:bg-paper"
            >
              Household members
            </Link>
            <Link
              href="/settle"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 text-sm text-ink hover:bg-paper"
            >
              Settle up
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-paper"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

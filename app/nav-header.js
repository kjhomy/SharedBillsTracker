'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/bills', label: 'Bills' },
  { href: '/bills/recurring', label: 'Recurring' },
  { href: '/household', label: 'Household' },
  { href: '/settle', label: 'Settle up' },
];

export default function NavHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function isActive(href) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 sm:gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink/60 transition hover:bg-white hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link href="/" className="whitespace-nowrap font-display text-lg font-semibold text-ink">
            Household Bills
          </Link>
          <nav className="hidden md:flex items-center gap-1 pl-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  isActive(link.href) ? 'bg-ink text-paper' : 'text-ink/60 hover:bg-white hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="hidden md:inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 transition hover:bg-white hover:text-ink"
          >
            Sign out
          </button>

          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:bg-paper"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-line bg-white py-1.5 shadow-card-hover">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block px-4 py-2 text-sm transition hover:bg-paper ${
                      isActive(link.href) ? 'font-medium text-ink' : 'text-ink/70'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="block w-full px-4 py-2 text-left text-sm text-ink/70 transition hover:bg-paper"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

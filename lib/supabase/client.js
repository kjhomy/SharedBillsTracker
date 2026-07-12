import { createBrowserClient } from '@supabase/ssr';

// Used inside 'use client' components — reads the public env vars,
// safe to expose in the browser (the anon key is designed for this).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

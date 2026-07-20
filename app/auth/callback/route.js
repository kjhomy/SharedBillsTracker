import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token = searchParams.get('token');

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    if (token) {
      const { error } = await supabase.rpc('accept_invite', { p_token: token });
      if (error) {
        return NextResponse.redirect(`${origin}/join/${token}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/`);
}

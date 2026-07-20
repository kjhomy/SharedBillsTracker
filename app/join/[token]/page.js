import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import AcceptInviteForm from './accept-invite-form';

export default async function JoinPage({ params }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: preview } = await supabase
    .rpc('get_invite_preview', { p_token: token })
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const household = await getHousehold(supabase, user.id);
    if (household) {
      redirect('/');
    }

    if (preview?.valid) {
      const { error } = await supabase.rpc('accept_invite', { p_token: token });
      if (!error) {
        redirect('/');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {!preview || !preview.valid ? (
          <div className="card">
            <h1 className="font-display text-2xl font-semibold text-ink mb-2">Invite not valid</h1>
            <p className="text-sm text-ink/70">
              This invite link has expired or has already been used. Ask whoever sent it for a new one.
            </p>
          </div>
        ) : (
          <>
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-mint-bg text-2xl">
              👋
            </span>
            <h1 className="font-display text-2xl font-semibold text-ink mb-1">
              Join {preview.household_name}
            </h1>
            <p className="text-sm text-ink/70 mb-6">
              You've been invited as <strong>{preview.member_name}</strong>. Sign up below to get access.
            </p>
            <div className="card">
              <AcceptInviteForm token={token} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

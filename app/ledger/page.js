import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import Avatar from '../avatar';
import { categoryStyle } from '@/lib/style';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monthLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default async function LedgerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const [{ data: members }, { data: entries }] = await Promise.all([
    supabase.from('household_members').select('id, name').eq('household_id', household.household_id),
    supabase.rpc('household_ledger', { p_household_id: household.household_id }),
  ]);

  const memberName = (id) => members?.find((m) => m.id === id)?.name ?? 'Unknown';

  // Group into month buckets, in the order entries already arrive
  // (newest first, per household_ledger's own ORDER BY).
  const groups = [];
  let currentKey = null;
  for (const entry of entries ?? []) {
    const key = monthLabel(entry.event_date);
    if (key !== currentKey) {
      groups.push({ label: key, entries: [] });
      currentKey = key;
    }
    groups[groups.length - 1].entries.push(entry);
  }

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1">Ledger</h1>
          <p className="text-sm text-ink/60 mb-8">
            Every bill logged and every settlement made, in one chronological statement.
          </p>

          {groups.length === 0 ? (
            <div className="card">
              <p className="text-sm text-ink/70">Nothing logged yet.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map((group) => (
                <div key={group.label}>
                  <h2 className="text-sm font-medium text-ink/70 mb-3">{group.label}</h2>
                  <ul className="space-y-2">
                    {group.entries.map((entry) =>
                      entry.entry_type === 'bill' ? (
                        <BillEntry key={`bill-${entry.entry_id}`} entry={entry} memberName={memberName} />
                      ) : (
                        <SettlementEntry key={`settlement-${entry.entry_id}`} entry={entry} memberName={memberName} />
                      )
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BillEntry({ entry, memberName }) {
  const style = categoryStyle(entry.category_name);
  return (
    <li className="card !p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${style.bg}`}>
            {style.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">
              {entry.category_name ?? 'Uncategorised'}{entry.payee ? ` — ${entry.payee}` : ''}
            </p>
            <p className="text-xs text-ink/60 mt-0.5">
              {formatDate(entry.event_date)}
              {entry.paid_status === 'paid' && entry.paid_by_member_id
                ? ` · paid by ${memberName(entry.paid_by_member_id)}`
                : ' · unpaid'}
            </p>
          </div>
        </div>
        <p className="text-sm font-semibold text-ink whitespace-nowrap">{formatAmount(entry.amount)}</p>
      </div>

      {entry.splits?.length > 0 && (
        <p className="text-xs text-ink/50 mt-2 pl-12">
          {entry.splits.map((s) => `${memberName(s.member_id)} ${formatAmount(s.share_amount)}`).join(' · ')}
        </p>
      )}
    </li>
  );
}

function SettlementEntry({ entry, memberName }) {
  const text = Number(entry.category_count) === 1
    ? `${memberName(entry.from_member_id)} settled ${entry.category_name ?? 'Uncategorised'} with ${memberName(entry.to_member_id)}`
    : `${memberName(entry.from_member_id)} settled up with ${memberName(entry.to_member_id)} across ${entry.category_count} categories`;

  return (
    <li className="card !p-4 bg-accent-mint-bg/40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2 shrink-0">
            <Avatar name={memberName(entry.from_member_id)} size="sm" className="ring-2 ring-white" />
            <Avatar name={memberName(entry.to_member_id)} size="sm" className="ring-2 ring-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{text}</p>
            <p className="text-xs text-ink/60 mt-0.5">{formatDate(entry.event_date)} · settled</p>
          </div>
        </div>
        <p className="text-sm font-semibold text-accent-mint-text whitespace-nowrap">{formatAmount(entry.amount)}</p>
      </div>
    </li>
  );
}

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import DeleteBillButton from './delete-bill-button';
import MarkPaidControl from './mark-paid-control';
import { categoryStyle } from '@/lib/style';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function BillsPage({ searchParams }) {
  const { filter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const { data: members } = await supabase
    .from('household_members')
    .select('id, name')
    .eq('household_id', household.household_id);

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, amount, payee, period_start, period_end, due_date, paid_status, created_at, categories(name), attachments(id, file_url), paid_by:paid_by_member_id(name)')
    .eq('household_id', household.household_id)
    .order('created_at', { ascending: false });

  const { data: flags } = await supabase.rpc('household_flags', { p_household_id: household.household_id });
  const missingAttachmentIds = new Set(
    (flags ?? []).filter((f) => f.flag_type === 'missing_attachment').map((f) => f.transaction_id)
  );

  const bills = await Promise.all(
    (transactions ?? []).map(async (t) => {
      const attachment = t.attachments?.[0];
      let receiptUrl = null;

      if (attachment) {
        const { data: signed } = await supabase.storage
          .from('receipts')
          .createSignedUrl(attachment.file_url, 60 * 60);
        receiptUrl = signed?.signedUrl ?? null;
      }

      return { ...t, receiptUrl, attachmentPath: attachment?.file_url ?? null };
    })
  );

  const visibleBills = filter === 'missing_receipt' ? bills.filter((b) => missingAttachmentIds.has(b.id)) : bills;

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="font-display text-3xl font-semibold text-ink">Bills</h1>
            <Link href="/bills/new" className="btn-primary">
              Add bill
            </Link>
          </div>
          <Link href="/bills/recurring" className="btn-ghost inline-block mb-8">
            Manage recurring bills
          </Link>

          {filter === 'missing_receipt' && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3">
              <p className="text-sm text-ink">Showing paid bills with no receipt attached.</p>
              <Link href="/bills" className="btn-ghost">
                Clear filter
              </Link>
            </div>
          )}

          {visibleBills.length === 0 ? (
            <div className="card">
              <p className="text-sm text-ink/70">
                {filter === 'missing_receipt' ? 'No paid bills are missing a receipt.' : 'No bills logged yet.'}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleBills.map((bill) => {
                const style = categoryStyle(bill.categories?.name);
                return (
                  <li key={bill.id} className="card-interactive flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${style.bg}`}>
                          {style.emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate">
                            {bill.categories?.name ?? 'Uncategorised'}
                            {bill.payee ? ` — ${bill.payee}` : ''}
                          </p>
                          <p className="text-xs text-ink/60 mt-0.5">
                            {[formatDate(bill.period_start), formatDate(bill.period_end)].filter(Boolean).join(' – ')}
                            {bill.due_date ? ` · due ${formatDate(bill.due_date)}` : ''}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-ink whitespace-nowrap">
                        {formatAmount(bill.amount)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-3">
                        <span className={`pill ${bill.paid_status === 'paid' ? 'bg-line text-ink/70' : 'bg-amber/15 text-amber'}`}>
                          {bill.paid_status}
                        </span>
                        {bill.receiptUrl && (
                          <a
                            href={bill.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost"
                          >
                            Receipt
                          </a>
                        )}
                        {missingAttachmentIds.has(bill.id) && (
                          <span className="text-xs text-amber">No receipt</span>
                        )}
                      </div>
                      <MarkPaidControl
                        billId={bill.id}
                        paidStatus={bill.paid_status}
                        paidByName={bill.paid_by?.name}
                        members={members ?? []}
                      />
                    </div>

                    <div className="flex items-center justify-end mt-3 pt-3 border-t border-line/70">
                      <DeleteBillButton
                        id={bill.id}
                        label={bill.categories?.name ?? bill.payee}
                        attachmentPath={bill.attachmentPath}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

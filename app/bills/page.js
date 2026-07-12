import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';

function formatAmount(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function BillsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, amount, payee, period_start, period_end, due_date, paid_status, created_at, categories(name), attachments(id, file_url)')
    .eq('household_id', household.household_id)
    .order('created_at', { ascending: false });

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

      return { ...t, receiptUrl };
    })
  );

  return (
    <div className="min-h-screen">
      <NavHeader />
      <div className="px-6 py-10">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-2xl font-semibold text-ink">Bills</h1>
          <Link
            href="/bills/new"
            className="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium"
          >
            Add bill
          </Link>
        </div>
        <Link href="/bills/recurring" className="block text-xs text-ink/60 underline mb-6">
          Manage recurring bills
        </Link>

        {bills.length === 0 ? (
          <div className="border border-line rounded-xl p-4 bg-white">
            <p className="text-sm text-ink/70">No bills logged yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {bills.map((bill) => (
              <li key={bill.id} className="border border-line rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {bill.categories?.name ?? 'Uncategorised'}
                      {bill.payee ? ` — ${bill.payee}` : ''}
                    </p>
                    <p className="text-xs text-ink/60 mt-0.5">
                      {[formatDate(bill.period_start), formatDate(bill.period_end)].filter(Boolean).join(' – ')}
                      {bill.due_date ? ` · due ${formatDate(bill.due_date)}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-ink whitespace-nowrap">
                    {formatAmount(bill.amount)}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${bill.paid_status === 'paid' ? 'bg-line text-ink/70' : 'bg-amber/20 text-amber'}`}>
                    {bill.paid_status}
                  </span>
                  {bill.receiptUrl && (
                    <a
                      href={bill.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ink/70 underline"
                    >
                      Receipt
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}

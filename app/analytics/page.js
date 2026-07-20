import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/household';
import { redirect } from 'next/navigation';
import NavHeader from '../nav-header';
import LineChart from './line-chart';
import BenchmarkChart from './benchmark-chart';
import BenchmarkEditor from './benchmark-editor';
import { assignSeriesColors, CHART_PALETTE } from '@/lib/chartPalette';

const OTHER_COLOR = '#898781';

function formatMonth(monthStr) {
  return new Date(`${monthStr}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const household = await getHousehold(supabase, user.id);

  if (!household) {
    redirect('/');
  }

  const [{ data: spendRows }, { data: balanceRows }, { data: benchmarkRows }] = await Promise.all([
    supabase.rpc('category_spend_by_month', { p_household_id: household.household_id }),
    supabase.rpc('balance_trend', { p_household_id: household.household_id }),
    supabase.from('benchmark_rates').select('id, category_id, monthly_amount, categories(name)'),
  ]);

  const spend = spendRows ?? [];
  const balanceEvents = balanceRows ?? [];
  const benchmarks = benchmarkRows ?? [];

  // ---- Spend trend, grouped by category, capped at 8 series (fold the rest into "Other") ----
  const categoryNames = [...new Set(spend.map((r) => r.category_name))].sort();
  const colorMap = assignSeriesColors(categoryNames);
  const keepNames = new Set(categoryNames.slice(0, CHART_PALETTE.length));
  const hasOther = categoryNames.length > CHART_PALETTE.length;

  const seriesList = categoryNames.slice(0, CHART_PALETTE.length).map((name) => ({
    id: name,
    name,
    color: colorMap.get(name),
  }));
  if (hasOther) seriesList.push({ id: 'Other', name: 'Other', color: OTHER_COLOR });

  const months = [...new Set(spend.map((r) => r.month))].sort();
  const spendPoints = months.map((month, i) => {
    const values = {};
    for (const row of spend.filter((r) => r.month === month)) {
      const key = keepNames.has(row.category_name) ? row.category_name : 'Other';
      values[key] = (values[key] ?? 0) + Number(row.total_amount);
    }
    return { x: i, xLabel: formatMonth(month), values };
  });

  // ---- Spend spikes: latest logged month vs the one before it, per category ----
  const spikes = [];
  for (const name of categoryNames) {
    const rows = spend.filter((r) => r.category_name === name).sort((a, b) => a.month.localeCompare(b.month));
    if (rows.length < 2) continue;
    const prev = Number(rows[rows.length - 2].total_amount);
    const latest = Number(rows[rows.length - 1].total_amount);
    if (prev > 0 && latest >= prev * 1.25) {
      spikes.push({ name, pct: Math.round(((latest - prev) / prev) * 100), month: rows[rows.length - 1].month });
    }
  }

  // ---- Balance trend: running signed total relative to the current viewer ----
  const byDate = new Map();
  for (const e of balanceEvents) {
    let signed = null;
    if (e.debtor_id === household.id) signed = Number(e.delta_amount);
    else if (e.creditor_id === household.id) signed = -Number(e.delta_amount);
    if (signed == null) continue;
    byDate.set(e.event_date, (byDate.get(e.event_date) ?? 0) + signed);
  }
  const sortedDates = [...byDate.keys()].sort();
  let running = 0;
  const balancePoints = sortedDates.map((date) => {
    running += byDate.get(date);
    return { x: new Date(`${date}T00:00:00Z`).getTime(), xLabel: formatDate(date), values: { balance: Math.round(running * 100) / 100 } };
  });
  if (balancePoints.length > 0) {
    const firstDate = new Date(balancePoints[0].x);
    firstDate.setUTCDate(firstDate.getUTCDate() - 1);
    balancePoints.unshift({ x: firstDate.getTime(), xLabel: 'Start', values: { balance: 0 } });
  }

  // ---- Benchmark comparison: household's average monthly spend vs the reference figure ----
  const spendByCategory = new Map();
  for (const row of spend) {
    if (!spendByCategory.has(row.category_name)) spendByCategory.set(row.category_name, { total: 0, months: new Set() });
    const entry = spendByCategory.get(row.category_name);
    entry.total += Number(row.total_amount);
    entry.months.add(row.month);
  }
  const benchmarkItems = benchmarks
    .map((b) => {
      const name = b.categories?.name ?? 'Unknown';
      const spendEntry = spendByCategory.get(name);
      const actual = spendEntry ? spendEntry.total / spendEntry.months.size : 0;
      return { id: b.id, name, actual: Math.round(actual * 100) / 100, benchmark: Number(b.monthly_amount) };
    })
    .filter((item) => item.actual > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page-shell">
      <NavHeader />
      <div className="page-container">
        <div className="mx-auto max-w-4xl">
          <h1 className="font-display text-3xl font-semibold text-ink mb-1">Analytics</h1>
          <p className="text-sm text-ink/60 mb-8">Trends in what's being spent and who owes what, over time.</p>

          {spikes.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-amber mb-2">Spend spikes</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {spikes.map((s) => (
                  <li key={s.name} className="rounded-2xl border border-amber/30 bg-amber/10 p-4">
                    <p className="text-sm text-ink">
                      <strong>{s.name}</strong> up {s.pct}% in {formatMonth(s.month)} vs the month before
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-1">Spend by category</h2>
            <p className="text-sm text-ink/60 mb-4">Total logged per category, by month.</p>
            <div className="card">
              <LineChart
                points={spendPoints}
                seriesList={seriesList}
                xType="band"
                emptyMessage="No bills logged yet."
              />
            </div>
          </section>

          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-1">Balance over time</h2>
            <p className="text-sm text-ink/60 mb-4">
              What you owe the rest of the household, running — above the line means you owe; below means you're owed.
            </p>
            <div className="card">
              <LineChart
                points={balancePoints}
                seriesList={[{ id: 'balance', name: 'You owe', color: CHART_PALETTE[0] }]}
                xType="time"
                areaFill
                emptyMessage="No paid bills or settlements yet."
              />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-xl font-semibold text-ink">Vs UK average</h2>
              <BenchmarkEditor
                benchmarks={benchmarks.map((b) => ({ id: b.id, category_name: b.categories?.name ?? 'Unknown', monthly_amount: b.monthly_amount }))}
              />
            </div>
            <p className="text-sm text-ink/60 mb-4">
              Your average monthly spend per category against an illustrative UK benchmark.
            </p>
            <div className="card">
              <BenchmarkChart items={benchmarkItems} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

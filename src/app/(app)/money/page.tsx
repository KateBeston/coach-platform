import Link from "next/link";
import { redirect } from "next/navigation";
import { PeriodPicker } from "@/components/period-picker";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { CATEGORIES, loadLedger, monthLabel, resolvePeriod, summarise } from "@/lib/accounting";
import { getCoach } from "@/lib/coach";
import { fmtDate, money, todayIn } from "@/lib/format";

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { supabase, coach, isManager } = await getCoach();
  if (!isManager) redirect("/");
  const period = resolvePeriod(sp.period, todayIn(coach.timezone), sp.from, sp.to);
  const { income, expenses } = await loadLedger(supabase, period.from, period.to, coach.timezone);
  const t = summarise(income, expenses, period.from, period.to);
  const cur = coach.currency;
  const gstOwing = coach.gst_registered ? t.gstCollected - t.gstPaid : 0;
  const taxOnProfit = Math.max(0, Math.round((t.profit * Number(coach.tax_set_aside_pct)) / 100));
  const maxCat = t.byCategory[0]?.[1] ?? 0;
  const qs = `period=${period.key}${period.key === "custom" ? `&from=${period.from}&to=${period.to}` : ""}`;

  return (
    <>
      <PageHeader
        title="Money"
        sub={`${period.label} · ${fmtDate(period.from)} to ${fmtDate(period.to)}`}
        action={
          <div className="flex gap-2">
            <Link href="/money/expenses" className="btn">Expenses</Link>
            <a href={`/money/export?${qs}`} className="btn-ghost">Export for accountant</a>
          </div>
        }
      />
      <PeriodPicker base="/money" period={period} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income" value={money(t.incomeEx, cur)} hint={coach.gst_registered ? "Paid invoices, ex GST" : "Paid invoices"} href="/invoices?status=paid" />
        <Stat label="Expenses" value={money(t.expensesEx, cur)} hint={coach.gst_registered ? "Ex GST" : `${expenses.length} recorded`} href={`/money/expenses?${qs}`} />
        <Stat label="Profit" value={money(t.profit, cur)} hint={t.incomeEx ? `${Math.round((t.profit / t.incomeEx) * 100)}% of income` : "Income less expenses"} />
        <Stat
          label="Set aside for tax"
          value={money(Math.max(0, gstOwing) + taxOnProfit, cur)}
          hint={coach.gst_registered ? `${money(gstOwing, cur)} GST + ${coach.tax_set_aside_pct}% of profit` : `${coach.tax_set_aside_pct}% of profit`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="section-title">Profit and loss</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-sm text-muted">
              <tr className="border-b border-line">
                <th className="py-2 font-medium">Month</th>
                <th className="py-2 text-right font-medium">Income</th>
                <th className="py-2 text-right font-medium">Expenses</th>
                <th className="py-2 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {t.months.map((m) => (
                <tr key={m.ym}>
                  <td className="py-2">{monthLabel(m.ym)}</td>
                  <td className="py-2 text-right">{money(m.income, cur)}</td>
                  <td className="py-2 text-right">{money(m.expenses, cur)}</td>
                  <td className={`py-2 text-right font-medium ${m.income - m.expenses < 0 ? "text-danger" : ""}`}>{money(m.income - m.expenses, cur)}</td>
                </tr>
              ))}
              {t.months.length > 1 && (
                <tr className="font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{money(t.incomeEx, cur)}</td>
                  <td className="py-2 text-right">{money(t.expensesEx, cur)}</td>
                  <td className="py-2 text-right">{money(t.profit, cur)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {coach.gst_registered && <p className="mt-3 text-xs text-muted">All figures ex GST. Income is counted when an invoice is paid (cash basis).</p>}
        </section>

        <div className="space-y-5">
          {coach.gst_registered && (
            <section className="card">
              <h2 className="section-title">GST for your BAS</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted">G1 Total sales</dt><dd>{money(t.incomeTotal, cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">1A GST on sales</dt><dd>{money(t.gstCollected, cur)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">1B GST on purchases</dt><dd>{money(t.gstPaid, cur)}</dd></div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold">
                  <dt>{gstOwing >= 0 ? "GST to pay" : "GST refund"}</dt>
                  <dd>{money(Math.abs(gstOwing), cur)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">Cash basis. Pick a quarter above to match your BAS period, and check with your accountant before lodging.</p>
            </section>
          )}

          <section className="card">
            <h2 className="section-title">Where the money went</h2>
            {t.byCategory.length ? (
              <ul className="space-y-2.5 text-sm">
                {t.byCategory.map(([cat, v]) => (
                  <li key={cat}>
                    <div className="flex justify-between"><span>{CATEGORIES[cat] ?? cat}</span><span className="text-muted">{money(v, cur)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-stone-soft">
                      <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${maxCat ? Math.max(4, (v / maxCat) * 100) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No expenses in this period. <Link href="/money/expenses" className="text-accent hover:underline">Add one</Link>.</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

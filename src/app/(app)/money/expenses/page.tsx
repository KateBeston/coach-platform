import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { PeriodPicker } from "@/components/period-picker";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { CATEGORIES, loadLedger, resolvePeriod } from "@/lib/accounting";
import { getCoach } from "@/lib/coach";
import { fmtDate, money, todayIn } from "@/lib/format";
import { createExpenseAction, deleteExpenseAction } from "../../actions";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string; category?: string; error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { supabase, coach, isManager } = await getCoach();
  if (!isManager) redirect("/");
  const today = todayIn(coach.timezone);
  const period = resolvePeriod(sp.period ?? "fy", today, sp.from, sp.to);
  const { expenses: all } = await loadLedger(supabase, period.from, period.to, coach.timezone);
  const expenses = sp.category ? all.filter((e) => e.category === sp.category) : all;
  const total = expenses.reduce((t, e) => t + e.amount_cents, 0);
  const cur = coach.currency;

  return (
    <>
      <p className="text-sm text-muted"><Link href="/money" className="hover:text-ink">Money</Link> /</p>
      <PageHeader title="Expenses" sub={`${period.label} · ${expenses.length} recorded · ${money(total, cur)}`} />
      <Banner error={sp.error} message={sp.saved ? "Expense saved." : undefined} />
      <PeriodPicker base="/money/expenses" period={period} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-0 lg:col-span-2">
          {expenses.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-sm text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Paid to</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Category</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {expenses.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="px-5 py-3 whitespace-nowrap">{fmtDate(e.spent_on)}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{e.supplier}</p>
                      {e.description && <p className="text-xs text-muted">{e.description}</p>}
                      {e.receipt_path && <a href={`/money/receipt/${e.id}`} target="_blank" className="text-xs text-accent hover:underline">Receipt</a>}
                    </td>
                    <td className="hidden px-5 py-3 md:table-cell">{CATEGORIES[e.category] ?? e.category}</td>
                    <td className="px-5 py-3 text-right">
                      {money(e.amount_cents, cur)}
                      {coach.gst_registered && e.gst_cents > 0 && <p className="text-xs text-muted">incl. {money(e.gst_cents, cur)} GST</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="text-xs text-muted hover:text-danger">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-5"><Empty>No expenses in this period.</Empty></div>
          )}
        </section>

        <section className="card h-fit">
          <h2 className="section-title">Add an expense</h2>
          <ExpenseForm action={createExpenseAction} today={today} gstRegistered={coach.gst_registered} gstRate={Number(coach.gst_rate)} />
        </section>
      </div>
    </>
  );
}

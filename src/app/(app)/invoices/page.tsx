import { redirect } from "next/navigation";
import Link from "next/link";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { fmtDate, fullName, money, todayIn } from "@/lib/format";

const FILTERS = ["all", "draft", "sent", "paid", "void"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  const { supabase, coach, isManager } = await getCoach();
  if (!isManager) redirect("/");
  const today = todayIn(coach.timezone);
  const fyStartYear = Number(today.slice(5, 7)) >= 7 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const fyStart = `${fyStartYear}-07-01`;

  let q = supabase
    .from("invoices")
    .select("id, number, status, issue_date, due_date, total_cents, tax_cents, currency, paid_at, client:clients(first_name, last_name)")
    .order("issue_date", { ascending: false })
    .order("number", { ascending: false });
  if (status !== "all") q = q.eq("status", status);
  const [{ data: invoices }, { data: fy }] = await Promise.all([
    q,
    supabase.from("invoices").select("total_cents, tax_cents").eq("status", "paid").gte("paid_at", fyStart),
  ]);

  const fyIncome = (fy ?? []).reduce((t, i) => t + i.total_cents, 0);
  const fyGst = (fy ?? []).reduce((t, i) => t + i.tax_cents, 0);

  return (
    <>
      <PageHeader title="Invoices" action={<Link href="/invoices/new" className="btn">New invoice</Link>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Received this financial year" value={money(fyIncome, coach.currency)} hint={`Since ${fmtDate(fyStart)}`} />
        {coach.gst_registered && <Stat label="GST collected this financial year" value={money(fyGst, coach.currency)} />}
        <Stat label="Income ex GST" value={money(fyIncome - fyGst, coach.currency)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f} href={`/invoices?status=${f}`} className={`rounded-full px-3 py-1 text-sm capitalize ${f === status ? "bg-accent text-white" : "bg-surface text-ink/80 ring-1 ring-line"}`}>
            {f === "sent" ? "Unpaid" : f}
          </Link>
        ))}
      </div>

      <div className="card p-0">
        {invoices?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-sm text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">Issued</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((i) => {
                const c = i.client as unknown as { first_name: string; last_name: string } | null;
                const overdue = i.status === "sent" && i.due_date && i.due_date < today;
                return (
                  <tr key={i.id} className="hover:bg-bg/60">
                    <td className="px-5 py-3"><Link href={`/invoices/${i.id}`} className="font-medium hover:text-accent">{i.number}</Link></td>
                    <td className="px-5 py-3">{c ? fullName(c) : ""}</td>
                    <td className="hidden px-5 py-3 sm:table-cell">{fmtDate(i.issue_date)}</td>
                    <td className="px-5 py-3 text-right">{money(i.total_cents, i.currency)}</td>
                    <td className="px-5 py-3">{overdue ? <Pill status="overdue" /> : <Pill status={i.status} label={i.status === "sent" ? "unpaid" : undefined} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-5"><Empty>No invoices here.</Empty></div>
        )}
      </div>
    </>
  );
}

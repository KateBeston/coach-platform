import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { fmtDate, fullName, money, todayIn } from "@/lib/format";
import { setInvoiceStatusAction } from "../../actions";
import { PrintButton } from "@/components/print-button";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, coach } = await getCoach();
  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*, client:clients(id, first_name, last_name, email)").eq("id", id).single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
  ]);
  if (!inv) notFound();
  const client = inv.client as unknown as { id: string; first_name: string; last_name: string; email: string | null };
  const overdue = inv.status === "sent" && inv.due_date && inv.due_date < todayIn(coach.timezone);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted"><Link href="/invoices" className="hover:text-ink">Invoices</Link> / {inv.number}</p>
        <div className="flex flex-wrap items-center gap-2">
          {inv.status === "draft" && (
            <form action={setInvoiceStatusAction}>
              <input type="hidden" name="id" value={id} />
              <button name="status" value="sent" className="btn">Mark as sent</button>
            </form>
          )}
          {(inv.status === "sent" || inv.status === "draft") && (
            <form action={setInvoiceStatusAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={id} />
              <select name="payment_method" className="input w-40">
                <option>Bank transfer</option>
                <option>PayID</option>
                <option>Card</option>
                <option>Cash</option>
                <option>Other</option>
              </select>
              <button name="status" value="paid" className="btn">Mark as paid</button>
            </form>
          )}
          {inv.status !== "void" && inv.status !== "paid" && (
            <form action={setInvoiceStatusAction}>
              <input type="hidden" name="id" value={id} />
              <button name="status" value="void" className="btn-ghost">Void</button>
            </form>
          )}
          <PrintButton />
        </div>
      </div>

      <article className="card mx-auto max-w-3xl p-8 print:border-0 print:p-0">
        <header className="mb-8 flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-serif text-2xl">{coach.business_name || coach.display_name}</p>
            <p className="text-sm text-muted">{coach.email}</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-2xl">{coach.gst_registered ? "Tax invoice" : "Invoice"}</p>
            <p className="text-sm">{inv.number}</p>
            <div className="mt-1 print:hidden">{overdue ? <Pill status="overdue" /> : <Pill status={inv.status} label={inv.status === "sent" ? "unpaid" : undefined} />}</div>
          </div>
        </header>

        <div className="mb-8 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="label">Billed to</p>
            <Link href={`/clients/${client.id}`} className="print:no-underline">{fullName(client)}</Link>
            {client.email && <p className="text-muted">{client.email}</p>}
          </div>
          <div>
            <p className="label">Issued</p>
            <p>{fmtDate(inv.issue_date)}</p>
          </div>
          <div>
            <p className="label">{inv.status === "paid" ? "Paid" : "Due"}</p>
            <p>{inv.status === "paid" && inv.paid_at ? `${fmtDate(inv.paid_at, coach.timezone)} · ${inv.payment_method}` : inv.due_date ? fmtDate(inv.due_date) : "–"}</p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-muted uppercase">
            <tr className="border-b border-line">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items?.map((it) => (
              <tr key={it.id}>
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{Number(it.quantity)}</td>
                <td className="py-2 text-right">{money(it.unit_cents, inv.currency)}</td>
                <td className="py-2 text-right">{money(Math.round(Number(it.quantity) * it.unit_cents), inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <p className="flex justify-between"><span className="text-muted">Subtotal</span>{money(inv.subtotal_cents, inv.currency)}</p>
          {coach.gst_registered && <p className="flex justify-between"><span className="text-muted">GST ({Number(coach.gst_rate)}%)</span>{money(inv.tax_cents, inv.currency)}</p>}
          <p className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span>{money(inv.total_cents, inv.currency)}</p>
        </div>

        {inv.notes && <p className="mt-8 text-sm whitespace-pre-line text-muted">{inv.notes}</p>}
      </article>
    </>
  );
}

import { Banner, Empty, PageHeader } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { fmtDateTime, fullName } from "@/lib/format";
import { createInvoiceAction } from "../../actions";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; error?: string }> }) {
  const { client: clientId, error } = await searchParams;
  const { supabase, coach } = await getCoach();

  const { data: clients } = await supabase.from("clients").select("id, first_name, last_name").neq("status", "alumni").order("first_name");

  let uninvoiced: { id: string; starts_at: string; status: string }[] = [];
  if (clientId) {
    const [{ data: sessions }, { data: billed }] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, starts_at, status")
        .eq("client_id", clientId)
        .in("status", ["completed", "late_cancel", "no_show", "scheduled"])
        .order("starts_at"),
      supabase.from("invoice_items").select("session_id").not("session_id", "is", null),
    ]);
    const billedIds = new Set((billed ?? []).map((b) => b.session_id));
    uninvoiced = (sessions ?? []).filter((s) => !billedIds.has(s.id)).slice(0, 20);
  }

  return (
    <>
      <PageHeader title="New invoice" sub={coach.gst_registered ? `GST at ${coach.gst_rate}% is added automatically.` : undefined} />
      <Banner error={error} />

      <form className="card mb-4 flex max-w-2xl items-end gap-2">
        <div className="flex-1">
          <label className="label">Client</label>
          <select name="client" className="input" defaultValue={clientId ?? ""}>
            <option value="" disabled>Choose a client</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </select>
        </div>
        <button className="btn-ghost">Choose</button>
      </form>

      {clientId && (
        <form action={createInvoiceAction} className="card max-w-2xl space-y-5">
          <input type="hidden" name="client_id" value={clientId} />
          <div>
            <h2 className="section-title">Sessions not yet invoiced</h2>
            {uninvoiced.length ? (
              <ul className="space-y-1.5">
                {uninvoiced.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="session_ids" value={s.id} defaultChecked={s.status !== "scheduled"} />
                      {fmtDateTime(s.starts_at, coach.timezone)}
                      <span className="text-xs text-muted">{s.status === "scheduled" ? "upcoming" : s.status.replace("_", " ")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>All of this client&apos;s sessions are invoiced.</Empty>
            )}
            <p className="mt-2 text-xs text-muted">Each session is priced from its arrangement or offer. Package prices are split per session.</p>
          </div>

          <div>
            <h2 className="section-title">Other line item</h2>
            <div className="grid gap-2 sm:grid-cols-[1fr_80px_120px]">
              <input name="custom_description" className="input" placeholder="e.g. 6-session package" />
              <input name="custom_quantity" type="number" className="input" defaultValue={1} min={1} />
              <input name="custom_amount" type="number" className="input" placeholder="Price ($)" min={0} step="0.01" />
            </div>
          </div>

          <div>
            <label className="label">Note on invoice</label>
            <textarea name="notes" className="input min-h-16" placeholder="Payment details, e.g. BSB and account number or PayID" />
          </div>
          <button className="btn">Create invoice</button>
        </form>
      )}
    </>
  );
}

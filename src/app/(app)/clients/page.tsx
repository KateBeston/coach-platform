import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { cadenceLabel, fmtDateTime, fullName } from "@/lib/format";

const FILTERS = ["all", "lead", "active", "paused", "alumni"];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "all", q = "" } = await searchParams;
  const { supabase, coach } = await getCoach();

  let query = supabase.from("clients").select("id, first_name, last_name, email, status, source").order("first_name");
  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);

  const [{ data: clients }, { data: arrangements }] = await Promise.all([
    query,
    supabase.from("arrangement_overview").select("client_id, cadence, next_session_at, needs_booking").eq("status", "active"),
  ]);
  const byClient = new Map((arrangements ?? []).map((a) => [a.client_id, a]));

  return (
    <>
      <PageHeader title="Clients" action={<Link href="/clients/new" className="btn">Add client</Link>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/clients?status=${f}`}
            className={`rounded-full px-3 py-1 text-sm capitalize ${f === status ? "bg-accent text-white" : "bg-surface text-ink/80 ring-1 ring-line"}`}
          >
            {f}
          </Link>
        ))}
        <form className="ml-auto">
          <input type="hidden" name="status" value={status} />
          <input className="input w-56" name="q" defaultValue={q} placeholder="Search name or email" />
        </form>
      </div>

      <div className="card p-0">
        {clients?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-muted uppercase">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">Arrangement</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Next session</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((c) => {
                const a = byClient.get(c.id);
                return (
                  <tr key={c.id} className="hover:bg-bg/60">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-accent">{fullName(c)}</Link>
                      <p className="text-xs text-muted">{c.email}</p>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">{a ? cadenceLabel(a.cadence ?? "") : <span className="text-muted">None</span>}</td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      {a?.next_session_at ? fmtDateTime(a.next_session_at, coach.timezone) : a?.needs_booking ? <Pill status="overdue" label="Needs booking" /> : <span className="text-muted">–</span>}
                    </td>
                    <td className="px-5 py-3"><Pill status={c.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-5"><Empty>No clients here yet.</Empty></div>
        )}
      </div>
    </>
  );
}

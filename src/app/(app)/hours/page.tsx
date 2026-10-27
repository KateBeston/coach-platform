import Link from "next/link";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { fmtDate, fullName } from "@/lib/format";

export default async function HoursPage() {
  const { supabase, coach, me } = await getCoach();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, starts_at, ends_at, is_paid_coaching, client:clients(first_name, last_name, email)")
    .eq("practitioner_id", me.id)
    .eq("status", "completed")
    .eq("counts_toward_icf", true)
    .order("starts_at", { ascending: false });

  const rows = (sessions ?? []).map((s) => ({
    ...s,
    hours: (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000,
    client: s.client as unknown as { first_name: string; last_name: string; email: string | null } | null,
  }));
  const total = rows.reduce((t, r) => t + r.hours, 0);
  const paid = rows.filter((r) => r.is_paid_coaching).reduce((t, r) => t + r.hours, 0);
  const clients = new Set(rows.map((r) => r.client?.email ?? fullName(r.client ?? {}))).size;

  return (
    <>
      <PageHeader
        title="Coaching hours"
        sub="Your coaching log, built from completed sessions. Ready for ICF credential applications."
        action={<Link href="/hours/export" className="btn-ghost">Download CSV</Link>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total hours" value={total.toFixed(1)} />
        <Stat label="Paid hours" value={paid.toFixed(1)} />
        <Stat label="Pro bono hours" value={(total - paid).toFixed(1)} />
        <Stat label="Clients coached" value={String(clients)} />
      </div>
      <p className="mb-4 text-sm text-muted">
        For reference, ICF&apos;s ACC credential asks for 100 hours (75 paid) with at least 8 clients, and PCC for 500 hours (450 paid) with at least 25 clients. Check ICF&apos;s current requirements before applying.
      </p>
      <div className="card p-0">
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-sm text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Hours</th>
                <th className="px-5 py-3 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5"><Link href={`/sessions/${r.id}`} className="hover:text-accent">{fmtDate(r.starts_at, coach.timezone)}</Link></td>
                  <td className="px-5 py-2.5">{r.client ? fullName(r.client) : ""}</td>
                  <td className="px-5 py-2.5">{r.hours.toFixed(2)}</td>
                  <td className="px-5 py-2.5">{r.is_paid_coaching ? "Paid" : "Pro bono"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5"><Empty>Hours appear here as you mark sessions completed.</Empty></div>
        )}
      </div>
    </>
  );
}

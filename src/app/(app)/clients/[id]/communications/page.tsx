import Link from "next/link";
import { notFound } from "next/navigation";
import { CommList } from "@/components/comm-list";
import { Banner, PageHeader } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { CHANNEL, loadCommunications } from "@/lib/communications";
import { fullName, utcToZonedInput } from "@/lib/format";
import { logCommunicationAction } from "../../../actions";

export default async function ClientCommunicationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; channel?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, coach } = await getCoach();
  const { data: client } = await supabase.from("clients").select("id, first_name, last_name, email, phone").eq("id", id).maybeSingle();
  if (!client) notFound();
  const all = await loadCommunications(supabase, id, 500);
  const rows = sp.channel ? all.filter((c) => c.channel === sp.channel) : all;
  const now = utcToZonedInput(new Date().toISOString(), coach.timezone);
  const counts = all.reduce<Record<string, number>>((m, c) => ((m[c.channel] = (m[c.channel] ?? 0) + 1), m), {});

  return (
    <>
      <p className="text-sm text-muted">
        <Link href="/clients" className="hover:text-ink">Clients</Link> / <Link href={`/clients/${id}`} className="hover:text-ink">{fullName(client)}</Link> /
      </p>
      <PageHeader title="Communications" sub={`Every email, SMS, call and message with ${client.first_name}. ${all.length} recorded.`} />
      <Banner error={sp.error} message={sp.saved ? "Recorded." : undefined} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2">
            <Link href={`/clients/${id}/communications`} className={`rounded-full px-3 py-1 text-sm ${!sp.channel ? "bg-accent text-white" : "bg-surface ring-1 ring-line"}`}>All</Link>
            {Object.entries(counts).map(([ch, n]) => (
              <Link key={ch} href={`/clients/${id}/communications?channel=${ch}`} className={`rounded-full px-3 py-1 text-sm ${sp.channel === ch ? "bg-accent text-white" : "bg-surface ring-1 ring-line"}`}>
                {CHANNEL[ch] ?? ch} · {n}
              </Link>
            ))}
          </div>
          <CommList rows={rows} tz={coach.timezone} full />
        </section>

        <section className="card h-fit">
          <h2 className="section-title">Record a communication</h2>
          <p className="mb-3 text-xs text-muted">For anything sent outside the app: a text from your phone, a call, an email from your own inbox, or something the client sent you.</p>
          <form action={logCommunicationAction} className="space-y-3">
            <input type="hidden" name="client_id" value={id} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">How</label>
                <select name="channel" className="input" defaultValue="sms">
                  {Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Direction</label>
                <select name="direction" className="input" defaultValue="outbound">
                  <option value="outbound">To client</option>
                  <option value="inbound">From client</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">When</label>
              <input type="datetime-local" name="occurred_at" className="input" defaultValue={now} />
            </div>
            <div>
              <label className="label">Subject or summary</label>
              <input name="subject" className="input" placeholder="e.g. Checked in about homework" />
            </div>
            <div>
              <label className="label">Message or notes</label>
              <textarea name="body" className="input min-h-28" placeholder="Paste the message, or note what was said" />
            </div>
            <button className="btn w-full">Record it</button>
          </form>
          {(client.email || client.phone) && (
            <p className="mt-3 text-xs text-muted">
              {client.email && <>Email: <a className="text-accent" href={`mailto:${client.email}`}>{client.email}</a></>}
              {client.email && client.phone && " · "}
              {client.phone && <>Phone: <a className="text-accent" href={`sms:${client.phone}`}>{client.phone}</a></>}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

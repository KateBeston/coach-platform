import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner, Empty, Pill } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { fmtDateTime, fmtTime, fullName, utcToZonedInput } from "@/lib/format";
import {
  addNoteAction,
  invoiceFromSessionAction,
  rescheduleSessionAction,
  toggleActionItemAction,
  updateSessionStatusAction,
} from "../../actions";

type ActionItem = { text: string; done: boolean };

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, coach, team, isManager, hasTeam } = await getCoach();
  const tz = coach.timezone;
  const back = `/sessions/${id}`;

  const [{ data: s }, notes, invoiced] = await Promise.all([
    supabase.from("sessions").select("*, client:clients(id, first_name, last_name, email), offer:offers(name)").eq("id", id).single(),
    supabase.from("notes").select("*").eq("session_id", id).order("created_at"),
    supabase.from("invoice_items").select("invoice_id, invoice:invoices(number, status)").eq("session_id", id).limit(1),
  ]);
  if (!s) notFound();

  const client = s.client as unknown as { id: string; first_name: string; last_name: string; email: string | null };
  const offer = s.offer as unknown as { name: string } | null;
  const minutes = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60_000);

  // Prep brief: the most recent earlier notes and any action items still open.
  const { data: earlier } = await supabase
    .from("notes")
    .select("id, body, action_items, created_at")
    .eq("client_id", client.id)
    .lt("created_at", s.starts_at)
    .order("created_at", { ascending: false })
    .limit(3);
  const openItems = (earlier ?? []).flatMap((nt) =>
    (nt.action_items as ActionItem[]).map((item, i) => ({ ...item, noteId: nt.id, index: i })).filter((x) => !x.done),
  );
  const invoice = invoiced.data?.[0]?.invoice as unknown as { number: string; status: string } | undefined;

  return (
    <>
      <Banner error={error} />
      <p className="text-sm text-muted">
        <Link href={`/clients/${client.id}`} className="hover:text-ink">{fullName(client)}</Link> /
      </p>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{fmtDateTime(s.starts_at, tz)}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Pill status={s.status} /> {fmtTime(s.starts_at, tz)} – {fmtTime(s.ends_at, tz)} · {offer?.name ?? "Session"} ·{" "}
            {s.location_type.replace("_", " ")}
            {!s.is_paid_coaching && " · pro bono"}
            {hasTeam && s.practitioner_id && ` · with ${team.find((m) => m.id === s.practitioner_id)?.name ?? ""}`}
          </p>
        </div>
        {s.meeting_url && s.status === "scheduled" && (
          <a href={s.meeting_url} target="_blank" className="btn">Join video call</a>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {s.status === "scheduled" && (
            <section className="card">
              <h2 className="section-title">Prep brief</h2>
              {earlier?.length ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted">Last note · {fmtDateTime(earlier[0].created_at, tz)}</p>
                    <p className="whitespace-pre-line">{earlier[0].body || "No written note."}</p>
                  </div>
                  {openItems.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted">Open action items</p>
                      <ul className="list-disc space-y-0.5 pl-5">
                        {openItems.map((x) => <li key={`${x.noteId}-${x.index}`}>{x.text}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <Empty>First session with {client.first_name}. No earlier notes.</Empty>
              )}
            </section>
          )}

          <section className="card">
            <h2 className="section-title">Session notes</h2>
            {notes.data?.length ? (
              <ul className="mb-4 space-y-4">
                {notes.data.map((nt) => (
                  <li key={nt.id} className="border-l-2 border-line pl-3">
                    {nt.body && <p className="text-sm whitespace-pre-line">{nt.body}</p>}
                    {(nt.action_items as ActionItem[]).map((item, i) => (
                      <form key={i} action={toggleActionItemAction} className="mt-1 flex items-center gap-2 text-sm">
                        <input type="hidden" name="note_id" value={nt.id} />
                        <input type="hidden" name="index" value={i} />
                        <input type="hidden" name="back" value={back} />
                        <button className={`h-4 w-4 shrink-0 rounded border ${item.done ? "border-accent bg-accent" : "border-line"}`} aria-label="Toggle" />
                        <span className={item.done ? "text-muted line-through" : ""}>{item.text}</span>
                      </form>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={addNoteAction} className="space-y-2">
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="session_id" value={id} />
              <input type="hidden" name="back" value={back} />
              <textarea name="body" className="input min-h-28" placeholder="What came up in this session" />
              <textarea name="action_items" className="input min-h-14" placeholder="Action items, one per line" />
              <button className="btn btn-sm">Save note</button>
            </form>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card">
            <h2 className="section-title">Outcome</h2>
            <form action={updateSessionStatusAction} className="grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <button name="status" value="completed" className="btn">Completed</button>
              <button name="status" value="no_show" className="btn-ghost">No-show</button>
              <button name="status" value="late_cancel" className="btn-ghost">Late cancel</button>
              <button name="status" value="cancelled" className="btn-ghost">Cancelled</button>
              {s.status !== "scheduled" && <button name="status" value="scheduled" className="btn-ghost col-span-2">Back to scheduled</button>}
            </form>
            <p className="mt-2 text-xs text-muted">No-shows and late cancellations count towards a package.</p>
          </section>

          {isManager && (
          <section className="card">
            <h2 className="section-title">Billing</h2>
            {invoice ? (
              <p className="flex items-center justify-between text-sm">
                <Link href={`/invoices/${invoiced.data![0].invoice_id}`} className="hover:text-accent">Invoice {invoice.number}</Link>
                <Pill status={invoice.status} />
              </p>
            ) : (
              <form action={invoiceFromSessionAction}>
                <input type="hidden" name="session_id" value={id} />
                <button className="btn-ghost w-full">Create invoice for this session</button>
              </form>
            )}
          </section>
          )}

          <section className="card">
            <h2 className="section-title">Details</h2>
            <form action={rescheduleSessionAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <div>
                <label className="label">Date and time</label>
                <input type="datetime-local" name="starts_at" className="input" defaultValue={utcToZonedInput(s.starts_at, tz)} step={900} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Minutes</label>
                  <input type="number" name="minutes" className="input" defaultValue={minutes} min={15} step={5} />
                </div>
                <div>
                  <label className="label">Where</label>
                  <select name="location_type" className="input" defaultValue={s.location_type}>
                    <option value="video">Video</option>
                    <option value="in_person">In person</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Meeting link or address</label>
                <input name="meeting_url" className="input" defaultValue={s.meeting_url ?? ""} placeholder="https://zoom.us/j/…" />
                <input name="location_detail" className="input mt-2" defaultValue={s.location_detail ?? ""} placeholder="Address or room (in person)" />
              </div>
              {isManager && hasTeam && (
                <div>
                  <label className="label">With</label>
                  <select name="practitioner_id" className="input" defaultValue={s.practitioner_id ?? ""}>
                    {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pro_bono" defaultChecked={!s.is_paid_coaching} /> Pro bono</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="counts_toward_icf" defaultChecked={s.counts_toward_icf} /> Counts towards coaching hours log</label>
              <button className="btn-ghost w-full">Save changes</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

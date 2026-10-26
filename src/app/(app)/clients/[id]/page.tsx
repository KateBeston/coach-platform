import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientFields } from "@/components/client-fields";
import { Banner, Empty, Pill } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { WEEKDAYS, cadenceLabel, fmtDate, fmtDateTime, fmtRelativeDays, fullName, money, todayIn } from "@/lib/format";
import {
  addGoalAction,
  addNoteAction,
  bookSessionAction,
  createArrangementAction,
  setGoalStatusAction,
  toggleActionItemAction,
  topUpBookingsAction,
  updateArrangementAction,
  updateClientAction,
} from "../../actions";

type ActionItem = { text: string; done: boolean };

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, coach } = await getCoach();
  const tz = coach.timezone;
  const now = new Date().toISOString();
  const back = `/clients/${id}`;

  const [{ data: client }, arrangements, upcoming, past, notes, goals, invoices, activity, offers] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("arrangement_overview").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("sessions").select("*").eq("client_id", id).gte("starts_at", now).eq("status", "scheduled").order("starts_at").limit(8),
    supabase.from("sessions").select("id, starts_at, status").eq("client_id", id).lt("starts_at", now).order("starts_at", { ascending: false }).limit(8),
    supabase.from("notes").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("goals").select("*").eq("client_id", id).order("created_at"),
    supabase.from("invoices").select("id, number, status, total_cents, currency, issue_date").eq("client_id", id).order("issue_date", { ascending: false }),
    supabase.from("activity").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("offers").select("id, name, kind, session_minutes, session_count, price_cents").eq("active", true).order("name"),
  ]);
  if (!client) notFound();

  const activeArr = (arrangements.data ?? []).filter((a) => a.status !== "ended");
  const pastArr = (arrangements.data ?? []).filter((a) => a.status === "ended");
  const completed = (past.data ?? []).filter((s) => s.status === "completed");

  return (
    <>
      <Banner error={error} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted"><Link href="/clients" className="hover:text-ink">Clients</Link> /</p>
          <h1 className="text-3xl">{fullName(client)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Pill status={client.status} />
            {client.email && <a href={`mailto:${client.email}`} className="hover:text-ink">{client.email}</a>}
            {client.phone && <span>· {client.phone}</span>}
            <span>· last session {fmtRelativeDays(completed[0]?.starts_at ?? null)}</span>
          </p>
        </div>
        <details className="group">
          <summary className="btn-ghost cursor-pointer list-none">Edit details</summary>
          <form action={updateClientAction} className="card absolute right-4 z-10 mt-2 w-[min(36rem,calc(100vw-2rem))] space-y-4 shadow-lg md:right-8">
            <input type="hidden" name="id" value={client.id} />
            <ClientFields client={client} />
            <button className="btn">Save</button>
          </form>
        </details>
      </div>

      {client.background && <p className="card mb-5 text-sm whitespace-pre-line">{client.background}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Arrangement */}
          <section className="card">
            <h2 className="section-title">Arrangement</h2>
            {activeArr.length ? (
              <div className="space-y-4">
                {activeArr.map((a) => (
                  <div key={a.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {cadenceLabel(a.cadence ?? "")}
                          {a.preferred_weekday !== null && a.preferred_time && (
                            <span className="font-normal text-muted"> · {WEEKDAYS[a.preferred_weekday]}s at {a.preferred_time.slice(0, 5)}</span>
                          )}
                        </p>
                        <p className="text-sm text-muted">
                          {a.session_minutes} min · {money(a.price_cents, coach.currency)}
                          {a.sessions_total ? ` for ${a.sessions_total} sessions` : " per session"}
                          {a.auto_book && ["weekly", "fortnightly", "monthly"].includes(a.cadence ?? "") ? " · standing booking on" : ""}
                        </p>
                        {a.paused_until && a.paused_until >= todayIn(tz) && (
                          <p className="text-sm text-warn">Paused until {fmtDate(a.paused_until)}</p>
                        )}
                      </div>
                      {a.needs_booking ? <Pill status="overdue" label="Needs booking" /> : a.status === "paused" ? <Pill status="paused" /> : <Pill status="active" label="On track" />}
                    </div>

                    {a.sessions_total && (
                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-bg">
                          <div className="h-full bg-accent" style={{ width: `${Math.min(100, ((a.sessions_used ?? 0) / a.sessions_total) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {a.sessions_used} used · {a.sessions_upcoming} booked · {a.sessions_unbooked} still to book
                        </p>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.auto_book && ["weekly", "fortnightly", "monthly"].includes(a.cadence ?? "") && (
                        <form action={topUpBookingsAction}>
                          <input type="hidden" name="arrangement_id" value={a.id ?? ""} />
                          <input type="hidden" name="client_id" value={id} />
                          <button className="btn-ghost btn-sm">Book next 12 weeks</button>
                        </form>
                      )}
                      <details>
                        <summary className="btn-ghost btn-sm cursor-pointer list-none">Pause or end</summary>
                        <form action={updateArrangementAction} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={a.id ?? ""} />
                          <input type="hidden" name="client_id" value={id} />
                          <div>
                            <label className="label">Change to</label>
                            <select name="status" className="input" defaultValue="paused">
                              <option value="paused">Pause</option>
                              <option value="active">Resume</option>
                              <option value="ended">End</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Pause until (optional)</label>
                            <input type="date" name="paused_until" className="input" />
                          </div>
                          <button className="btn btn-sm">Update</button>
                          <p className="w-full text-xs text-muted">Pausing or ending cancels the booked sessions it covers.</p>
                        </form>
                      </details>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No ongoing arrangement. Add one so sessions book themselves and nothing slips.</Empty>
            )}

            <details className="mt-4" open={!activeArr.length}>
              <summary className="cursor-pointer text-sm font-medium text-accent">Add an arrangement</summary>
              <form action={createArrangementAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="client_id" value={id} />
                <div className="sm:col-span-2">
                  <label className="label">Offer</label>
                  <select name="offer_id" className="input">
                    <option value="">No offer, set details below</option>
                    {offers.data?.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} ({money(o.price_cents, coach.currency)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">How often</label>
                  <select name="cadence" className="input" defaultValue="weekly">
                    <option value="weekly">Weekly</option>
                    <option value="fortnightly">Fortnightly</option>
                    <option value="monthly">Monthly (every 4 weeks)</option>
                    <option value="package">Package, booked as needed</option>
                    <option value="ad_hoc">As needed</option>
                  </select>
                </div>
                <div>
                  <label className="label">Day</label>
                  <select name="preferred_weekday" className="input" defaultValue="">
                    <option value="">–</option>
                    {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Time</label>
                  <input type="time" name="preferred_time" className="input" step={900} />
                </div>
                <div>
                  <label className="label">Minutes</label>
                  <input type="number" name="session_minutes" className="input" placeholder="From offer" min={15} step={5} />
                </div>
                <div>
                  <label className="label">Total sessions</label>
                  <input type="number" name="sessions_total" className="input" placeholder="Ongoing" min={1} />
                </div>
                <div>
                  <label className="label">Price ($)</label>
                  <input type="number" name="price" className="input" placeholder="From offer" min={0} step="0.01" />
                </div>
                <div>
                  <label className="label">Starts</label>
                  <input type="date" name="start_date" className="input" defaultValue={todayIn(tz)} />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-3">
                  <input type="checkbox" name="auto_book" defaultChecked /> Book sessions automatically at this day and time (standing booking)
                </label>
                <div className="sm:col-span-3"><button className="btn">Save arrangement</button></div>
              </form>
            </details>
          </section>

          {/* Sessions */}
          <section className="card">
            <h2 className="section-title">Upcoming sessions</h2>
            {upcoming.data?.length ? (
              <ul className="divide-y divide-line">
                {upcoming.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/sessions/${s.id}`} className="hover:text-accent">{fmtDateTime(s.starts_at, tz)}</Link>
                    <span className="text-xs text-muted">{s.booked_by === "auto" ? "Standing booking" : s.booked_by === "client" ? "Booked by client" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing booked.</Empty>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-accent">Book a session</summary>
              <form action={bookSessionAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="client_id" value={id} />
                <div>
                  <label className="label">Date and time</label>
                  <input type="datetime-local" name="starts_at" className="input" step={900} required />
                </div>
                <div>
                  <label className="label">Minutes</label>
                  <input type="number" name="minutes" className="input" defaultValue={activeArr[0]?.session_minutes ?? 60} min={15} step={5} />
                </div>
                <div>
                  <label className="label">Where</label>
                  <select name="location_type" className="input">
                    <option value="video">Video</option>
                    <option value="in_person">In person</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
                {activeArr.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="label">Counts towards</label>
                    <select name="arrangement_id" className="input" defaultValue={activeArr[0].id ?? ""}>
                      {activeArr.map((a) => <option key={a.id} value={a.id ?? ""}>{cadenceLabel(a.cadence ?? "")} arrangement</option>)}
                      <option value="">A one-off session</option>
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" name="pro_bono" /> Pro bono
                </label>
                <div className="sm:col-span-3"><button className="btn">Book</button></div>
              </form>
            </details>

            {past.data && past.data.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Recent</h3>
                <ul className="space-y-1 text-sm">
                  {past.data.map((s) => (
                    <li key={s.id} className="flex items-center justify-between">
                      <Link href={`/sessions/${s.id}`} className="hover:text-accent">{fmtDateTime(s.starts_at, tz)}</Link>
                      <Pill status={s.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Notes */}
          <section className="card">
            <h2 className="section-title">Notes</h2>
            <form action={addNoteAction} className="mb-5 space-y-2">
              <input type="hidden" name="client_id" value={id} />
              <textarea name="body" className="input min-h-20" placeholder="What came up, what shifted, what to pick up next time" />
              <textarea name="action_items" className="input min-h-14" placeholder="Action items, one per line" />
              <button className="btn btn-sm">Add note</button>
            </form>
            {notes.data?.length ? (
              <ul className="space-y-4">
                {notes.data.map((nt) => (
                  <li key={nt.id} className="border-l-2 border-line pl-3">
                    <p className="text-xs text-muted">
                      {fmtDateTime(nt.created_at, tz)}
                      {nt.session_id && <> · <Link href={`/sessions/${nt.session_id}`} className="hover:text-ink">session</Link></>}
                    </p>
                    {nt.body && <p className="mt-1 text-sm whitespace-pre-line">{nt.body}</p>}
                    {(nt.action_items as ActionItem[]).length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {(nt.action_items as ActionItem[]).map((item, i) => (
                          <li key={i}>
                            <form action={toggleActionItemAction} className="flex items-center gap-2 text-sm">
                              <input type="hidden" name="note_id" value={nt.id} />
                              <input type="hidden" name="index" value={i} />
                              <input type="hidden" name="back" value={back} />
                              <button className={`h-4 w-4 shrink-0 rounded border ${item.done ? "border-accent bg-accent" : "border-line"}`} aria-label="Toggle" />
                              <span className={item.done ? "text-muted line-through" : ""}>{item.text}</span>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No notes yet.</Empty>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {/* Goals */}
          <section className="card">
            <h2 className="section-title">Goals</h2>
            {goals.data?.length ? (
              <ul className="mb-4 space-y-2">
                {goals.data.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <p className={g.status === "dropped" ? "text-muted line-through" : ""}>{g.title}</p>
                      {g.target_date && <p className="text-xs text-muted">by {fmtDate(g.target_date)}</p>}
                    </div>
                    {g.status === "open" ? (
                      <form action={setGoalStatusAction} className="flex gap-1">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="client_id" value={id} />
                        <button name="status" value="achieved" className="btn-ghost btn-sm">Achieved</button>
                      </form>
                    ) : (
                      <Pill status={g.status} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No goals set.</Empty>
            )}
            <form action={addGoalAction} className="mt-3 space-y-2">
              <input type="hidden" name="client_id" value={id} />
              <input name="title" className="input" placeholder="New goal" />
              <div className="flex gap-2">
                <input type="date" name="target_date" className="input" />
                <button className="btn btn-sm">Add</button>
              </div>
            </form>
          </section>

          {/* Invoices */}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title mb-0">Invoices</h2>
              <Link href={`/invoices/new?client=${id}`} className="text-sm text-accent">New invoice</Link>
            </div>
            {invoices.data?.length ? (
              <ul className="space-y-2 text-sm">
                {invoices.data.map((i) => (
                  <li key={i.id} className="flex items-center justify-between">
                    <Link href={`/invoices/${i.id}`} className="hover:text-accent">{i.number}</Link>
                    <span className="flex items-center gap-2">{money(i.total_cents, i.currency)} <Pill status={i.status} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No invoices yet.</Empty>
            )}
          </section>

          {/* Timeline */}
          <section className="card">
            <h2 className="section-title">Timeline</h2>
            {activity.data?.length ? (
              <ol className="space-y-3">
                {activity.data.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p>{a.summary}</p>
                    <p className="text-xs text-muted">{fmtDateTime(a.created_at, tz)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>Activity will appear here as you work with this client.</Empty>
            )}
            {pastArr.length > 0 && <p className="mt-4 text-xs text-muted">{pastArr.length} past arrangement{pastArr.length > 1 ? "s" : ""}.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

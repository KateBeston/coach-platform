import Link from "next/link";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { cadenceLabel, fmtDateTime, fmtRelativeDays, fmtTime, fullName, money, todayIn, zonedToUtc, addDays } from "@/lib/format";

export default async function TodayPage() {
  const { supabase, coach } = await getCoach();
  const tz = coach.timezone;

  // Keep standing bookings topped up whenever the coach opens the app.
  await supabase.rpc("extend_all_standing_bookings", { p_weeks: 8 });

  const today = todayIn(tz);
  const dayStart = zonedToUtc(`${today}T00:00`, tz);
  const dayEnd = zonedToUtc(`${addDays(today, 1)}T00:00`, tz);
  const monthStart = zonedToUtc(`${today.slice(0, 8)}01T00:00`, tz);
  const yearStart = zonedToUtc(`${today.slice(0, 4)}-01-01T00:00`, tz);

  const [todaySessions, overview, unpaid, paidThisMonth, leads, hoursYear, needsNotes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, location_type, meeting_url, client:clients(id, first_name, last_name)")
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .neq("status", "cancelled")
      .order("starts_at"),
    supabase.from("arrangement_overview").select("*").eq("status", "active"),
    supabase
      .from("invoices")
      .select("id, number, total_cents, due_date, currency, client:clients(first_name, last_name)")
      .eq("status", "sent")
      .order("due_date"),
    supabase.from("invoices").select("total_cents, tax_cents").eq("status", "paid").gte("paid_at", monthStart),
    supabase.from("clients").select("id, first_name, last_name, created_at, source").eq("status", "lead").order("created_at", { ascending: false }).limit(5),
    supabase.from("sessions").select("starts_at, ends_at, is_paid_coaching").eq("status", "completed").eq("counts_toward_icf", true).gte("starts_at", yearStart),
    supabase
      .from("sessions")
      .select("id, starts_at, client:clients(first_name, last_name)")
      .lt("ends_at", new Date().toISOString())
      .gte("starts_at", addDays(today, -14))
      .eq("status", "scheduled")
      .order("starts_at"),
  ]);

  const needsBooking = (overview.data ?? []).filter((a) => a.needs_booking);
  const endingSoon = (overview.data ?? []).filter((a) => a.ending_soon && !a.needs_booking);

  const received = (paidThisMonth.data ?? []).reduce((t, i) => t + i.total_cents, 0);
  const gstCollected = (paidThisMonth.data ?? []).reduce((t, i) => t + i.tax_cents, 0);
  const incomeTaxSetAside = Math.round(((received - gstCollected) * Number(coach.tax_set_aside_pct)) / 100);
  const owed = (unpaid.data ?? []).reduce((t, i) => t + i.total_cents, 0);
  const overdue = (unpaid.data ?? []).filter((i) => i.due_date && i.due_date < today);
  const hours = (hoursYear.data ?? []).reduce((t, x) => t + (new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime()) / 3_600_000, 0);

  type ClientRef = { id?: string; first_name: string; last_name: string } | null;
  const greeting = Number(new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date())) < 12 ? "Good morning" : "Good afternoon";

  return (
    <>
      <PageHeader
        title={`${greeting}${coach.display_name ? `, ${coach.display_name.split(" ")[0]}` : ""}`}
        sub={new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date())}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received this month" value={money(received, coach.currency)} href="/invoices?status=paid" />
        <Stat
          label="Set aside for tax"
          value={money(incomeTaxSetAside + gstCollected, coach.currency)}
          hint={coach.gst_registered ? `${money(gstCollected, coach.currency)} GST + ${coach.tax_set_aside_pct}% income tax` : `${coach.tax_set_aside_pct}% of income`}
        />
        <Stat label="Owed to you" value={money(owed, coach.currency)} hint={overdue.length ? `${overdue.length} overdue` : undefined} href="/invoices?status=sent" />
        <Stat label="Coaching hours this year" value={hours.toFixed(1)} href="/hours" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="section-title">Today&apos;s sessions</h2>
          {todaySessions.data?.length ? (
            <ul className="divide-y divide-line">
              {todaySessions.data.map((s) => {
                const c = s.client as unknown as ClientRef;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/sessions/${s.id}`} className="min-w-0">
                      <p className="font-medium">{c ? fullName(c) : "Client"}</p>
                      <p className="text-sm text-muted">
                        {fmtTime(s.starts_at, tz)} – {fmtTime(s.ends_at, tz)} · {s.location_type.replace("_", " ")}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2">
                      {s.meeting_url && s.status === "scheduled" && (
                        <a href={s.meeting_url} target="_blank" className="btn-ghost btn-sm">Join</a>
                      )}
                      <Pill status={s.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Nothing booked today.</Empty>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Needs booking</h2>
          {needsBooking.length ? (
            <ul className="space-y-3">
              {needsBooking.map((a) => (
                <li key={a.id}>
                  <Link href={`/clients/${a.client_id}`} className="block rounded-lg bg-warn-soft px-3 py-2">
                    <p className="font-medium">{fullName(a)}</p>
                    <p className="text-xs text-warn">
                      {cadenceLabel(a.cadence ?? "")} · last session {fmtRelativeDays(a.last_session_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Every client on an arrangement has their next session booked.</Empty>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Write up notes</h2>
          {needsNotes.data?.length ? (
            <ul className="space-y-2">
              {needsNotes.data.map((s) => {
                const c = s.client as unknown as ClientRef;
                return (
                  <li key={s.id}>
                    <Link href={`/sessions/${s.id}`} className="flex justify-between text-sm hover:text-accent">
                      <span>{c ? fullName(c) : "Client"}</span>
                      <span className="text-muted">{fmtDateTime(s.starts_at, tz)}</span>
                    </Link>
                  </li>
                );
              })}
              <p className="pt-1 text-xs text-muted">Past sessions not yet marked complete.</p>
            </ul>
          ) : (
            <Empty>All past sessions are wrapped up.</Empty>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Packages ending soon</h2>
          {endingSoon.length ? (
            <ul className="space-y-2">
              {endingSoon.map((a) => (
                <li key={a.id}>
                  <Link href={`/clients/${a.client_id}`} className="flex justify-between text-sm hover:text-accent">
                    <span>{fullName(a)}</span>
                    <span className="text-muted">{a.sessions_remaining} left</span>
                  </Link>
                </li>
              ))}
              <p className="pt-1 text-xs text-muted">A good time to talk about renewing.</p>
            </ul>
          ) : (
            <Empty>No packages are close to finishing.</Empty>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Unpaid invoices</h2>
          {unpaid.data?.length ? (
            <ul className="space-y-2">
              {unpaid.data.slice(0, 6).map((i) => {
                const c = i.client as unknown as ClientRef;
                const late = i.due_date && i.due_date < today;
                return (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex justify-between text-sm hover:text-accent">
                      <span>
                        {c ? fullName(c) : ""} {late && <Pill status="overdue" />}
                      </span>
                      <span>{money(i.total_cents, i.currency)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Nothing outstanding.</Empty>
          )}
        </section>

        <section className="card lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title mb-0">New leads</h2>
            <Link href="/clients?status=lead" className="text-sm text-accent">All leads</Link>
          </div>
          {leads.data?.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {leads.data.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="block rounded-lg border border-line px-3 py-2 hover:border-accent/40">
                    <p className="text-sm font-medium">{fullName(c)}</p>
                    <p className="text-xs text-muted">{c.source ?? "Added"} · {fmtRelativeDays(c.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No new leads. Share your booking page to get discovery calls coming in.</Empty>
          )}
        </section>
      </div>
    </>
  );
}

import Link from "next/link";
import { Banner, PageHeader } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { addDays, fmtDate, fmtTime, fullName, minutesInDay, todayIn, utcToZonedInput, weekStart, zonedToUtc } from "@/lib/format";
import { addCalendarEventAction, deleteCalendarEventAction, toggleCalendarVisibleAction } from "../actions";

const VIEWS = [
  { key: "all", label: "Everything" },
  { key: "work", label: "Work only" },
  { key: "personal", label: "Personal only" },
];
const HOUR_PX = 48;

type Block = { id: string; title: string; sub?: string; href?: string; start: string; end: string; colour: string; allDay?: boolean; muted?: boolean };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : "all";
  const { supabase, coach } = await getCoach();
  const tz = coach.timezone;
  const today = todayIn(tz);
  const monday = weekStart(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = zonedToUtc(`${monday}T00:00`, tz);
  const to = zonedToUtc(`${addDays(monday, 7)}T00:00`, tz);
  const here = `/calendar?week=${monday}&view=${view}`;

  const [{ data: calendars }, { data: events }, { data: sessions }, { data: rules }] = await Promise.all([
    supabase.from("calendars").select("*").order("created_at"),
    supabase.from("calendar_events").select("*").lt("starts_at", to).gt("ends_at", from).order("starts_at"),
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, status, client:clients(first_name, last_name)")
      .lt("starts_at", to)
      .gt("ends_at", from)
      .neq("status", "cancelled"),
    supabase.from("availability_rules").select("weekday, start_time, end_time"),
  ]);

  const cals = calendars ?? [];
  const shown = new Set(cals.filter((c) => c.visible && (view === "all" || c.kind === view || (view === "work" && c.kind === "other"))).map((c) => c.id));
  const bookingCal = cals.find((c) => c.is_booking_destination) ?? cals.find((c) => c.kind === "work");
  const calById = new Map(cals.map((c) => [c.id, c]));

  const blocks: Block[] = [];
  if (bookingCal && shown.has(bookingCal.id)) {
    for (const s of sessions ?? []) {
      const c = s.client as unknown as { first_name: string; last_name: string } | null;
      blocks.push({
        id: s.id,
        title: c ? fullName(c) : "Session",
        sub: s.status === "scheduled" ? undefined : s.status.replace("_", " "),
        href: `/sessions/${s.id}`,
        start: s.starts_at,
        end: s.ends_at,
        colour: bookingCal.colour,
        muted: s.status !== "scheduled" && s.status !== "completed",
      });
    }
  }
  for (const e of events ?? []) {
    if (!shown.has(e.calendar_id)) continue;
    blocks.push({ id: e.id, title: e.title, sub: calById.get(e.calendar_id)?.name, start: e.starts_at, end: e.ends_at, colour: calById.get(e.calendar_id)?.colour ?? "#999", allDay: e.all_day });
  }

  const timed = blocks.filter((b) => !b.allDay);
  const startHour = Math.min(7, ...timed.map((b) => Math.floor(minutesInDay(b.start, tz) / 60)));
  const endHour = Math.max(20, ...timed.map((b) => Math.ceil((minutesInDay(b.start, tz) + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000) / 60)));
  const hours = Array.from({ length: Math.min(24, endHour) - startHour }, (_, i) => startHour + i);

  const dayOf = (iso: string) => utcToZonedInput(iso, tz).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Calendar"
        sub={`Week of ${fmtDate(monday)}`}
        action={
          <div className="flex items-center gap-2">
            <Link className="btn-ghost btn-sm" href={`/calendar?week=${addDays(monday, -7)}&view=${view}`}>Previous</Link>
            <Link className="btn-ghost btn-sm" href={`/calendar?view=${view}`}>This week</Link>
            <Link className="btn-ghost btn-sm" href={`/calendar?week=${addDays(monday, 7)}&view=${view}`}>Next</Link>
          </div>
        }
      />
      <Banner error={sp.error} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-surface p-0.5 ring-1 ring-line">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/calendar?week=${monday}&view=${v.key}`} className={`rounded-md px-3 py-1 text-sm ${v.key === view ? "bg-accent text-white" : "text-ink/80"}`}>
              {v.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cals.map((c) => (
            <form key={c.id} action={toggleCalendarVisibleAction}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="visible" value={String(!c.visible)} />
              <input type="hidden" name="back" value={here} />
              <button className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-line ${c.visible ? "bg-surface" : "bg-transparent text-muted line-through"}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.colour }} />
                {c.name}
              </button>
            </form>
          ))}
        </div>
        <Link href="/settings#calendars" className="ml-auto text-sm text-accent">Manage calendars</Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line text-sm">
            <div />
            {days.map((d) => (
              <div key={d} className={`px-2 py-2 ${d === today ? "font-semibold text-accent" : ""}`}>
                {new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"))}
                <div className="mt-1 space-y-1">
                  {blocks
                    .filter((b) => b.allDay && dayOf(b.start) <= d && dayOf(new Date(new Date(b.end).getTime() - 1).toISOString()) >= d)
                    .map((b) => (
                      <p key={b.id} className="truncate rounded px-1.5 py-0.5 text-xs text-white" style={{ background: b.colour }}>{b.title}</p>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            <div>
              {hours.map((h) => (
                <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right text-[11px] text-muted">
                  {h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const dow = new Date(d + "T00:00:00Z").getUTCDay();
              return (
                <div key={d} className="relative border-l border-line" style={{ height: hours.length * HOUR_PX }}>
                  {/* Working hours shading */}
                  {(rules ?? [])
                    .filter((r) => r.weekday === dow)
                    .map((r, i) => {
                      const [sh, sm] = r.start_time.split(":").map(Number);
                      const [eh, em] = r.end_time.split(":").map(Number);
                      const top = ((sh * 60 + sm - startHour * 60) / 60) * HOUR_PX;
                      const height = (((eh - sh) * 60 + (em - sm)) / 60) * HOUR_PX;
                      return <div key={i} className="absolute inset-x-0 bg-accent-soft/40" style={{ top, height }} />;
                    })}
                  {hours.map((h) => <div key={h} className="border-b border-line/60" style={{ height: HOUR_PX }} />)}
                  {timed
                    .filter((b) => dayOf(b.start) === d)
                    .map((b) => {
                      const top = ((minutesInDay(b.start, tz) - startHour * 60) / 60) * HOUR_PX;
                      const height = Math.max(20, ((new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000) * HOUR_PX - 2);
                      const inner = (
                        <>
                          <p className="truncate font-medium">{b.title}</p>
                          <p className="truncate opacity-85">{fmtTime(b.start, tz)}{b.sub ? ` · ${b.sub}` : ""}</p>
                        </>
                      );
                      const cls = `absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight text-white ${b.muted ? "opacity-50" : ""}`;
                      return b.href ? (
                        <Link key={b.id} href={b.href} className={cls} style={{ top, height, background: b.colour }}>{inner}</Link>
                      ) : (
                        <div key={b.id} className={cls} style={{ top, height, background: b.colour }}>{inner}</div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">Add to calendar</h2>
          <form action={addCalendarEventAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="back" value={here} />
            <div>
              <label className="label">Calendar</label>
              <select name="calendar_id" className="input" defaultValue={cals.find((c) => c.kind === "personal")?.id}>
                {cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input name="title" className="input" placeholder="School pick-up, holiday…" />
            </div>
            <div>
              <label className="label">Starts</label>
              <input type="datetime-local" name="starts_at" className="input" step={900} />
            </div>
            <div>
              <label className="label">Ends</label>
              <input type="datetime-local" name="ends_at" className="input" step={900} />
            </div>
            <details className="sm:col-span-2">
              <summary className="cursor-pointer text-sm text-accent">All day or time off instead</summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="all_day" /> All day</label>
                <div>
                  <label className="label">From</label>
                  <input type="date" name="start_date" className="input" />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" name="end_date" className="input" />
                </div>
              </div>
            </details>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="cancel_overlapping" /> Cancel any client sessions booked in this time
            </label>
            <p className="text-xs text-muted sm:col-span-2">
              Events in calendars set to block availability stop clients booking over them, and standing bookings skip them. Clients only ever see “busy”.
            </p>
            <div><button className="btn">Add</button></div>
          </form>
        </section>

        <section className="card">
          <h2 className="section-title">Events this week</h2>
          {(events ?? []).length ? (
            <ul className="divide-y divide-line text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: calById.get(e.calendar_id)?.colour }} />
                    {e.title}
                    <span className="text-muted">· {e.all_day ? fmtDate(dayOf(e.starts_at)) : `${fmtDate(e.starts_at, tz)} ${fmtTime(e.starts_at, tz)}`}</span>
                  </span>
                  <form action={deleteCalendarEventAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="back" value={here} />
                    <button className="text-xs text-muted hover:text-danger">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No personal or other events this week.</p>
          )}
          <p className="mt-4 text-xs text-muted">Google and Outlook calendar sync connects here next; events from those calendars will appear alongside these.</p>
        </section>
      </div>
    </>
  );
}

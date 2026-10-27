import { Banner, PageHeader } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { WEEKDAYS } from "@/lib/format";
import { saveCalendarAction, updateAvailabilityAction, updateSettingsAction } from "../actions";
import { signOut } from "../../login/actions";

const TIMEZONES = [
  "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth", "Australia/Hobart",
  "Pacific/Auckland", "Asia/Singapore", "Asia/Dubai", "Europe/London", "Europe/Dublin", "Europe/Berlin", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Toronto",
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const { supabase, coach, me, isManager, hasTeam } = await getCoach();
  const [{ data: rules }, { data: calendars }] = await Promise.all([
    supabase.from("availability_rules").select("*").eq("member_id", me.id).order("start_time"),
    supabase.from("calendars").select("*").eq("member_id", me.id).order("created_at"),
  ]);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const byDay = (d: number) => (rules ?? []).filter((r) => r.weekday === d);

  return (
    <>
      <PageHeader title="Settings" />
      <Banner error={error} message={saved ? "Saved." : undefined} />

      {isManager && (
        <section className="card mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title mb-1">Team</h2>
            <p className="text-sm text-muted">
              {hasTeam ? "Manage who works in the business, their access and their pay." : "Working with other coaches or subcontractors? Add them so they get their own login, calendar and clients."}
            </p>
          </div>
          <a href="/team" className="btn-ghost">{hasTeam ? "Open team" : "Add a team member"}</a>
        </section>
      )}

      {isManager ? (
      <form action={updateSettingsAction} className="space-y-5">
        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="section-title sm:col-span-2">Your business</h2>
          <div>
            <label className="label">Your name</label>
            <input name="display_name" className="input" defaultValue={coach.display_name} />
          </div>
          <div>
            <label className="label">Business name</label>
            <input name="business_name" className="input" defaultValue={coach.business_name} />
          </div>
          <div>
            <label className="label">Time zone</label>
            <select name="timezone" className="input" defaultValue={coach.timezone}>
              {(TIMEZONES.includes(coach.timezone) ? TIMEZONES : [coach.timezone, ...TIMEZONES]).map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Currency</label>
            <select name="currency" className="input" defaultValue={coach.currency}>
              {["AUD", "NZD", "USD", "GBP", "EUR", "CAD", "SGD"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Your video meeting link</label>
            <input name="default_meeting_url" className="input" defaultValue={coach.default_meeting_url ?? ""} placeholder="Your personal Zoom room or Google Meet link" />
            <p className="mt-1 text-xs text-muted">Added to every new session. Automatic Zoom and Google Meet links per session connect here next.</p>
          </div>
        </section>

        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="section-title sm:col-span-2">Booking page</h2>
          <div className="sm:col-span-2">
            <label className="label">Booking link</label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted">{site}/book/</span>
              <input name="booking_slug" className="input max-w-xs" defaultValue={coach.booking_slug ?? ""} />
            </div>
            {coach.booking_slug && (
              <a href={`/book/${coach.booking_slug}`} target="_blank" className="mt-1 inline-block text-sm text-accent">Open your booking page</a>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="booking_enabled" defaultChecked={coach.booking_enabled} /> Clients can book themselves
          </label>
          <div>
            <label className="label">Minimum notice (hours)</label>
            <input name="booking_min_notice_hours" type="number" className="input" defaultValue={coach.booking_min_notice_hours} min={0} />
          </div>
          <div>
            <label className="label">Book up to (days ahead)</label>
            <input name="booking_window_days" type="number" className="input" defaultValue={coach.booking_window_days} min={1} />
          </div>
          <div>
            <label className="label">Buffer between sessions (minutes)</label>
            <input name="session_buffer_minutes" type="number" className="input" defaultValue={coach.session_buffer_minutes} min={0} step={5} />
          </div>
          <div>
            <label className="label">Maximum sessions per day</label>
            <input name="max_sessions_per_day" type="number" className="input" defaultValue={coach.max_sessions_per_day} min={1} />
          </div>
        </section>

        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="section-title sm:col-span-2">Money and tax</h2>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="gst_registered" defaultChecked={coach.gst_registered} /> I&apos;m registered for GST
          </label>
          <div>
            <label className="label">GST rate (%)</label>
            <input name="gst_rate" type="number" className="input" defaultValue={Number(coach.gst_rate)} step="0.01" min={0} />
          </div>
          <div>
            <label className="label">Set aside for income tax (%)</label>
            <input name="tax_set_aside_pct" type="number" className="input" defaultValue={Number(coach.tax_set_aside_pct)} step="0.5" min={0} />
            <p className="mt-1 text-xs text-muted">A rule of thumb for your dashboard. Your accountant can tell you the right figure.</p>
          </div>
          <div>
            <label className="label">Invoice number prefix</label>
            <input name="invoice_prefix" className="input" defaultValue={coach.invoice_prefix} />
          </div>
          <div>
            <label className="label">Payment terms (days)</label>
            <input name="payment_terms_days" type="number" className="input" defaultValue={coach.payment_terms_days} min={0} />
          </div>
        </section>

        <button className="btn">Save settings</button>
      </form>
      ) : (
        <p className="card text-sm text-muted">Business settings are managed by the owner. You can set your own working hours and calendars below.</p>
      )}

      <form id="availability" action={updateAvailabilityAction} className="card mt-5 space-y-3">
        <h2 className="section-title">{hasTeam ? "Your working hours" : "Working hours"}</h2>
        <p className="text-sm text-muted">When clients can book you. Add a second block for split days.</p>
        {WEEKDAYS.map((day, d) => {
          const blocks = byDay(d);
          return (
            <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-32 items-center gap-2">
                <input type="checkbox" name={`on_${d}`} defaultChecked={blocks.length > 0} /> {day}
              </label>
              {[1, 2].map((b) => (
                <span key={b} className="flex items-center gap-1">
                  <input type="time" name={`start_${d}_${b}`} className="input w-28" step={900} defaultValue={blocks[b - 1]?.start_time.slice(0, 5) ?? (b === 1 ? "09:00" : "")} />
                  <span className="text-muted">to</span>
                  <input type="time" name={`end_${d}_${b}`} className="input w-28" step={900} defaultValue={blocks[b - 1]?.end_time.slice(0, 5) ?? (b === 1 ? "17:00" : "")} />
                </span>
              ))}
            </div>
          );
        })}
        <button className="btn">Save working hours</button>
      </form>

      <section id="calendars" className="card mt-5">
        <h2 className="section-title">Calendars</h2>
        <p className="mb-4 text-sm text-muted">
          Keep work and personal separate or view them together. Choose which ones block your availability and which one new sessions go into.
        </p>
        <div className="space-y-3">
          {[...(calendars ?? []), null].map((c) => (
            <form key={c?.id ?? "new"} action={saveCalendarAction} className="grid items-end gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_120px_70px_auto]">
              {c && <input type="hidden" name="id" value={c.id} />}
              <div>
                <label className="label">{c ? "Name" : "Add a calendar"}</label>
                <input name="name" className="input" defaultValue={c?.name ?? ""} placeholder="e.g. Family" required />
              </div>
              <div>
                <label className="label">Type</label>
                <select name="kind" className="input" defaultValue={c?.kind ?? "personal"}>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Colour</label>
                <input type="color" name="colour" className="h-9 w-full rounded-lg border border-line" defaultValue={c?.colour ?? "#7A6A9A"} />
              </div>
              <button className="btn-ghost">{c ? "Save" : "Add"}</button>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="blocks_availability" defaultChecked={c?.blocks_availability ?? true} /> Blocks my availability (shows clients “busy”)
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="is_booking_destination" defaultChecked={c?.is_booking_destination ?? false} /> New sessions go here
              </label>
            </form>
          ))}
        </div>
      </section>

      <form action={signOut} className="mt-5">
        <button className="btn-ghost">Sign out</button>
      </form>
    </>
  );
}

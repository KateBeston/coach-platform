import Link from "next/link";
import { redirect } from "next/navigation";
import { Banner, Empty, PageHeader, Pill } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { fmtDateTime } from "@/lib/format";
import { sendTestEmailAction } from "../actions";

const KIND: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  session_moved: "Session moved",
  session_cancelled: "Session cancelled",
  session_reminder: "Reminder",
  coach_nudge: "Not booked yet (to you)",
  test: "Test",
};

const FILTERS = [
  ["all", "Everything"],
  ["queued", "Waiting"],
  ["sent", "Sent"],
  ["failed", "Didn't send"],
] as const;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string; open?: string; test?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, coach, isManager } = await getCoach();
  if (!isManager) redirect("/");
  const status = sp.status ?? "all";
  let q = supabase.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const [{ data: rows }, { count: waitingSetup }] = await Promise.all([
    q,
    supabase.from("email_outbox").select("*", { count: "exact", head: true }).eq("status", "queued").eq("status_note", "Waiting for email set-up"),
  ]);
  const open = rows?.find((r) => r.id === sp.open);

  return (
    <>
      <PageHeader
        title="Messages"
        sub="Booking emails and reminders sent for you, automatically."
        action={
          <div className="flex gap-2">
            <form action={sendTestEmailAction}><button className="btn-ghost">Send me a test</button></form>
            <Link href="/settings#emails" className="btn-ghost">Email settings</Link>
          </div>
        }
      />
      <Banner error={sp.error} message={sp.test ? "Test queued. It goes out within 10 minutes." : undefined} />
      {(waitingSetup ?? 0) > 0 && (
        <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          {waitingSetup} {waitingSetup === 1 ? "email is" : "emails are"} ready and waiting: sending switches on once the platform&apos;s email service is connected.
        </p>
      )}
      {!coach.email_confirmations && !coach.email_reminders && (
        <p className="mb-4 rounded-xl bg-accent-soft/70 px-4 py-3 text-sm">Client emails are switched off in <Link href="/settings#emails" className="text-accent underline">Settings</Link>.</p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/messages?status=${k}`} className={`rounded-full px-3 py-1 text-sm ${status === k ? "bg-accent text-white" : "bg-surface text-ink/80 ring-1 ring-line"}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="card p-0 lg:col-span-3">
          {rows?.length ? (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/messages?status=${status}&open=${r.id}`} className={`block px-5 py-3 hover:bg-bg/60 ${sp.open === r.id ? "bg-accent-soft/40" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.subject ?? KIND[r.kind]}</p>
                        <p className="text-xs text-muted">
                          {KIND[r.kind]} · to {r.to_name ? `${r.to_name} (${r.to_email})` : r.to_email}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {r.status === "sent" ? (
                          <Pill status="paid" label="sent" />
                        ) : r.status === "failed" ? (
                          <Pill status="overdue" label="didn't send" />
                        ) : r.status === "skipped" ? (
                          <Pill status="cancelled" label="not needed" />
                        ) : (
                          <Pill status="sent" label="waiting" />
                        )}
                        <p className="mt-1 text-xs text-muted">{fmtDateTime(r.sent_at ?? r.created_at, coach.timezone)}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><Empty>Nothing here yet. Emails appear as sessions are booked, moved or coming up.</Empty></div>
          )}
        </section>

        <section className="card h-fit lg:col-span-2">
          {open ? (
            <>
              <p className="text-xs text-muted">{KIND[open.kind]} · to {open.to_email}</p>
              <h2 className="mt-1 mb-3 font-serif text-xl">{open.subject ?? "Not written yet"}</h2>
              {open.body_text ? (
                <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{open.body_text}</pre>
              ) : (
                <p className="text-sm text-muted">This email is written when it goes out, so it always has the latest time and details.</p>
              )}
              {open.status_note && <p className="mt-4 rounded-xl bg-stone-soft px-3 py-2 text-xs text-muted">{open.status_note}</p>}
            </>
          ) : (
            <>
              <h2 className="section-title">What goes out</h2>
              <ul className="space-y-2 text-sm">
                <li><span className="font-medium">Booking confirmed</span> — when you or your client books a session.</li>
                <li><span className="font-medium">Session moved or cancelled</span> — straight away, with the new time.</li>
                <li><span className="font-medium">Reminder</span> — {coach.reminder_hours} hours before each session.</li>
                <li><span className="font-medium">Not booked yet</span> — to you, each morning, listing ongoing clients with no next session.</li>
              </ul>
              <p className="mt-3 text-xs text-muted">Pick any email on the left to see exactly what it said.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import { Banner, Empty, PageHeader, Pill } from "@/components/ui";
import { EMPLOYMENT_LABEL, getCoach, ROLE_LABEL, type Member } from "@/lib/coach";
import { addDays, money, todayIn } from "@/lib/format";
import { addTeamMemberAction, deactivateTeamMemberAction, updateTeamMemberAction } from "../actions";

type ReportRow = {
  member_id: string;
  name: string;
  role: string;
  employment: string;
  pay_type: string;
  pay_rate: number;
  sessions_completed: number;
  late_cancels: number;
  no_shows: number;
  hours: number;
  value_cents: number;
  pay_cents: number;
  active_clients: number;
};

const PAY_LABEL: Record<string, string> = { none: "Not paid per session", percent: "% of session value", per_session: "$ per session", hourly: "$ per hour" };

function payText(m: { pay_type: string; pay_rate: number }) {
  const r = Number(m.pay_rate);
  if (m.pay_type === "percent") return `${r}% of session value`;
  if (m.pay_type === "per_session") return `$${r.toFixed(2)} per session`;
  if (m.pay_type === "hourly") return `$${r.toFixed(2)} per hour`;
  return "Not paid per session";
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; added?: string; saved?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, coach, me, team, isManager } = await getCoach();
  if (!isManager) redirect("/");

  const today = todayIn(coach.timezone);
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const { data: report, error: reportError } = await supabase.rpc("team_report", { p_from: from, p_to: to });
  const rows = (report ?? []) as ReportRow[];
  const totals = rows.reduce(
    (t, r) => ({ sessions: t.sessions + Number(r.sessions_completed), value: t.value + Number(r.value_cents), pay: t.pay + Number(r.pay_cents) }),
    { sessions: 0, value: 0, pay: 0 },
  );
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const lastMonthStart = `${addDays(`${today.slice(0, 8)}01`, -1).slice(0, 8)}01`;
  const lastMonthEnd = addDays(`${today.slice(0, 8)}01`, -1);

  return (
    <>
      <PageHeader title="Team" sub="Everyone who works in the business, what they've delivered and what subcontractors are owed." />
      <Banner error={sp.error ?? reportError?.message} message={sp.added ? "Added. Ask them to create an account with that email to get their login." : sp.saved ? "Saved." : undefined} />

      {/* Report */}
      <section className="card mb-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="section-title mb-0">Delivery and pay</h2>
          <form className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">From</label>
              <input type="date" name="from" className="input" defaultValue={from} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" name="to" className="input" defaultValue={to} />
            </div>
            <button className="btn-ghost">Show</button>
            <a className="btn-ghost" href={`/team?from=${lastMonthStart}&to=${lastMonthEnd}`}>Last month</a>
          </form>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-sm text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Person</th>
                  <th className="py-2 text-right font-medium">Active clients</th>
                  <th className="py-2 text-right font-medium">Sessions</th>
                  <th className="py-2 text-right font-medium">Hours</th>
                  <th className="py-2 text-right font-medium">Late cancel / no-show</th>
                  <th className="py-2 text-right font-medium">Session value</th>
                  <th className="py-2 text-right font-medium">Pay owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.member_id}>
                    <td className="py-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted">{EMPLOYMENT_LABEL[r.employment]} · {payText(r)}</p>
                    </td>
                    <td className="py-2 text-right">{r.active_clients}</td>
                    <td className="py-2 text-right">{r.sessions_completed}</td>
                    <td className="py-2 text-right">{Number(r.hours).toFixed(1)}</td>
                    <td className="py-2 text-right">{r.late_cancels} / {r.no_shows}</td>
                    <td className="py-2 text-right">{money(Number(r.value_cents), coach.currency)}</td>
                    <td className="py-2 text-right font-medium">{r.pay_type === "none" ? "–" : money(Number(r.pay_cents), coach.currency)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">Total</td>
                  <td />
                  <td className="py-2 text-right">{totals.sessions}</td>
                  <td colSpan={2} />
                  <td className="py-2 text-right">{money(totals.value, coach.currency)}</td>
                  <td className="py-2 text-right">{money(totals.pay, coach.currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No sessions in this period.</Empty>
        )}
        <p className="mt-3 text-xs text-muted">
          Session value uses each client&apos;s arrangement or offer price. Percentage pay includes late cancellations; per-session and hourly pay count completed sessions only.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Members */}
        <section className="space-y-3 lg:col-span-2">
          {team.map((m: Member) => (
            <details key={m.id} className="card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: m.colour }} />
                  <span className="font-medium">{m.name}</span>
                  <span className="text-sm text-muted">{m.email}</span>
                </span>
                <span className="flex items-center gap-2">
                  {!m.user_id && <Pill status="sent" label="Invited" />}
                  {!m.bookable && <Pill status="paused" label="Not bookable" />}
                  <Pill status={m.role === "practitioner" ? "scheduled" : "active"} label={ROLE_LABEL[m.role]} />
                  <span className="text-xs text-muted">{EMPLOYMENT_LABEL[m.employment]}</span>
                </span>
              </summary>
              <form action={updateTeamMemberAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={m.id} />
                <div>
                  <label className="label">Name</label>
                  <input name="name" className="input" defaultValue={m.name} required />
                </div>
                <div>
                  <label className="label">Colour in calendar</label>
                  <input type="color" name="colour" className="h-9 w-full rounded-lg border border-line" defaultValue={m.colour} />
                </div>
                {m.id !== me.id && (
                  <>
                    <div>
                      <label className="label">Role</label>
                      <select name="role" className="input" defaultValue={m.role}>
                        <option value="practitioner">Practitioner: sees only their own clients</option>
                        <option value="manager">Manager: sees everything, runs the business</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Works as</label>
                      <select name="employment" className="input" defaultValue={m.employment}>
                        <option value="in_house">In-house</option>
                        <option value="subcontractor">Subcontractor</option>
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label className="label">Pay</label>
                  <select name="pay_type" className="input" defaultValue={m.pay_type}>
                    {Object.entries(PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Rate</label>
                  <input type="number" name="pay_rate" className="input" step="0.01" min={0} defaultValue={Number(m.pay_rate)} />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="bookable" defaultChecked={m.bookable} /> Clients can book with {m.name.split(" ")[0]} on the booking page
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button className="btn">Save</button>
                </div>
              </form>
              {m.id !== me.id && (
                <form action={deactivateTeamMemberAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                  <input type="hidden" name="id" value={m.id} />
                  <div>
                    <label className="label">Remove and hand their clients to</label>
                    <select name="reassign_to" className="input" defaultValue={me.id}>
                      {team.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </div>
                  <button className="btn-ghost text-danger">Remove from team</button>
                </form>
              )}
            </details>
          ))}
        </section>

        {/* Add */}
        <section className="card h-fit">
          <h2 className="section-title">Add a team member</h2>
          <form action={addTeamMemberAction} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" className="input" required />
            </div>
            <div>
              <label className="label">Role</label>
              <select name="role" className="input" defaultValue="practitioner">
                <option value="practitioner">Practitioner</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div>
              <label className="label">Works as</label>
              <select name="employment" className="input" defaultValue="subcontractor">
                <option value="in_house">In-house</option>
                <option value="subcontractor">Subcontractor</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Pay</label>
                <select name="pay_type" className="input" defaultValue="percent">
                  {Object.entries(PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Rate</label>
                <input type="number" name="pay_rate" className="input" step="0.01" min={0} placeholder="e.g. 60" />
              </div>
            </div>
            <div>
              <label className="label">Calendar colour</label>
              <input type="color" name="colour" className="h-9 w-full rounded-lg border border-line" defaultValue="#5B6E8C" />
            </div>
            <button className="btn w-full">Add to team</button>
            <p className="text-xs text-muted">
              They join by creating an account with this email at {site ? `${site}/login?mode=signup` : "the sign-up page"}. Practitioners only ever see their own clients.
            </p>
          </form>
        </section>
      </div>
    </>
  );
}

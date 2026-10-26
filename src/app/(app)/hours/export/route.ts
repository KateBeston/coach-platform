import { getCoach } from "@/lib/coach";

export async function GET() {
  const { supabase, coach } = await getCoach();
  const { data } = await supabase
    .from("sessions")
    .select("starts_at, ends_at, is_paid_coaching, client:clients(first_name, last_name, email)")
    .eq("status", "completed")
    .eq("counts_toward_icf", true)
    .order("starts_at");

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ["Date,Start,Client name,Client email,Hours,Paid or pro bono"];
  for (const s of data ?? []) {
    const c = s.client as unknown as { first_name: string; last_name: string; email: string | null } | null;
    const start = new Date(s.starts_at);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: coach.timezone }).format(start);
    const time = new Intl.DateTimeFormat("en-AU", { timeZone: coach.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
    const hours = ((new Date(s.ends_at).getTime() - start.getTime()) / 3_600_000).toFixed(2);
    lines.push([date, time, esc(`${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()), esc(c?.email ?? ""), hours, s.is_paid_coaching ? "Paid" : "Pro bono"].join(","));
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="coaching-hours-log.csv"',
    },
  });
}

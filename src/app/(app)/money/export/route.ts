import { NextResponse, type NextRequest } from "next/server";
import { CATEGORIES, loadLedger, resolvePeriod } from "@/lib/accounting";
import { getCoach } from "@/lib/coach";
import { todayIn } from "@/lib/format";

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (c: number) => (c / 100).toFixed(2);

/** One CSV with income and expenses for the period, the way an accountant wants it. */
export async function GET(req: NextRequest) {
  const { supabase, coach, isManager } = await getCoach();
  if (!isManager) return new NextResponse("Not allowed", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const period = resolvePeriod(sp.get("period") ?? undefined, todayIn(coach.timezone), sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const { income, expenses } = await loadLedger(supabase, period.from, period.to, coach.timezone);

  const rows: (string | number)[][] = [["Type", "Date", "Reference", "Name", "Category", "Description", "Total (inc GST)", "GST", "Ex GST", "Paid with"]];
  for (const r of income) rows.push(["Income", r.date, r.number, r.client, "Coaching income", "", dollars(r.total), dollars(r.gst), dollars(r.total - r.gst), ""]);
  for (const e of [...expenses].reverse()) {
    rows.push(["Expense", e.spent_on, "", e.supplier, CATEGORIES[e.category] ?? e.category, e.description ?? "", dollars(e.amount_cents), dollars(e.gst_cents), dollars(e.amount_cents - e.gst_cents), e.payment_method ?? ""]);
  }
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const name = (coach.business_name || coach.display_name || "business").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}_${period.from}_to_${period.to}.csv"`,
    },
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, utcToZonedInput, zonedToUtc } from "./format";

export const CATEGORIES: Record<string, string> = {
  supervision: "Supervision and mentoring",
  training: "Training and courses",
  software: "Software and subscriptions",
  marketing: "Marketing and advertising",
  venue: "Room or venue hire",
  travel: "Travel",
  insurance: "Insurance",
  professional_fees: "Accountant, legal, memberships",
  equipment: "Equipment",
  phone_internet: "Phone and internet",
  subcontractors: "Subcontractors",
  bank_fees: "Bank and payment fees",
  other: "Other",
};

export type Period = { key: string; label: string; from: string; to: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Australian financial year (July to June) and BAS quarters, worked out from today. */
export function resolvePeriod(key: string | undefined, today: string, from?: string, to?: string): Period {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const fyStart = m >= 7 ? y : y - 1;
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const quarter = (sy: number, sm: number, label: string, k: string): Period => {
    const em = sm + 2;
    return { key: k, label, from: ymd(sy, sm, 1), to: ymd(sy, em, lastDay(sy, em)) };
  };
  switch (key) {
    case "last-month": {
      const lm = m === 1 ? 12 : m - 1;
      const ly = m === 1 ? y - 1 : y;
      return { key, label: `${MONTHS[lm - 1]} ${ly}`, from: ymd(ly, lm, 1), to: ymd(ly, lm, lastDay(ly, lm)) };
    }
    case "quarter":
      return quarter(y, qStartMonth, `${MONTHS[qStartMonth - 1]}–${MONTHS[qStartMonth + 1]} ${y} quarter`, key);
    case "last-quarter": {
      const sm = qStartMonth === 1 ? 10 : qStartMonth - 3;
      const sy = qStartMonth === 1 ? y - 1 : y;
      return quarter(sy, sm, `${MONTHS[sm - 1]}–${MONTHS[sm + 1]} ${sy} quarter`, key);
    }
    case "fy":
      return { key, label: `${fyStart}–${String(fyStart + 1).slice(2)} financial year`, from: ymd(fyStart, 7, 1), to: ymd(fyStart + 1, 6, 30) };
    case "last-fy":
      return { key, label: `${fyStart - 1}–${String(fyStart).slice(2)} financial year`, from: ymd(fyStart - 1, 7, 1), to: ymd(fyStart, 6, 30) };
    case "custom":
      if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
        return { key, label: `${from} to ${to}`, from, to };
      }
    // falls through
    default:
      return { key: "month", label: `${MONTHS[m - 1]} ${y}`, from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) };
  }
}

export const PERIOD_KEYS = [
  ["month", "This month"],
  ["last-month", "Last month"],
  ["quarter", "This quarter"],
  ["last-quarter", "Last quarter"],
  ["fy", "This financial year"],
  ["last-fy", "Last financial year"],
] as const;

export type IncomeRow = { date: string; number: string; client: string; total: number; gst: number };
export type ExpenseRow = {
  id: string;
  spent_on: string;
  supplier: string;
  description: string | null;
  category: string;
  amount_cents: number;
  gst_cents: number;
  payment_method: string | null;
  receipt_path: string | null;
};

/** Paid invoices (counted on the day paid, in the coach's time zone) and expenses for a period. */
export async function loadLedger(supabase: SupabaseClient, from: string, to: string, tz: string) {
  const [{ data: inv }, { data: exp }] = await Promise.all([
    supabase
      .from("invoices")
      .select("number, paid_at, total_cents, tax_cents, client:clients(first_name, last_name)")
      .eq("status", "paid")
      .gte("paid_at", zonedToUtc(from, tz))
      .lt("paid_at", zonedToUtc(addDays(to, 1), tz))
      .order("paid_at"),
    supabase.from("expenses").select("*").gte("spent_on", from).lte("spent_on", to).order("spent_on", { ascending: false }),
  ]);
  const income: IncomeRow[] = (inv ?? []).map((i) => {
    const c = i.client as unknown as { first_name: string; last_name: string | null } | null;
    return {
      date: utcToZonedInput(i.paid_at as string, tz).slice(0, 10),
      number: i.number,
      client: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "",
      total: i.total_cents,
      gst: i.tax_cents,
    };
  });
  return { income, expenses: (exp ?? []) as ExpenseRow[] };
}

/** Totals, month by month and by category. Everything ex GST except G1. */
export function summarise(income: IncomeRow[], expenses: ExpenseRow[], from: string, to: string) {
  const incomeTotal = income.reduce((t, r) => t + r.total, 0);
  const gstCollected = income.reduce((t, r) => t + r.gst, 0);
  const expenseTotal = expenses.reduce((t, r) => t + r.amount_cents, 0);
  const gstPaid = expenses.reduce((t, r) => t + r.gst_cents, 0);
  const incomeEx = incomeTotal - gstCollected;
  const expensesEx = expenseTotal - gstPaid;

  const months: { ym: string; income: number; expenses: number }[] = [];
  for (let cur = from.slice(0, 7); cur <= to.slice(0, 7); ) {
    months.push({ ym: cur, income: 0, expenses: 0 });
    const [yy, mm] = cur.split("-").map(Number);
    cur = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  }
  const byMonth = new Map(months.map((x) => [x.ym, x]));
  for (const r of income) {
    const row = byMonth.get(r.date.slice(0, 7));
    if (row) row.income += r.total - r.gst;
  }
  for (const r of expenses) {
    const row = byMonth.get(r.spent_on.slice(0, 7));
    if (row) row.expenses += r.amount_cents - r.gst_cents;
  }

  const cats = new Map<string, number>();
  for (const r of expenses) cats.set(r.category, (cats.get(r.category) ?? 0) + r.amount_cents - r.gst_cents);
  const byCategory = [...cats.entries()].sort((a, b) => b[1] - a[1]);

  return { incomeTotal, gstCollected, gstPaid, incomeEx, expensesEx, profit: incomeEx - expensesEx, months, byCategory };
}

/** GST included in a GST-inclusive amount, e.g. 110.00 at 10% -> 10.00. */
export function gstIncluded(amountCents: number, ratePct: number) {
  return Math.round((amountCents * ratePct) / (100 + ratePct));
}

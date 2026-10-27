import Link from "next/link";
import { PERIOD_KEYS, type Period } from "@/lib/accounting";

/** Period chips plus a custom date range. Keeps the user on the same page. */
export function PeriodPicker({ base, period }: { base: string; period: Period }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {PERIOD_KEYS.map(([k, label]) => (
        <Link
          key={k}
          href={`${base}?period=${k}`}
          className={`rounded-full px-3 py-1 text-sm ${period.key === k ? "bg-accent text-white" : "bg-surface text-ink/80 ring-1 ring-line hover:ring-accent"}`}
        >
          {label}
        </Link>
      ))}
      <form action={base} className="flex items-center gap-1.5 text-sm">
        <input type="hidden" name="period" value="custom" />
        <input type="date" name="from" defaultValue={period.from} className="input w-auto py-1" aria-label="From" />
        <span className="text-muted">to</span>
        <input type="date" name="to" defaultValue={period.to} className="input w-auto py-1" aria-label="To" />
        <button className={period.key === "custom" ? "btn btn-sm" : "btn-ghost btn-sm"}>Show</button>
      </form>
    </div>
  );
}

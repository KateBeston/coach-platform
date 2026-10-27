import { Empty, Pill } from "@/components/ui";
import { CHANNEL, type Comm } from "@/lib/communications";
import { fmtDateTime } from "@/lib/format";

export function CommList({ rows, tz, full }: { rows: Comm[]; tz: string; full?: boolean }) {
  if (!rows.length) return <Empty>No emails, messages or calls recorded yet.</Empty>;
  return (
    <ol className="space-y-3">
      {rows.map((c) => (
        <li key={c.id} className="text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill status={c.channel === "email" ? "scheduled" : c.channel === "sms" ? "trial" : "draft"} label={CHANNEL[c.channel] ?? c.channel} />
            <span className="text-xs text-muted">{c.direction === "inbound" ? "from client" : "to client"}</span>
            {c.automatic && <span className="text-xs text-muted">· automatic</span>}
            {c.status && c.status !== "sent" && (
              <span className="text-xs text-warn">· {c.status === "queued" ? "waiting" : c.status === "skipped" ? "not needed" : "didn't send"}</span>
            )}
          </div>
          <p className="mt-0.5 font-medium">{c.title}</p>
          {c.body &&
            (full ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-accent">Show message</summary>
                <pre className="mt-1 rounded-xl bg-bg p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{c.body}</pre>
              </details>
            ) : (
              <p className="line-clamp-2 text-muted">{c.body.replace(/\s+/g, " ")}</p>
            ))}
          <p className="text-xs text-muted">
            {fmtDateTime(c.at, tz)}
            {c.who && ` · ${c.who}`}
            {full && c.note && ` · ${c.note}`}
          </p>
        </li>
      ))}
    </ol>
  );
}

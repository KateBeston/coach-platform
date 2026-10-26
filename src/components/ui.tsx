import Link from "next/link";

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Banner({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return error ? (
    <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>
  ) : (
    <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{message}</p>
  );
}

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-[#eef0f6] text-[#41507a]",
  active: "bg-accent-soft text-accent",
  paused: "bg-warn-soft text-warn",
  alumni: "bg-[#efedea] text-muted",
  scheduled: "bg-[#eef0f6] text-[#41507a]",
  completed: "bg-accent-soft text-accent",
  cancelled: "bg-[#efedea] text-muted",
  late_cancel: "bg-warn-soft text-warn",
  no_show: "bg-warn-soft text-warn",
  draft: "bg-[#efedea] text-muted",
  sent: "bg-[#eef0f6] text-[#41507a]",
  paid: "bg-accent-soft text-accent",
  void: "bg-[#efedea] text-muted",
  overdue: "bg-warn-soft text-warn",
  ended: "bg-[#efedea] text-muted",
  open: "bg-[#eef0f6] text-[#41507a]",
  achieved: "bg-accent-soft text-accent",
  dropped: "bg-[#efedea] text-muted",
};

export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`pill ${STATUS_STYLES[status] ?? "bg-[#efedea] text-muted"}`}>
      {label ?? status.replace("_", " ")}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition hover:border-accent/40">
      {inner}
    </Link>
  ) : (
    <div className="card">{inner}</div>
  );
}

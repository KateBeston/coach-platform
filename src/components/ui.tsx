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
    <p className="mb-4 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>
  ) : (
    <p className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">{message}</p>
  );
}

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-sky-soft text-sky",
  active: "bg-accent-soft text-accent",
  paused: "bg-warn-soft text-warn",
  alumni: "bg-stone-soft text-muted",
  scheduled: "bg-sky-soft text-sky",
  completed: "bg-accent-soft text-accent",
  cancelled: "bg-stone-soft text-muted",
  late_cancel: "bg-warn-soft text-warn",
  no_show: "bg-warn-soft text-warn",
  draft: "bg-stone-soft text-muted",
  sent: "bg-sky-soft text-sky",
  paid: "bg-accent-soft text-accent",
  void: "bg-stone-soft text-muted",
  overdue: "bg-warn-soft text-warn",
  ended: "bg-stone-soft text-muted",
  open: "bg-sky-soft text-sky",
  achieved: "bg-accent-soft text-accent",
  dropped: "bg-stone-soft text-muted",
  trial: "bg-clay-soft text-clay",
  past_due: "bg-warn-soft text-warn",
  internal: "bg-stone-soft text-muted",
};

export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`pill ${STATUS_STYLES[status] ?? "bg-stone-soft text-muted"}`}>
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
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl font-normal text-accent">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block border-t-2 border-t-accent/40 transition hover:border-accent/50">
      {inner}
    </Link>
  ) : (
    <div className="card border-t-2 border-t-clay/40">{inner}</div>
  );
}

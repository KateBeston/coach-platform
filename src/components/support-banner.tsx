import { endSupportAction } from "@/app/(app)/actions";

/** Shown across every page while platform staff are supporting this business. */
export function SupportBanner({ business, reason, expiresAt, staffEmail }: { business: string; reason: string; expiresAt: string; staffEmail: string | null }) {
  const until = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" }).format(new Date(expiresAt));
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-clay px-4 py-2 text-sm text-white print:hidden">
      <p>
        <span className="font-semibold">Support access:</span> you&apos;re in <span className="font-semibold">{business}</span> as its owner
        {staffEmail ? ` (signed in as ${staffEmail})` : ""}. Reason: {reason}. Ends {until} Brisbane time. Everything you change is real.
      </p>
      <form action={endSupportAction}>
        <button className="rounded-lg bg-white/20 px-3 py-1 font-medium hover:bg-white/30">End support session</button>
      </form>
    </div>
  );
}

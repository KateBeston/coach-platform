"use client";

import { useActionState, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { book, getSlots } from "./actions";

export type PublicOffer = { id: string; name: string; description: string | null; kind: string; session_minutes: number; price_cents: number };

const viewerTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function BookingFlow({
  slug,
  timezone,
  currency,
  offers,
  team,
}: {
  slug: string;
  timezone: string;
  currency: string;
  offers: PublicOffer[];
  team: { id: string; name: string }[];
}) {
  const [offerId, setOfferId] = useState(offers.length === 1 ? offers[0].id : "");
  const [memberId, setMemberId] = useState("");
  const [from, setFrom] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()));
  const [slots, setSlots] = useState<{ slot_start: string; member_id: string }[]>([]);
  const [chosen, setChosen] = useState("");
  const [loading, startLoading] = useTransition();
  const [result, action, pending] = useActionState(book, null);
  // Show times in the visitor's own time zone once in the browser.
  const tz = useSyncExternalStore(
    () => () => {},
    viewerTz,
    () => timezone,
  );

  useEffect(() => {
    if (!offerId) return;
    startLoading(async () => setSlots(await getSlots(slug, offerId, from, memberId || null)));
  }, [offerId, from, slug, memberId]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { slot_start: s } of slots) {
      const day = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(s));
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots, tz]);

  const offer = offers.find((o) => o.id === offerId);
  const money = (c: number) => (c === 0 ? "Free" : new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(c / 100));
  const time = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const shift = (days: number) => {
    const d = new Date(from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const next = d.toISOString().slice(0, 10);
    setChosen("");
    setFrom(next < today ? today : next);
  };

  if (result?.ok && result.startsAt) {
    return (
      <div className="card">
        <h2 className="mb-2 text-2xl">You&apos;re booked</h2>
        <p className="text-sm">
          {offer?.name}
          {team.length > 1 && result.with ? ` with ${result.with}` : ""} on{" "}
          {new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(result.startsAt))}.
        </p>
        {result.meetingUrl && (
          <p className="mt-2 text-sm">Join here: <a className="text-accent underline" href={result.meetingUrl}>{result.meetingUrl}</a></p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <h2 className="section-title">Choose a session</h2>
        <div className="space-y-2">
          {offers.map((o) => (
            <label key={o.id} className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 ${o.id === offerId ? "border-accent bg-accent-soft/50" : "border-line"}`}>
              <span className="flex gap-3">
                <input type="radio" name="offer" checked={o.id === offerId} onChange={() => {
                    setChosen("");
                    setOfferId(o.id);
                  }} className="mt-1" />
                <span>
                  <span className="block font-medium">{o.name}</span>
                  <span className="block text-sm text-muted">{o.session_minutes} minutes</span>
                  {o.description && <span className="mt-1 block text-sm">{o.description}</span>}
                </span>
              </span>
              <span className="text-sm font-medium">{money(o.price_cents)}</span>
            </label>
          ))}
        </div>
      </section>

      {offerId && team.length > 1 && (
        <section className="card">
          <h2 className="section-title">Who would you like to see?</h2>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "", name: "Anyone available" }, ...team].map((m) => (
              <button
                type="button"
                key={m.id || "any"}
                onClick={() => {
                  setChosen("");
                  setMemberId(m.id);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${m.id === memberId ? "bg-accent text-white ring-accent" : "bg-surface ring-line hover:ring-accent"}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {offerId && (
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title mb-0">Choose a time</h2>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost btn-sm" onClick={() => shift(-14)}>Earlier</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => shift(14)}>Later</button>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted">Times shown in {tz.replace("_", " ")}.</p>
          {loading ? (
            <p className="text-sm text-muted">Finding times…</p>
          ) : byDay.length ? (
            <div className="space-y-4">
              {byDay.map(([day, times]) => (
                <div key={day}>
                  <p className="mb-1.5 text-sm font-medium">{day}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {times.map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setChosen(t)}
                        className={`rounded-lg px-3 py-1.5 text-sm ring-1 ${t === chosen ? "bg-accent text-white ring-accent" : "bg-surface ring-line hover:ring-accent"}`}
                      >
                        {time(t)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No times free in these two weeks. Try later dates.</p>
          )}
        </section>
      )}

      {chosen && (
        <form action={action} className="card space-y-3">
          <h2 className="section-title">Your details</h2>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="offer_id" value={offerId} />
          <input type="hidden" name="starts_at" value={chosen} />
          <input type="hidden" name="member_id" value={memberId || slots.find((x) => x.slot_start === chosen)?.member_id || ""} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="first_name" className="input" placeholder="First name" required />
            <input name="last_name" className="input" placeholder="Last name" />
            <input name="email" type="email" className="input" placeholder="Email" required />
            <input name="phone" className="input" placeholder="Phone (optional)" />
          </div>
          {result?.error && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{result.error}</p>}
          <button className="btn w-full" disabled={pending}>{pending ? "Booking…" : `Book ${time(chosen)}`}</button>
        </form>
      )}
    </div>
  );
}

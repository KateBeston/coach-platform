import { Banner, Empty, PageHeader, Pill } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { money } from "@/lib/format";
import { createOfferAction, toggleOfferAction } from "../actions";

const KIND: Record<string, string> = { single: "Single session", package: "Package", recurring: "Ongoing", discovery: "Discovery call" };

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, coach } = await getCoach();
  const { data: offers } = await supabase.from("offers").select("*").order("active", { ascending: false }).order("price_cents");

  return (
    <>
      <PageHeader title="Offers" sub="What you sell. Public offers appear on your booking page." />
      <Banner error={error} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          {offers?.length ? (
            offers.map((o) => (
              <div key={o.id} className={`card flex flex-wrap items-start justify-between gap-3 ${o.active ? "" : "opacity-60"}`}>
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-sm text-muted">
                    {KIND[o.kind]} · {o.kind === "package" ? `${o.session_count} × ` : ""}{o.session_minutes} min · {money(o.price_cents, coach.currency)}
                    {o.billing === "monthly" ? " per month" : o.kind === "package" ? " total" : ""}
                  </p>
                  {o.description && <p className="mt-1 text-sm">{o.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {o.is_public && o.active && <Pill status="active" label="On booking page" />}
                  <form action={toggleOfferAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="field" value="is_public" />
                    <input type="hidden" name="value" value={String(!o.is_public)} />
                    <button className="btn-ghost btn-sm">{o.is_public ? "Hide from booking page" : "Show on booking page"}</button>
                  </form>
                  <form action={toggleOfferAction}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="field" value="active" />
                    <input type="hidden" name="value" value={String(!o.active)} />
                    <button className="btn-ghost btn-sm">{o.active ? "Archive" : "Restore"}</button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <Empty>No offers yet.</Empty>
          )}
        </section>

        <section className="card h-fit">
          <h2 className="section-title">New offer</h2>
          <form action={createOfferAction} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input name="name" className="input" required placeholder="6-session clarity package" />
            </div>
            <div>
              <label className="label">Type</label>
              <select name="kind" className="input">
                <option value="single">Single session</option>
                <option value="package">Package</option>
                <option value="recurring">Ongoing (weekly, monthly)</option>
                <option value="discovery">Discovery call</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Sessions</label>
                <input name="session_count" type="number" className="input" min={1} placeholder="Packages" />
              </div>
              <div>
                <label className="label">Minutes</label>
                <input name="session_minutes" type="number" className="input" defaultValue={60} min={15} step={5} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Price ($)</label>
                <input name="price" type="number" className="input" min={0} step="0.01" />
              </div>
              <div>
                <label className="label">Billing</label>
                <select name="billing" className="input">
                  <option value="upfront">Upfront</option>
                  <option value="per_session">Per session</option>
                  <option value="monthly">Monthly</option>
                  <option value="free">Free</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea name="description" className="input min-h-16" />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_public" defaultChecked /> Show on booking page</label>
            <button className="btn">Save offer</button>
          </form>
        </section>
      </div>
    </>
  );
}

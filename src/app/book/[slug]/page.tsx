import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingFlow, type PublicOffer } from "./booking-flow";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_coach_profile", { p_slug: slug });
  if (!data) notFound();
  const profile = data as { display_name: string; business_name: string; timezone: string; currency: string; offers: PublicOffer[] };
  const name = profile.business_name || profile.display_name || "Book a session";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-muted">{profile.business_name && profile.display_name ? profile.display_name : ""}</p>
      <h1 className="mb-6 text-3xl">{name}</h1>
      {profile.offers.length ? (
        <BookingFlow slug={slug} timezone={profile.timezone} currency={profile.currency} offers={profile.offers} />
      ) : (
        <p className="card text-sm text-muted">Online booking isn&apos;t open right now.</p>
      )}
    </main>
  );
}

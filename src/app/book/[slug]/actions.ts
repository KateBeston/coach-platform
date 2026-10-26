"use server";

import { createClient } from "@/lib/supabase/server";

export async function getSlots(slug: string, offerId: string, from: string, days = 14) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_booking_slots", { p_slug: slug, p_offer: offerId, p_from: from, p_days: days });
  if (error) return [];
  return (data ?? []).map((r: { slot_start: string }) => r.slot_start);
}

export async function book(
  _prev: { ok: boolean; error?: string; startsAt?: string; meetingUrl?: string | null } | null,
  fd: FormData,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_book_session", {
    p_slug: String(fd.get("slug")),
    p_offer: String(fd.get("offer_id")),
    p_starts_at: String(fd.get("starts_at")),
    p_first_name: String(fd.get("first_name") ?? ""),
    p_last_name: String(fd.get("last_name") ?? ""),
    p_email: String(fd.get("email") ?? ""),
    p_phone: String(fd.get("phone") ?? "") || undefined,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { starts_at: string; meeting_url: string | null };
  return { ok: true, startsAt: r.starts_at, meetingUrl: r.meeting_url };
}

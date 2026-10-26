import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Coach = {
  id: string;
  display_name: string;
  business_name: string;
  email: string | null;
  timezone: string;
  currency: string;
  booking_slug: string | null;
  booking_enabled: boolean;
  booking_min_notice_hours: number;
  booking_window_days: number;
  session_buffer_minutes: number;
  max_sessions_per_day: number;
  default_meeting_url: string | null;
  gst_registered: boolean;
  gst_rate: number;
  tax_set_aside_pct: number;
  invoice_prefix: string;
  payment_terms_days: number;
};

/** Signed-in coach and a Supabase client, once per request. */
export const getCoach = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: coach } = await supabase.from("coaches").select("*").eq("id", user.id).single();
  if (!coach) redirect("/login");
  return { supabase, coach: coach as Coach };
});

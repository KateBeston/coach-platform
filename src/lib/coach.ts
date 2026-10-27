import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

/** The business account (one per practice). */
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

/** A person working in the business, the owner included. */
export type Member = {
  id: string;
  coach_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role: "owner" | "manager" | "practitioner";
  employment: "owner" | "in_house" | "subcontractor";
  pay_type: "none" | "percent" | "per_session" | "hourly";
  pay_rate: number;
  colour: string;
  bookable: boolean;
  active: boolean;
  created_at: string;
};

/**
 * Signed-in person, their business and their team, once per request.
 * `coach` is the business; `me` is the signed-in team member.
 */
export type SupportSession = { id: string; coach_id: string; reason: string; started_at: string; expires_at: string };

export const getCoach = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Platform staff supporting a business see it exactly as its owner does.
  const { data: supportRaw } = await supabase.rpc("my_support_session");
  const support = (supportRaw ?? null) as SupportSession | null;

  let me: Member | null = null;
  if (support) {
    const { data } = await supabase.from("team_members").select("*").eq("coach_id", support.coach_id).eq("role", "owner").order("created_at").limit(1).maybeSingle();
    me = data as Member | null;
  } else {
    const { data } = await supabase.from("team_members").select("*").eq("user_id", user.id).eq("active", true).maybeSingle();
    me = data as Member | null;
  }
  if (!me) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent("This login isn't linked to an active account.")}`);
  }
  const [{ data: coach }, { data: team }] = await Promise.all([
    supabase.from("coaches").select("*").eq("id", me.coach_id).single(),
    supabase.from("team_members").select("*").eq("coach_id", me.coach_id).eq("active", true).order("created_at"),
  ]);
  if (!coach) redirect("/login");

  const members = (team ?? []) as Member[];
  return {
    supabase,
    coach: coach as Coach,
    me,
    team: members,
    isManager: me.role === "owner" || me.role === "manager",
    hasTeam: members.length > 1,
    support,
    staffEmail: support ? user.email ?? null : null,
  };
});

export const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", practitioner: "Practitioner" };
export const EMPLOYMENT_LABEL: Record<string, string> = { owner: "Owner", in_house: "In-house", subcontractor: "Subcontractor" };

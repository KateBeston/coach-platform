import type { SupabaseClient } from "@supabase/supabase-js";

export const CHANNEL: Record<string, string> = { email: "Email", sms: "SMS", call: "Call", message: "Message", in_person: "In person", other: "Other" };
const AUTO: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  session_moved: "Session moved",
  session_cancelled: "Session cancelled",
  session_reminder: "Reminder",
  test: "Test",
};

export type Comm = {
  id: string;
  at: string;
  channel: string;
  direction: "outbound" | "inbound";
  title: string;
  body: string | null;
  automatic: boolean;
  status?: string;
  note?: string | null;
  who?: string | null;
};

/** Every communication with a client: automatic emails plus everything logged by hand, newest first. */
export async function loadCommunications(supabase: SupabaseClient, clientId: string, limit = 200): Promise<Comm[]> {
  const [{ data: emails }, { data: logged }, { data: team }] = await Promise.all([
    supabase.from("email_outbox").select("id, kind, subject, body_text, status, status_note, created_at, sent_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(limit),
    supabase.from("client_communications").select("*").eq("client_id", clientId).order("occurred_at", { ascending: false }).limit(limit),
    supabase.from("team_members").select("id, name"),
  ]);
  const names = new Map((team ?? []).map((m) => [m.id, m.name]));
  const rows: Comm[] = [
    ...(emails ?? []).map((e) => ({
      id: `e-${e.id}`,
      at: e.sent_at ?? e.created_at,
      channel: "email",
      direction: "outbound" as const,
      title: e.subject ?? AUTO[e.kind] ?? "Automatic email",
      body: e.body_text,
      automatic: true,
      status: e.status,
      note: e.status_note,
    })),
    ...(logged ?? []).map((c) => ({
      id: `c-${c.id}`,
      at: c.occurred_at,
      channel: c.channel,
      direction: c.direction,
      title: c.subject || `${CHANNEL[c.channel] ?? c.channel} ${c.direction === "inbound" ? "from client" : "to client"}`,
      body: c.body,
      automatic: false,
      who: c.member_id ? names.get(c.member_id) ?? null : null,
    })),
  ];
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

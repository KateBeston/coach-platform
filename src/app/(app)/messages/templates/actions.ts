"use server";

import { revalidatePath } from "next/cache";
import { getCoach } from "@/lib/coach";
import { EMAIL_KINDS, TAGS, type EmailKind } from "@/lib/email-templates";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const KINDS = EMAIL_KINDS.map((k) => k.key) as string[];

export async function saveEmailTemplate(kind: EmailKind, mode: "preset" | "ai" | "custom", presetKey: string | null, subject: string, body: string): Promise<Result> {
  const { supabase, isManager, coach } = await getCoach();
  if (!isManager) return { ok: false, error: "Only owners and managers can change client emails." };
  if (!KINDS.includes(kind)) return { ok: false, error: "Unknown email." };
  if (!body.trim()) return { ok: false, error: "The email needs some wording." };
  if (!body.includes("{session_time}") && kind !== "session_cancelled")
    return { ok: false, error: "Include {session_time} so your client knows when their session is." };
  const { error } = await supabase
    .from("email_templates")
    .upsert({ coach_id: coach.id, kind, mode, preset_key: presetKey, subject: subject.trim() || null, body: body.replace(/\r/g, ""), updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/messages/templates");
  return { ok: true, message: "Saved. Your next emails will use this wording." };
}

export async function resetEmailTemplate(kind: EmailKind): Promise<Result> {
  const { supabase, isManager, coach } = await getCoach();
  if (!isManager) return { ok: false, error: "Only owners and managers can change client emails." };
  const { error } = await supabase.from("email_templates").delete().eq("coach_id", coach.id).eq("kind", kind);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/messages/templates");
  return { ok: true, message: "Back to the standard wording." };
}

/** Drafts an email with AI from the coach's own description. They always review and save it themselves. */
/** Approximate US$ per million tokens [input, output], for the usage record. */
const PRICES: Record<string, [number, number]> = { "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };

export async function draftEmailWithAi(kind: EmailKind, brief: string): Promise<{ ok: true; subject: string; body: string } | { ok: false; error: string }> {
  const { isManager, coach, supabase } = await getCoach();
  if (!isManager) return { ok: false, error: "Only owners and managers can change client emails." };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI writing isn't switched on yet. Choose a template or write your own for now." };
  const k = EMAIL_KINDS.find((x) => x.key === kind);
  if (!k) return { ok: false, error: "Unknown email." };

  const prompt = [
    `Write a short email that a coach sends to a client automatically: "${k.label}" (${k.when.toLowerCase()}).`,
    `The business is "${coach.business_name || coach.display_name || "a coaching practice"}".`,
    `What the coach wants: ${brief.trim() || "warm, clear and brief"}.`,
    "",
    "Rules:",
    "- Australian English spelling.",
    "- Use these fill-in tags exactly as written, and no others: " + TAGS.filter((t) => kind === "session_moved" || t.tag !== "{old_session_time}").map((t) => t.tag).join(", ") + ".",
    kind === "session_cancelled" ? "- Mention {session_time} and offer {booking_link} to rebook." : "- Always include {session_time} and {location} on their own lines.",
    "- Start with 'Hi {client_first_name},' and end with {signoff} on its own line.",
    "- Plain text, no markdown, no emoji unless asked. Under 110 words.",
    "- Don't make promises about refunds, fees or policies the coach hasn't mentioned.",
    "",
    'Reply with JSON only: {"subject": "...", "body": "..."} with \\n for line breaks.',
  ].join("\n");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
  // Every AI request is recorded, so the platform can see use and cost per coach.
  const record = async (ok: boolean, usage?: { input_tokens?: number; output_tokens?: number }, error?: string) => {
    const [pi, po] = PRICES[model] ?? [0, 0];
    const input = usage?.input_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    await supabase.from("ai_usage").insert({
      coach_id: coach.id, feature: "email_draft", detail: k.label, model,
      input_tokens: input, output_tokens: output, cost_usd: (input * pi + output * po) / 1_000_000, ok, error: error ?? null,
    });
  };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      await record(false, undefined, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { ok: false, error: "The AI couldn't write that just now. Try again in a moment." };
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { subject?: string; body?: string };
    if (!json.body) {
      await record(false, data.usage, "Empty draft");
      return { ok: false, error: "The AI's draft came back empty. Try describing it a little differently." };
    }
    await record(true, data.usage);
    return { ok: true, subject: json.subject ?? "", body: json.body };
  } catch (e) {
    await record(false, undefined, e instanceof Error ? e.message.slice(0, 200) : "Request failed").catch(() => {});
    return { ok: false, error: "The AI couldn't write that just now. Try again in a moment." };
  }
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailTemplateEditor } from "@/components/email-template-editor";
import { PageHeader } from "@/components/ui";
import { getCoach } from "@/lib/coach";
import { EMAIL_KINDS, type EmailKind } from "@/lib/email-templates";

/** The standard wording used until a coach chooses their own (same as the built-in emails). */
const STANDARD: Record<EmailKind, { subject: string; body: string }> = {
  booking_confirmed: {
    subject: "You're booked in: {session_time}",
    body: "Hi {client_first_name},\n\nYou're booked in. Here are the details:\n\n{session_name}\n{session_time}\n{location}\n\nNeed to change it? Just reply to this email.\n\n{signoff}",
  },
  session_reminder: {
    subject: "Reminder: {session_time}",
    body: "Hi {client_first_name},\n\nJust a reminder about your upcoming session:\n\n{session_name}\n{session_time}\n{location}\n\nNeed to change it? Just reply to this email.\n\n{signoff}",
  },
  session_moved: {
    subject: "Your session has moved to {session_time}",
    body: "Hi {client_first_name},\n\nYour session has moved.\n\n{session_name}\nNew time: {session_time}\nWas: {old_session_time}\n{location}\n\nIf the new time doesn't suit, just reply to this email.\n\n{signoff}",
  },
  session_cancelled: {
    subject: "Your session on {session_time} is cancelled",
    body: "Hi {client_first_name},\n\nYour session on {session_time} has been cancelled.\n\nYou can book a new time here: {booking_link}\n\nAny questions, just reply to this email.\n\n{signoff}",
  },
};

export default async function EmailTemplatesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams;
  const { supabase, isManager } = await getCoach();
  if (!isManager) redirect("/");
  const kind = (EMAIL_KINDS.find((x) => x.key === k)?.key ?? "booking_confirmed") as EmailKind;
  const { data: rows } = await supabase.from("email_templates").select("*");
  const byKind = new Map((rows ?? []).map((r) => [r.kind, r]));
  const saved = byKind.get(kind) ?? null;

  return (
    <>
      <p className="text-sm text-muted"><Link href="/messages" className="hover:text-ink">Messages</Link> /</p>
      <PageHeader title="Email wording" sub="Choose how your automatic emails sound: a ready-made template, an AI draft you check, or your own words." />

      <nav className="mb-6 flex flex-wrap border-b border-line">
        {EMAIL_KINDS.map((x) => (
          <Link
            key={x.key}
            href={`/messages/templates?kind=${x.key}`}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap ${x.key === kind ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {x.label}
            {byKind.has(x.key) && <span className="ml-1.5 text-xs text-accent">· yours</span>}
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted">{EMAIL_KINDS.find((x) => x.key === kind)?.when}.</p>

      <EmailTemplateEditor
        key={kind}
        kind={kind}
        saved={saved ? { mode: saved.mode, preset_key: saved.preset_key, subject: saved.subject, body: saved.body } : null}
        defaultSubject={STANDARD[kind].subject}
        defaultBody={STANDARD[kind].body}
      />
    </>
  );
}

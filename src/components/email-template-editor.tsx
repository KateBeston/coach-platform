"use client";

import { useRef, useState, useTransition } from "react";
import { draftEmailWithAi, resetEmailTemplate, saveEmailTemplate } from "@/app/(app)/messages/templates/actions";
import { fillSample, PRESETS, TAGS, type EmailKind } from "@/lib/email-templates";

type Saved = { mode: "preset" | "ai" | "custom"; preset_key: string | null; subject: string | null; body: string } | null;
type Mode = "preset" | "ai" | "custom";

const MODES: { key: Mode; label: string; note: string }[] = [
  { key: "preset", label: "Use a template", note: "Pick a tone, then tweak it if you like" },
  { key: "ai", label: "Write with AI", note: "Describe what you want; AI drafts it for you to check" },
  { key: "custom", label: "Write my own", note: "Start from a blank page" },
];

export function EmailTemplateEditor({ kind, saved, defaultSubject, defaultBody }: { kind: EmailKind; saved: Saved; defaultSubject: string; defaultBody: string }) {
  const [mode, setMode] = useState<Mode>(saved?.mode ?? "preset");
  const [presetKey, setPresetKey] = useState<string | null>(saved?.preset_key ?? null);
  const [subject, setSubject] = useState(saved?.subject ?? defaultSubject);
  const [body, setBody] = useState(saved?.body ?? defaultBody);
  const [brief, setBrief] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const tags = TAGS.filter((t) => kind === "session_moved" || t.tag !== "{old_session_time}");

  const insert = (tag: string) => {
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + tag);
    const [a, z] = [el.selectionStart, el.selectionEnd];
    const next = body.slice(0, a) + tag + body.slice(z);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + tag.length, a + tag.length);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setMode(m.key);
                setMsg(null);
                if (m.key === "custom" && mode !== "custom") {
                  setSubject("");
                  setBody("Hi {client_first_name},\n\n\n\n{signoff}");
                }
              }}
              className={`rounded-xl border p-3 text-left text-sm transition ${mode === m.key ? "border-accent bg-accent-soft/60" : "border-line bg-surface hover:border-accent/50"}`}
            >
              <span className="block font-semibold">{m.label}</span>
              <span className="text-xs text-muted">{m.note}</span>
            </button>
          ))}
        </div>

        {mode === "preset" && (
          <div className="space-y-2">
            {PRESETS[kind].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPresetKey(p.key);
                  setSubject(p.subject);
                  setBody(p.body);
                  setMsg(null);
                }}
                className={`w-full rounded-xl border p-3 text-left text-sm ${presetKey === p.key ? "border-accent bg-accent-soft/40" : "border-line hover:border-accent/50"}`}
              >
                <span className="font-semibold">{p.label}</span> <span className="text-muted">· {p.note}</span>
                <span className="mt-1 line-clamp-2 block text-xs text-muted">{fillSample(p.body).replace(/\n+/g, " ")}</span>
              </button>
            ))}
          </div>
        )}

        {mode === "ai" && (
          <div className="rounded-xl border border-line p-3">
            <label className="label">What would you like it to say or sound like?</label>
            <textarea
              className="input min-h-20"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Warm and calm. Remind them to find a quiet space and have water handy. Mention my 24-hour change policy."
            />
            <button
              type="button"
              className="btn mt-2"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  const res = await draftEmailWithAi(kind, brief);
                  if (!res.ok) return setMsg({ ok: false, text: res.error });
                  setSubject(res.subject);
                  setBody(res.body);
                  setMsg({ ok: true, text: "Here's a draft. Read it through and change anything before saving." });
                })
              }
            >
              {pending ? "Writing…" : body && mode === "ai" && msg?.ok ? "Write another version" : "Write it for me"}
            </button>
          </div>
        )}

        <div>
          <label className="label">Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={defaultSubject} />
        </div>
        <div>
          <label className="label">Email</label>
          <textarea ref={bodyRef} className="input min-h-64 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-2 mb-1 text-xs text-muted">Add details that fill in automatically:</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button key={t.tag} type="button" onClick={() => insert(t.tag)} className="pill bg-stone-soft text-ink hover:bg-accent-soft" title={t.tag}>
                + {t.label}
              </button>
            ))}
          </div>
        </div>

        {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveEmailTemplate(kind, mode, mode === "preset" ? presetKey : null, subject, body);
                setMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
              })
            }
          >
            Save this email
          </button>
          {saved && (
            <button
              type="button"
              className="btn-ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await resetEmailTemplate(kind);
                  if (res.ok) {
                    setSubject(defaultSubject);
                    setBody(defaultBody);
                    setMode("preset");
                    setPresetKey(null);
                  }
                  setMsg(res.ok ? { ok: true, text: res.message ?? "Reset." } : { ok: false, text: res.error });
                })
              }
            >
              Go back to standard wording
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="label">How it will look (with example details)</p>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_3px_rgba(31,58,61,0.05)]">
          <p className="text-xs text-muted">Subject</p>
          <p className="mb-4 font-medium">{fillSample(subject || defaultSubject)}</p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{fillSample(body)}</div>
        </div>
      </div>
    </div>
  );
}

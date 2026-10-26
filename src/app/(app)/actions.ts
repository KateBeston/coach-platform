"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCoach } from "@/lib/coach";
import { addDays, todayIn, zonedToUtc } from "@/lib/format";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return v === null ? "" : String(v).trim();
};
const n = (fd: FormData, k: string) => {
  const v = s(fd, k);
  return v === "" ? null : Number(v);
};
const cents = (fd: FormData, k: string) => {
  const v = s(fd, k);
  return v === "" ? 0 : Math.round(Number(v) * 100);
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

// ---------- Clients ----------

export async function createClientAction(fd: FormData) {
  const { supabase } = await getCoach();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      first_name: s(fd, "first_name"),
      last_name: s(fd, "last_name"),
      email: s(fd, "email").toLowerCase() || null,
      phone: s(fd, "phone") || null,
      status: s(fd, "status") || "lead",
      source: s(fd, "source") || null,
      background: s(fd, "background") || null,
    })
    .select("id")
    .single();
  if (error) fail("/clients/new", error.message.includes("duplicate") ? "A client with that email already exists." : error.message);
  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(fd: FormData) {
  const { supabase } = await getCoach();
  const id = s(fd, "id");
  const { error } = await supabase
    .from("clients")
    .update({
      first_name: s(fd, "first_name"),
      last_name: s(fd, "last_name"),
      email: s(fd, "email").toLowerCase() || null,
      phone: s(fd, "phone") || null,
      status: s(fd, "status"),
      source: s(fd, "source") || null,
      background: s(fd, "background") || null,
    })
    .eq("id", id);
  if (error) fail(`/clients/${id}`, error.message);
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

// ---------- Arrangements ----------

export async function createArrangementAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const clientId = s(fd, "client_id");
  const cadence = s(fd, "cadence");
  const offerId = s(fd, "offer_id") || null;

  let minutes = n(fd, "session_minutes") ?? 60;
  let total = n(fd, "sessions_total");
  let price = cents(fd, "price");
  if (offerId) {
    const { data: offer } = await supabase.from("offers").select("*").eq("id", offerId).single();
    if (offer) {
      if (!s(fd, "session_minutes")) minutes = offer.session_minutes;
      if (total === null && offer.kind === "package") total = offer.session_count;
      if (!s(fd, "price")) price = offer.price_cents;
    }
  }

  const { data, error } = await supabase
    .from("arrangements")
    .insert({
      client_id: clientId,
      offer_id: offerId,
      cadence,
      preferred_weekday: n(fd, "preferred_weekday"),
      preferred_time: s(fd, "preferred_time") || null,
      session_minutes: minutes,
      sessions_total: total,
      price_cents: price,
      start_date: s(fd, "start_date") || todayIn(coach.timezone),
      end_date: s(fd, "end_date") || null,
      auto_book: bool(fd, "auto_book"),
    })
    .select("id")
    .single();
  if (error) fail(`/clients/${clientId}`, error.message);

  await supabase.from("clients").update({ status: "active" }).eq("id", clientId).neq("status", "active");
  if (bool(fd, "auto_book")) await supabase.rpc("extend_standing_bookings", { p_arrangement: data.id, p_weeks: 8 });

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function updateArrangementAction(fd: FormData) {
  const { supabase } = await getCoach();
  const id = s(fd, "id");
  const clientId = s(fd, "client_id");
  const status = s(fd, "status");
  const update: Record<string, unknown> = { status };
  update.paused_until = status === "paused" ? s(fd, "paused_until") || null : null;
  if (status === "paused") update.status = "active"; // "paused" is expressed with paused_until so it resumes by itself
  if (status === "paused" && !update.paused_until) update.status = "paused";

  await supabase.from("arrangements").update(update).eq("id", id);

  if (status === "ended" || status === "paused") {
    // Clear future standing bookings that fall inside the pause, or all of them when ending.
    let q = supabase
      .from("sessions")
      .update({ status: "cancelled" })
      .eq("arrangement_id", id)
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString());
    if (status === "paused" && update.paused_until) q = q.lte("starts_at", `${update.paused_until}T23:59:59Z`);
    await q;
  }
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function topUpBookingsAction(fd: FormData) {
  const { supabase } = await getCoach();
  const clientId = s(fd, "client_id");
  await supabase.rpc("extend_standing_bookings", { p_arrangement: s(fd, "arrangement_id"), p_weeks: 12 });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

// ---------- Sessions ----------

export async function bookSessionAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const clientId = s(fd, "client_id");
  const back = s(fd, "back") || `/clients/${clientId}`;
  const local = s(fd, "starts_at");
  if (!local) fail(back, "Choose a date and time.");
  const start = zonedToUtc(local, coach.timezone);
  const minutes = n(fd, "minutes") ?? 60;
  const end = new Date(new Date(start).getTime() + minutes * 60_000).toISOString();

  const { data: clash } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "scheduled")
    .lt("starts_at", end)
    .gt("ends_at", start)
    .limit(1);
  if (clash?.length && !bool(fd, "allow_overlap")) fail(back, "That time overlaps another session.");

  const { error } = await supabase.from("sessions").insert({
    client_id: clientId,
    arrangement_id: s(fd, "arrangement_id") || null,
    offer_id: s(fd, "offer_id") || null,
    starts_at: start,
    ends_at: end,
    location_type: s(fd, "location_type") || "video",
    location_detail: s(fd, "location_detail") || null,
    meeting_url: s(fd, "meeting_url") || coach.default_meeting_url,
    is_paid_coaching: !bool(fd, "pro_bono"),
    booked_by: "coach",
  });
  if (error) fail(back, error.message);
  revalidatePath(back);
  revalidatePath("/");
  redirect(back);
}

export async function updateSessionStatusAction(fd: FormData) {
  const { supabase } = await getCoach();
  const id = s(fd, "id");
  await supabase.from("sessions").update({ status: s(fd, "status") }).eq("id", id);
  revalidatePath(`/sessions/${id}`);
  revalidatePath("/");
  redirect(s(fd, "back") || `/sessions/${id}`);
}

export async function rescheduleSessionAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const id = s(fd, "id");
  const start = zonedToUtc(s(fd, "starts_at"), coach.timezone);
  const minutes = n(fd, "minutes") ?? 60;
  const end = new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
  const { error } = await supabase
    .from("sessions")
    .update({
      starts_at: start,
      ends_at: end,
      location_type: s(fd, "location_type") || "video",
      location_detail: s(fd, "location_detail") || null,
      meeting_url: s(fd, "meeting_url") || null,
      is_paid_coaching: !bool(fd, "pro_bono"),
      counts_toward_icf: bool(fd, "counts_toward_icf"),
    })
    .eq("id", id);
  if (error) fail(`/sessions/${id}`, error.message);
  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}`);
}

// ---------- Notes & goals ----------

export async function addNoteAction(fd: FormData) {
  const { supabase } = await getCoach();
  const clientId = s(fd, "client_id");
  const actions = s(fd, "action_items")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((text) => ({ text, done: false }));
  const body = s(fd, "body");
  if (!body && !actions.length) fail(s(fd, "back") || `/clients/${clientId}`, "Write a note or an action item.");
  await supabase.from("notes").insert({
    client_id: clientId,
    session_id: s(fd, "session_id") || null,
    body,
    action_items: actions,
  });
  const back = s(fd, "back") || `/clients/${clientId}`;
  revalidatePath(back);
  redirect(back);
}

export async function toggleActionItemAction(fd: FormData) {
  const { supabase } = await getCoach();
  const id = s(fd, "note_id");
  const index = Number(s(fd, "index"));
  const { data } = await supabase.from("notes").select("action_items").eq("id", id).single();
  const items = (data?.action_items ?? []) as { text: string; done: boolean }[];
  if (items[index]) items[index].done = !items[index].done;
  await supabase.from("notes").update({ action_items: items }).eq("id", id);
  const back = s(fd, "back");
  revalidatePath(back);
  redirect(back);
}

export async function addGoalAction(fd: FormData) {
  const { supabase } = await getCoach();
  const clientId = s(fd, "client_id");
  if (s(fd, "title"))
    await supabase.from("goals").insert({ client_id: clientId, title: s(fd, "title"), target_date: s(fd, "target_date") || null });
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function setGoalStatusAction(fd: FormData) {
  const { supabase } = await getCoach();
  const clientId = s(fd, "client_id");
  const status = s(fd, "status");
  await supabase
    .from("goals")
    .update({ status, achieved_at: status === "achieved" ? new Date().toISOString() : null })
    .eq("id", s(fd, "id"));
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

// ---------- Offers ----------

export async function createOfferAction(fd: FormData) {
  const { supabase } = await getCoach();
  const kind = s(fd, "kind");
  const { error } = await supabase.from("offers").insert({
    name: s(fd, "name"),
    description: s(fd, "description") || null,
    kind,
    session_count: kind === "package" ? n(fd, "session_count") : 1,
    session_minutes: n(fd, "session_minutes") ?? 60,
    price_cents: cents(fd, "price"),
    billing: s(fd, "billing") || "upfront",
    is_public: bool(fd, "is_public"),
  });
  if (error) fail("/offers", error.message);
  revalidatePath("/offers");
  redirect("/offers");
}

export async function toggleOfferAction(fd: FormData) {
  const { supabase } = await getCoach();
  const field = s(fd, "field") === "is_public" ? "is_public" : "active";
  await supabase.from("offers").update({ [field]: s(fd, "value") === "true" }).eq("id", s(fd, "id"));
  revalidatePath("/offers");
  redirect("/offers");
}

// ---------- Invoices ----------

async function sessionLine(supabase: Awaited<ReturnType<typeof getCoach>>["supabase"], sessionId: string, tz: string) {
  const { data: sess } = await supabase
    .from("sessions")
    .select("id, starts_at, arrangement:arrangements(price_cents, sessions_total), offer:offers(name, price_cents, kind)")
    .eq("id", sessionId)
    .single();
  if (!sess) return null;
  const arr = sess.arrangement as unknown as { price_cents: number; sessions_total: number | null } | null;
  const offer = sess.offer as unknown as { name: string; price_cents: number; kind: string } | null;
  // Package price is for the whole package, so a single session from a package is priced per session.
  let unit = offer?.price_cents ?? 0;
  if (arr) unit = arr.sessions_total ? Math.round(arr.price_cents / arr.sessions_total) : arr.price_cents;
  const date = new Intl.DateTimeFormat("en-AU", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(sess.starts_at),
  );
  return { description: `${offer?.name ?? "Coaching session"} – ${date}`, unit_cents: unit, session_id: sess.id };
}

export async function createInvoiceAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const clientId = s(fd, "client_id");
  if (!clientId) fail("/invoices/new", "Choose a client.");
  const today = todayIn(coach.timezone);

  const lines: { description: string; unit_cents: number; quantity: number; session_id: string | null }[] = [];
  for (const sid of fd.getAll("session_ids").map(String)) {
    const line = await sessionLine(supabase, sid, coach.timezone);
    if (line) lines.push({ ...line, quantity: 1 });
  }
  if (s(fd, "custom_description") && s(fd, "custom_amount")) {
    lines.push({
      description: s(fd, "custom_description"),
      unit_cents: cents(fd, "custom_amount"),
      quantity: n(fd, "custom_quantity") ?? 1,
      session_id: null,
    });
  }
  if (!lines.length) fail(`/invoices/new?client=${clientId}`, "Add at least one session or line item.");

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      client_id: clientId,
      issue_date: today,
      due_date: addDays(today, coach.payment_terms_days),
      currency: coach.currency,
      notes: s(fd, "notes") || null,
    })
    .select("id")
    .single();
  if (error) fail("/invoices/new", error.message);

  await supabase.from("invoice_items").insert(lines.map((l, i) => ({ ...l, invoice_id: inv.id, position: i })));
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}

export async function invoiceFromSessionAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const sessionId = s(fd, "session_id");
  const line = await sessionLine(supabase, sessionId, coach.timezone);
  const { data: sess } = await supabase.from("sessions").select("client_id").eq("id", sessionId).single();
  if (!line || !sess) fail(`/sessions/${sessionId}`, "Session not found.");
  const today = todayIn(coach.timezone);
  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({ client_id: sess.client_id, issue_date: today, due_date: addDays(today, coach.payment_terms_days), currency: coach.currency })
    .select("id")
    .single();
  if (error) fail(`/sessions/${sessionId}`, error.message);
  await supabase.from("invoice_items").insert({ ...line, quantity: 1, invoice_id: inv.id });
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}

export async function setInvoiceStatusAction(fd: FormData) {
  const { supabase } = await getCoach();
  const id = s(fd, "id");
  const status = s(fd, "status");
  await supabase
    .from("invoices")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      payment_method: status === "paid" ? s(fd, "payment_method") || "Bank transfer" : null,
    })
    .eq("id", id);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/");
  redirect(`/invoices/${id}`);
}

// ---------- Settings ----------

export async function updateSettingsAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const slug = s(fd, "booking_slug")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  const { error } = await supabase
    .from("coaches")
    .update({
      display_name: s(fd, "display_name"),
      business_name: s(fd, "business_name"),
      timezone: s(fd, "timezone") || coach.timezone,
      currency: s(fd, "currency") || coach.currency,
      default_meeting_url: s(fd, "default_meeting_url") || null,
      booking_slug: slug || coach.booking_slug,
      booking_enabled: bool(fd, "booking_enabled"),
      booking_min_notice_hours: n(fd, "booking_min_notice_hours") ?? 24,
      booking_window_days: n(fd, "booking_window_days") ?? 60,
      session_buffer_minutes: n(fd, "session_buffer_minutes") ?? 15,
      max_sessions_per_day: n(fd, "max_sessions_per_day") ?? 6,
      gst_registered: bool(fd, "gst_registered"),
      gst_rate: n(fd, "gst_rate") ?? 10,
      tax_set_aside_pct: n(fd, "tax_set_aside_pct") ?? 30,
      invoice_prefix: s(fd, "invoice_prefix") || "INV-",
      payment_terms_days: n(fd, "payment_terms_days") ?? 7,
    })
    .eq("id", coach.id);
  if (error) fail("/settings", error.message.includes("duplicate") ? "That booking link is taken. Try another." : error.message);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function updateAvailabilityAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const rows: { weekday: number; start_time: string; end_time: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (!bool(fd, `on_${d}`)) continue;
    for (const b of [1, 2]) {
      const start = s(fd, `start_${d}_${b}`);
      const end = s(fd, `end_${d}_${b}`);
      if (start && end && end > start) rows.push({ weekday: d, start_time: start, end_time: end });
    }
  }
  await supabase.from("availability_rules").delete().eq("coach_id", coach.id);
  if (rows.length) await supabase.from("availability_rules").insert(rows);
  revalidatePath("/settings");
  redirect("/settings?saved=1#availability");
}

// ---------- Calendar ----------

export async function saveCalendarAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const id = s(fd, "id");
  const values = {
    name: s(fd, "name") || "Calendar",
    kind: s(fd, "kind") || "work",
    colour: s(fd, "colour") || "#4F6D5C",
    blocks_availability: bool(fd, "blocks_availability"),
    is_booking_destination: bool(fd, "is_booking_destination"),
  };
  if (values.is_booking_destination)
    await supabase.from("calendars").update({ is_booking_destination: false }).eq("coach_id", coach.id);
  if (id) await supabase.from("calendars").update(values).eq("id", id);
  else await supabase.from("calendars").insert(values);
  revalidatePath("/calendar");
  redirect(s(fd, "back") || "/settings#calendars");
}

export async function toggleCalendarVisibleAction(fd: FormData) {
  const { supabase } = await getCoach();
  await supabase.from("calendars").update({ visible: s(fd, "visible") === "true" }).eq("id", s(fd, "id"));
  const back = s(fd, "back") || "/calendar";
  revalidatePath("/calendar");
  redirect(back);
}

export async function addCalendarEventAction(fd: FormData) {
  const { supabase, coach } = await getCoach();
  const back = s(fd, "back") || "/calendar";
  const allDay = bool(fd, "all_day");
  let start: string, end: string;
  if (allDay) {
    const from = s(fd, "start_date");
    const to = s(fd, "end_date") || from;
    if (!from) fail(back, "Choose a date.");
    start = zonedToUtc(`${from}T00:00`, coach.timezone);
    end = zonedToUtc(`${addDays(to, 1)}T00:00`, coach.timezone);
  } else {
    if (!s(fd, "starts_at") || !s(fd, "ends_at")) fail(back, "Choose a start and end time.");
    start = zonedToUtc(s(fd, "starts_at"), coach.timezone);
    end = zonedToUtc(s(fd, "ends_at"), coach.timezone);
  }
  if (end <= start) fail(back, "The end needs to be after the start.");

  const { error } = await supabase.from("calendar_events").insert({
    calendar_id: s(fd, "calendar_id"),
    title: s(fd, "title") || "Busy",
    starts_at: start,
    ends_at: end,
    all_day: allDay,
  });
  if (error) fail(back, error.message);

  if (bool(fd, "cancel_overlapping")) {
    await supabase
      .from("sessions")
      .update({ status: "cancelled" })
      .eq("status", "scheduled")
      .lt("starts_at", end)
      .gt("ends_at", start);
  }
  revalidatePath("/calendar");
  redirect(back);
}

export async function deleteCalendarEventAction(fd: FormData) {
  const { supabase } = await getCoach();
  await supabase.from("calendar_events").delete().eq("id", s(fd, "id"));
  const back = s(fd, "back") || "/calendar";
  revalidatePath("/calendar");
  redirect(back);
}

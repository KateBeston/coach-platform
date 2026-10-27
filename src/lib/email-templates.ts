/* Client email wording: the kinds coaches can reword, the fill-in tags, and preset templates. */

export const EMAIL_KINDS = [
  { key: "booking_confirmed", label: "Booking confirmed", when: "When a session is booked" },
  { key: "session_reminder", label: "Reminder", when: "Before each session" },
  { key: "session_moved", label: "Session moved", when: "When a session's time changes" },
  { key: "session_cancelled", label: "Session cancelled", when: "When a session is cancelled" },
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number]["key"];

export const TAGS = [
  { tag: "{client_first_name}", label: "Client's first name", sample: "Sam" },
  { tag: "{session_name}", label: "Session", sample: "Single session" },
  { tag: "{session_time}", label: "Session time", sample: "Thursday 5 November at 10:00 am (Australia/Brisbane time)" },
  { tag: "{old_session_time}", label: "Previous time (moved only)", sample: "Tuesday 3 November at 2:00 pm (Australia/Brisbane time)" },
  { tag: "{location}", label: "Where / joining link", sample: "Join here: https://zoom.us/j/123456789" },
  { tag: "{booking_link}", label: "Your booking page", sample: "https://coach-platform-flax.vercel.app/book/your-name" },
  { tag: "{coach_name}", label: "Your name", sample: "Alex" },
  { tag: "{business_name}", label: "Business name", sample: "Clear Path Coaching" },
  { tag: "{signoff}", label: "Your sign-off", sample: "Alex, Clear Path Coaching" },
];

export function fillSample(text: string) {
  return TAGS.reduce((t, x) => t.split(x.tag).join(x.sample), text);
}

type Preset = { key: string; label: string; note: string; subject: string; body: string };

export const PRESETS: Record<EmailKind, Preset[]> = {
  booking_confirmed: [
    {
      key: "warm", label: "Warm", note: "Friendly and encouraging",
      subject: "You're booked in, {client_first_name}",
      body: "Hi {client_first_name},\n\nLovely — you're booked in. I'm looking forward to our time together.\n\n{session_name}\n{session_time}\n{location}\n\nIf anything changes, just reply to this email and we'll find another time.\n\nWarmly,\n{signoff}",
    },
    {
      key: "professional", label: "Professional", note: "Clear and polished",
      subject: "Session confirmed: {session_time}",
      body: "Hi {client_first_name},\n\nThis confirms your session.\n\nSession: {session_name}\nWhen: {session_time}\nWhere: {location}\n\nTo reschedule, please reply to this email at least 24 hours beforehand.\n\nKind regards,\n{signoff}",
    },
    {
      key: "short", label: "Short and simple", note: "Just the details",
      subject: "Booked: {session_time}",
      body: "Hi {client_first_name},\n\nYou're booked for {session_time}.\n{location}\n\nReply if you need to change it.\n\n{signoff}",
    },
  ],
  session_reminder: [
    {
      key: "warm", label: "Warm", note: "Friendly and encouraging",
      subject: "See you soon, {client_first_name}",
      body: "Hi {client_first_name},\n\nJust a gentle reminder that we're meeting soon.\n\n{session_name}\n{session_time}\n{location}\n\nIt can help to jot down anything you'd like to focus on before we start.\n\nSee you then,\n{signoff}",
    },
    {
      key: "professional", label: "Professional", note: "Clear and polished",
      subject: "Reminder: your session on {session_time}",
      body: "Hi {client_first_name},\n\nThis is a reminder of your upcoming session.\n\nSession: {session_name}\nWhen: {session_time}\nWhere: {location}\n\nIf you need to reschedule, please reply to this email.\n\nKind regards,\n{signoff}",
    },
    {
      key: "short", label: "Short and simple", note: "Just the details",
      subject: "Reminder: {session_time}",
      body: "Hi {client_first_name},\n\nReminder: {session_time}.\n{location}\n\n{signoff}",
    },
  ],
  session_moved: [
    {
      key: "warm", label: "Warm", note: "Friendly and encouraging",
      subject: "Your new session time, {client_first_name}",
      body: "Hi {client_first_name},\n\nThanks for your flexibility — your session has a new time.\n\n{session_name}\nNow: {session_time}\n(Was: {old_session_time})\n{location}\n\nIf the new time doesn't work, just reply and we'll sort it out.\n\nWarmly,\n{signoff}",
    },
    {
      key: "professional", label: "Professional", note: "Clear and polished",
      subject: "Session rescheduled to {session_time}",
      body: "Hi {client_first_name},\n\nYour session has been rescheduled.\n\nSession: {session_name}\nNew time: {session_time}\nPrevious time: {old_session_time}\nWhere: {location}\n\nPlease reply if the new time doesn't suit.\n\nKind regards,\n{signoff}",
    },
    {
      key: "short", label: "Short and simple", note: "Just the details",
      subject: "Moved to {session_time}",
      body: "Hi {client_first_name},\n\nYour session has moved to {session_time} (was {old_session_time}).\n{location}\n\n{signoff}",
    },
  ],
  session_cancelled: [
    {
      key: "warm", label: "Warm", note: "Friendly and encouraging",
      subject: "Your session on {session_time}",
      body: "Hi {client_first_name},\n\nJust letting you know your session on {session_time} has been cancelled.\n\nWhenever you're ready, you can choose a new time here: {booking_link}\n\nTake care,\n{signoff}",
    },
    {
      key: "professional", label: "Professional", note: "Clear and polished",
      subject: "Session cancelled: {session_time}",
      body: "Hi {client_first_name},\n\nYour session on {session_time} has been cancelled.\n\nTo book another time, please visit {booking_link} or reply to this email.\n\nKind regards,\n{signoff}",
    },
    {
      key: "short", label: "Short and simple", note: "Just the details",
      subject: "Cancelled: {session_time}",
      body: "Hi {client_first_name},\n\nYour session on {session_time} is cancelled. Book again: {booking_link}\n\n{signoff}",
    },
  ],
};

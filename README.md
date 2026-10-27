# Coach Platform (working name)

The business side of a coaching practice in one place: clients, arrangements, calendar, booking, sessions and notes, invoices, GST and tax set-aside, and a coaching hours log.

Built with Next.js 16, React 19, Tailwind 4 and Supabase. Deploys to Vercel.

## What's in this version

- **Today** – today's sessions, clients who need booking, notes to write up, packages ending, unpaid invoices, new leads, money received this month and how much to set aside for tax.
- **Clients** – one record per client with their arrangement, sessions, notes and action items, goals, invoices and an automatic timeline of everything that's happened.
- **Arrangements** – weekly, fortnightly, monthly, package or as-needed. Standing bookings book the client's regular slot ahead automatically, skipping clashes and time off. Anyone who has drifted from their arrangement shows up as "Needs booking".
- **Calendar** – week view with work and personal calendars shown together or separately. Personal events block availability and only ever show clients "busy". Time off can cancel sessions in that period.
- **Booking page** – `/book/your-link`. Clients pick an offer and a free time; they're added as a lead and the session lands in your calendar.
- **Sessions** – prep brief from the last notes and open action items, outcome buttons (completed, no-show, late cancel), notes, and one-click invoicing.
- **Invoices** – numbered automatically, GST added if you're registered, mark sent or paid, print or save as PDF. Financial-year totals.
- **Offers** – what you sell, and which offers appear on the booking page.
- **Coaching hours** – ICF-ready log built from each person's completed sessions, with CSV download.
- **Teams** – for practices with in-house or subcontracted practitioners. Owners and managers see the whole business; practitioners see only their own clients, sessions and notes, and never invoices. Each person has their own calendar, working hours and coaching hours log. Clients can choose a practitioner (or "anyone available") on the booking page. The Team page shows sessions, hours and session value per person, and calculates what subcontractors are owed (percentage, per session or hourly). Solo operators don't see any of this until they add someone.

## Setup

1. Copy `.env.example` to `.env.local` (values for the live Supabase project are already in it). Set `NEXT_PUBLIC_SITE_URL` to your real address once deployed.
2. In Supabase → Authentication → URL Configuration, set the **Site URL** to the same address and add `https://YOUR-DOMAIN/auth/callback` to **Redirect URLs**.
3. `npm install` then `npm run dev`.
4. On Vercel, add the three environment variables from `.env.example`.

Team members join by signing up with the email the owner added them under.

The database is already set up in the Supabase project `coach-platform` (Sydney region). The SQL in `supabase/migrations` recreates it from scratch if ever needed.

## Next to build

- Google and Outlook calendar sync (the calendar tables are ready for it)
- Zoom and Google Meet links created per session
- Email reminders and confirmations
- Bookkeeping: expenses, P&L, BAS-ready reports, accountant access, Xero export
- Online payments (Stripe) on invoices and the booking page

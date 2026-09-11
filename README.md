# Gallant Admin

Operations console for [gallant_bulk_sms](../gallant_bulk_sms). A separate
Next.js app that reads the same MySQL database and writes only through its
own audited actions.

## What it does

| Area | What an admin can do |
|---|---|
| **Templates** | Review the queue with transactional-compliance flags. Approve, reject with a reason, or **request changes** with a note the user sees on their dashboard. Flags offer ready-made wording for the note. A template the user then edits returns to the queue automatically. |
| **Messages** | Every SMS through the platform, filtered by phone, content, account, status, sandbox/live, delivery report, date. Detail view shows the gateway response and DLR payload. CSV export of any filter (audited). |
| **Users** | Filter by role, status, balance, activity. Per account: balance, keys (masked), templates, messages, payments, ledger, sign-ins, support. Suspend / ban / reactivate with a reason. Adjust credits (atomic, ledgered, notified, never negative). Send a dashboard notification. Superadmin: change role. |
| **Support** | Inbox of requests from the dashboard's support page. Reply (lands in the user's thread and notifications), close, reopen, prioritise. |
| **Payments** | M-Pesa top-ups with status breakdown and sums for any filter. |
| **Pricing** | View the active ladder and history. Superadmin: publish a new ladder, validated (prices fall with volume, tiers don't overlap). |
| **Sign-ins** | Every dashboard and admin sign-in, with a hotspot list of addresses repeatedly failing in the last 24h. |
| **Finance** | Cash in vs revenue earned. Units sold, consumed, deferred (liability), gross margin. Reconciles the ledger against payments and derived consumption against messages sent, listing any account whose books disagree. Twelve-month table, top accounts. |
| **Usage & runway** | Messages per hour / day / week with failures, busiest hours, sign-ups and active senders per day, 30-day projections for messages, cash and sign-ups. Gateway balance polled and charted; **runway** in days at the current burn; low-credit reminders on a configurable interval. Record gateway purchases (spend, unit cost); set monthly targets and see actuals against them. |
| **Compliance** | What was actually sent, scanned for marketing content and grouped by account. Catches abuse through template variables, which approval cannot. |
| **Audit log** | Every admin action with before/after state, reason, and IP. Nothing in this app can edit or delete it. |

## Run

```
cp .env.example .env     # fill in the same DB settings as the main app, plus a session secret
npm install
npm run dev              # http://localhost:3000  (use -p 3200 if the main app has 3000)
```

Sign in with any account whose `role` is `admin` or `superadmin` in the shared
`users` table. Sign-ins are recorded in `device_access` alongside the main
app's.

## Automation API

Bearer-token endpoints (`REVIEW_API_TOKEN`) for scripts, cron and AI reviewers:

```
POST /api/review           analyse text -- { content } or { contents[] }, kind: template | message
GET  /api/review/queue     templates awaiting review, each with its analysis
GET  /api/review/scan      sent traffic that reads as marketing, by account
POST /api/review/decide    { templateId, decision, note, reviewer } -- audited under REVIEW_API_ACTOR
GET  /api/alerts/status    runway without side effects
GET  /api/alerts/run       poll the gateway if stale, remind admins if low -- call hourly from cron
```

Every review response carries the transactional-only policy it implements,
so a model can cite it. The gateway balance endpoint needs the account
password (`BULK_SMS_PASSWORD`), not the API key; without it runway shows
"balance unknown" and everything else works.

## Design notes

- **Same database, one schema owner.** Tables the admin needs
  (`support_messages`, `support_replies`, `admin_audit_log`, the
  `changes_requested` status) are created by the main app's migrations, so
  there is one migration system. This app never runs DDL.
- **Writes are transactions with their audit row.** A review decision, its
  notification to the user, and its audit entry commit together or not at
  all. Same for credit adjustments.
- **Separate session secret.** An admin cookie is never a valid user
  session and vice versa.
- **Compliance flags are prompts, not verdicts.** `src/lib/compliance.ts`
  surfaces promotional wording, links, opt-out language, missing variables,
  capitals and length -- each with a suggestion the reviewer can insert
  into the note. The reviewer decides.

## Layout

```
src/
  proxy.ts              auth gate: every route except /login needs a valid session
  lib/
    env.ts              checked once; fails with the variable's name
    db/pool.ts          mysql2 pool, typed query/one/exec/transaction
    db/*.ts             one module per domain; all SQL lives here
    auth/               login (bcrypt, rate-limited) and the signed cookie
    audit.ts            one function every action calls
    notify.ts           writes to the user's notifications
    compliance.ts       transactional-review flags
  app/
    login/
    (app)/              authenticated: layout with nav + queue counts, one folder per area
```

# Gallant Admin

> New to this? Start with `../gallant_bulk_sms/docs/HANDOVER.md` — it covers both apps, what is settled, and what is open.

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
| **Finance** | Cash in by period (last hour, today, 7d, 30d, this year, 12 months, all time) vs revenue earned. Units sold, consumed, deferred (liability), gross margin. Reconciles the ledger against payments and derived consumption against messages sent, listing any account whose books disagree. Company **expenses** by category (marketing, infrastructure, fees, ...) alongside gateway purchases; net after expenses. Twelve-month table, top accounts. |
| **Usage & runway** | Messages per hour / day / week with failures, busiest hours, sign-ups and active senders per day, 30-day projections for messages, cash and sign-ups. Gateway balance polled and charted; **runway** in days at the current burn; low-credit reminders on a configurable interval. Record gateway purchases (spend, unit cost); set monthly targets and see actuals against them. |
| **Compliance** | What was actually sent, scanned for marketing content and grouped by account. Catches abuse through template variables, which approval cannot. Warn or suspend an account from here; warnings are counted. |
| **Human review** | The queue of things an automated reviewer was not sure about -- templates, messages, accounts. A human decision on a template resolves its request automatically. Filter templates by "human review requested". |
| **Email** | Send to one address, one account, or a segment (paying, unpaid, idle 30d, all active, admins). `{{name}}` and `{{email}}` are filled per recipient; never BCC; capped at 500. Every message is logged before sending, so a failed batch can be re-sent. |
| **Audit log** | Every admin action with before/after state, reason, and IP. Nothing in this app can edit or delete it. |

## What you need to add

Things the console cannot supply itself. Each one degrades cleanly until it
is set; nothing else breaks.

| Setting | Where | Why | Until then |
|---|---|---|---|
| ~~`BULK_SMS_PASSWORD`~~ | — | **Done 13 Sep 2026.** Balance polls via `/SMSApi/account/readstatus`; purchases import from `/SMSApi/account/readcredithistory`. | — |
| ~~`EMAIL_PASS`~~ | — | **Done 13 Sep 2026.** New app password in both `.env` files; verified. | — |
| Cron for `/api/alerts/run` | wherever the app is hosted | Reminders and balance polling run only when something calls this. Hourly is right; it is idempotent. | The Usage page still computes runway on load; you just get no push. |
| `REVIEW_API_TOKEN` handed to the AI reviewer | your automation | The review API is what an AI uses to work the queue, record verdicts, and escalate. | The endpoints answer 401. |
| `ENFORCE_API_MAY_SUSPEND=1` | admin `.env`, optional | Lets the API suspend accounts directly. Off by default: an automated reviewer can *request* suspension and a person decides. | API suspensions become human-review requests. |
| `GATEWAY_COST_PER_SMS` | admin `.env` | Set to **0.20** from HostPinnacle's price list (every pack to 250k units; 0.18 at 500k, 0.16 at 1M). Change it if you buy a larger pack. | Defaults to 0.20. |
| Git remote | -- | This repo has no origin yet. | Local history only. |

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
POST /api/review/request   ask a human to look at a template, message or account
GET  /api/review/requests  open human-review requests (paged)
GET  /api/review/unreviewed  sent messages with no verdict yet -- the AI work queue (paged)
POST /api/review/verdicts  record up to 500 verdicts; is_human is always 0 via the API
GET  /api/review/verdicts  counts by review state
POST /api/review/enforce   warn | suspend | request_suspension on an account
GET  /api/alerts/status    runway without side effects
GET  /api/alerts/run       poll the gateway if stale, remind admins if low -- call hourly from cron
```

Every review response carries the transactional-only policy it implements,
so a model can cite it. The gateway account endpoints need the portal password (`BULK_SMS_PASSWORD`)
with a lowercase `userid`; the API key is refused there.

## Messages: AI first, human confirms

Traffic will be too much to read. The flow that scales:

1. `GET /api/review/unreviewed` -- a page of sent messages nobody has checked, each with the deterministic flags attached.
2. The AI decides and `POST /api/review/verdicts` -- clean, marketing, or unsure, with a confidence. Recorded with `is_human = 0`.
3. Anything `unsure`, or `marketing` below `escalate_below` (default 0.8), also opens a human-review request.
4. A person works `/reviews`, or filters `/messages` by *AI flagged, unconfirmed*, and clicks **Confirm marketing** / **Confirm clean**. That writes a verdict with `is_human = 1` -- the "confirmed, not AI" flag every filter keys on.
5. Repeat offenders: `POST /api/review/enforce` with `warn` (counted), or `request_suspension` (a person decides). The compliance page has the same buttons.

Filters on `/messages`: unreviewed · flagged (AI or human) · AI flagged, unconfirmed · AI unsure · AI clean · human confirmed marketing · human confirmed clean.

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

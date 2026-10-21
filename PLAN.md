# Ghost Subscriber "Book Reward" Tracker — Plan

**Status:** Phase 0 complete (data spike done) — no app code yet
**Last updated:** 2026-10-21
**Owner:** Gulhan Karali (gulhan.karali@gmail.com)

---

## 1. Goal

A local web app that provides an interface to view **kerimbalci.com** customers (Ghost
members) ranked by **subscription age**, and that automates two reward-related email
flows: a **daily admin alert** when a customer reaches 12 months of paid membership (time
to send them the book), and a **one-time retention email** to a customer whenever their
subscription pauses.

---

## 2. Core concept: "Subscription age"

**Subscription age = cumulative *paid* time**, with these rules:

- **Excludes the 7-day free trial.** The clock starts when the customer's **first real
  payment** begins (effectively `trial_end` = `trial_start + 7 days`).
- **Pauses on interruption.** On a **cancellation**, **refund**, or **failed payment**,
  the clock **stops** — the customer keeps the months already accrued.
- **Resumes on return.** If the customer comes back, counting continues from where it
  left off (e.g. a customer frozen at 9 months resumes toward 12, not from 0).
- Therefore subscription age is **the sum of actual paid periods**, not a single
  `now − start` calculation.

### States a customer can be in
| State | Meaning | Clock |
|-------|---------|-------|
| In trial | Within the 7-day free window | Not started |
| Active (paying) | Currently paying | Running |
| Paused | Cancelled / refunded / payment failed | Frozen at accrued value |
| Completed | Reached 12 accrued months | Stopped; book due/sent |

> Excluded from subscription-age tracking: comped / free / staff members (to be confirmed
> against live data).

---

## 2b. Phase 0 findings — live data spike (2026-10-21)

Probed the **real kerimbalci.com Ghost Admin API** (Content API confirmed useless here —
`/members` returns 404; members are Admin-only).

**Member base:** 134 total → **18 paid**, 1 comped, 115 free. The sampled members were
**created 2026-10-20/21 — the subscriber base is brand new; nobody is near 12 months.**

**The Admin API subscription object gives us, directly:**

| Field | Example | Use in our logic |
|-------|---------|------------------|
| `status` | `trialing` | Stripe status (trialing / active / canceled / past_due / unpaid) → **pause detection** |
| `trial_start_at`, `trial_end_at` | explicit ISO timestamps | **Paid clock starts at `trial_end_at`** — no need to derive |
| `tier.trial_days` | **7** | Confirms the 7-day trial assumption |
| `start_date` | ISO | Subscription start |
| `current_period_end` | ISO | Current billing period end |
| `cancel_at_period_end`, `cancellation_reason` | bool / text | Cancellation signal |
| `plan.interval` | `month` (yearly tiers also exist) | Monthly vs annual |
| `default_payment_card_last4` | `9714` | Payment presence |
| `tier.name` / `.slug` | `Gold` | Tier label |

**The one gap:** the subscription object is a **snapshot of current state only** — it has
**no invoice/payment history**, so Ghost alone cannot reconstruct *past* paused/resumed
paid periods retroactively.

### Decision: **Stripe is NOT needed.** ✅
Because the member base is brand new and no one is near 12 months, we don't need historical
reconstruction. We **accumulate accrued paid time by observing member state daily, going
forward** — exactly what the `paid_periods` table is for. The daily job adds paid time
while a member is paying and freezes it while paused. Stripe would only matter for
historical backfill, which is explicitly out of scope.

> Keys: Content API key and Admin API key both verified working. The **Admin key is a
> full read/write secret** — it was shared in plaintext during this spike and should be
> **rotated before production use**. Keys live only in a git-ignored `.env`.

---

## 3. Email flows

### 3.1 Admin alert — "send the book"
- **Trigger:** a customer's accrued paid time reaches **12 months** AND `book_sent` is
  false.
- **Recipient:** gulhan.karali@gmail.com
- **Frequency:** evaluated **daily** (GMT). Uses `book_sent` flag so each customer
  triggers **once** even if the job runs many times.
- **Content:** which customer(s) hit 12 months and need the book shipped.

### 3.2 Customer retention email — "you're almost there"
- **Trigger:** a **new pause event** (cancellation / refund / failed payment) is detected
  for a customer.
- **Recipient:** the customer.
- **Frequency:** **once per pause incident** (not repeated while away).
- **Content:** encouragement showing progress, e.g.
  *"You've completed 9 months — you're only 3 months away from receiving your book."*

---

## 4. Architecture

Runs **entirely locally** on the owner's machine for now.

```
┌─────────────────────┐      HTTP       ┌──────────────────────────┐
│  React + TypeScript  │ ─────────────▶ │   Local backend (Node)    │
│  frontend (UI)       │ ◀───────────── │   - holds Ghost Admin key  │
└─────────────────────┘    JSON API     │   - (optional Stripe key)  │
                                         │   - business logic         │
                                         │   - cron (daily, GMT)      │
                                         │   - email sender           │
                                         └───────────┬──────────────┘
                                                     │
                                         ┌───────────┴───────────┐
                                         │                       │
                                  ┌──────▼──────┐        ┌───────▼────────┐
                                  │  SQLite DB   │        │  Ghost Admin   │
                                  │ (local file) │        │  API (+Stripe?)│
                                  └─────────────┘        └────────────────┘
```

### Why a backend is required
- The **Ghost Admin API key is a secret** that signs JWTs; it must **never** ship in a
  browser bundle. The backend holds it and exposes only safe, read-shaped endpoints.
- The **daily cron** and **email sending** cannot run reliably from a React frontend.

### Components
1. **Backend (Node + TypeScript)**
   - Ghost Admin API client (member + subscription data).
   - Optional **Stripe API client** (only if Ghost data can't reconstruct accrued paid
     time accurately — see Open Risks).
   - Subscription-age calculator (sums paid periods, honours pause/resume).
   - Pause-event detector (diffs latest state vs. last-known state in DB).
   - Email service (admin alert + retention email).
   - **Cron scheduler**, daily at a fixed GMT time.
   - REST endpoints for the frontend.
2. **SQLite database (single local file)** — see schema below.
3. **Frontend (React + TypeScript)** — customer list sortable/filterable by subscription
   age, plus a "due to send" view.

---

## 5. Data model (SQLite)

```
members
  id                TEXT PRIMARY KEY     -- Ghost member id
  email             TEXT
  name              TEXT
  status            TEXT                 -- free / paid / comped
  trial_end         DATETIME             -- when paid clock starts
  accrued_months    REAL                 -- cumulative paid time (months)
  current_state     TEXT                 -- in_trial / active / paused / completed
  last_synced_at    DATETIME
  book_sent         INTEGER DEFAULT 0    -- 0/1, prevents duplicate admin alerts
  book_sent_at      DATETIME

paid_periods                             -- the building blocks of accrued time
  id                INTEGER PRIMARY KEY
  member_id         TEXT
  period_start      DATETIME
  period_end        DATETIME             -- null if ongoing
  source            TEXT                 -- ghost / stripe

events                                   -- audit of pauses/resumes etc.
  id                INTEGER PRIMARY KEY
  member_id         TEXT
  type              TEXT                 -- pause / resume / failed_payment / refund / ...
  occurred_at       DATETIME
  detected_at       DATETIME

email_log                                -- dedup + audit for all sent email
  id                INTEGER PRIMARY KEY
  member_id         TEXT
  type              TEXT                 -- admin_book_alert / customer_retention
  sent_at           DATETIME
  context           TEXT                 -- e.g. pause incident id, accrued months
```

Key invariants:
- `book_sent` ensures the admin alert fires once per customer.
- An `email_log` row of type `customer_retention` tied to a pause incident ensures the
  retention email fires once per pause.

---

## 6. Daily job (GMT) — logic

1. **Sync** latest member + subscription data from Ghost (and Stripe if enabled).
2. **Recompute** each member's accrued paid time and `current_state`.
3. **Detect pause events** by diffing against last-known state:
   - new pause → write `events` row → send **one** retention email → log it.
4. **Detect 12-month completions**:
   - accrued ≥ 12 months AND `book_sent = 0` → send **admin alert** → set `book_sent = 1`.
5. Persist everything; update `last_synced_at`.

---

## 7. Decisions locked in

| Topic | Decision |
|-------|----------|
| Hosting | Local machine (for now) |
| Subscription age | Cumulative paid time, excludes 7-day trial |
| Pause behaviour | Pause-and-preserve (keep accrued, resume later) |
| Qualify for book | 12 accrued paid months |
| Admin alert | Daily check, email to gulhan.karali@gmail.com, once per customer |
| Retention email | To customer, once per pause incident |
| Timezone | GMT for the daily job |
| Persistence | SQLite (local file) |
| Historical backfill | **None needed** — no customer is past 12 months yet |
| Stack | React + TypeScript (frontend), Node + TypeScript (backend) |

---

## 8. Open items (decide at build time)

1. **Email transport** — Gmail **App Password** (SMTP, simplest for local) vs. a service
   like **Resend / SendGrid**.
2. ~~**Stripe key**~~ — **RESOLVED in Phase 0: not needed.** Accrued time is tracked
   forward via daily observation; no historical reconstruction required.
3. **Comped / free / staff** handling — 1 comped member exists; confirm exclusion rule.
4. ~~**Trial length**~~ — **RESOLVED: `tier.trial_days = 7`**, and `trial_end_at` is
   provided directly by the API.
5. **Exact GMT time of day** for the cron run.

---

## 9. Open risks

- ~~**Accrued paid time from Ghost alone.**~~ **RESOLVED in Phase 0.** Ghost gives only a
  current-state snapshot (no invoice history), but since the member base is brand new and
  no one is near 12 months, we accrue paid time forward by daily observation — Stripe is
  unnecessary. The residual dependency is simply that **the daily job must run reliably**
  so the accrual ledger stays complete (see next risk).
- **Pause detection granularity.** We detect pauses by diffing daily snapshots; a
  pause-and-resume that happens entirely between two runs could be missed. Stripe webhooks
  would be more precise but add infra; out of scope for the local-only v1.

---

## 10. Suggested build phases

- **Phase 0 — Data spike. ✅ DONE (2026-10-21).** Inspected real member/subscription
  payloads. Outcome: Admin API suffices, **no Stripe needed**, field mappings locked
  (see §2b). *No app code written.*
- **Phase 1 — Backend core.** Ghost client, SQLite schema, subscription-age calculator,
  REST read endpoints. Verified against real data.
- **Phase 2 — Frontend.** React + TS customer list, sort/filter by subscription age,
  "due to send" view.
- **Phase 3 — Automation.** Daily GMT cron, pause detection, both email flows, dedup via
  DB flags/logs.
- **Phase 4 — Hardening.** Error handling, logging, manual "re-send / mark sent" controls,
  basic local auth if ever needed.

---

## 11. What I need from you to proceed past planning

- ~~Ghost Admin API key + URL~~ — **received & verified in Phase 0.**
- ~~Stripe key~~ — **not needed (Phase 0).**
- Choice of **email transport** — Gmail App Password vs. Resend/SendGrid (needed by Phase 3).
- **Exact GMT time of day** for the daily job.
- **Comped-member** rule: exclude the 1 comped member from tracking? (assumed yes)
```

Nothing here is built. This document is the agreement before any code.

# Ghost Subscriber "Book Reward" Tracker

A local web app for **kerimbalci.com** that lists Ghost members by **subscription age**
(cumulative paid time, excluding the 7-day free trial) and automates two reward emails:

- **Admin alert** — daily email to the owner when a customer reaches **12 months** of paid
  membership (time to send them the book). Fires once per customer.
- **Customer retention email** — a one-time message to a customer when their subscription
  **pauses** (cancellation / refund / failed payment), showing how close they are to the
  book (e.g. *"9 months done, 3 to go"*). Subscription age **pauses and resumes**, never
  resets.

> **Status:** Planning. No application code yet — see [`PLAN.md`](./PLAN.md) for the full
> specification and build phases.

---

## Stack (planned)

- **Frontend:** React + TypeScript
- **Backend:** Node + TypeScript (holds the Ghost Admin API key; runs the daily cron and
  email sending)
- **Database:** SQLite (single local file)
- **Scheduler:** daily cron at a fixed **GMT** time

Runs **entirely locally** for now.

---

## Prerequisites

Already present on the dev machine — nothing extra to install system-wide:

- **Node.js** ≥ 21 (built-in `node:sqlite` would need ≥ 22; we use the `better-sqlite3`
  npm package instead)
- **npm**
- **SQLite** — the engine ships with macOS (`/usr/bin/sqlite3`), useful for inspecting the
  DB file. The backend talks to SQLite via the `better-sqlite3` dependency, not the CLI.

---

## Secrets / configuration (planned)

These will live in a local `.env` file (git-ignored), **never** in the frontend bundle:

- `GHOST_ADMIN_API_URL` — e.g. `https://kerimbalci.com`
- `GHOST_ADMIN_API_KEY` — Ghost Admin API key (secret; signs JWTs)
- `STRIPE_API_KEY` — optional, only if Ghost data can't reconstruct accrued paid time
- Email transport credentials (Gmail App Password **or** Resend/SendGrid key)

---

## Next step

**Phase 0 — data spike:** with the real Ghost Admin API key, confirm whether accrued paid
time (with pauses/resumes) can be reconstructed from Ghost alone or whether Stripe is
required. This decision shapes the architecture. See [`PLAN.md`](./PLAN.md) §10–11.

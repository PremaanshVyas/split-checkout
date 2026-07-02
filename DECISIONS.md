# Decision Log

Every non-obvious choice in this project, dated, with the alternatives considered and the reasoning. Newest entries at the bottom.

---

## 2026-07-02 — Orchestration only; the demo never holds funds

**Decision:** One order is represented by N Airwallex PaymentIntents. Money settles directly to the merchant's Airwallex account. Nothing in this system pools, holds, or forwards shopper funds at any point.

**Alternatives:** A "collect then disburse" model (charge cards into an intermediary balance, then pay the merchant) would be simpler to reason about as a single ledger entry.

**Why:** Holding shopper money — even transiently — makes this a regulated stored-value / purchased-payment facility in Australia (AFSL/ASIC/AUSTRAC territory). Orchestration on top of Airwallex's existing authorize/capture primitives sidesteps licensing entirely and is also the honest pitch: this is a feature that belongs *inside* the platform, not a middleman.

---

## 2026-07-02 — Authorize all, then capture together (`autoCapture: false`)

**Decision:** Each card is confirmed client-side with `autoCapture: false`, which places an authorization hold without moving money. The server captures every intent in the group only after **all** of them reach the authorized state. If any card fails, nothing is captured.

**Alternatives:** (a) Charge cards one at a time as the shopper enters them — simpler, but a mid-checkout failure leaves the shopper partially charged and forces refunds. (b) Charge everything at the end without holds — the second card can fail after the first was charged, same refund problem.

**Why:** The two-phase authorize/capture protocol is exactly what card networks provide for "all-or-nothing" semantics. A failed authorization costs nothing to unwind — uncaptured holds simply expire. This eliminates the partial-charge failure mode entirely instead of handling it.

---

## 2026-07-02 — Sequential stepper UX, not two card forms side by side

**Decision:** The checkout collects cards one at a time in a stepper (Card A → hold → Card B → hold → capture both), not two live card forms on one page.

**Alternatives:** Parallel entry — both card forms visible simultaneously.

**Why:** Airwallex's docs state each card element should be mounted once per payment flow. Two live elements bound to two different intents on one page is fragile and fights the SDK. Sequential is also how the incumbent in this space (Hands In) sequences it — it is the correct UX, not a compromise.

---

## 2026-07-02 — Polling-first status tracking; webhooks as a stretch goal

**Decision:** After each client-side confirm resolves, the backend calls the PaymentIntent Retrieve endpoint to verify the true status. Webhook handling (with signature verification) is planned as a later hardening step, not the primary mechanism.

**Alternatives:** Webhook-first, which is the production-grade pattern.

**Why:** Airwallex's docs warn that a completed client-side flow does not imply a successful transaction, so a server-side Retrieve is required either way. For a demo that reviewers will run locally, polling is deterministic and has zero setup (no public URL / tunnel needed to receive webhooks). The interface is designed so webhook events can later feed the same status-transition code path.

---

## 2026-07-02 — SQLite (better-sqlite3) instead of Postgres

**Decision:** Persistence is a local SQLite file via better-sqlite3.

**Alternatives:** Postgres (what production would use), or no persistence (in-memory).

**Why:** A reviewer must be able to run this from a fresh clone with only a sandbox account — zero external services. The schema (`order_groups`, `payment_slots`) is written as it would be in Postgres; the swap is a driver change, not a redesign. In-memory was rejected because the order-group state machine is the heart of the demo and deserves real persistence semantics.

---

## 2026-07-02 — Express over Fastify

**Decision:** The backend is Node.js + TypeScript on Express.

**Alternatives:** Fastify (faster, nicer TS story), Hono, or a full framework (Next.js API routes).

**Why:** The server is a handful of routes; framework performance is irrelevant. Express is the dialect every reviewer reads without thinking, which serves the goal of boring, auditable code. A full framework would bury ~300 lines of payments logic under scaffolding.

---

## 2026-07-02 — React + Vite for the frontend

**Decision:** The checkout UI is React (with Vite), not vanilla TS.

**Alternatives:** Vite + vanilla TS — fewer dependencies, and the spec allowed either.

**Why:** The stepper is inherently stateful: per-slot status (created / held / declined / captured), group status, retry-in-place, live split validation. In vanilla TS that becomes hand-rolled state-and-render plumbing; in React it's a few small components with obvious data flow. The *smaller codebase* here is the one that doesn't reimplement a view layer.

---

## 2026-07-02 — Monorepo layout: `server/` + `web/` npm workspaces

**Decision:** One repo, two npm workspaces: an Express API (`server/`) and the Vite frontend (`web/`). In production builds the server serves the built frontend, so the demo deploys as a single process.

**Alternatives:** Two repos; or a single package mixing server and client source.

**Why:** One `git clone && npm install && npm run dev` for reviewers, one deploy target for the hosted demo, but still a hard compile-time boundary between browser code (which may only ever see per-intent `client_secret`s) and server code (which holds the API key). That boundary mirrors the security rule, so the layout enforces it.

# Decision Log

Every non-obvious choice in this project, dated, with the alternatives considered and the reasoning. Newest entries at the bottom.

---

## 2026-07-02: Orchestration only; the demo never holds funds

**Decision:** One order is represented by N Airwallex PaymentIntents. Money settles directly to the merchant's Airwallex account. Nothing in this system pools, holds, or forwards shopper funds at any point.

**Alternatives:** A "collect then disburse" model (charge cards into an intermediary balance, then pay the merchant) would be simpler to reason about as a single ledger entry.

**Why:** Holding shopper money, even transiently, makes this a regulated stored-value or purchased-payment facility in Australia (AFSL, ASIC and AUSTRAC territory). Orchestration on top of Airwallex's existing authorize/capture primitives sidesteps licensing entirely and is also the honest pitch: this is a feature that belongs *inside* the platform, not a middleman.

---

## 2026-07-02: Authorize all, then capture together (`autoCapture: false`)

**Decision:** Each card is confirmed client-side with `autoCapture: false`, which places an authorization hold without moving money. The server captures every intent in the group only after **all** of them reach the authorized state. If any card fails, nothing is captured.

**Alternatives:** (a) Charge cards one at a time as the shopper enters them. Simpler, but a mid-checkout failure leaves the shopper partially charged and forces refunds. (b) Charge everything at the end without holds, where the second card can fail after the first was charged. Same refund problem.

**Why:** The two-phase authorize/capture protocol is exactly what card networks provide for all-or-nothing semantics. A failed authorization costs nothing to unwind, since uncaptured holds simply expire. This eliminates the partial-charge failure mode entirely instead of handling it.

---

## 2026-07-02: Sequential stepper UX, not two card forms side by side

**Decision:** The checkout collects cards one at a time in a stepper (Card A, hold, Card B, hold, then capture both), not two live card forms on one page.

**Alternatives:** Parallel entry, with both card forms visible simultaneously.

**Why:** Airwallex's docs state each card element should be mounted once per payment flow. Two live elements bound to two different intents on one page is fragile and fights the SDK. Sequential is also how the incumbent in this space (Hands In) sequences it. It is the correct UX, not a compromise.

---

## 2026-07-02: Polling-first status tracking; webhooks as a stretch goal

**Decision:** After each client-side confirm resolves, the backend calls the PaymentIntent Retrieve endpoint to verify the true status. Webhook handling (with signature verification) is planned as a later hardening step, not the primary mechanism.

**Alternatives:** Webhook-first, which is the production-grade pattern.

**Why:** Airwallex's docs warn that a completed client-side flow does not imply a successful transaction, so a server-side Retrieve is required either way. For a demo that reviewers will run locally, polling is deterministic and has zero setup: no public URL or tunnel is needed to receive webhooks. The interface is designed so webhook events can later feed the same status-transition code path.

---

## 2026-07-02: SQLite (better-sqlite3) instead of Postgres

**Decision:** Persistence is a local SQLite file via better-sqlite3.

**Alternatives:** Postgres (what production would use), or no persistence at all.

**Why:** A reviewer must be able to run this from a fresh clone with only a sandbox account and zero external services. The schema (`order_groups`, `payment_slots`) is written as it would be in Postgres; the swap is a driver change, not a redesign. In-memory was rejected because the order-group state machine is the heart of the demo and deserves real persistence semantics.

---

## 2026-07-02: Express over Fastify

**Decision:** The backend is Node.js + TypeScript on Express.

**Alternatives:** Fastify (faster, nicer TypeScript story), Hono, or a full framework like Next.js API routes.

**Why:** The server is a handful of routes; framework performance is irrelevant. Express is the dialect every reviewer reads without thinking, which serves the goal of boring, auditable code. A full framework would bury ~300 lines of payments logic under scaffolding.

---

## 2026-07-02: React + Vite for the frontend

**Decision:** The checkout UI is React (with Vite), not vanilla TypeScript.

**Alternatives:** Vite + vanilla TS: fewer dependencies, and the spec allowed either.

**Why:** The stepper is inherently stateful: per-slot status (created, held, declined, captured), group status, retry-in-place, live split validation. In vanilla TS that becomes hand-rolled state-and-render plumbing; in React it's a few small components with obvious data flow. The *smaller codebase* here is the one that doesn't reimplement a view layer.

---

## 2026-07-02: Monorepo layout, `server/` + `web/` npm workspaces

**Decision:** One repo, two npm workspaces: an Express API (`server/`) and the Vite frontend (`web/`). In production builds the server serves the built frontend, so the demo deploys as a single process.

**Alternatives:** Two repos, or a single package mixing server and client source.

**Why:** One `git clone && npm install && npm run dev` for reviewers and one deploy target for the hosted demo, but still a hard compile-time boundary between browser code (which may only ever see per-intent `client_secret`s) and server code (which holds the API key). That boundary mirrors the security rule, so the layout enforces it.

---

## 2026-07-02: Raw REST client instead of the official Node SDK

**Decision:** The server talks to Airwallex via a small hand-written typed client (`server/src/airwallex/client.ts`) over `fetch`, not `@airwallex/node-sdk`.

**Alternatives:** `@airwallex/node-sdk`, Airwallex's official TypeScript-first server SDK with auto token refresh and typed models.

**Why:** The official SDK is currently in beta (`2.x.0-beta.*`). This demo touches exactly five endpoints (login, create, retrieve, capture, cancel), and the whole client fits in ~130 readable lines, which also keeps the authorize/capture mechanics visible to a reviewer instead of hidden behind an SDK call. A beta dependency is the wrong trade for five endpoints. The client mirrors the SDK's semantics (cached 30-minute token, refresh before expiry, `request_id` idempotency on every mutating call) so swapping later is mechanical.

---

## 2026-07-02: Sandbox finding: the insufficient-funds test card runs a 3DS challenge first

**What happened:** End-to-end testing of the failure path with Airwallex's documented insufficient-funds combination (card `5307 8373 6054 4518` at $80.51) did not produce an immediate decline. The confirm went to `REQUIRES_CUSTOMER_ACTION` / `AUTHENTICATION_REDIRECTED`. In the sandbox this card triggers a full 3DS challenge (OTP `1234`) *before* the issuer decline is returned. Our first integration pass never rendered the challenge because `authFormContainer` wasn't passed to `createElement`, so the confirm just hung.

**Decision:** (a) Always pass `authFormContainer` so any card that requires 3DS can complete authentication. This matters for real cards too, not just test ones. (b) Use the risk-decline test card (`4646 4646 4646 4644`, declines at any amount, no 3DS) as the primary scripted decline demo, and keep the code-51 card as the manual demo with the OTP hint shown in the UI.

**Why it's recorded:** The spec's rule was that a documented surprise beats a silent workaround. The lesson generalizes: client-side confirm outcomes are not binary success/decline. There is a customer-action middle state the UI must host, which is exactly why the server-side Retrieve is the only source of truth.

---

## 2026-07-02: Deploy on Fly.io, one machine, scale-to-zero

**Decision:** The hosted demo runs on Fly.io as a single machine (`fly scale count 1`) with scale-to-zero, SQLite on the machine's ephemeral disk.

**Alternatives:** Render (needs a GitHub repo connection, and this repo is local-only until the pitch); two or more machines for availability; a Fly volume or managed Postgres for durable state.

**Why:** Fly deploys straight from the local working tree, which fits a private pre-pitch repo. The first deploy defaulted to two machines "for high availability" and immediately demonstrated why that's wrong here: each machine had its own SQLite file, so an order created on one machine 404'd when the verify request landed on the other. One machine is the honest topology for a SQLite demo. Order state is checkout-session-scoped, so losing it on redeploy or restart is acceptable (noted in README limitations); production would use Postgres and any number of instances.

---

## 2026-07-02: 3DS challenges render in a modal, not inline

**Decision:** The `authFormContainer` div the SDK injects bank-verification challenges into is a single top-level element styled as a centered modal with a dimmed backdrop (pure CSS on `:not(:empty)`, no JS observer needed). Previously it sat inline inside the card step.

**Alternatives:** Inline rendering under the card fields (our first pass), or the SDK's default behavior with no container.

**Why:** User testing found the OTP form clipped and partly invisible inline: a shopper mid-payment saw "Placing hold…" and a fragment of a bank form. A challenge is modal by nature. It blocks the payment, comes from a third party (the issuer), and must be completed or cancelled. The modal makes the full "Purchase Authentication" form visible in one piece with an explanatory caption. The full transaction matrix was re-verified afterwards (see EVIDENCE.md): frictionless 3DS, challenge success, challenge failure, authentication failure, issuer decline behind 3DS, risk decline, and invalid card all surface correct states and human-readable copy.

---

## 2026-07-02: Explicit hold reversal, a cancel button plus a stale-order sweep

**Decision:** Abandoned orders no longer rely on authorization holds expiring naturally. Two mechanisms reverse them explicitly: a "Cancel order & release holds" action in the checkout, and a server-side sweep that cancels any order still uncaptured 60 minutes after creation (checked every 5 minutes).

**Alternatives:** The original design let unneeded holds expire on their own (about 5 days for cards), documented as acceptable because no money moves either way.

**Why:** Reading Visa's [authorization best-practices](https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/authorization-and-reversal-processing-best-practices-for-merchants.pdf) changed the calculus. Merchants are expected to reverse approved authorizations within 24 hours of learning a transaction won't complete, and authorizations never matched to a capture or reversal attract a Misuse of Authorization fee. "Let it expire" is therefore not just lazy UX that locks the shopper's money for days; it's the exact behavior the scheme penalizes, and plausibly a reason risk-averse merchants avoid multi-card flows entirely. A split-payment system that wants to be taken seriously must treat hold reversal as a first-class path. The 60-minute TTL matches the client_secret lifetime: past it, the checkout session cannot proceed anyway. Covered by unit tests against a stubbed Airwallex client.

---

## 2026-07-02: Decline recovery, split offered as a rescue and not only a choice

**Decision:** The store now has a standard single-card checkout as the default path. When that card declines, the checkout offers "split it across two cards" in place: the failed intent is cancelled (hold-reversal path) and the shopper re-enters the split flow with their context intact. Under the hood a single-card purchase is a **one-slot order group**, so both modes run the same state machine and capture gate.

**Alternatives:** (a) Upfront-only splitting, the original design. But shoppers who don't plan to split never see the feature, and the strongest commercial evidence is for rescue: Air Europa's two-card decline-recovery flow converts at 95.1% and drove €2.4M of its €3.8M split-payments revenue. (b) Retrying the split on the same PaymentIntent. Rejected because intent amounts are fixed at creation; a split needs fresh intents per part, so cancel-and-recreate is the honest mechanics.

**Why:** Insufficient funds is the single largest cause of card declines (around 44% per Ethoca). A declined shopper is a person mid-purchase with money on other cards, the highest-intent moment a conversion feature can target. Modeling single-card purchases as one-slot groups meant recovery cost about 30 lines: relax the two-part minimum, add the offer panel, and reuse abandon plus create.

---

## 2026-07-02: Webhooks as the second status channel (M7)

**Decision:** `POST /api/webhooks/airwallex` verifies each delivery (HMAC-SHA256 over `x-timestamp + raw_body`, constant-time compare, a 5-minute timestamp window, raw body parsed only after verification) and feeds `payment_intent.*` events into the **same** slot and group transitions as the polling path. Polling remains the primary channel for the demo.

**Alternatives:** Webhook-first with polling as reconciliation (the production pattern), or leaving webhooks unimplemented as originally scoped.

**Why:** Polling-first stays because a reviewer running `npm run dev` locally has no public URL, and the demo must be deterministic without one. But the two channels racing is exactly where state machines go wrong, so the interesting work was making the transitions channel-agnostic and safe under duplication and reordering. Writing the test for that surfaced a real bug before the code ever ran: a late or duplicated `requires_capture` delivery would have regressed an already-captured slot and attempted a second capture. Slot states are now monotonic, meaning terminal states (`captured`, `cancelled`) never regress. Whichever channel reports first wins; the other becomes a no-op.

**Known demo-grade gap, recorded for candor:** the two channels are not serialized, so polling and a webhook arriving in the same instant could both pass the capture gate and issue overlapping capture calls. There is no money risk (a card cannot be captured beyond its authorized amount, so the second call fails cleanly upstream and is recorded), but production would take a per-order lock or queue before the gate. Left unserialized here to keep the demo's concurrency story readable.

---

## 2026-07-02: Refund allocation, pulled in from out-of-scope

**Decision:** Refunds are implemented after all, despite the original spec excluding them. A captured order can be refunded in full or partially; the amount is allocated **pro-rata across the cards in proportion to what each one paid**, exact to the cent (integer-cent math, with rounding shortfall assigned to the slot with the most headroom). Each allocation becomes a real Airwallex refund against that card's PaymentIntent. The success screen exposes it as a clearly-labeled merchant demo action.

**Alternatives considered for the allocation policy:** (a) last-card-first (reverse capture order), which concentrates the refund on one instrument and is simpler to reason about for disputes; (b) shopper-chooses, which is the flexible production answer but needs UI that would bloat the demo; (c) pro-rata, chosen because it is the fairest default when nothing is known about the cards and it exercises the interesting math.

**Why the scope change:** "What happens on refund?" is the first question a payments engineer asks about split payment, and leaving it as a limitations bullet made the biggest objection also the least-answered one. A minimal honest implementation converts it into a demonstrated capability. Two things stayed out deliberately: refund settlement is asynchronous (we record the RECEIVED status and stop; production would track settlement via `refund.*` webhooks), and dispute handling across two issuers remains genuinely open.

---

## 2026-07-02: Edge cases from user testing, round two

**What happened:** Manual testing produced a confusing result: the "insufficient funds" test card was accepted on card 1 and only declined on card 2. That is the sandbox working as documented (the card declines only when the charged amount is exactly $80.51, the magic-amount convention), but the demo guide's wording implied the card itself was bad, so correct behavior read as a bug. Treated as a prompt to audit the whole edge-case surface again rather than just fix the copy.

**Decisions:**
- **Checkout survives a browser refresh.** Order id, product sku, and the client_secrets now persist in sessionStorage; on load the order's true state is re-fetched from the server and the checkout resumes exactly where it was, holds intact. Previously a refresh stranded the order in React state and left card 1's hold dangling until the sweeper. sessionStorage over localStorage deliberately: closing the tab abandons the checkout and the sweep releases the holds, which is the correct default for a payment session.
- **Cancelling the bank challenge gets real copy.** Empirically probed the SDK's rejection when a shopper clicks "Cancel authentication" mid-3DS: the code is `3ds_cancel_success` (their naming). Mapped it to "Bank verification was cancelled. Try again when you're ready." instead of the generic fallback; the slot stays open for retry.
- **The demo guide explains the magic amount.** The insufficient-funds card entry now states plainly that it declines only at exactly $80.51 and behaves like a normal card at any other amount.

**Also audited and confirmed already safe:** double-submit guards on every mutating button; duplicate or out-of-order status deliveries (monotonic slot states); concurrent refund requests (the second exceeds Airwallex's per-intent refund cap and fails cleanly upstream); malformed split amounts (cent-exact server validation); capture failures mid-gate (retryable idempotently).

---

## 2026-07-03: Agentic checkout via MCP

**Decision:** The repo ships an MCP server (`mcp/server.mjs`) that lets an AI agent complete the entire split purchase: browse products, authorize N cards, capture together, refund pro-rata, cancel and release holds. It drives a new `POST /api/agent/checkout` endpoint that confirms intents server-side through Airwallex's Native API, since an agent has no browser to mount a card element in.

**The safety line, drawn hard:** the endpoint accepts only Airwallex's **published sandbox test cards**, checked against a hard-coded allowlist before any API call, with friendly aliases (`success`, `decline`, `insufficient_funds`) so agents never handle PANs at all. Passing raw card numbers through one's own server is a PCI DSS scope decision that this demo does not pretend to have made: a production agent flow would use tokenized credentials or delegated wallet authority instead, which is exactly the problem Airi's agentic-commerce roadmap describes. The demo exists to show the orchestration semantics an agent needs (all-or-nothing capture across funding sources), not to model credential handling.

**Why build it:** Airwallex launched AgentOS two weeks ago and frames Airi as wallet infrastructure for agents that transact on a shopper's behalf with spend controls. An agent paying across two funding sources is the natural intersection of that roadmap and this repo, and as far as public evidence shows, nobody had demonstrated it. Verified end to end: an MCP client purchased the $1,200 product split 700/500 (both captured, real intent ids), took a $150 partial refund allocated 87.50/62.50 pro-rata, hit the decline path with nothing captured, and cancelled a failed order with holds released. Also verified: a non-test PAN is rejected before any upstream call.

---

## 2026-07-03: A real store, and the MCP server moves onto the deployment

**Decision:** The single-product demo store became a sixteen-product catalog with categories, color variants, ratings, stock levels, faceted search, product detail pages, and a multi-item cart. Orders are now line-item baskets (an `order_items` table; totals always computed server-side from the catalog). And the MCP server moved from a local stdio process into the deployment itself: a stateless Streamable HTTP endpoint at `/mcp`, so connecting an agent means pasting a URL, not cloning a repo.

**Alternatives:** Keep the one-product store (the original spec's "one hero product" scoping); keep stdio-only MCP (simpler, but every consumer must clone and install first).

**Why:** Once the agentic mode became the differentiator, catalog realism became payment-demo realism: "find a matte-black grinder under $500 in stock and split it across my cards" exercises search, filtering, variant selection, basket assembly, and split payment in one sentence, which is the demo arc the successful agent-shopping products (ChatGPT shopping, Perplexity, Amazon's agents) all converge on. Design choices follow the field's emerging conventions deliberately: tool names and shapes mirror Shopify's storefront MCP (`search_catalog`, `get_product`, open browse tools with the payment step guarded), and Streamable HTTP is the current standard for remote MCP servers. The research behind this also sharpened the pitch: OpenAI/Stripe's ACP, Google's UCP, and AP2 all model a single payment credential per checkout; none covers splitting one purchase across funding sources.

**Trade-offs accepted:** stock is validated but never decremented (a demo store must not wedge itself empty); the even-split option distributes remainder cents to the first cards; catalog search is in-memory over sixteen products, which is honest for a catalog that fits in one file.

---

## 2026-07-03: Real product photography, curated from open licenses

**Decision:** The emoji product visuals were replaced with real photographs, sourced through the Openverse API and restricted to permissive licenses (fourteen CC0 from StockSnap and Rawpixel, two CC BY from Flickr, credited in ATTRIBUTIONS.md). Every image was reviewed by eye before selection; images are committed to the repo (about 650KB total at 900px) so the store stays self-contained, and the MCP catalog tools return absolute `image_url`s so agents can render product cards.

**Alternatives:** Unsplash and Pexels have the best free product photography but block programmatic search, and hotlinking guessed CDN URLs risks broken or wrong images. AI-generated product shots were rejected outright: they read as fake at a glance, and a payments demo trades entirely on looking real. General open-license search (all Flickr sources) was tried first and produced amateur clutter unfit for a storefront.

**Why it matters beyond looks:** a store that photographs like a real store makes the payment flows read as real, and the agent demo now returns product images an MCP client can display. The curation rule was strict: a wrong-but-pretty photo loses to nothing, and each photo had to plausibly *be* the product it sells.

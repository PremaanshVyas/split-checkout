# Split Checkout

**Pay for one order with two cards, on Airwallex.**

A working demo of multi-card payment orchestration built directly on Airwallex's sandbox API: one order becomes N PaymentIntents, every card is *authorized without being charged*, and money moves only when all of the holds succeed — captured together, settling straight to the merchant's Airwallex account. It ships both deployment modes: **upfront splitting** (the shopper chooses two cards from the start) and **decline recovery** (a failed single-card payment converts into a split instead of a lost sale — the mode behind Air Europa's measured €2.4M recovery).

> **Try it now: https://split-checkout-demo.fly.dev** — sandbox only, no real money; test card numbers are on the checkout page. Or run it locally in two minutes ([below](#run-it-yourself)). Decline path included — you can watch a card fail safely in about ten seconds.

## Why this exists

High-ticket checkouts die at the payment step: a card limit, a low balance, or a shopper who wants to spread a purchase across funding sources. The industry numbers are blunt: Stripe's checkout research found **[85% of shoppers abandon](https://stripe.com/newsroom/news/state-of-checkouts-2022) a purchase when their preferred payment method isn't offered** (Airwallex's own materials cite 77% for the same effect), and insufficient funds is the [single largest cause of card declines](https://cdn2.hubspot.net/hubfs/464903/Ethoca%20Research%20Report%20-%20False%20Declines.pdf) — the exact failure a second card fixes. Splitting one payment across multiple cards is a conversion feature — and while Airwallex splits *outgoing* marketplace payouts, nothing on the platform today splits an *incoming* payment.

This repo is an independent exploration of what that feature could look like built on Airwallex's existing primitives — no new money movement, no custody, just orchestration.

## How it works

The mechanism is the card networks' own two-phase protocol, applied across cards:

```mermaid
sequenceDiagram
    participant S as Shopper (browser)
    participant B as Backend (this repo)
    participant A as Airwallex API

    S->>B: create order, split [A$600, A$600]
    B->>A: create PaymentIntent #1 (600)
    B->>A: create PaymentIntent #2 (600)
    A-->>B: intent ids + client_secrets
    B-->>S: order group + client_secrets

    Note over S: Step 1 — Card A
    S->>A: confirm intent #1 (autoCapture: false)
    A-->>S: hold placed (no charge)
    S->>B: verify slot 1
    B->>A: retrieve intent #1
    A-->>B: REQUIRES_CAPTURE ✓

    Note over S: Step 2 — Card B
    S->>A: confirm intent #2 (autoCapture: false)
    A-->>S: hold placed (no charge)
    S->>B: verify slot 2
    B->>A: retrieve intent #2
    A-->>B: REQUIRES_CAPTURE ✓

    Note over B: capture-together gate:<br/>ALL slots held → capture ALL
    B->>A: capture intent #1
    B->>A: capture intent #2
    A-->>B: SUCCEEDED × 2
    B-->>S: success — both charges shown
```

The invariants that make it safe:

- **Authorize ≠ charge.** Each confirm uses `autoCapture: false`, a documented Airwallex option that places a hold instead of charging. The UI says "you will not be charged yet" because it's literally true.
- **All-or-nothing capture.** The server captures *only* when every intent in the group reaches `REQUIRES_CAPTURE`. One declined card → zero captures.
- **Failure is free to unwind.** A declined confirm leaves that PaymentIntent open, so the shopper retries that card slot in place — the other card's hold is untouched. If the shopper walks away, the holds simply expire (~5 days). No refunds, no reversals, because no money ever moved.
- **The server never trusts the client.** After every confirm, the backend retrieves the intent from Airwallex and acts on that status — Airwallex's docs themselves warn that a completed client flow doesn't imply a successful payment.

## Why doesn't every store have this already?

Any supermarket register can split a bill across two cards, yet online it's near-extinct — a spot-check of ten major US retail sites found exactly [one](https://www.creditcards.com/education/split-payment-transaction-online-two-cards/) that accepts two credit cards on one order. The reasons are instructive:

- **It's not a card-network restriction.** Visa's [Partial Authorization Service](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/visa-partial-authorization-service.pdf) has explicitly supported split tender in eCommerce since 2005 — issuers and acquirers *must* support it, but implementing it is **optional for online merchants**, so almost none do.
- **Checkout APIs are one-instrument-per-transaction.** A payment intent takes exactly one card. Splitting an order means the merchant builds the multi-intent orchestration state machine themselves — that's this repo — and every downstream system (refunds, chargebacks, taxes, promotions, reconciliation) assumes one order = one payment.
- **Doing it sloppily costs real money.** Visa [fines authorizations](https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/authorization-and-reversal-processing-best-practices-for-merchants.pdf) that are never captured or reversed, and expects sibling holds to be reversed within 24 hours when an order won't complete. This demo complies: nothing dangles — failed or abandoned orders have their holds cancelled explicitly (a cancel button plus a server-side stale-hold sweep).
- **Gift cards make the gap personal.** Closed-loop store cards (an Amazon balance) combine fine — that's the merchant's internal ledger. Open-loop prepaid Visa/Mastercard gift cards are real card transactions, so combining them *is* multi-card payment — which is why [43% of US adults](https://www.bankrate.com/credit-cards/news/gift-cards-survey/) sit on unused gift cards averaging $244 each.
- **Filling the gap measurably pays.** Air Europa added split payments to checkout in 2024 and attributes [€3.8M in incremental revenue](https://thefintechtimes.com/air-europa-selects-hands-in-to-add-split-payments-to-checkout-boosting-revenue-by-e3-8million/) to it, with the two-card decline-recovery flow converting at 95.1%.

### Why no payments license is needed

This system never holds, pools, or forwards shopper funds. Each capture settles directly from the shopper's card to the merchant's Airwallex account through Airwallex's existing rails. Orchestration-only means none of the stored-value / purchased-payment-facility regimes (AFSL/ASIC/AUSTRAC in Australia) are triggered. The moment an implementation would route money through anything the operator controls, it's out of bounds — by design, this one can't.

## What's in the repo

```
server/   Express + TypeScript. Airwallex client (~130 lines, raw REST),
          order-group state machine, capture-together gate, SQLite.
web/      Vite + React checkout: product page, split editor, sequential
          card stepper on @airwallex/components-sdk, status chips.
```

- [DECISIONS.md](DECISIONS.md) — every non-obvious choice, dated, with alternatives and reasoning (including one genuine sandbox surprise involving 3DS).
- [EVIDENCE.md](EVIDENCE.md) — the QA record: real intent IDs and screenshots for the happy path and the decline path.
- `.mcp.json` — ships a config for [Airwallex's Developer MCP](https://www.airwallex.com/docs/developer-tools/ai/developer-mcp) (part of Airwallex AgentOS), so AI coding tools working in this repo get live Airwallex API docs and sandbox tooling.

## Run it yourself

You need Node 20+ and a free [Airwallex sandbox account](https://www.airwallex.com/docs/developer-tools/sandbox-environment) (no KYC, instant).

```bash
git clone <this repo> && cd split-checkout
cp .env.example .env
# fill in AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY
# (demo.airwallex.com → Settings → Developer → API keys → Generate)
npm install
npm run dev
```

Open http://localhost:5173:

1. **Pay with multiple cards** → choose a split (or a preset).
2. Card 1: `4035 5010 0000 0008`, any future expiry, any CVC → *Held ✓ — not charged*.
3. Card 2: same card again → both captured together, real intent IDs on screen.
4. **See it fail safely:** use the "Decline demo" preset and card `4646 4646 4646 4644` on step 2 — Card 1's hold survives, nothing is captured, and you retry in place. (For an issuer-code decline with a 3DS challenge, use `5307 8373 6054 4518` on the $80.51 slot; OTP is `1234`.)

Sandbox note: amounts formatted `$8x.xx` are reserved by Airwallex to trigger error responses — the demo's decline preset uses that deliberately.

## Honest limitations

This is a demo of the core mechanism, not a finished product. Production would additionally need:

- **Refund allocation** — a partial refund on a split order must decide which card(s) to refund, including expired/replaced cards.
- **Dispute handling across issuers** — one order can now generate chargebacks from two banks with independent timelines.
- **Scheme rules review** — card-network rules on split tender and on authorization/capture windows per scheme (the demo captures within seconds, well inside every window).
- **Webhook-driven status** — the demo verifies by retrieving intents server-side after each confirm (deterministic for local runs); production would drive the state machine from signed webhooks (`payment_intent.requires_capture`, `payment_intent.succeeded`) with polling as reconciliation.
- **Capture-retry hardening** — a capture failure after partial success currently leaves the group retryable via the same idempotent gate; production wants an async worker with alerting.
- **N > 2 cards** — the data model and capture gate are already N-ary; only the UI is fixed at two.
- **True partial authorization** — Visa's partial-auth flow lets a low-balance prepaid card approve *part* of the requested amount, with the remainder rolling to the next card automatically (no guessing the gift card's balance). It needs acquirer-level support not exposed through PaymentIntents today; it's the natural next primitive for this feature.

## Disclaimer

This is an independent demo built against Airwallex's public sandbox API for exploration and discussion. It is not an Airwallex product and is not affiliated with, endorsed by, or sponsored by Airwallex. No real cards, no real money — Airwallex's published test cards only.

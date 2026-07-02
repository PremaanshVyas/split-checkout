# Split Checkout

**Pay for one order with two cards, on Airwallex.**

A working demo of multi-card payment orchestration built directly on Airwallex's sandbox API: one order becomes N PaymentIntents, every card is *authorized without being charged*, and money moves only when all of the holds succeed — captured together, settling straight to the merchant's Airwallex account.

> **Try it:** run it locally in two minutes ([below](#run-it-yourself)), or use the hosted demo *(URL coming once deployed)*. Decline path included — you can watch a card fail safely in about ten seconds.

## Why this exists

High-ticket checkouts die at the payment step: a card limit, a low balance, or a shopper who wants to spread a purchase across funding sources. Airwallex's own research says **77% of shoppers abandon a purchase when their preferred payment method isn't available**. Splitting one payment across multiple cards is a conversion feature — and while Airwallex splits *outgoing* marketplace payouts, nothing on the platform today splits an *incoming* payment.

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

## Disclaimer

This is an independent demo built against Airwallex's public sandbox API for exploration and discussion. It is not an Airwallex product and is not affiliated with, endorsed by, or sponsored by Airwallex. No real cards, no real money — Airwallex's published test cards only.

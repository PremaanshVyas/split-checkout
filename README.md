# Split Checkout

Pay for one order with two cards, on Airwallex.

> **Status: work in progress.** This README will grow with the build — see [DECISIONS.md](DECISIONS.md) for the decision log.

## The problem

High-ticket checkouts die when a single card can't carry the full amount — a limit, a low balance, or a shopper who simply wants to spread the cost across funding sources. Airwallex's own research puts the number bluntly: **77% of shoppers abandon a purchase when their preferred payment method isn't available.** Splitting one payment across multiple cards is a conversion feature, and today nothing on the Airwallex platform offers it for *incoming* payments.

## What this is

A working demo of **multi-card payment orchestration** built directly on Airwallex's sandbox API:

- One order → N PaymentIntents (2 in the demo), linked by an `order_group`.
- Each card is **authorized without being charged** (`autoCapture: false` — a hold, not a payment).
- Only when **every** hold succeeds does the server **capture all of them together**.
- If any card declines, nothing is captured. The shopper retries that card slot; the other hold is untouched. Abandoned holds simply expire — no money ever moved.

**No funds custody.** Money settles directly to the merchant's Airwallex account. This is pure orchestration on top of Airwallex's authorize/capture primitives — no pooling, no stored value, no licensing exposure.

## Run it yourself

*(Instructions will be finalized as the build progresses. You will need a free [Airwallex sandbox account](https://demo.airwallex.com).)*

```bash
cp .env.example .env   # fill in your sandbox Client ID + API key
npm install
npm run dev
```

## Disclaimer

This is an independent demo built against Airwallex's public sandbox API. It is not an Airwallex product and is not affiliated with or endorsed by Airwallex.

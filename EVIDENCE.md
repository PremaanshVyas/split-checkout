# Evidence

QA record for the two core flows, run end-to-end against the Airwallex sandbox (browser-driven, real card elements, real PaymentIntents). All intent IDs below are real sandbox objects and can be looked up in the Airwallex dashboard (Transactions → Payments) to see the authorization and capture events.

## Happy path — two holds, captured together

Order `split-0e3e381e`, AUD $1,200.00 split 50/50.

| Card | Amount | PaymentIntent | Final status |
|---|---|---|---|
| 1 | $600.00 | `int_hkdm5hl7nhk09vmcyu8` | `SUCCEEDED` (captured) |
| 2 | $600.00 | `int_hkdm7g8s4hk09vmj3sy` | `SUCCEEDED` (captured) |

1. Card 1 confirmed with `autoCapture: false` → hold placed, UI shows **"Held ✓ — not charged"**, intent at `REQUIRES_CAPTURE`:

   ![Card 1 held, card 2 awaiting](docs/evidence/happy-after-card1.png)

2. Card 2 confirmed → both slots at `REQUIRES_CAPTURE` → server captures both sequentially → success screen with both intent IDs:

   ![Both captured](docs/evidence/happy-success.png)

Server-side record (SQLite) after completion: order group `captured`, both slots `captured`. Retrieve on each intent returns `SUCCEEDED` with the full `captured_amount`.

## Failure path — Card B declines, nothing captured, retry in place

Order `split-804b5d78`, split $1,119.49 / $80.51.

| Card | Amount | PaymentIntent | Journey |
|---|---|---|---|
| 1 | $1,119.49 | `int_hkdm7g8s4hk0agloyw4` | held → captured only after card 2 recovered |
| 2 | $80.51 | `int_hkdm5hl7nhk0aglv5qn` | declined (risk engine) → retried with a good card → captured |

1. Card 1 held. Card 2 attempted with the always-declines test card (`4646 4646 4646 4644`) → decline surfaced with friendly copy, Card 1's hold untouched, **nothing captured** (server state: group `partially_authorized`, captured amounts all zero):

   ![Card 2 declined, card 1 still held](docs/evidence/decline-card2-error.png)

2. Card 2 retried in place with a valid card — same order, same intent, no restart → both captured together:

   ![Recovered and captured](docs/evidence/decline-success.png)

## Sandbox finding worth knowing

Airwallex's insufficient-funds test card (`5307 8373 6054 4518` @ $80.51) runs a **3DS challenge (OTP `1234`) before returning the code-51 decline**. The demo handles this (the challenge renders in the checkout via `authFormContainer`), and the discovery is written up in [DECISIONS.md](DECISIONS.md). Use it in a manual run to see the 3DS + issuer-decline path; the scripted evidence above uses the no-3DS risk-decline card so the run is deterministic.

## Reproduce it yourself

```bash
npm install && npm run dev
# open http://localhost:5173 → "Pay with multiple cards"
# success card: 4035 5010 0000 0008 · decline card: 4646 4646 4646 4644
# (any future expiry, any CVC)
```

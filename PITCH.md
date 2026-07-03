# The pitch

*If you only have two minutes: watch the GIF in the [README](README.md), click the [live demo](https://split-checkout-demo.fly.dev), and read "The fit" below.*

## The moment that started this

I won an essay competition. The prize was $2,000 on two prepaid Visa gift cards, $1,000 each. I tried to buy a Galaxy S26 Ultra on Samsung's Australian online store: the total came to AUD $1,389 after stacking an education discount and two more from their sales chat. I had the money, on two perfectly valid Visa-network cards, and the checkout physically could not take it. One card per order. JB Hi-Fi was the same. So was almost everywhere else I checked.

Any supermarket register handles this without blinking. Online, a spot-check of ten major US retailers found exactly one that accepts two cards on one order. The money I couldn't spend is not unusual either: 43% of US adults are sitting on unused gift cards averaging $244 each, and a third of Australians hold A$1.25B of them.

## What this repo is

A working implementation of split checkout on Airwallex's sandbox API, in both of the modes that matter:

- **Upfront splitting.** The shopper chooses to pay across two cards, sets the split, and each card is authorized without being charged. Capture happens only when every hold succeeds, together.
- **Decline recovery.** The shopper pays normally with one card. If it declines, the checkout offers to split the purchase instead of losing the sale. This is the mode with hard commercial evidence: Air Europa's equivalent flow converts at 95.1% and recovered €2.4M.

It is not a sketch. The state machine is tested, every documented sandbox transaction type is verified end to end (3DS challenges included), holds are reversed per Visa's authorization best practices, refunds allocate pro-rata across the cards to the cent, a signed webhook listener feeds the same state machine, and the whole thing is deployed. [EVIDENCE.md](EVIDENCE.md) has real intent IDs you can look up in the Airwallex dashboard.

## Why merchants don't build this themselves

Visa's rules have explicitly supported split tender online since 2005, but implementing it is optional for merchants, and every checkout API takes exactly one card per payment intent. So each merchant would have to build multi-intent orchestration, refund allocation, and hold-reversal discipline alone, for what each one sees as an edge case. The full breakdown with sources is in the [README](README.md#why-doesnt-every-store-have-this-already).

That is exactly the shape of problem that belongs in the platform, not in every merchant's codebase.

## The agentic preview

Since Airi's roadmap is agents that transact on a shopper's behalf, the demo also hosts a remote MCP server at https://split-checkout-demo.fly.dev/mcp. Paste that URL into Claude or Cursor and an agent can search a sixteen-product catalog by category, color, price, and stock, assemble a basket, and complete the purchase split across multiple cards, with the same all-or-nothing capture semantics, then refund it pro-rata. No install, no clone.

It also implements the delegation layer Airi's roadmap describes: in the store's Agent mode a human grants a **spending mandate** (budget, expiry, backing cards) and hands the agent a code. The agent never touches a card, and the server enforces the budget: a $600 mandate refused the $1,950 bundle, bought a $485 grinder split across its two cards, then refused a $189 kettle against the $115 remainder. The refusals come from the payment layer, not the agent's judgment. The shape mirrors ACP allowances, AP2 mandates, and the card networks' agentic tokens, with the one thing none of them cover: a grant spanning multiple funding sources, enforced across all of them together. Test cards only, by hard allowlist; production credential handling is deliberately out of scope and noted as Airi territory.

## The fit

Airwallex is the right home for this feature three times over:

1. **A checkout toggle.** Airwallex owns the checkout surface (hosted payment page, drop-in, embedded elements, payment links). Split checkout could ship to every merchant as configuration, the same way Airi rolled out inside Checkout at no extra fee.
2. **An Airi capability.** Airi's whole premise is conversion at checkout. A wallet that can top up a balance with a card is already doing split tender; making that a first-class primitive extends naturally to two cards, or a gift card plus a card.
3. **A decline-recovery play.** Insufficient funds causes roughly 44% of card declines. Recovering those sales at the moment of failure fits directly into the conversion-optimization story, with Air Europa's numbers as the precedent.

And the architecture never touches funds. Every capture settles straight to the merchant's Airwallex account through existing rails, so no stored-value licensing is triggered anywhere. The demo is deliberately Airwallex-native: their primitives, their SDK, their test tooling, their Developer MCP.

## What I'm asking

A conversation. I built this to show how I think and work: the [decision log](DECISIONS.md) records every non-obvious call including the dead ends, and the commit history tells the story honestly. If the payments or Airi team sees something here worth exploring, I would love to help build it properly.

Premaansh Vyas
premaanshvyas04@gmail.com · [github.com/PremaanshVyas](https://github.com/PremaanshVyas)

# The operator's case

Split payment is easy to want as a shopper and easy to dismiss as a platform: two transactions for one sale sounds like double the fees, double the reconciliation, double the disputes, for a feature a minority will use. This document takes that objection seriously and works it end to end, with sources. The short version: the marginal cost is one fixed fee (about thirty cents), the reconciliation problem is already solved by plumbing Airwallex ships today, the scheme rulebooks explicitly permit it, and the honest risks (disputes, screening) are bounded and quantifiable. Research date: July 2026; regulatory facts current to the RBA's March 2026 Conclusions Paper.

## 1. The thirty-cent question

What does splitting A$1,200 into 2 x A$600 actually cost, over charging it once?

| Layer | Effect of splitting | Why |
|---|---|---|
| Interchange, consumer credit (AU) | **Neutral** | Percentage-based (capped 0.50%, falling to 0.30%); two halves cost the same as one whole ([RBA](https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/conclusions-paper/interchange-fees.html)) |
| Interchange, debit online (AU) | **~Neutral** | Visa's online Standard debit rate is percentage-based (0.20%, 0.10% tokenised); the cents-based rates apply mainly card-present ([Visa AU interchange](https://www.visa.com.au/about-visa/interchange.html)) |
| Scheme fees | **~Neutral** | Averaging ~10.3 bps of value, mostly ad valorem ([RBA backgrounder](https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/backgrounders/backgrounder-on-interchange-and-scheme-fees.html)) |
| PSP blended pricing | **+ one fixed fee** | On Airwallex AU's published 1.65% + A$0.30: A$20.10 becomes A$20.40 ([pricing](https://www.airwallex.com/au/pricing)) |

So the whole marginal cost on blended pricing is **+A$0.30, about 0.025% of the order**. And the platform holds a lever no merchant does: price the fixed fee **per order, not per transaction**, for split orders. Adyen already charges a single fixed fee per payment on interchange++ and runs partial payments through an order object; a per-order fixed fee for splits would make the marginal cost of the second card literally zero, at the platform's discretion.

The authorize-then-capture design adds nothing: fees land at capture, cancelling an uncaptured authorization is free at typical PSPs ([Stripe](https://docs.stripe.com/refunds)), and Visa's misuse-of-authorization fee (US$0.09-0.15) applies only to holds that are *neither* captured *nor* reversed, which is exactly what this system's explicit reversal discipline prevents.

## 2. Surcharges: the question answers itself in Australia

From **1 October 2026**, merchants cannot surcharge eftpos, Visa, or Mastercard payments at all: the RBA's final decision removes surcharging across debit, prepaid, and credit for the designated networks ([RBA Conclusions Paper, 31 March 2026](https://www.rba.gov.au/media-releases/2026/mr-26-10.html)). So "who pays the extra thirty cents" has a mandated answer: the merchant absorbs it, like every other acceptance cost.

The same reform is why that is painless: consumer credit interchange caps fall from 0.50% to 0.30% in the same package. On the same A$1,200 order, that is roughly **A$2.40 of new merchant savings against A$0.30 of split cost**. The regulation that closes the surcharge door hands merchants eight times the money the split costs, and the RBA sizes total merchant savings at ~A$910m per year.

## 3. It is explicitly legal

The scheme rulebooks prohibit "split sales", and it is worth being precise about what that means, because it is the opposite of this feature. The prohibited pattern is splitting one sale across receipts **on the same card** to dodge authorization limits. Visa's Core Rules carve our case out verbatim (rule ID 0008603, "Prohibition against Split Transaction", exception list): *"A transaction in which part of the amount is paid with a Visa Card and the other part paid with another Visa Card or other form of payment"* is permitted ([Visa Core Rules, April 2026 edition](https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf)). Mastercard's rules likewise state a merchant "may accept more than one payment method for a single purchase" (Transaction Processing Rules §3.9). Two cards, one order, is a written exception, not a grey area.

## 4. Two transactions, one legible order

The reconciliation objection assumes the platform sees two unrelated rows. It does not have to, and mostly already does not:

**What works today, demonstrated in this repo.** Airwallex requires a `merchant_order_id` on every PaymentIntent and persists up to 50 metadata keys into transaction reporting; the settlement details report exposes the order ID and metadata as columns ([settlement report docs](https://www.airwallex.com/docs/payments/payment-operations/reporting/settlement-report)). This demo stamps every split part accordingly: shared `order_ref`, `split_part` ("1 of 2"), `order_total_aud`, and a plain-language `note` field readable by anyone who opens the payment in the dashboard. Group the settlement report by order reference and the two rows reconcile as one order with zero new platform machinery. Merchants also already receive **one daily settlement batch**, not per-transaction payouts, so cash reconciliation was never two line-items of money in the first place.

**What the platform-native version looks like.** The closest prior art is Adyen's `/orders` API for partial payments: an order object carrying the total, a `remainingAmount` that each payment draws down, an order-closed webhook when it hits zero, and order-level cancellation that reverses every leg ([Adyen docs](https://docs.adyen.com/online-payments/partial-payments)). An Airwallex "order group" object would be the same shape sitting one level above PaymentIntents, which is precisely the state machine in this repo's `order_groups` table: it exists to be absorbed. Add order-grouped display in the dashboard's payment list and order-level fee pricing, and the merchant experience of a split order becomes indistinguishable from a single payment.

**What the shopper's bank statement says.** Each part is created with a descriptor labelling it ("AURORA 1/2"), so the two statement lines explain themselves. One honest caveat from testing: the sandbox displays the account name instead of custom descriptors, and dynamic descriptors on Airwallex are enabled per account; the field is populated correctly and the pattern (order reference inside the descriptor) is existing Airwallex practice in its WooCommerce plugin.

## 5. What genuinely doubles, and why it is bounded

Honesty about the real costs:

- **Risk screening and 3DS run per transaction**, so a split order is screened twice. That is correct behavior, not waste: they are different cards with different fraud profiles. Cost order-of-magnitude: cents.
- **A full-order dispute means two chargebacks** across two issuers: two fees (2 x ~A$25), evidence filed twice. Bounded by the feature's share of orders times dispute rate; on any realistic numbers this is a rounding error next to the recovered revenue, and partial-goods disputes on split shipments are a long-solved precedent for scoping a dispute to one leg.
- **Visa's monitoring program (VAMP) counts events**, and a split doubles both the numerator and denominator of the ratio it watches, leaving the ratio roughly neutral while raising absolute counts. Worth knowing; not a blocker.

## 6. The adoption objection, answered honestly

There is no public data on what share of transactions use split tender where it is offered; anyone quoting a percentage is guessing. Two things are known instead. First, the one split flow that demonstrably thrives everywhere is gift-card-plus-card top-up: roughly 60-79% of gift card redeemers spend beyond the card's balance ([Fiserv Gift Card Gauge](https://www.carat.fiserv.com/en-us/resources/gift-card-gauge-q1-2024/)), which is exactly a split-tender behavior, currently impossible online with open-loop cards. Second, the famous failure in this space, Airbnb's group payments (killed after ~10 months), died of **72-hour holds blocking host inventory**, a supply-side wound this design cannot suffer: capture happens within seconds and nothing is ever reserved against a hold.

Which is why the sizing argument does not rest on how many shoppers plan to split. It rests on **decline rescue**: insufficient funds is the largest decline bucket, and a second card at the moment of failure is the highest-intent conversion save that exists (Air Europa's deployment converts 95% of them). Offered as a rescue path, the feature costs nothing on the 97%+ of orders that never see it, and earns its keep on the failures. That is the correct frame for a platform: not a niche checkout option, but a decline-recovery upgrade with a self-service option attached, shipped as configuration on rails that already exist.

## 7. By card type: what actually flows through an Airwallex checkout

Airwallex accepts seven card schemes online (Visa, Mastercard, American Express, UnionPay, JCB, Discover, Diners Club per [their docs](https://www.airwallex.com/docs/payments/payment-methods/global/cards)), and the split story differs by type. The demo's test-card aliases cover all seven; a Visa leg and an Amex leg captured together is verified in EVIDENCE.md.

**The market this lands in is debit-led and wallet-heavy.** Australian card use is 76.6% debit by transaction count (RBA tables C1/C2, April 2026), and mobile wallets carry 43% of all card transactions (RBA parliamentary submission, January 2026). Debit declines are balance-driven, which is precisely the failure a second card rescues: the rescue case is strongest in exactly the card mix Australia has.

| Card type | Split implications |
|---|---|
| Visa / Mastercard (74%+ of volume) | The base case this document already prices. Covered by the October 2026 interchange cuts and surcharge removal. |
| Debit (76.6% of transactions) | Balance-driven declines make debit the rescue mode's main audience. Online debit interchange is percentage-based, so splits stay fee-neutral. |
| Mobile wallets (43% of card transactions) | A wallet can be one leg of a split: each Airwallex element binds to its own PaymentIntent and nothing in the documented model prevents a wallet-confirmed intent beside a card-confirmed one (flagged honestly: argument from absence, and Apple Pay requires its own user gesture per leg). A wallet leg is *better* than a card leg twice over: tokenised online debit interchange is 0.10% versus 0.20% standard ([Visa AU schedule](https://www.visa.com.au/about-visa/interchange.html)), and cryptogram-authenticated wallet payments generally skip the 3DS challenge, halving the split's authentication friction. |
| American Express | Cost-neutral on Airwallex specifically: their AU list pricing bundles Amex at the same 1.65% + A$0.30 as Visa/MC, which most PSPs do not. Amex is a three-party scheme outside the RBA's designation, so it is untouched by the October 2026 surcharge removal (merchants may still surcharge an Amex leg) and its ~1.32% average acceptance cost ([RBA C3](https://www.rba.gov.au/statistics/tables/xls/c03hist.xlsx)) sits with the merchant's existing Amex decision, not with the split. |
| Open-loop prepaid (the gift-card case) | Covered by the new 8.0c / 0.16% debit-prepaid caps. Visa requires all prepaid issuers and all acquirers to support partial authorization; Airwallex does not currently expose partial auth on PaymentIntents, so prepaid splits are amount-known-in-advance today, and exposing partial auth is the roadmap item that would let a gift card reveal its own balance at the moment of payment. |
| UnionPay / JCB / Discover | Non-designated (still surchargeable), niche AU volume, largely foreign-issued (Diners Club Australia wound down in 2024). One operational caveat from Airwallex's docs history: JCB cannot complete 3DS, so a JCB leg fails if authentication is required. Splits should prefer schemes with full 3DS support. |

Two 3DS notes for the split design generally: Australia has no universal 3DS mandate (AusPayNet's framework applies it to merchants breaching fraud thresholds), so most domestic splits will see zero or one challenge rather than two; and where authentication is required on both legs, making one leg a wallet removes one challenge entirely.

## 8. Proposed platform changes, structured for zero hassle

What Airwallex would actually have to do, phased so that each step is independently shippable, independently reversible, and none requires new licensing, new money movement, or scheme filings. Everything below runs on primitives that already exist; this repo is the working reference for phases 0 and 2.

**Phase 0: configuration, not construction.** Ship split checkout and decline rescue as a merchant toggle inside the existing checkout surfaces, exactly as Airi shipped (a payment-methods toggle, no extra fees). Mechanics: N PaymentIntents per order with `auto_capture: false`, capture together on all-authorized, reverse on failure, the shared `merchant_order_id` and metadata conventions this demo already populates for settlement-report grouping. Cost to build: the state machine in this repo is ~300 lines plus tests. Cost to run: one extra fixed fee per split order, cents of screening. Rollback: turn the toggle off; no data model to unwind. Why it is not a hassle: nothing new touches money movement, scheme rules permit it by name, and merchants who never enable it never see it.

**Phase 1: the order object.** Promote the grouping from convention to primitive: an order-group API in the shape of Adyen's `/orders` (order total, `remainingAmount` drawn down by each payment, an order-closed webhook, order-level cancel and refund that fan out to the legs), with dashboard rendering that shows one order row expanding into its payments, and the option to price the fixed fee per order rather than per transaction, which zeroes the split's marginal cost at the platform's discretion. This repo's `order_groups` table and capture gate are the same shape and exist to be absorbed. Why it is not a hassle: it is additive API surface with a named competitor precedent, and it also cleans up an existing platform reality (partial captures, retries) that merchants already reconcile by hand.

**Phase 2: Airi grows the capability it is missing.** Airi already stores multiple cards per shopper with a default; it launched unable to combine them. "Pay with two of your saved cards" inside Airi's one-click flow is this demo's checkout with the card entry already done, and the spending-mandate layer in this repo (budget, expiry, revocation, spend-on-capture-only) is the working shape of Airi's own announced roadmap line: delegated agent payments with spend limits. Why it is not a hassle: the funding sources are already vaulted, the delegation UX is already announced strategy, and conversion is Airi's headline metric.

**Phase 3: the network features that finish the story.** Expose partial authorization on PaymentIntents so a low-balance prepaid card approves what it can and the remainder rolls to the next card (Visa already mandates issuer support; this turns gift-card splits from guess-the-balance into a one-tap rescue). Add scheme-aware split orchestration: prefer wallet legs (cheaper tokenised interchange, no 3DS challenge), avoid JCB legs where 3DS is likely. Why it is not a hassle: each is an isolated acquiring feature with independent value beyond splits.

The through-line: at no phase does Airwallex hold funds differently, file anything with a scheme, take on a new regulated activity, or bet the roadmap. Phase 0 is a toggle. Everything after it is optional compounding.

## Summary for the impatient reviewer

One extra fixed fee that the platform could zero out by pricing per order. Surcharging is moot in Australia after 1 October 2026, and the same reform pays merchants back eight-fold. Explicitly permitted by Visa and Mastercard rules. Reconciles as one order today through `merchant_order_id` and metadata that this demo already populates, with Adyen's order object as the blueprint for the native version. Risk-layer costs double but are cents; dispute exposure is bounded and precedented. The card mix favors it: a debit-led, wallet-heavy market where a wallet leg is cheaper and skips a 3DS challenge, and where Amex rides at the same list price. The adoption case is decline rescue, where the feature only ever fires at the moment a sale would otherwise die. And the rollout is a toggle first, an order object second, an Airi capability third, with no phase touching custody, licensing, or scheme filings.

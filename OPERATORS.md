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

## Summary for the impatient reviewer

One extra fixed fee that the platform could zero out by pricing per order. Surcharging is moot in Australia after 1 October 2026, and the same reform pays merchants back eight-fold. Explicitly permitted by Visa and Mastercard rules. Reconciles as one order today through `merchant_order_id` and metadata that this demo already populates, with Adyen's order object as the blueprint for the native version. Risk-layer costs double but are cents; dispute exposure is bounded and precedented. And the adoption case is decline rescue, where the feature only ever fires at the moment a sale would otherwise die.

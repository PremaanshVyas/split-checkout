import type { OrderView } from "../types";
import { StatusChip } from "./StatusChip";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

export function SuccessScreen({ order }: { order: OrderView }) {
  return (
    <section className="success-screen">
      <h2>Payment complete 🎉</h2>
      <p className="muted">
        One order, two charges, captured together. Order ref{" "}
        <code>{order.merchant_order_ref}</code>.
      </p>

      <div className="money-flow">
        {order.slots.map((slot, i) => (
          <div className="money-flow-card" key={slot.id}>
            <span className="muted">Card {i + 1}</span>
            <strong>{fmt(slot.amount, order.currency)}</strong>
            <StatusChip status={slot.status} />
            <code className="intent-id" title="Real PaymentIntent ID — verifiable in the Airwallex dashboard">
              {slot.intent_id}
            </code>
          </div>
        ))}
        <div className="money-flow-arrow" aria-hidden>
          →
        </div>
        <div className="money-flow-card money-flow-merchant">
          <span className="muted">Merchant settles</span>
          <strong>{fmt(order.total_amount, order.currency)}</strong>
          <span className="chip chip-captured">Airwallex account</span>
        </div>
      </div>

      <p className="muted small">
        These are real sandbox PaymentIntent IDs — look them up in the Airwallex dashboard to see
        both authorizations and captures.
      </p>
    </section>
  );
}

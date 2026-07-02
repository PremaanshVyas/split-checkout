import { useState } from "react";
import { api } from "../api";
import type { OrderView } from "../types";
import { StatusChip } from "./StatusChip";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

export function SuccessScreen({
  order,
  onOrderUpdate,
}: {
  order: OrderView;
  onOrderUpdate: (order: OrderView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refunded = order.refunded_amount > 0;

  async function refund() {
    setBusy(true);
    setError(null);
    try {
      onOrderUpdate(await api.refundOrder(order.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="success-screen">
      <h2>{refunded ? "Order refunded" : "Payment complete 🎉"}</h2>
      <p className="muted">
        {refunded
          ? "The refund was allocated across both cards in proportion to what each one paid."
          : "One order, two charges, captured together."}{" "}
        Order ref <code>{order.merchant_order_ref}</code>.
      </p>

      <div className="money-flow">
        {order.slots.map((slot, i) => (
          <div className="money-flow-card" key={slot.id}>
            <span className="muted">Card {i + 1}</span>
            <strong>{fmt(slot.amount, order.currency)}</strong>
            {slot.refunded_amount > 0 ? (
              <span className="chip chip-held">
                Refunded {fmt(slot.refunded_amount, order.currency)}
              </span>
            ) : (
              <StatusChip status={slot.status} />
            )}
            <code
              className="intent-id"
              title="Real PaymentIntent ID, verifiable in the Airwallex dashboard"
            >
              {slot.intent_id}
            </code>
          </div>
        ))}
        <div className="money-flow-arrow" aria-hidden>
          {refunded ? "←" : "→"}
        </div>
        <div className="money-flow-card money-flow-merchant">
          <span className="muted">{refunded ? "Merchant returns" : "Merchant settles"}</span>
          <strong>
            {fmt(refunded ? order.refunded_amount : order.total_amount, order.currency)}
          </strong>
          <span className="chip chip-captured">Airwallex account</span>
        </div>
      </div>

      <p className="muted small">
        These are real sandbox PaymentIntent IDs. Look them up in the Airwallex dashboard to see
        both authorizations and captures{refunded ? ", plus the refunds" : ""}.
      </p>

      {!refunded && (
        <div className="refund-demo">
          <button className="refund-button" disabled={busy} onClick={refund}>
            {busy ? "Refunding…" : "Refund this order (demo)"}
          </button>
          <p className="muted small">
            The merchant back-office action, shown here to answer the obvious question: a refund
            on a split order is allocated pro-rata across the cards, exact to the cent.
          </p>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </section>
  );
}

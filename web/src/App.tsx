import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { OrderView, Product } from "./types";
import { SplitEditor } from "./components/SplitEditor";
import { CardStep } from "./components/CardStep";
import { StatusChip } from "./components/StatusChip";
import { SuccessScreen } from "./components/SuccessScreen";
import "./App.css";

type Phase = "shop" | "split" | "checkout";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

export default function App() {
  const [product, setProduct] = useState<Product | null>(null);
  const [phase, setPhase] = useState<Phase>("shop");
  const [order, setOrder] = useState<OrderView | null>(null);
  // client_secrets only arrive on order creation; later verify responses
  // deliberately omit them, so they are kept here for the flow's lifetime.
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    api.getProduct().then(setProduct).catch(() => setFatalError("Could not reach the server."));
  }, []);

  const activeSlotIndex = useMemo(() => {
    if (!order) return -1;
    return order.slots.findIndex((s) => s.status === "created");
  }, [order]);
  const activeSlot = activeSlotIndex >= 0 ? order?.slots[activeSlotIndex] : undefined;

  async function startOrder(splits: number[]) {
    setBusy(true);
    setFatalError(null);
    try {
      const created = await api.createOrder(splits);
      const secretMap: Record<string, string> = {};
      for (const slot of created.slots) {
        if (slot.client_secret) secretMap[slot.id] = slot.client_secret;
      }
      setSecrets(secretMap);
      setOrder(created);
      setPhase("checkout");
    } catch (err) {
      setFatalError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSettled(slotId: string, clientErrorCode?: string) {
    if (!order) return;
    try {
      const updated = await api.verifySlot(order.id, slotId, clientErrorCode);
      setOrder(updated);
      // An expired client_secret can be refreshed without recreating the intent.
      const slot = updated.slots.find((s) => s.id === slotId);
      if (slot?.status === "created" && slot.last_error_code === "expired") {
        const { client_secret } = await api.refreshSecret(order.id, slotId);
        setSecrets((prev) => ({ ...prev, [slotId]: client_secret }));
      }
    } catch (err) {
      setFatalError((err as Error).message);
    }
  }

  if (fatalError && !order) {
    return (
      <main className="shell">
        <p className="error">{fatalError}</p>
      </main>
    );
  }
  if (!product) {
    return (
      <main className="shell">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="masthead">
        <span className="brand">AURORA &amp; CO.</span>
        <span className="muted small">Demo store · Airwallex sandbox · no real money</span>
      </header>

      {phase === "shop" && (
        <section className="product-page">
          <div className="product-visual" aria-hidden>
            ☕
          </div>
          <div className="product-info">
            <h1>{product.name}</h1>
            <p className="muted">{product.description}</p>
            <p className="price">{fmt(product.price, product.currency)}</p>
            <button className="primary" onClick={() => setPhase("split")}>
              Pay with multiple cards
            </button>
            <p className="muted small">
              This split flow is the demo — a single-card button would sit alongside it in a real
              store.
            </p>
          </div>
        </section>
      )}

      {phase === "split" && <SplitEditor product={product} busy={busy} onConfirm={startOrder} />}

      {phase === "checkout" && order && (
        <div className="checkout-grid">
          <div className="checkout-main">
            {order.status === "captured" ? (
              <SuccessScreen order={order} />
            ) : activeSlot ? (
              <CardStep
                key={activeSlot.id}
                slot={activeSlot}
                stepNumber={activeSlotIndex + 1}
                clientSecret={secrets[activeSlot.id]}
                currency={order.currency}
                onConfirmSettled={handleConfirmSettled}
              />
            ) : (
              <section className="card-step">
                <h2>Capturing…</h2>
                <p className="muted">Both holds are in place — completing the charges.</p>
              </section>
            )}
            {fatalError && <p className="error">{fatalError}</p>}
          </div>

          <aside className="order-summary">
            <h3>Order</h3>
            <p>
              {product.name}
              <br />
              <strong>{fmt(order.total_amount, order.currency)}</strong>
            </p>
            <ol className="slot-list">
              {order.slots.map((slot, i) => (
                <li key={slot.id}>
                  <span>
                    Card {i + 1} · {fmt(slot.amount, order.currency)}
                  </span>
                  <StatusChip status={slot.status} declined={Boolean(slot.last_error_code)} />
                </li>
              ))}
            </ol>
            {order.status !== "captured" && (
              <p className="muted small">
                Holds are not charges. If any card fails, nothing is captured and the holds simply
                expire.
              </p>
            )}
            <details className="test-cards">
              <summary>Sandbox test cards</summary>
              <p>
                Success: <code>4035 5010 0000 0008</code>
                <br />
                Declines at any amount: <code>4646 4646 4646 4644</code>
                <br />
                Insufficient funds: <code>5307 8373 6054 4518</code> on an $80.51 slot (use the
                “Decline demo” split; enter <code>1234</code> if a 3DS prompt appears)
                <br />
                Expiry: any future date · CVC: any 3 digits
              </p>
            </details>
          </aside>
        </div>
      )}
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { OrderView, Product } from "./types";
import { ProductGrid } from "./components/ProductGrid";
import { SplitEditor } from "./components/SplitEditor";
import { CardStep } from "./components/CardStep";
import { StatusChip } from "./components/StatusChip";
import { SuccessScreen } from "./components/SuccessScreen";
import { DemoGuide } from "./components/DemoGuide";
import "./App.css";

type Phase = "shop" | "split" | "checkout";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

export default function App() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [phase, setPhase] = useState<Phase>("shop");
  const [order, setOrder] = useState<OrderView | null>(null);
  // client_secrets only arrive on order creation; later verify responses
  // deliberately omit them, so they are kept here for the flow's lifetime.
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    api.getProducts().then(setProducts).catch(() => setFatalError("Could not reach the server."));
  }, []);

  const activeSlotIndex = useMemo(() => {
    if (!order) return -1;
    return order.slots.findIndex((s) => s.status === "created");
  }, [order]);
  const activeSlot = activeSlotIndex >= 0 ? order?.slots[activeSlotIndex] : undefined;

  function backToShop() {
    setPhase("shop");
    setProduct(null);
    setOrder(null);
    setSecrets({});
    setFatalError(null);
  }

  async function startOrder(splits: number[]) {
    if (!product) return;
    setBusy(true);
    setFatalError(null);
    try {
      const created = await api.createOrder(product.sku, splits);
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

  return (
    <main className="shell">
      <header className="masthead">
        <button className="brand" onClick={backToShop}>
          AURORA &amp; CO.
        </button>
        <span className="muted small">Demo store · Airwallex sandbox · no real money</span>
      </header>

      {/* 3DS bank-verification challenges render here as a modal (see App.css). */}
      <div id="awx-auth-form" />

      {fatalError && !order && <p className="error">{fatalError}</p>}

      {phase === "shop" &&
        (products ? (
          <ProductGrid
            products={products}
            onSelect={(p) => {
              setProduct(p);
              setPhase("split");
            }}
          />
        ) : (
          !fatalError && <p className="muted">Loading…</p>
        ))}

      {phase === "split" && product && (
        <div className="split-page">
          <button className="back-link" onClick={backToShop}>
            ← Back to store
          </button>
          <div className="split-product-summary">
            <div className="split-product-visual" aria-hidden>
              {product.art}
            </div>
            <div>
              <h1>{product.name}</h1>
              <p className="muted">{product.description}</p>
              <p className="price">{fmt(product.price, product.currency)}</p>
            </div>
          </div>
          <SplitEditor product={product} busy={busy} onConfirm={startOrder} />
          {fatalError && <p className="error">{fatalError}</p>}
        </div>
      )}

      {phase === "checkout" && order && product && (
        <div className="checkout-grid">
          <div className="checkout-main">
            {order.status === "captured" ? (
              <>
                <SuccessScreen order={order} />
                <button className="back-link" onClick={backToShop}>
                  ← Continue shopping
                </button>
              </>
            ) : order.status === "failed" ? (
              <section className="card-step">
                <h2>Order cancelled</h2>
                <p className="muted">
                  All holds on your cards have been released — nothing was charged.
                </p>
                <button className="primary" onClick={backToShop}>
                  Back to store
                </button>
              </section>
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
                <h2>Completing your payment…</h2>
                <p className="muted">Both holds are in place — capturing the charges together.</p>
              </section>
            )}
            {fatalError && <p className="error">{fatalError}</p>}
          </div>

          <aside className="sidebar">
            <div className="order-summary">
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
              {order.status !== "captured" && order.status !== "failed" && (
                <>
                  <p className="muted small">
                    A hold is not a charge. If any card fails, nothing is captured and the holds
                    simply expire.
                  </p>
                  <button
                    className="cancel-order"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        setOrder(await api.abandonOrder(order.id));
                      } catch (err) {
                        setFatalError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Cancel order &amp; release holds
                  </button>
                </>
              )}
            </div>
            <DemoGuide />
          </aside>
        </div>
      )}

      <footer className="footer muted small">
        Independent demo built on Airwallex's public sandbox API — not an Airwallex product. No
        real cards, no real money.
      </footer>
    </main>
  );
}

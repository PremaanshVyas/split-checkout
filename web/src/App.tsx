import { useEffect, useMemo, useState } from "react";
import { api, type OrderItemRequest } from "./api";
import type { CartLine, OrderView, Product } from "./types";
import { ProductGrid } from "./components/ProductGrid";
import { ProductDetail } from "./components/ProductDetail";
import { CartView } from "./components/CartView";
import { SplitEditor } from "./components/SplitEditor";
import { CardStep } from "./components/CardStep";
import { StatusChip } from "./components/StatusChip";
import { SuccessScreen } from "./components/SuccessScreen";
import { DemoGuide } from "./components/DemoGuide";
import { AgentMode } from "./components/AgentMode";
import "./App.css";

type Phase = "shop" | "product" | "cart" | "pay" | "checkout" | "agent";

const fmt = (n: number, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

/**
 * Checkout survives a browser refresh: order id and the client_secrets
 * (which only exist at order creation) are kept in sessionStorage, and
 * the order's true state is re-fetched on load. Session-scoped on
 * purpose: closing the tab abandons the checkout and the server-side
 * sweep releases the holds. The cart persists the same way.
 */
const SESSION_KEY = "split-checkout-session";
const CART_KEY = "split-checkout-cart";

interface SavedSession {
  orderId: string;
  secrets: Record<string, string>;
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("shop");
  const [product, setProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartLine[]>(() => loadJson<CartLine[]>(CART_KEY) ?? []);
  // The lines being paid for right now (buy-now bypasses the cart).
  const [checkoutLines, setCheckoutLines] = useState<CartLine[]>([]);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [recoveryHint, setRecoveryHint] = useState(false);
  // Whether the current checkout came from the cart (clears it on success)
  // or from buy-now (leaves the cart alone).
  const [checkoutFromCart, setCheckoutFromCart] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  // Restore an in-flight checkout after a refresh.
  useEffect(() => {
    const saved = loadJson<SavedSession>(SESSION_KEY);
    if (!saved) return;
    api
      .getOrder(saved.orderId)
      .then((restored) => {
        if (restored.status === "failed") {
          sessionStorage.removeItem(SESSION_KEY);
          return;
        }
        setSecrets(saved.secrets);
        setOrder(restored);
        setPhase("checkout");
      })
      .catch(() => sessionStorage.removeItem(SESSION_KEY));
  }, []);

  const activeSlotIndex = useMemo(() => {
    if (!order) return -1;
    return order.slots.findIndex((s) => s.status === "created");
  }, [order]);
  const activeSlot = activeSlotIndex >= 0 ? order?.slots[activeSlotIndex] : undefined;

  const cartCount = cart.reduce((acc, l) => acc + l.quantity, 0);
  const checkoutTotal = checkoutLines.reduce((acc, l) => acc + l.price * l.quantity, 0);

  function backToShop() {
    sessionStorage.removeItem(SESSION_KEY);
    setPhase("shop");
    setProduct(null);
    setOrder(null);
    setSecrets({});
    setFatalError(null);
    setRecoveryHint(false);
  }

  function addToCart(p: Product, quantity: number, color: string) {
    setCart((prev) => {
      const existing = prev.findIndex((l) => l.sku === p.sku && l.color === color);
      if (existing >= 0) {
        return prev.map((l, i) =>
          i === existing ? { ...l, quantity: Math.min(10, l.quantity + quantity) } : l,
        );
      }
      return [...prev, { sku: p.sku, name: p.name, price: p.price, quantity, color, stock: p.stock, image: p.image }];
    });
    setPhase("cart");
  }

  function toItems(lines: CartLine[]): OrderItemRequest[] {
    return lines.map((l) => ({
      sku: l.sku,
      quantity: l.quantity,
      ...(l.color ? { color: l.color } : {}),
    }));
  }

  async function startOrder(splits: number[]) {
    if (checkoutLines.length === 0) return;
    setBusy(true);
    setFatalError(null);
    try {
      const created = await api.createOrder(toItems(checkoutLines), splits);
      const secretMap: Record<string, string> = {};
      for (const slot of created.slots) {
        if (slot.client_secret) secretMap[slot.id] = slot.client_secret;
      }
      setSecrets(secretMap);
      setOrder(created);
      setRecoveryHint(false);
      setPhase("checkout");
      // Paying for the cart clears it; a buy-now leaves the cart alone.
      if (checkoutFromCart) {
        setCart([]);
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ orderId: created.id, secrets: secretMap }));
    } catch (err) {
      setFatalError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recoverWithSplit() {
    if (!order) return;
    setBusy(true);
    try {
      await api.abandonOrder(order.id);
      setOrder(null);
      setSecrets({});
      setFatalError(null);
      setRecoveryHint(true);
      setPhase("pay");
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
        <div className="masthead-right">
          <span className="muted small">Demo store · Airwallex sandbox · no real money</span>
          <button className="agent-link" onClick={() => setPhase("agent")}>
            Agent mode
          </button>
          <button className="cart-button" onClick={() => setPhase("cart")} aria-label="Cart">
            🛒{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </button>
        </div>
      </header>

      {/* 3DS bank-verification challenges render here as a modal (see App.css). */}
      <div id="awx-auth-form" />

      {fatalError && !order && <p className="error">{fatalError}</p>}

      {phase === "agent" && <AgentMode onBack={() => setPhase("shop")} />}

      {phase === "shop" && (
        <ProductGrid
          onSelect={(p) => {
            setProduct(p);
            setPhase("product");
          }}
        />
      )}

      {phase === "product" && product && (
        <ProductDetail
          product={product}
          onBack={() => setPhase("shop")}
          onAddToCart={addToCart}
          onBuyNow={(p, quantity, color) => {
            setCheckoutLines([
              { sku: p.sku, name: p.name, price: p.price, quantity, color, stock: p.stock, image: p.image },
            ]);
            setCheckoutFromCart(false);
            setRecoveryHint(false);
            setPhase("pay");
          }}
        />
      )}

      {phase === "cart" && (
        <CartView
          cart={cart}
          onBack={() => setPhase("shop")}
          onUpdateQty={(i, quantity) =>
            setCart((prev) => prev.map((l, idx) => (idx === i ? { ...l, quantity } : l)))
          }
          onRemove={(i) => setCart((prev) => prev.filter((_, idx) => idx !== i))}
          onCheckout={() => {
            setCheckoutLines(cart);
            setCheckoutFromCart(true);
            setRecoveryHint(false);
            setPhase("pay");
          }}
        />
      )}

      {phase === "pay" && checkoutLines.length > 0 && (
        <div className="split-page">
          <button className="back-link" onClick={() => setPhase(checkoutFromCart ? "cart" : "shop")}>
            ← Back
          </button>
          <div className="pay-summary">
            <h1>Checkout</h1>
            <ul className="pay-lines">
              {checkoutLines.map((l) => (
                <li key={`${l.sku}-${l.color ?? ""}`}>
                  <img className="pay-line-thumb" src={l.image} alt="" /> {l.quantity} × {l.name}
                  {l.color ? ` (${l.color})` : ""}
                  <strong>{fmt(l.price * l.quantity)}</strong>
                </li>
              ))}
            </ul>
            <p className="price">Total {fmt(checkoutTotal)}</p>
          </div>
          {recoveryHint && (
            <p className="recovery-hint" role="status">
              Your card was declined, but the order isn't lost. Try splitting it across two cards
              below. Nothing has been charged.
            </p>
          )}
          {!recoveryHint && (
            <div className="pay-single">
              <button className="primary" disabled={busy} onClick={() => startOrder([checkoutTotal])}>
                {busy ? "Setting up…" : `Pay with one card (${fmt(checkoutTotal)})`}
              </button>
              <p className="muted small pay-divider">or split it across two cards</p>
            </div>
          )}
          <SplitEditor total={checkoutTotal} currency="AUD" busy={busy} onConfirm={startOrder} />
          {fatalError && <p className="error">{fatalError}</p>}
        </div>
      )}

      {phase === "checkout" && order && (
        <div className="checkout-grid">
          <div className="checkout-main">
            {order.status === "captured" ? (
              <>
                <SuccessScreen order={order} onOrderUpdate={setOrder} />
                <button className="back-link" onClick={backToShop}>
                  ← Continue shopping
                </button>
              </>
            ) : order.status === "failed" ? (
              <section className="card-step">
                <h2>Order cancelled</h2>
                <p className="muted">All holds on your cards have been released. Nothing was charged.</p>
                <button className="primary" onClick={backToShop}>
                  Back to store
                </button>
              </section>
            ) : activeSlot ? (
              <>
                <CardStep
                  key={activeSlot.id}
                  slot={activeSlot}
                  stepNumber={activeSlotIndex + 1}
                  totalSlots={order.slots.length}
                  clientSecret={secrets[activeSlot.id]}
                  currency={order.currency}
                  onConfirmSettled={handleConfirmSettled}
                />
                {order.slots.length === 1 && activeSlot.last_error_code && (
                  <aside className="recovery-offer">
                    <strong>Don't lose the order. Split it across two cards.</strong>
                    <p className="muted small">
                      Pay part on this card and the rest on another. Nothing is charged unless both
                      cards authorize.
                    </p>
                    <button className="primary" disabled={busy} onClick={recoverWithSplit}>
                      Split across two cards
                    </button>
                  </aside>
                )}
              </>
            ) : (
              <section className="card-step">
                <h2>Completing your payment…</h2>
                <p className="muted">Both holds are in place. Capturing the charges together.</p>
              </section>
            )}
            {fatalError && <p className="error">{fatalError}</p>}
          </div>

          <aside className="sidebar">
            <div className="order-summary">
              <h3>Order</h3>
              <ul className="order-items">
                {order.items.map((item) => (
                  <li key={`${item.sku}-${item.color ?? ""}`}>
                    {item.quantity} × {item.name}
                    {item.color ? ` (${item.color})` : ""}
                  </li>
                ))}
              </ul>
              <p>
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
        Independent demo built on Airwallex's public sandbox API, not an Airwallex product. No real
        cards, no real money. Agents can shop here too:{" "}
        <code>{`${window.location.origin}/mcp`}</code>
      </footer>
    </main>
  );
}

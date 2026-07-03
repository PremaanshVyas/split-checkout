import type { CartLine } from "../types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface Props {
  cart: CartLine[];
  onUpdateQty: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
  onCheckout: () => void;
  onBack: () => void;
}

export function CartView({ cart, onUpdateQty, onRemove, onCheckout, onBack }: Props) {
  const total = cart.reduce((acc, line) => acc + line.price * line.quantity, 0);

  return (
    <div className="cart-view">
      <button className="back-link" onClick={onBack}>
        ← Keep shopping
      </button>
      <h1>Your cart</h1>
      {cart.length === 0 ? (
        <p className="muted">Nothing in here yet.</p>
      ) : (
        <>
          <ul className="cart-lines">
            {cart.map((line, i) => (
              <li key={`${line.sku}-${line.color ?? ""}`}>
                <span className="cart-line-art" aria-hidden>
                  {line.art}
                </span>
                <div className="cart-line-info">
                  <strong>{line.name}</strong>
                  {line.color && <span className="muted small"> · {line.color}</span>}
                  <div className="muted small">{fmt(line.price)} each</div>
                </div>
                <div className="qty-picker">
                  <button onClick={() => onUpdateQty(i, Math.max(1, line.quantity - 1))} aria-label="Decrease">
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button onClick={() => onUpdateQty(i, Math.min(10, line.quantity + 1))} aria-label="Increase">
                    +
                  </button>
                </div>
                <strong className="cart-line-total">{fmt(line.price * line.quantity)}</strong>
                <button className="cart-remove" onClick={() => onRemove(i)} aria-label="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="cart-footer">
            <span>
              Total <strong>{fmt(total)}</strong>
            </span>
            <button className="primary" onClick={onCheckout}>
              Checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
}

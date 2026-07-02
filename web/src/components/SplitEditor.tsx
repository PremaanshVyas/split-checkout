import { useMemo, useState } from "react";
import type { Product } from "../types";

interface Props {
  product: Product;
  busy: boolean;
  onConfirm: (splits: number[]) => void;
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

/**
 * Two amounts that must sum exactly to the product price. The server
 * re-validates; this is purely for a friendly editing experience.
 */
export function SplitEditor({ product, busy, onConfirm }: Props) {
  const [first, setFirst] = useState(product.price / 2);

  const second = useMemo(
    () => Math.round((product.price - first) * 100) / 100,
    [first, product.price],
  );
  const valid = first >= 1 && second >= 1 && !Number.isNaN(first);

  const setClamped = (value: number) => {
    if (Number.isNaN(value)) {
      setFirst(NaN);
      return;
    }
    setFirst(Math.round(value * 100) / 100);
  };

  return (
    <section className="split-editor">
      <h2>Split your payment</h2>
      <p className="muted">
        Pay {fmt(product.price, product.currency)} across two cards. Neither card is charged until
        both authorizations succeed.
      </p>

      <input
        type="range"
        min={1}
        max={product.price - 1}
        step={0.01}
        value={Number.isNaN(first) ? product.price / 2 : first}
        onChange={(e) => setClamped(Number(e.target.value))}
        aria-label="Split amount for card 1"
      />

      <div className="split-inputs">
        <label>
          Card 1
          <input
            type="number"
            min={1}
            max={product.price - 1}
            step={0.01}
            value={Number.isNaN(first) ? "" : first}
            onChange={(e) => setClamped(e.target.value === "" ? NaN : Number(e.target.value))}
          />
        </label>
        <label>
          Card 2
          <input type="number" value={second} readOnly />
        </label>
      </div>

      <div className="split-presets">
        <button type="button" onClick={() => setClamped(product.price / 2)}>50 / 50</button>
        <button type="button" onClick={() => setClamped(Math.round(product.price * 75) / 100)}>75 / 25</button>
        <button
          type="button"
          title="Sets card 2 to $80.51 — a sandbox amount that triggers an insufficient-funds decline"
          onClick={() => setClamped(Math.round((product.price - 80.51) * 100) / 100)}
        >
          Decline demo
        </button>
      </div>

      {!valid && <p className="error">Each card must carry at least 1.00.</p>}

      <button
        className="primary"
        disabled={!valid || busy}
        onClick={() => onConfirm([first, second])}
      >
        {busy ? "Setting up…" : "Continue to cards"}
      </button>
    </section>
  );
}

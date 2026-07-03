import { useState } from "react";
import type { Product } from "../types";
import { Stars, StockBadge } from "./ProductGrid";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

interface Props {
  product: Product;
  onAddToCart: (product: Product, quantity: number, color: string) => void;
  onBuyNow: (product: Product, quantity: number, color: string) => void;
  onBack: () => void;
}

export function ProductDetail({ product, onAddToCart, onBuyNow, onBack }: Props) {
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [quantity, setQuantity] = useState(1);
  const out = product.stock === 0;

  return (
    <div className="product-detail">
      <button className="back-link" onClick={onBack}>
        ← Back to store
      </button>
      <div className="product-detail-grid">
        <div className="product-detail-visual">
          <img src={product.image} alt={product.name} />
        </div>
        <div>
          <p className="muted small detail-category">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="small">
            <Stars rating={product.rating} />{" "}
            <span className="muted">
              {product.rating} · {product.reviews} reviews
            </span>
          </p>
          <p className="price">{fmt(product.price, product.currency)}</p>
          <p className="muted">{product.description}</p>

          <div className="detail-row">
            <span className="detail-label">Colour</span>
            <div className="swatches">
              {product.colors.map((c) => (
                <button
                  key={c}
                  className={c === color ? "swatch swatch-active" : "swatch"}
                  onClick={() => setColor(c)}
                >
                  <span className="color-dot" data-color={c} /> {c}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-row">
            <span className="detail-label">Qty</span>
            <div className="qty-picker">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease">
                −
              </button>
              <span>{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(Math.max(product.stock, 1), 10, quantity + 1))}
                aria-label="Increase"
              >
                +
              </button>
            </div>
            <StockBadge stock={product.stock} />
          </div>

          <div className="detail-actions">
            <button className="primary" disabled={out} onClick={() => onBuyNow(product, quantity, color)}>
              Buy now
            </button>
            <button
              className="secondary"
              disabled={out}
              onClick={() => onAddToCart(product, quantity, color)}
            >
              Add to cart
            </button>
          </div>
          {out && <p className="muted small">This one's popular. Check back soon.</p>}
        </div>
      </div>
    </div>
  );
}

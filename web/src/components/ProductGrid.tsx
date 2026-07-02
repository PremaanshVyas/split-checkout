import type { Product } from "../types";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

export function ProductGrid({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
}) {
  return (
    <section>
      <div className="store-hero">
        <h1>Serious coffee equipment.</h1>
        <p className="muted">
          Free shipping Australia-wide · 3-year warranty · Pay with one card, or split across two.
        </p>
      </div>
      <div className="product-grid">
        {products.map((product) => (
          <article className="product-card" key={product.sku}>
            <div className="product-card-visual" aria-hidden>
              {product.art}
            </div>
            <div className="product-card-body">
              <h2>{product.name}</h2>
              <p className="muted small">{product.tagline}</p>
              <p className="product-card-price">{fmt(product.price, product.currency)}</p>
              <button className="primary" onClick={() => onSelect(product)}>
                Buy now
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

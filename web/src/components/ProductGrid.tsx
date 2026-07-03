import { useEffect, useState } from "react";
import { api } from "../api";
import type { Product, SearchResult } from "../types";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

const CATEGORIES = [
  "espresso machines",
  "grinders",
  "kettles",
  "brewers",
  "scales",
  "accessories",
  "bundles",
];

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" title={`${rating} out of 5`}>
      {"★".repeat(Math.round(rating))}
      <span className="stars-dim">{"★".repeat(5 - Math.round(rating))}</span>
    </span>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) return <span className="stock stock-out">Out of stock</span>;
  if (stock <= 5) return <span className="stock stock-low">Only {stock} left</span>;
  return <span className="stock stock-in">In stock</span>;
}

export function ProductGrid({ onSelect }: { onSelect: (product: Product) => void }) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .searchProducts({
          ...(q ? { q } : {}),
          ...(category ? { category } : {}),
          ...(inStock ? { in_stock: true } : {}),
          ...(sort ? { sort } : {}),
        })
        .then(setResult)
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [q, category, inStock, sort]);

  return (
    <section>
      <div className="store-hero">
        <h1>Serious coffee equipment.</h1>
        <p className="muted">
          Free shipping Australia-wide · 3-year warranty · Pay with one card, or split across two.
        </p>
      </div>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Search the store…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search products"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
          <option value="">Featured</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Top rated</option>
          <option value="reviews">Most reviewed</option>
        </select>
        <label className="filter-stock">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
          In stock only
        </label>
      </div>

      <div className="category-chips">
        <button
          className={category === undefined ? "chip-btn chip-btn-active" : "chip-btn"}
          onClick={() => setCategory(undefined)}
        >
          all
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={category === c ? "chip-btn chip-btn-active" : "chip-btn"}
            onClick={() => setCategory(category === c ? undefined : c)}
          >
            {c}
            {result?.facets.categories[c] !== undefined && category === undefined
              ? ` (${result.facets.categories[c]})`
              : ""}
          </button>
        ))}
      </div>

      {result && result.total === 0 && (
        <p className="muted">Nothing matches those filters. Try loosening them.</p>
      )}

      <div className="product-grid">
        {result?.products.map((product) => (
          <article
            className={product.stock === 0 ? "product-card product-card-out" : "product-card"}
            key={product.sku}
            onClick={() => onSelect(product)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelect(product)}
          >
            <div className="product-card-visual" aria-hidden>
              {product.art}
            </div>
            <div className="product-card-body">
              <h2>{product.name}</h2>
              <p className="muted small">{product.tagline}</p>
              <p className="small">
                <Stars rating={product.rating} />{" "}
                <span className="muted">({product.reviews})</span>
              </p>
              <div className="color-dots" aria-label={`Colors: ${product.colors.join(", ")}`}>
                {product.colors.map((c) => (
                  <span key={c} className="color-dot" data-color={c} title={c} />
                ))}
              </div>
              <div className="product-card-footer">
                <span className="product-card-price">{fmt(product.price, product.currency)}</span>
                <StockBadge stock={product.stock} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

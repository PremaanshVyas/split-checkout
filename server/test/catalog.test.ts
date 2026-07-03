import { test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, searchProducts } from "../src/catalog.js";

test("no filters returns the whole catalog with facets", () => {
  const result = searchProducts({});
  assert.equal(result.total, PRODUCTS.length);
  assert.ok(result.facets.categories["grinders"]! >= 3);
  assert.ok(result.facets.price_range!.min < 100);
});

test("category and price filters combine", () => {
  const result = searchProducts({ category: "grinders", maxPrice: 500 });
  assert.ok(result.total >= 2);
  for (const p of result.products) {
    assert.equal(p.category, "grinders");
    assert.ok(p.price <= 500);
  }
});

test("free-text search matches tags and descriptions", () => {
  const result = searchProducts({ q: "pour over" });
  assert.ok(result.products.some((p) => p.sku === "aurora-kettle"));
  assert.ok(result.products.some((p) => p.sku === "aurora-dripper"));
});

test("color filter matches partial color names", () => {
  const result = searchProducts({ color: "walnut" });
  assert.ok(result.total >= 2);
  for (const p of result.products) {
    assert.ok(p.colors.some((c) => c.includes("walnut")));
  }
});

test("in-stock filter excludes sold-out products", () => {
  const all = searchProducts({});
  const inStock = searchProducts({ inStock: true });
  assert.ok(inStock.total < all.total);
  for (const p of inStock.products) assert.ok(p.stock > 0);
});

test("price sort is monotonic", () => {
  const result = searchProducts({ sort: "price_asc" });
  const prices = result.products.map((p) => p.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

test("no match returns empty with empty facets", () => {
  const result = searchProducts({ q: "submarine" });
  assert.equal(result.total, 0);
  assert.equal(result.facets.price_range, null);
});

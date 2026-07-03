import type { OrderView, Product, SearchParams, SearchResult } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export interface OrderItemRequest {
  sku: string;
  quantity?: number;
  color?: string;
}

export const api = {
  searchProducts: (params: SearchParams = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.category) qs.set("category", params.category);
    if (params.color) qs.set("color", params.color);
    if (params.max_price !== undefined) qs.set("max_price", String(params.max_price));
    if (params.in_stock) qs.set("in_stock", "true");
    if (params.sort) qs.set("sort", params.sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<SearchResult>(`/api/products${suffix}`);
  },

  getProduct: (sku: string) => request<Product>(`/api/products/${sku}`),

  getOrder: (orderId: string) => request<OrderView>(`/api/orders/${orderId}`),

  createOrder: (items: OrderItemRequest[], splits: number[]) =>
    request<OrderView>("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, splits }),
    }),

  verifySlot: (orderId: string, slotId: string, clientErrorCode?: string) =>
    request<OrderView>(`/api/orders/${orderId}/slots/${slotId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientErrorCode ? { client_error_code: clientErrorCode } : {}),
    }),

  refreshSecret: (orderId: string, slotId: string) =>
    request<{ client_secret: string }>(`/api/orders/${orderId}/slots/${slotId}/refresh-secret`, {
      method: "POST",
    }),

  abandonOrder: (orderId: string) =>
    request<OrderView>(`/api/orders/${orderId}/abandon`, { method: "POST" }),

  refundOrder: (orderId: string) =>
    request<OrderView>(`/api/orders/${orderId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
};

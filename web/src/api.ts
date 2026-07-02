import type { OrderView, Product } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  getProducts: () => request<Product[]>("/api/products"),

  getOrder: (orderId: string) => request<OrderView>(`/api/orders/${orderId}`),

  createOrder: (sku: string, splits: number[]) =>
    request<OrderView>("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, splits }),
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

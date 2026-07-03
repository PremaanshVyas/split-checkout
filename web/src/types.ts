export interface Product {
  sku: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  colors: string[];
  rating: number;
  reviews: number;
  stock: number;
  tags: string[];
  art: string;
}

export interface SearchResult {
  products: Product[];
  total: number;
  facets: {
    categories: Record<string, number>;
    colors: Record<string, number>;
    price_range: { min: number; max: number } | null;
  };
}

export interface SearchParams {
  q?: string;
  category?: string;
  color?: string;
  max_price?: number;
  in_stock?: boolean;
  sort?: string;
}

export interface CartLine {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  art: string;
}

export interface OrderItemView {
  sku: string;
  name: string;
  unit_price: number;
  quantity: number;
  color: string | null;
}

export type SlotStatus = "created" | "authorized" | "captured" | "failed" | "cancelled";

export interface SlotView {
  id: string;
  amount: number;
  status: SlotStatus;
  intent_id: string;
  client_secret?: string;
  last_error_code: string | null;
  error_message: string | null;
  refunded_amount: number;
}

export interface OrderView {
  id: string;
  merchant_order_ref: string;
  total_amount: number;
  currency: string;
  status: "pending" | "partially_authorized" | "authorized" | "captured" | "failed";
  refunded_amount: number;
  items: OrderItemView[];
  slots: SlotView[];
}

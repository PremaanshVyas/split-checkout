export interface Product {
  sku: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  art: string;
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
  slots: SlotView[];
}

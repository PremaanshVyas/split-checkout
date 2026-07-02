export type OrderGroupStatus =
  | "pending"
  | "partially_authorized"
  | "authorized"
  | "captured"
  | "failed";

export type SlotStatus = "created" | "authorized" | "captured" | "failed" | "cancelled";

export interface OrderGroup {
  id: string;
  merchant_order_ref: string;
  total_amount: number;
  currency: string;
  status: OrderGroupStatus;
  created_at: string;
}

export interface PaymentSlot {
  id: string;
  order_group_id: string;
  airwallex_intent_id: string;
  amount: number;
  status: SlotStatus;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Group status derived from its slots. This is the state machine:
 * pending → partially_authorized → authorized → captured, with
 * `failed` reserved for explicit abandonment/cancellation.
 *
 * A declined confirm does NOT move a slot to `failed`; Airwallex
 * leaves the PaymentIntent open, so the slot stays `created` (with
 * last_error_code recorded) and the shopper retries in place.
 */
export function deriveGroupStatus(slots: PaymentSlot[], current: OrderGroupStatus): OrderGroupStatus {
  if (current === "failed") return "failed";
  if (slots.length === 0) return "pending";
  if (slots.every((s) => s.status === "captured")) return "captured";
  const authorizedOrBeyond = slots.filter((s) => s.status === "authorized" || s.status === "captured");
  if (authorizedOrBeyond.length === slots.length) return "authorized";
  if (authorizedOrBeyond.length > 0) return "partially_authorized";
  return "pending";
}

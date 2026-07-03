/**
 * Known PaymentIntent statuses. Airwallex documents this list as
 * non-exhaustive, so code must tolerate values outside the union;
 * hence the `(string & {})` escape hatch.
 */
export type PaymentIntentStatus =
  | "REQUIRES_PAYMENT_METHOD"
  | "REQUIRES_CUSTOMER_ACTION"
  | "PENDING_REVIEW"
  | "REQUIRES_CAPTURE"
  | "PENDING"
  | "SUCCEEDED"
  | "CANCELLED"
  | (string & {});

export interface PaymentAttempt {
  id: string;
  status: string;
  payment_method?: {
    type?: string;
    card?: { brand?: string; last4?: string };
  };
  authentication_data?: unknown;
  provider_original_response_code?: string;
}

export interface PaymentIntent {
  id: string;
  request_id: string;
  amount: number;
  currency: string;
  merchant_order_id: string;
  status: PaymentIntentStatus;
  captured_amount?: number;
  client_secret?: string;
  descriptor?: string;
  metadata?: Record<string, string>;
  latest_payment_attempt?: PaymentAttempt;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  merchantOrderId: string;
  descriptor?: string;
  metadata?: Record<string, string>;
}

export interface TestCardDetails {
  number: string;
  expiry_month: string;
  expiry_year: string;
  cvc: string;
  name?: string;
}

export interface Refund {
  id: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  reason?: string;
  created_at: string;
}

/** Error body shape returned by the Airwallex API. */
export interface AirwallexErrorBody {
  code: string;
  message: string;
  source?: string;
  details?: unknown;
}

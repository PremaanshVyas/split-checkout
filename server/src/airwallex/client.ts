import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type {
  AirwallexErrorBody,
  CreatePaymentIntentParams,
  PaymentIntent,
} from "./types.js";

/** Refresh the access token this long before its stated expiry. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export class AirwallexApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly source?: string,
  ) {
    super(`Airwallex API error ${httpStatus} (${code}): ${message}`);
    this.name = "AirwallexApiError";
  }
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

/**
 * Minimal typed client for the Airwallex payment-acceptance API.
 *
 * Uses raw REST rather than the beta @airwallex/node-sdk; see DECISIONS.md.
 * The bearer token is valid for 30 minutes; we cache it and refresh
 * shortly before expiry. Credentials never leave this module.
 */
export class AirwallexClient {
  private cachedToken: CachedToken | null = null;

  constructor(private readonly config: Config) {}

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAtMs - TOKEN_REFRESH_BUFFER_MS) {
      return this.cachedToken.token;
    }
    const res = await fetch(`${this.config.airwallexBaseUrl}/api/v1/authentication/login`, {
      method: "POST",
      headers: {
        "x-client-id": this.config.airwallexClientId,
        "x-api-key": this.config.airwallexApiKey,
      },
    });
    if (!res.ok) {
      throw await toApiError(res);
    }
    const body = (await res.json()) as { token: string; expires_at: string };
    this.cachedToken = {
      token: body.token,
      expiresAtMs: Date.parse(body.expires_at),
    };
    return body.token;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.config.airwallexBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      throw await toApiError(res);
    }
    return (await res.json()) as T;
  }

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntent> {
    return this.request<PaymentIntent>("POST", "/api/v1/pa/payment_intents/create", {
      request_id: randomUUID(),
      amount: params.amount,
      currency: params.currency,
      merchant_order_id: params.merchantOrderId,
      ...(params.descriptor !== undefined ? { descriptor: params.descriptor } : {}),
      ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
    });
  }

  async retrievePaymentIntent(intentId: string): Promise<PaymentIntent> {
    return this.request<PaymentIntent>("GET", `/api/v1/pa/payment_intents/${intentId}`);
  }

  async capturePaymentIntent(intentId: string): Promise<PaymentIntent> {
    return this.request<PaymentIntent>("POST", `/api/v1/pa/payment_intents/${intentId}/capture`, {
      request_id: randomUUID(),
    });
  }

  async cancelPaymentIntent(intentId: string, reason?: string): Promise<PaymentIntent> {
    return this.request<PaymentIntent>("POST", `/api/v1/pa/payment_intents/${intentId}/cancel`, {
      request_id: randomUUID(),
      ...(reason !== undefined ? { cancellation_reason: reason } : {}),
    });
  }
}

async function toApiError(res: Response): Promise<AirwallexApiError> {
  let parsed: Partial<AirwallexErrorBody> = {};
  try {
    parsed = (await res.json()) as AirwallexErrorBody;
  } catch {
    // Non-JSON error body (e.g. gateway HTML); fall through to defaults.
  }
  return new AirwallexApiError(
    res.status,
    parsed.code ?? "unknown_error",
    parsed.message ?? res.statusText,
    parsed.source,
  );
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, raw } from "express";
import type { PaymentIntent } from "../airwallex/types.js";
import type { OrderService } from "../orders/service.js";

/** Reject events whose timestamp is further than this from our clock. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Airwallex signs each delivery with HMAC-SHA256 over
 * `x-timestamp + raw_body`, hex-encoded in `x-signature`.
 * Verification must run on the raw bytes, before any JSON parsing.
 */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody.toString("utf8"))
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook listener (secondary status channel; see DECISIONS.md).
 * payment_intent.* events feed the exact same slot/group transitions
 * as the polling path, so whichever arrives first wins and the other
 * is an idempotent no-op.
 *
 * Mounted BEFORE the JSON body parser: signature verification needs
 * the raw, unmodified request body.
 */
export function webhooksRouter(service: OrderService, secret: string | undefined): Router {
  const router = Router();

  router.post("/webhooks/airwallex", raw({ type: "*/*" }), (req, res) => {
    if (!secret) {
      res.status(503).json({ error: "AIRWALLEX_WEBHOOK_SECRET not configured" });
      return;
    }
    const timestamp = req.header("x-timestamp");
    const signature = req.header("x-signature");
    if (!timestamp || !signature) {
      res.status(400).json({ error: "Missing signature headers" });
      return;
    }
    const skewMs = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(skewMs) || skewMs > TIMESTAMP_TOLERANCE_MS) {
      res.status(400).json({ error: "Timestamp outside tolerance" });
      return;
    }
    if (!verifyWebhookSignature(secret, timestamp, req.body as Buffer, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let event: { name?: string; data?: { object?: PaymentIntent } };
    try {
      event = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    // Acknowledge immediately; Airwallex retries non-200 deliveries.
    res.json({ received: true });

    const intent = event.data?.object;
    if (event.name?.startsWith("payment_intent.") && intent?.id) {
      service
        .processIntentUpdate(intent)
        .then((matched) => {
          if (matched) console.log(`webhook: ${event.name} applied to intent ${intent.id}`);
        })
        .catch((err) => console.error(`webhook: failed to process ${event.name}:`, err));
    }
  });

  return router;
}

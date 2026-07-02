import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../src/routes/webhooks.js";
import { openDatabase } from "../src/db.js";
import { OrderStore } from "../src/orders/store.js";
import { OrderService } from "../src/orders/service.js";
import type { AirwallexClient } from "../src/airwallex/client.js";
import type { PaymentIntent } from "../src/airwallex/types.js";

const SECRET = "whsec_test_secret";

function sign(timestamp: string, body: string): string {
  return createHmac("sha256", SECRET).update(timestamp + body).digest("hex");
}

test("valid signature verifies", () => {
  const body = Buffer.from(JSON.stringify({ name: "payment_intent.succeeded" }));
  const ts = "1782972000000";
  assert.equal(verifyWebhookSignature(SECRET, ts, body, sign(ts, body.toString())), true);
});

test("tampered body fails verification", () => {
  const body = Buffer.from(JSON.stringify({ name: "payment_intent.succeeded" }));
  const ts = "1782972000000";
  const sig = sign(ts, body.toString());
  const tampered = Buffer.from(JSON.stringify({ name: "payment_intent.cancelled" }));
  assert.equal(verifyWebhookSignature(SECRET, ts, tampered, sig), false);
});

test("wrong secret fails verification", () => {
  const body = Buffer.from("{}");
  const ts = "1782972000000";
  const sig = createHmac("sha256", "other_secret").update(ts + "{}").digest("hex");
  assert.equal(verifyWebhookSignature(SECRET, ts, body, sig), false);
});

test("shifted timestamp fails verification (timestamp is inside the MAC)", () => {
  const body = Buffer.from("{}");
  const sig = sign("1782972000000", "{}");
  assert.equal(verifyWebhookSignature(SECRET, "1782972999999", body, sig), false);
});

test("webhook-delivered statuses drive the capture gate", async () => {
  const db = openDatabase(":memory:");
  const store = new OrderStore(db);
  const captured: string[] = [];
  const client = {
    capturePaymentIntent: async (id: string) => {
      captured.push(id);
      return { id, status: "SUCCEEDED" };
    },
  } as unknown as AirwallexClient;
  const service = new OrderService(store, client);

  const group = store.createGroup({ merchantOrderRef: "wh-test", totalAmount: 1200, currency: "AUD" });
  store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_a", amount: 600 });
  store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_b", amount: 600 });

  const requiresCapture = (id: string) => ({ id, status: "REQUIRES_CAPTURE" }) as PaymentIntent;

  // First hold arrives via webhook: no capture yet (gate demands ALL).
  assert.equal(await service.processIntentUpdate(requiresCapture("int_a")), true);
  assert.equal(captured.length, 0);
  assert.equal(store.getGroup(group.id)!.status, "partially_authorized");

  // Second hold: gate fires, both captured together.
  await service.processIntentUpdate(requiresCapture("int_b"));
  assert.deepEqual(captured.sort(), ["int_a", "int_b"]);
  assert.equal(store.getGroup(group.id)!.status, "captured");

  // Unknown intent is ignored.
  assert.equal(await service.processIntentUpdate(requiresCapture("int_unknown")), false);

  // Duplicate delivery is an idempotent no-op.
  await service.processIntentUpdate(requiresCapture("int_a"));
  assert.equal(captured.length, 2);
});

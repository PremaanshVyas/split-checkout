import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { OrderStore } from "../src/orders/store.js";
import { OrderService } from "../src/orders/service.js";
import { MandateError, MandateStore } from "../src/orders/mandates.js";
import { AirwallexApiError, type AirwallexClient } from "../src/airwallex/client.js";

/**
 * Airwallex stub for the full agent flow: create -> confirm -> retrieve ->
 * capture. A PAN listed in `declines` fails at confirm, like a real decline.
 */
function stubAirwallex(declines: string[] = []) {
  let seq = 0;
  const confirmed = new Set<string>();
  return {
    createPaymentIntent: async ({ amount }: { amount: number }) => ({
      id: `int_test_${++seq}`,
      client_secret: `secret_${seq}`,
      status: "REQUIRES_PAYMENT_METHOD",
      amount,
    }),
    confirmPaymentIntentWithCard: async (intentId: string, card: { number: string }) => {
      if (declines.includes(card.number)) {
        throw new AirwallexApiError(400, "risk_declined", "declined by test stub");
      }
      confirmed.add(intentId);
      return { id: intentId, status: "REQUIRES_CAPTURE" };
    },
    retrievePaymentIntent: async (intentId: string) => ({
      id: intentId,
      status: confirmed.has(intentId) ? "REQUIRES_CAPTURE" : "REQUIRES_PAYMENT_METHOD",
    }),
    capturePaymentIntent: async (intentId: string) => ({ id: intentId, status: "SUCCEEDED" }),
    cancelPaymentIntent: async (intentId: string) => ({ id: intentId, status: "CANCELLED" }),
    createRefund: async (intentId: string, amount: number) => ({
      id: `rfd_${intentId}`,
      payment_intent_id: intentId,
      amount,
      currency: "AUD",
      status: "RECEIVED",
      created_at: "",
    }),
  } as unknown as AirwallexClient;
}

function setup(declines: string[] = []) {
  const db = openDatabase(":memory:");
  const mandates = new MandateStore(db);
  const service = new OrderService(new OrderStore(db), stubAirwallex(declines), mandates);
  return { db, mandates, service };
}

test("create validates cards, budget, and expiry", () => {
  const { mandates } = setup();
  assert.throws(() => mandates.create({ cards: ["visa-gold"], maxAmount: 100, ttlMinutes: 60 }), MandateError);
  assert.throws(() => mandates.create({ cards: ["success"], maxAmount: 0.5, ttlMinutes: 60 }), MandateError);
  assert.throws(() => mandates.create({ cards: ["success"], maxAmount: 100, ttlMinutes: 2 }), MandateError);
  const m = mandates.create({ cards: ["success", "success_mastercard"], maxAmount: 600, ttlMinutes: 60 });
  assert.match(m.code, /^mdt-[0-9a-f]{8}$/);
  assert.equal(m.remaining, 600);
  assert.equal(m.card_count, 2);
  assert.equal(m.state, "active");
});

test("a captured purchase decrements the budget; over-budget is refused before any intent exists", async () => {
  const { mandates, service } = setup();
  const m = mandates.create({ cards: ["success", "success_mastercard"], maxAmount: 600, ttlMinutes: 60 });

  // $1,950 bundle on a $600 budget: refused up front.
  await assert.rejects(
    () => service.mandateCheckout(m.code, [{ sku: "aurora-barista-bundle" }]),
    /exceeds the mandate's remaining budget/,
  );

  // $485 grinder: fits, captures, decrements.
  const { order, mandate } = await service.mandateCheckout(m.code, [{ sku: "aurora-grinder-64" }]);
  assert.equal(order.status, "captured");
  assert.equal(order.slots.length, 2); // split across the mandate's two cards
  assert.equal(mandate.remaining, 115);

  // $189 kettle now exceeds the $115 remainder.
  await assert.rejects(
    () => service.mandateCheckout(m.code, [{ sku: "aurora-kettle" }]),
    /exceeds the mandate's remaining budget/,
  );
});

test("a declined purchase costs the budget nothing", async () => {
  const { mandates, service } = setup(["4646464646464644"]);
  const m = mandates.create({ cards: ["success", "decline"], maxAmount: 600, ttlMinutes: 60 });
  const { order, mandate } = await service.mandateCheckout(m.code, [{ sku: "aurora-grinder-64" }]);
  assert.equal(order.status, "partially_authorized"); // card 2 declined, nothing captured
  assert.equal(mandate.remaining, 600);
});

test("expired and revoked mandates are refused", async () => {
  const { db, mandates, service } = setup();
  const m = mandates.create({ cards: ["success"], maxAmount: 600, ttlMinutes: 60 });
  db.prepare(`UPDATE mandates SET expires_at = ? WHERE code = ?`).run(
    new Date(Date.now() - 60_000).toISOString(),
    m.code,
  );
  await assert.rejects(() => service.mandateCheckout(m.code, [{ sku: "aurora-dripper" }]), /expired/);
  assert.equal(mandates.status(m.code).state, "expired");

  const m2 = mandates.create({ cards: ["success"], maxAmount: 600, ttlMinutes: 60 });
  mandates.revoke(m2.code);
  await assert.rejects(() => service.mandateCheckout(m2.code, [{ sku: "aurora-dripper" }]), /revoked/);
});

test("refunds do not restore mandate budget", async () => {
  const { mandates, service } = setup();
  const m = mandates.create({ cards: ["success"], maxAmount: 600, ttlMinutes: 60 });
  const { order } = await service.mandateCheckout(m.code, [{ sku: "aurora-grinder-64" }]);
  assert.equal(order.status, "captured");
  await service.refundOrder(order.id);
  assert.equal(mandates.status(m.code).remaining, 115);
});

test("exhausted mandate reports its state", async () => {
  const { mandates, service } = setup();
  const m = mandates.create({ cards: ["success"], maxAmount: 49, ttlMinutes: 60 });
  await service.mandateCheckout(m.code, [{ sku: "aurora-dripper" }]); // exactly $49
  const status = mandates.status(m.code);
  assert.equal(status.remaining, 0);
  assert.equal(status.state, "exhausted");
  await assert.rejects(() => service.mandateCheckout(m.code, [{ sku: "aurora-dripper" }]), /fully spent/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { withLock, activeLockCount } from "../src/orders/orderLock.js";
import { openDatabase } from "../src/db.js";
import { OrderStore } from "../src/orders/store.js";
import { OrderService, RefundError } from "../src/orders/service.js";
import { MandateStore } from "../src/orders/mandates.js";
import type { AirwallexClient } from "../src/airwallex/client.js";
import type { PaymentIntent } from "../src/airwallex/types.js";

// --- the lock primitive ---

test("withLock serializes same-key work and preserves order", async () => {
  const events: string[] = [];
  await Promise.all([
    withLock("k", async () => {
      events.push("a-start");
      await sleep(30);
      events.push("a-end");
    }),
    withLock("k", async () => {
      events.push("b-start");
      events.push("b-end");
    }),
  ]);
  assert.deepEqual(events, ["a-start", "a-end", "b-start", "b-end"]);
});

test("different keys run concurrently", async () => {
  const events: string[] = [];
  await Promise.all([
    withLock("x", async () => {
      events.push("x-start");
      await sleep(30);
      events.push("x-end");
    }),
    withLock("y", async () => {
      events.push("y-start");
      events.push("y-end");
    }),
  ]);
  assert.deepEqual(events, ["x-start", "y-start", "y-end", "x-end"]);
});

test("a rejection reaches its caller but not the next holder", async () => {
  const results = await Promise.allSettled([
    withLock("k2", async () => {
      throw new Error("boom");
    }),
    withLock("k2", async () => "fine"),
  ]);
  assert.equal(results[0]!.status, "rejected");
  assert.equal(results[1]!.status, "fulfilled");
});

test("drained locks clean themselves up", async () => {
  await withLock("k3", async () => {});
  await sleep(5);
  assert.equal(activeLockCount(), 0);
});

// --- the races the lock exists to close ---

function stub(captureDelayMs = 20) {
  let seq = 0;
  const captures: string[] = [];
  const confirmed = new Set<string>();
  const client = {
    createPaymentIntent: async ({ amount }: { amount: number }) => ({
      id: `int_${++seq}`,
      client_secret: `s${seq}`,
      status: "REQUIRES_PAYMENT_METHOD",
      amount,
    }),
    confirmPaymentIntentWithCard: async (id: string) => {
      confirmed.add(id);
      return { id, status: "REQUIRES_CAPTURE" };
    },
    retrievePaymentIntent: async (id: string) => ({
      id,
      status: confirmed.has(id) ? "REQUIRES_CAPTURE" : "REQUIRES_PAYMENT_METHOD",
    }),
    capturePaymentIntent: async (id: string) => {
      captures.push(id);
      await sleep(captureDelayMs);
      return { id, status: "SUCCEEDED" };
    },
    cancelPaymentIntent: async (id: string) => ({ id, status: "CANCELLED" }),
    createRefund: async (id: string, amount: number) => ({
      id: `rfd_${id}_${captures.length}_${Math.trunc(amount * 100)}`,
      payment_intent_id: id,
      amount,
      currency: "AUD",
      status: "RECEIVED",
      created_at: "",
    }),
  } as unknown as AirwallexClient;
  return { client, captures };
}

test("polling and webhook racing the capture gate capture each intent exactly once", async () => {
  const db = openDatabase(":memory:");
  const store = new OrderStore(db);
  const { client, captures } = stub();
  const service = new OrderService(store, client);

  const group = store.createGroup({ merchantOrderRef: "race", totalAmount: 1200, currency: "AUD" });
  const s1 = store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_a", amount: 600 });
  const s2 = store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_b", amount: 600 });
  store.updateSlotStatus(s1.id, "authorized");
  store.updateGroupStatus(group.id, "partially_authorized");

  // Both channels report intent B's authorization at the same instant.
  const webhookIntent = { id: "int_b", status: "REQUIRES_CAPTURE" } as PaymentIntent;
  const pollingIntent = { id: "int_a", status: "REQUIRES_CAPTURE" } as PaymentIntent;
  await Promise.all([
    service.processIntentUpdate(webhookIntent),
    service.processIntentUpdate(pollingIntent),
    service.processIntentUpdate(webhookIntent),
  ]);

  assert.equal(captures.filter((id) => id === "int_a").length, 1, "int_a captured once");
  assert.equal(captures.filter((id) => id === "int_b").length, 1, "int_b captured once");
  assert.equal(store.getGroup(group.id)!.status, "captured");
});

test("concurrent refunds cannot exceed the captured total", async () => {
  const db = openDatabase(":memory:");
  const store = new OrderStore(db);
  const { client } = stub(5);
  const service = new OrderService(store, client);

  const group = store.createGroup({ merchantOrderRef: "rf-race", totalAmount: 100, currency: "AUD" });
  const s1 = store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_r", amount: 100 });
  store.updateSlotStatus(s1.id, "captured");
  store.updateGroupStatus(group.id, "captured");

  const results = await Promise.allSettled([
    service.refundOrder(group.id, 60),
    service.refundOrder(group.id, 60),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one refund succeeds");
  assert.equal(rejected.length, 1, "the second is refused");
  assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof RefundError);
});

test("concurrent mandate spends cannot exceed the budget", async () => {
  const db = openDatabase(":memory:");
  const store = new OrderStore(db);
  const mandates = new MandateStore(db);
  const { client } = stub(5);
  const service = new OrderService(store, client, mandates);

  const m = mandates.create({ cards: ["success"], maxAmount: 600, ttlMinutes: 60 });
  // Two $485 grinders at once against a $600 budget.
  const results = await Promise.allSettled([
    service.mandateCheckout(m.code, [{ sku: "aurora-grinder-64" }]),
    service.mandateCheckout(m.code, [{ sku: "aurora-grinder-64" }]),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "exactly one spend goes through");
  assert.equal(mandates.status(m.code).remaining, 115);
});

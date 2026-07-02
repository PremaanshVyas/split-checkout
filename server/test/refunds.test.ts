import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { OrderStore } from "../src/orders/store.js";
import { OrderService, RefundError, allocateRefund } from "../src/orders/service.js";
import type { AirwallexClient } from "../src/airwallex/client.js";

// --- allocateRefund: the cent-exact pro-rata math ---

test("full refund allocates everything", () => {
  assert.deepEqual(allocateRefund(120000, [60000, 60000]), [60000, 60000]);
});

test("partial refund splits proportionally", () => {
  // 50/50 capture, refund half: 300 each
  assert.deepEqual(allocateRefund(60000, [60000, 60000]), [30000, 30000]);
});

test("uneven capture refunds proportionally", () => {
  // $1,119.49 / $80.51 capture, refund $120.00
  const [a, b] = allocateRefund(12000, [111949, 8051]);
  assert.equal(a! + b!, 12000);
  // Slot 1 carries ~93.3% of the order, so ~93.3% of the refund
  assert.ok(a! >= 11190 && a! <= 11200, `slot 1 got ${a}`);
});

test("odd cents never get lost to rounding", () => {
  // Three-way split of 100 cents across equal thirds cannot divide evenly
  const parts = allocateRefund(100, [1000, 1000, 1000]);
  assert.equal(parts.reduce((x, y) => x + y, 0), 100);
});

test("allocation respects per-slot remaining capacity", () => {
  // Slot 1 nearly exhausted: only 10 cents left refundable
  const [a, b] = allocateRefund(5000, [10, 60000]);
  assert.equal(a! + b!, 5000);
  assert.ok(a! <= 10);
});

test("over-refund throws", () => {
  assert.throws(() => allocateRefund(120001, [60000, 60000]), RefundError);
});

// --- refundOrder: service behavior against a stubbed client ---

function setup() {
  const db = openDatabase(":memory:");
  const store = new OrderStore(db);
  const refundCalls: { intentId: string; amount: number }[] = [];
  const client = {
    createRefund: async (intentId: string, amount: number) => {
      refundCalls.push({ intentId, amount });
      return { id: `rfd_${refundCalls.length}`, payment_intent_id: intentId, amount, currency: "AUD", status: "RECEIVED", created_at: "" };
    },
  } as unknown as AirwallexClient;
  const service = new OrderService(store, client);

  const group = store.createGroup({ merchantOrderRef: "rf-test", totalAmount: 1200, currency: "AUD" });
  const s1 = store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_a", amount: 600 });
  const s2 = store.addSlot({ orderGroupId: group.id, airwallexIntentId: "int_b", amount: 600 });
  store.updateSlotStatus(s1.id, "captured");
  store.updateSlotStatus(s2.id, "captured");
  store.updateGroupStatus(group.id, "captured");
  return { store, service, group, refundCalls };
}

test("full refund hits both intents and shows in the view", async () => {
  const { service, group, refundCalls } = setup();
  const view = await service.refundOrder(group.id);
  assert.deepEqual(refundCalls, [
    { intentId: "int_a", amount: 600 },
    { intentId: "int_b", amount: 600 },
  ]);
  assert.equal(view.refunded_amount, 1200);
  assert.deepEqual(view.slots.map((s) => s.refunded_amount), [600, 600]);
});

test("partial refunds accumulate and cannot exceed captured total", async () => {
  const { service, group } = setup();
  await service.refundOrder(group.id, 100);
  const view = await service.refundOrder(group.id, 200);
  assert.equal(view.refunded_amount, 300);
  await assert.rejects(() => service.refundOrder(group.id, 1000), RefundError);
});

test("refund is rejected while the order is not captured", async () => {
  const { store, service } = setup();
  const pending = store.createGroup({ merchantOrderRef: "rf-pending", totalAmount: 500, currency: "AUD" });
  store.addSlot({ orderGroupId: pending.id, airwallexIntentId: "int_c", amount: 500 });
  await assert.rejects(() => service.refundOrder(pending.id), RefundError);
});

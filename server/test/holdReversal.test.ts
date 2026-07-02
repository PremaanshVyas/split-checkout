import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { OrderStore } from "../src/orders/store.js";
import { OrderService } from "../src/orders/service.js";
import type { AirwallexClient } from "../src/airwallex/client.js";
import type { SlotStatus } from "../src/orders/types.js";

/** Airwallex stub: records cancellations, never talks to the network. */
function stubAirwallex() {
  const cancelled: string[] = [];
  const client = {
    cancelPaymentIntent: async (intentId: string) => {
      cancelled.push(intentId);
      return { id: intentId, status: "CANCELLED" };
    },
  } as unknown as AirwallexClient;
  return { client, cancelled };
}

let store: OrderStore;
let service: OrderService;
let cancelled: string[];

function seedGroup(opts: { ageMinutes: number; slotStatuses: SlotStatus[] }) {
  const group = store.createGroup({
    merchantOrderRef: `test-${Math.random().toString(36).slice(2, 8)}`,
    totalAmount: 1200,
    currency: "AUD",
  });
  for (const [i, status] of opts.slotStatuses.entries()) {
    const slot = store.addSlot({
      orderGroupId: group.id,
      airwallexIntentId: `int_${group.merchant_order_ref}_${i}`,
      amount: 600,
    });
    if (status !== "created") store.updateSlotStatus(slot.id, status);
  }
  // Derive the matching group status the way live traffic would have.
  const slots = store.getSlotsForGroup(group.id);
  if (slots.every((s) => s.status === "captured")) store.updateGroupStatus(group.id, "captured");
  else if (slots.every((s) => s.status === "authorized"))
    store.updateGroupStatus(group.id, "authorized");
  else if (slots.some((s) => s.status === "authorized"))
    store.updateGroupStatus(group.id, "partially_authorized");
  // Backdate creation.
  const createdAt = new Date(Date.now() - opts.ageMinutes * 60_000).toISOString();
  // @ts-expect-error reaching into the store's db for test setup only
  store.db.prepare(`UPDATE order_groups SET created_at = ? WHERE id = ?`).run(createdAt, group.id);
  return group;
}

beforeEach(() => {
  const db = openDatabase(":memory:");
  store = new OrderStore(db);
  const stub = stubAirwallex();
  cancelled = stub.cancelled;
  service = new OrderService(store, stub.client);
});

const TTL = 60 * 60_000;

test("stale partially-authorized order: hold is cancelled, group fails", async () => {
  const group = seedGroup({ ageMinutes: 90, slotStatuses: ["authorized", "created"] });
  const swept = await service.expireStaleOrders(TTL);
  assert.equal(swept, 1);
  assert.equal(store.getGroup(group.id)!.status, "failed");
  const slots = store.getSlotsForGroup(group.id);
  assert.deepEqual(
    slots.map((s) => s.status),
    ["cancelled", "cancelled"],
  );
  // Both open intents were reversed upstream, not just marked locally.
  assert.equal(cancelled.length, 2);
});

test("fresh order is left alone", async () => {
  const group = seedGroup({ ageMinutes: 10, slotStatuses: ["authorized", "created"] });
  const swept = await service.expireStaleOrders(TTL);
  assert.equal(swept, 0);
  assert.equal(store.getGroup(group.id)!.status, "partially_authorized");
  assert.equal(cancelled.length, 0);
});

test("captured order is never touched, regardless of age", async () => {
  const group = seedGroup({ ageMinutes: 300, slotStatuses: ["captured", "captured"] });
  const swept = await service.expireStaleOrders(TTL);
  assert.equal(swept, 0);
  assert.equal(store.getGroup(group.id)!.status, "captured");
  assert.equal(cancelled.length, 0);
});

test("abandonOrder cancels only open slots and marks the group failed", async () => {
  const group = seedGroup({ ageMinutes: 5, slotStatuses: ["authorized", "created"] });
  const view = await service.abandonOrder(group.id);
  assert.equal(view.status, "failed");
  assert.equal(cancelled.length, 2);
  const again = await service.abandonOrder(group.id);
  // Idempotent: nothing left to cancel on a second call.
  assert.equal(cancelled.length, 2);
  assert.equal(again.status, "failed");
});

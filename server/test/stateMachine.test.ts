import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveGroupStatus, type PaymentSlot, type SlotStatus } from "../src/orders/types.js";

function slot(status: SlotStatus): PaymentSlot {
  return {
    id: `slot-${status}-${Math.random().toString(36).slice(2, 8)}`,
    order_group_id: "group-1",
    airwallex_intent_id: "int_x",
    amount: 600,
    status,
    last_error_code: null,
    created_at: "",
    updated_at: "",
  };
}

test("no slots → pending", () => {
  assert.equal(deriveGroupStatus([], "pending"), "pending");
});

test("all slots created → pending", () => {
  assert.equal(deriveGroupStatus([slot("created"), slot("created")], "pending"), "pending");
});

test("one hold placed → partially_authorized", () => {
  assert.equal(
    deriveGroupStatus([slot("authorized"), slot("created")], "pending"),
    "partially_authorized",
  );
});

test("all holds placed → authorized", () => {
  assert.equal(
    deriveGroupStatus([slot("authorized"), slot("authorized")], "partially_authorized"),
    "authorized",
  );
});

test("declined slot stays created; group stays partially_authorized on the other hold", () => {
  // A decline does not move the slot to failed; the intent stays open for retry.
  assert.equal(
    deriveGroupStatus([slot("authorized"), slot("created")], "partially_authorized"),
    "partially_authorized",
  );
});

test("both captured → captured", () => {
  assert.equal(
    deriveGroupStatus([slot("captured"), slot("captured")], "authorized"),
    "captured",
  );
});

test("one captured, one still authorized (mid-capture) → authorized, not captured", () => {
  assert.equal(
    deriveGroupStatus([slot("captured"), slot("authorized")], "authorized"),
    "authorized",
  );
});

test("failed group stays failed regardless of slots", () => {
  assert.equal(deriveGroupStatus([slot("authorized"), slot("authorized")], "failed"), "failed");
});

test("scales to N slots (data model is N-ary even though the UI builds 2)", () => {
  assert.equal(
    deriveGroupStatus([slot("authorized"), slot("authorized"), slot("created")], "pending"),
    "partially_authorized",
  );
});

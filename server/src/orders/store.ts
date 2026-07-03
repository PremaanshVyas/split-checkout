import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OrderGroup, OrderGroupStatus, OrderItem, PaymentSlot, SlotStatus } from "./types.js";

export class OrderStore {
  constructor(private readonly db: Database) {}

  createGroup(params: { merchantOrderRef: string; totalAmount: number; currency: string }): OrderGroup {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO order_groups (id, merchant_order_ref, total_amount, currency)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, params.merchantOrderRef, params.totalAmount, params.currency);
    return this.getGroup(id)!;
  }

  addSlot(params: { orderGroupId: string; airwallexIntentId: string; amount: number }): PaymentSlot {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO payment_slots (id, order_group_id, airwallex_intent_id, amount)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, params.orderGroupId, params.airwallexIntentId, params.amount);
    return this.getSlot(id)!;
  }

  getGroup(id: string): OrderGroup | undefined {
    return this.db.prepare(`SELECT * FROM order_groups WHERE id = ?`).get(id) as
      | OrderGroup
      | undefined;
  }

  getSlotByIntentId(airwallexIntentId: string): PaymentSlot | undefined {
    return this.db
      .prepare(`SELECT * FROM payment_slots WHERE airwallex_intent_id = ?`)
      .get(airwallexIntentId) as PaymentSlot | undefined;
  }

  getSlot(id: string): PaymentSlot | undefined {
    return this.db.prepare(`SELECT * FROM payment_slots WHERE id = ?`).get(id) as
      | PaymentSlot
      | undefined;
  }

  getSlotsForGroup(orderGroupId: string): PaymentSlot[] {
    // rowid preserves insertion order; created_at has only millisecond
    // resolution, so same-instant inserts would otherwise tie and sort
    // by random UUID, shuffling "Card 1" and "Card 2".
    return this.db
      .prepare(`SELECT * FROM payment_slots WHERE order_group_id = ? ORDER BY rowid`)
      .all(orderGroupId) as PaymentSlot[];
  }

  updateSlotStatus(id: string, status: SlotStatus, lastErrorCode?: string | null): void {
    this.db
      .prepare(
        `UPDATE payment_slots
         SET status = ?, last_error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      )
      .run(status, lastErrorCode ?? null, id);
  }

  updateSlotIntent(id: string, airwallexIntentId: string): void {
    this.db
      .prepare(
        `UPDATE payment_slots
         SET airwallex_intent_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      )
      .run(airwallexIntentId, id);
  }

  updateGroupStatus(id: string, status: OrderGroupStatus): void {
    this.db.prepare(`UPDATE order_groups SET status = ? WHERE id = ?`).run(status, id);
  }

  addOrderItem(params: {
    orderGroupId: string;
    sku: string;
    name: string;
    unitPrice: number;
    quantity: number;
    color?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO order_items (id, order_group_id, sku, name, unit_price, quantity, color)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        params.orderGroupId,
        params.sku,
        params.name,
        params.unitPrice,
        params.quantity,
        params.color ?? null,
      );
  }

  getItemsForGroup(orderGroupId: string): OrderItem[] {
    return this.db
      .prepare(`SELECT * FROM order_items WHERE order_group_id = ? ORDER BY rowid`)
      .all(orderGroupId) as OrderItem[];
  }

  addRefund(params: {
    slotId: string;
    airwallexRefundId: string;
    amount: number;
    status: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO refunds (id, slot_id, airwallex_refund_id, amount, status)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), params.slotId, params.airwallexRefundId, params.amount, params.status);
  }

  /** Total refunded so far per slot id, for one order group. */
  refundedBySlot(orderGroupId: string): Map<string, number> {
    const rows = this.db
      .prepare(
        `SELECT r.slot_id AS slot_id, SUM(r.amount) AS total
         FROM refunds r JOIN payment_slots s ON s.id = r.slot_id
         WHERE s.order_group_id = ?
         GROUP BY r.slot_id`,
      )
      .all(orderGroupId) as { slot_id: string; total: number }[];
    return new Map(rows.map((r) => [r.slot_id, r.total]));
  }

  /** Uncaptured groups created before the cutoff, candidates for hold reversal. */
  getStaleUncapturedGroups(cutoffIso: string): OrderGroup[] {
    return this.db
      .prepare(
        `SELECT * FROM order_groups
         WHERE status IN ('pending','partially_authorized','authorized')
           AND created_at < ?`,
      )
      .all(cutoffIso) as OrderGroup[];
  }
}

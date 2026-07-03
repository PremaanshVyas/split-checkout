import { randomUUID } from "node:crypto";
import type { AirwallexClient } from "../airwallex/client.js";
import { AirwallexApiError } from "../airwallex/client.js";
import type { PaymentIntent } from "../airwallex/types.js";
import { getProduct, type Product } from "../catalog.js";
import { friendlyDeclineMessage } from "./errorMessages.js";
import type { MandateStore, MandateView } from "./mandates.js";
import type { OrderStore } from "./store.js";
import type { OrderGroup, PaymentSlot } from "./types.js";
import { deriveGroupStatus } from "./types.js";

export interface OrderItemRequest {
  sku: string;
  quantity?: number;
  color?: string;
}

export interface OrderItemView {
  sku: string;
  name: string;
  unit_price: number;
  quantity: number;
  color: string | null;
}

export interface SlotView {
  id: string;
  amount: number;
  status: PaymentSlot["status"];
  intent_id: string;
  client_secret?: string;
  last_error_code: string | null;
  error_message: string | null;
  refunded_amount: number;
}

export interface OrderView {
  id: string;
  merchant_order_ref: string;
  total_amount: number;
  currency: string;
  status: OrderGroup["status"];
  refunded_amount: number;
  items: OrderItemView[];
  slots: SlotView[];
}

export class SplitAmountError extends Error {}
export class RefundError extends Error {}

/**
 * Pro-rata refund allocation, exact to the cent. Distributes `requestedCents`
 * across slots proportionally to each slot's remaining refundable amount;
 * rounding shortfall goes to the largest remaining slot first so the parts
 * always sum to the request. Exported for direct unit testing.
 */
export function allocateRefund(
  requestedCents: number,
  availableCents: number[],
): number[] {
  const totalAvailable = availableCents.reduce((a, b) => a + b, 0);
  if (requestedCents > totalAvailable) {
    throw new RefundError(
      `Refund of ${requestedCents} exceeds refundable ${totalAvailable} (in cents).`,
    );
  }
  const allocations = availableCents.map((avail) =>
    Math.min(avail, Math.floor((requestedCents * avail) / totalAvailable)),
  );
  let shortfall = requestedCents - allocations.reduce((a, b) => a + b, 0);
  // Assign leftover cents to slots with headroom, largest headroom first.
  const order = availableCents
    .map((avail, i) => ({ headroom: avail - allocations[i]!, i }))
    .sort((a, b) => b.headroom - a.headroom);
  for (const { headroom, i } of order) {
    if (shortfall === 0) break;
    const add = Math.min(headroom, shortfall);
    allocations[i]! += add;
    shortfall -= add;
  }
  return allocations;
}

export class OrderService {
  constructor(
    private readonly store: OrderStore,
    private readonly airwallex: AirwallexClient,
    private readonly mandates?: MandateStore,
  ) {}

  /** Catalog total for a basket, in cents. Validation happens at order creation. */
  cartTotalCents(items: OrderItemRequest[]): number {
    let total = 0;
    for (const item of items) {
      const product = getProduct(item.sku);
      if (!product) throw new SplitAmountError(`Unknown product: ${item.sku}`);
      total += Math.round(product.price * 100) * (item.quantity ?? 1);
    }
    return total;
  }

  /**
   * Mandate-backed agent checkout: the agent presents a mandate code, never
   * a card. The mandate gates the spend (budget, expiry, revocation) before
   * any intent is created, and the budget is decremented only when the
   * order actually captures; a declined card costs nothing.
   */
  async mandateCheckout(
    code: string,
    items: OrderItemRequest[],
    splits?: number[],
  ): Promise<{ order: OrderView; mandate: MandateView }> {
    if (!this.mandates) throw new Error("Mandates are not configured.");
    const totalCents = this.cartTotalCents(items);
    const { pans } = this.mandates.authorizeSpend(code, totalCents);

    let parts = splits;
    if (parts === undefined) {
      // Even split across the mandate's cards, exact to the cent.
      const base = Math.floor(totalCents / pans.length);
      parts = pans.map((_, i) => (base + (i < totalCents - base * pans.length ? 1 : 0)) / 100);
    } else if (parts.length !== pans.length) {
      throw new SplitAmountError(
        `This mandate is backed by ${pans.length} card(s); provide ${pans.length} split part(s) or omit splits.`,
      );
    }

    const order = await this.agentCheckout(items, parts, pans.map((pan) => ({ pan })));
    if (order.status === "captured") {
      this.mandates.recordSpend(code, totalCents);
    }
    return { order, mandate: this.mandates.status(code) };
  }

  /**
   * One order → N PaymentIntents, one per split amount. A single-card
   * purchase is simply a one-slot order sharing the same state machine and
   * capture gate, which is what makes decline recovery cheap: a failed
   * single-card order converts to a two-slot one. The client only
   * proposes skus, quantities, and a split; totals always come from the
   * server-side catalog, and the parts must sum to the total exactly.
   */
  async createSplitOrder(items: OrderItemRequest[], splits: number[]): Promise<OrderView> {
    if (items.length < 1) {
      throw new SplitAmountError("An order needs at least one item.");
    }
    let totalCents = 0;
    const lines: { product: Product; quantity: number; color?: string }[] = [];
    for (const item of items) {
      const product = getProduct(item.sku);
      if (!product) {
        throw new SplitAmountError(`Unknown product: ${item.sku}`);
      }
      const quantity = item.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        throw new SplitAmountError(`Quantity for ${item.sku} must be a whole number from 1 to 10.`);
      }
      if (product.stock < quantity) {
        throw new SplitAmountError(
          product.stock === 0
            ? `${product.name} is out of stock.`
            : `Only ${product.stock} of ${product.name} in stock.`,
        );
      }
      if (item.color !== undefined && !product.colors.includes(item.color)) {
        throw new SplitAmountError(
          `${product.name} comes in: ${product.colors.join(", ")} (not "${item.color}").`,
        );
      }
      totalCents += Math.round(product.price * 100) * quantity;
      lines.push({ product, quantity, ...(item.color !== undefined ? { color: item.color } : {}) });
    }

    if (splits.length < 1) {
      throw new SplitAmountError("An order needs at least one payment part.");
    }
    if (splits.some((amount) => !Number.isFinite(amount) || amount < 1)) {
      throw new SplitAmountError("Each part must be at least 1.00.");
    }
    // Work in cents to avoid float drift when validating the sum.
    const sumCents = splits.reduce((acc, amount) => acc + Math.round(amount * 100), 0);
    if (sumCents !== totalCents) {
      throw new SplitAmountError(
        `Parts must sum to ${(totalCents / 100).toFixed(2)} AUD (the cart total).`,
      );
    }

    const merchantOrderRef = `split-${randomUUID().slice(0, 8)}`;
    const group = this.store.createGroup({
      merchantOrderRef,
      totalAmount: totalCents / 100,
      currency: "AUD",
    });
    for (const line of lines) {
      this.store.addOrderItem({
        orderGroupId: group.id,
        sku: line.product.sku,
        name: line.product.name,
        unitPrice: line.product.price,
        quantity: line.quantity,
        ...(line.color !== undefined ? { color: line.color } : {}),
      });
    }

    const secrets = new Map<string, string>();
    const total = (totalCents / 100).toFixed(2);
    for (const [index, amount] of splits.entries()) {
      // Every part is self-describing wherever it surfaces: the shopper's
      // bank statement says which part of how many ("AURORA 1/2"), and the
      // intent's metadata tells anyone opening it in the Airwallex
      // dashboard what order it belongs to, the full total, and where its
      // siblings are. Two transactions, one legible order.
      const intent = await this.airwallex.createPaymentIntent({
        amount,
        currency: "AUD",
        merchantOrderId: `${merchantOrderRef}-card${index + 1}`,
        descriptor: splits.length > 1 ? `AURORA ${index + 1}/${splits.length}` : "AURORA & CO",
        metadata: {
          order_group_id: group.id,
          order_ref: merchantOrderRef,
          split_part: `${index + 1} of ${splits.length}`,
          order_total_aud: total,
          note:
            splits.length > 1
              ? `Split-tender: part ${index + 1} of ${splits.length} of one ${total} AUD order. Siblings share order_ref ${merchantOrderRef}.`
              : "Single-card order.",
        },
      });
      const slot = this.store.addSlot({
        orderGroupId: group.id,
        airwallexIntentId: intent.id,
        amount,
      });
      if (intent.client_secret) secrets.set(slot.id, intent.client_secret);
    }
    return this.view(group.id, secrets);
  }

  /**
   * Called after a client-side confirm resolves OR rejects. We never
   * trust the client callback: the true status comes from retrieving
   * the intent server-side. If this verification completes the set of
   * holds, the capture-together gate fires.
   */
  async verifySlot(orderGroupId: string, slotId: string, clientErrorCode?: string): Promise<OrderView> {
    const slot = this.requireSlot(orderGroupId, slotId);
    const intent = await this.airwallex.retrievePaymentIntent(slot.airwallex_intent_id);
    this.applyIntentStatus(slot, intent, clientErrorCode);
    this.recomputeGroupStatus(orderGroupId);
    await this.captureIfAllHeld(orderGroupId);
    return this.view(orderGroupId);
  }

  /**
   * The capture-together gate: the one genuinely subtle piece of this
   * system. Nothing is captured until EVERY slot in the group holds an
   * authorization (REQUIRES_CAPTURE). Only then do we capture each
   * intent, sequentially. A capture failure leaves the group in
   * `authorized` with the error recorded, so re-running the gate (any
   * subsequent verify call) retries only the uncaptured intents.
   */
  private async captureIfAllHeld(orderGroupId: string): Promise<void> {
    const slots = this.store.getSlotsForGroup(orderGroupId);
    const allHeld = slots.every((s) => s.status === "authorized" || s.status === "captured");
    if (!allHeld) return;

    for (const slot of slots) {
      if (slot.status === "captured") continue;
      try {
        const intent = await this.airwallex.capturePaymentIntent(slot.airwallex_intent_id);
        if (intent.status === "SUCCEEDED") {
          this.store.updateSlotStatus(slot.id, "captured");
        }
      } catch (err) {
        if (err instanceof AirwallexApiError) {
          this.store.updateSlotStatus(slot.id, "authorized", err.code);
          break; // stop; the group stays `authorized` and the gate can re-run
        }
        throw err;
      }
    }
    this.recomputeGroupStatus(orderGroupId);
  }

  /**
   * Apply an intent status delivered by webhook. Same transitions as the
   * polling path; whichever channel reports first wins and the other is an
   * idempotent no-op. Returns false for intents we don't track.
   */
  async processIntentUpdate(intent: PaymentIntent): Promise<boolean> {
    const slot = this.store.getSlotByIntentId(intent.id);
    if (!slot) return false;
    this.applyIntentStatus(slot, intent);
    this.recomputeGroupStatus(slot.order_group_id);
    await this.captureIfAllHeld(slot.order_group_id);
    return true;
  }

  /** Client secrets expire after 60 minutes; re-retrieving issues a fresh one. */
  async refreshSlotSecret(orderGroupId: string, slotId: string): Promise<{ client_secret: string }> {
    const slot = this.requireSlot(orderGroupId, slotId);
    const intent = await this.airwallex.retrievePaymentIntent(slot.airwallex_intent_id);
    if (!intent.client_secret) {
      throw new Error(`Intent ${intent.id} returned no client_secret`);
    }
    return { client_secret: intent.client_secret };
  }

  /** Abandon the order: cancel every uncaptured intent, mark the group failed. */
  async abandonOrder(orderGroupId: string, reason = "order abandoned"): Promise<OrderView> {
    const slots = this.store.getSlotsForGroup(orderGroupId);
    for (const slot of slots) {
      if (slot.status === "created" || slot.status === "authorized") {
        try {
          await this.airwallex.cancelPaymentIntent(slot.airwallex_intent_id, reason);
          this.store.updateSlotStatus(slot.id, "cancelled");
        } catch (err) {
          // A hold that fails to cancel simply expires on its own; record and move on.
          if (err instanceof AirwallexApiError) {
            this.store.updateSlotStatus(slot.id, slot.status, err.code);
          } else {
            throw err;
          }
        }
      }
    }
    this.store.updateGroupStatus(orderGroupId, "failed");
    return this.view(orderGroupId);
  }

  /**
   * Hold-reversal sweep. Visa's authorization best practices require
   * reversing approved holds within 24 hours once a transaction won't
   * complete, and fine authorizations that are never captured or
   * reversed. Any order still uncaptured after the TTL is treated as
   * walked-away: its holds are cancelled explicitly rather than left
   * to expire. Returns the number of groups reversed.
   */
  async expireStaleOrders(maxAgeMs: number): Promise<number> {
    const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();
    const stale = this.store.getStaleUncapturedGroups(cutoffIso);
    for (const group of stale) {
      await this.abandonOrder(group.id, "order expired - releasing holds");
    }
    return stale.length;
  }

  /**
   * Refund a captured order, allocating pro-rata across its slots. This is
   * the question every payments engineer asks first about split payment
   * ("who gets the refund?"), answered concretely: proportional to what
   * each card actually paid, exact to the cent. Omitting `amount` refunds
   * everything still refundable.
   */
  async refundOrder(orderGroupId: string, amount?: number): Promise<OrderView> {
    const group = this.requireGroup(orderGroupId);
    if (group.status !== "captured") {
      throw new RefundError("Only fully captured orders can be refunded.");
    }
    const slots = this.store.getSlotsForGroup(orderGroupId);
    const refunded = this.store.refundedBySlot(orderGroupId);
    const availableCents = slots.map(
      (slot) => Math.round(slot.amount * 100) - Math.round((refunded.get(slot.id) ?? 0) * 100),
    );
    const totalAvailableCents = availableCents.reduce((a, b) => a + b, 0);
    const requestedCents = amount === undefined ? totalAvailableCents : Math.round(amount * 100);
    if (requestedCents <= 0 || requestedCents > totalAvailableCents) {
      throw new RefundError(
        `Refund must be between 0.01 and ${(totalAvailableCents / 100).toFixed(2)} ${group.currency}.`,
      );
    }

    const allocations = allocateRefund(requestedCents, availableCents);
    for (const [i, slot] of slots.entries()) {
      const cents = allocations[i]!;
      if (cents === 0) continue;
      const refund = await this.airwallex.createRefund(
        slot.airwallex_intent_id,
        cents / 100,
        "split-checkout demo refund",
      );
      this.store.addRefund({
        slotId: slot.id,
        airwallexRefundId: refund.id,
        amount: cents / 100,
        status: refund.status,
      });
    }
    return this.view(orderGroupId);
  }

  /**
   * Agent-driven checkout: the whole split flow in one server-side call,
   * for the MCP demo. Creates the order group, confirms each slot with
   * its (published test) card via the Native API, verifies true statuses,
   * and lets the same capture-together gate decide the outcome. Declines
   * follow the exact semantics of the browser flow: the slot stays open,
   * nothing is captured unless every card authorizes.
   */
  async agentCheckout(
    items: OrderItemRequest[],
    splits: number[],
    cards: { pan: string; name?: string }[],
  ): Promise<OrderView> {
    if (cards.length !== splits.length) {
      throw new SplitAmountError("Provide exactly one card per split part.");
    }
    const order = await this.createSplitOrder(items, splits);
    for (const [i, slotView] of order.slots.entries()) {
      const slot = this.requireSlot(order.id, slotView.id);
      try {
        await this.airwallex.confirmPaymentIntentWithCard(slot.airwallex_intent_id, {
          number: cards[i]!.pan,
          expiry_month: "12",
          expiry_year: "2030",
          cvc: "123",
          name: cards[i]!.name ?? "Agent Checkout Demo",
        });
      } catch (err) {
        if (err instanceof AirwallexApiError) {
          this.store.updateSlotStatus(slot.id, "created", err.code);
          continue; // decline: slot stays open, gate will not fire
        }
        throw err;
      }
      const intent = await this.airwallex.retrievePaymentIntent(slot.airwallex_intent_id);
      this.applyIntentStatus(slot, intent);
      this.recomputeGroupStatus(order.id);
    }
    await this.captureIfAllHeld(order.id);
    return this.view(order.id);
  }

  getOrder(orderGroupId: string): OrderView {
    return this.view(orderGroupId);
  }

  private applyIntentStatus(slot: PaymentSlot, intent: PaymentIntent, clientErrorCode?: string): void {
    // Terminal slot states never regress. Webhooks and polling race, and
    // deliveries can arrive late or duplicated; a stale REQUIRES_CAPTURE
    // must not un-capture a slot (or trigger a second capture attempt).
    if (slot.status === "captured" || slot.status === "cancelled") return;
    switch (intent.status) {
      case "REQUIRES_CAPTURE":
        this.store.updateSlotStatus(slot.id, "authorized", null);
        break;
      case "SUCCEEDED":
        this.store.updateSlotStatus(slot.id, "captured", null);
        break;
      case "CANCELLED":
        this.store.updateSlotStatus(slot.id, "cancelled");
        break;
      default: {
        // Declined confirms leave the intent open (REQUIRES_PAYMENT_METHOD):
        // the slot stays `created` and the shopper retries in place. Prefer
        // the issuer code from the server-side attempt over the client's.
        const code =
          intent.latest_payment_attempt?.provider_original_response_code ?? clientErrorCode ?? null;
        this.store.updateSlotStatus(slot.id, "created", code);
      }
    }
  }

  private recomputeGroupStatus(orderGroupId: string): void {
    const group = this.requireGroup(orderGroupId);
    const slots = this.store.getSlotsForGroup(orderGroupId);
    const next = deriveGroupStatus(slots, group.status);
    if (next !== group.status) {
      this.store.updateGroupStatus(orderGroupId, next);
    }
  }

  private view(orderGroupId: string, secrets?: Map<string, string>): OrderView {
    const group = this.requireGroup(orderGroupId);
    const slots = this.store.getSlotsForGroup(orderGroupId);
    const refunded = this.store.refundedBySlot(orderGroupId);
    const slotViews = slots.map((slot) => ({
      id: slot.id,
      amount: slot.amount,
      status: slot.status,
      intent_id: slot.airwallex_intent_id,
      ...(secrets?.has(slot.id) ? { client_secret: secrets.get(slot.id)! } : {}),
      last_error_code: slot.last_error_code,
      error_message: friendlyDeclineMessage(slot.last_error_code),
      refunded_amount: refunded.get(slot.id) ?? 0,
    }));
    return {
      id: group.id,
      merchant_order_ref: group.merchant_order_ref,
      total_amount: group.total_amount,
      currency: group.currency,
      status: group.status,
      refunded_amount: slotViews.reduce((acc, s) => acc + s.refunded_amount, 0),
      items: this.store.getItemsForGroup(orderGroupId).map((item) => ({
        sku: item.sku,
        name: item.name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        color: item.color,
      })),
      slots: slotViews,
    };
  }

  private requireGroup(id: string): OrderGroup {
    const group = this.store.getGroup(id);
    if (!group) throw new NotFoundError(`Order group ${id} not found`);
    return group;
  }

  private requireSlot(orderGroupId: string, slotId: string): PaymentSlot {
    const slot = this.store.getSlot(slotId);
    if (!slot || slot.order_group_id !== orderGroupId) {
      throw new NotFoundError(`Payment slot ${slotId} not found in order ${orderGroupId}`);
    }
    return slot;
  }
}

export class NotFoundError extends Error {}

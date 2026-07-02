import { randomUUID } from "node:crypto";
import type { AirwallexClient } from "../airwallex/client.js";
import { AirwallexApiError } from "../airwallex/client.js";
import type { PaymentIntent } from "../airwallex/types.js";
import { getProduct } from "../catalog.js";
import { friendlyDeclineMessage } from "./errorMessages.js";
import type { OrderStore } from "./store.js";
import type { OrderGroup, PaymentSlot } from "./types.js";
import { deriveGroupStatus } from "./types.js";

export interface SlotView {
  id: string;
  amount: number;
  status: PaymentSlot["status"];
  intent_id: string;
  client_secret?: string;
  last_error_code: string | null;
  error_message: string | null;
}

export interface OrderView {
  id: string;
  merchant_order_ref: string;
  total_amount: number;
  currency: string;
  status: OrderGroup["status"];
  slots: SlotView[];
}

export class SplitAmountError extends Error {}

export class OrderService {
  constructor(
    private readonly store: OrderStore,
    private readonly airwallex: AirwallexClient,
  ) {}

  /**
   * One order → N PaymentIntents, one per split amount. A single-card
   * purchase is simply a one-slot order sharing the same state machine and
   * capture gate, which is what makes decline recovery cheap: a failed
   * single-card order converts to a two-slot one. The client only
   * proposes a product and how to split it; the total is always the
   * server-side catalog price, and the parts must sum to it exactly.
   */
  async createSplitOrder(sku: string, splits: number[]): Promise<OrderView> {
    const product = getProduct(sku);
    if (!product) {
      throw new SplitAmountError(`Unknown product: ${sku}`);
    }
    if (splits.length < 1) {
      throw new SplitAmountError("An order needs at least one part.");
    }
    if (splits.some((amount) => !Number.isFinite(amount) || amount < 1)) {
      throw new SplitAmountError("Each part must be at least 1.00.");
    }
    // Work in cents to avoid float drift when validating the sum.
    const sumCents = splits.reduce((acc, amount) => acc + Math.round(amount * 100), 0);
    if (sumCents !== Math.round(product.price * 100)) {
      throw new SplitAmountError(
        `Parts must sum to ${product.price.toFixed(2)} ${product.currency}.`,
      );
    }

    const merchantOrderRef = `split-${randomUUID().slice(0, 8)}`;
    const group = this.store.createGroup({
      merchantOrderRef,
      totalAmount: product.price,
      currency: product.currency,
    });

    const secrets = new Map<string, string>();
    for (const [index, amount] of splits.entries()) {
      const intent = await this.airwallex.createPaymentIntent({
        amount,
        currency: product.currency,
        merchantOrderId: `${merchantOrderRef}-card${index + 1}`,
        metadata: { order_group_id: group.id, slot_index: String(index + 1), sku },
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
    return {
      id: group.id,
      merchant_order_ref: group.merchant_order_ref,
      total_amount: group.total_amount,
      currency: group.currency,
      status: group.status,
      slots: slots.map((slot) => ({
        id: slot.id,
        amount: slot.amount,
        status: slot.status,
        intent_id: slot.airwallex_intent_id,
        ...(secrets?.has(slot.id) ? { client_secret: secrets.get(slot.id)! } : {}),
        last_error_code: slot.last_error_code,
        error_message: friendlyDeclineMessage(slot.last_error_code),
      })),
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

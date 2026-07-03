import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import { resolveTestCard } from "./testCards.js";

/**
 * Spending mandates: the delegation layer between a human and an agent.
 * A mandate is a scoped, expiring, amount-capped authorization backed by
 * one or more (test) cards. The agent holds only the mandate code; the
 * cards never pass through it, and the server enforces the budget.
 *
 * The shape deliberately mirrors what the field converged on in 2025-26:
 * ACP's `allowance` (max_amount, expires_at, scope), AP2's user-signed
 * mandates, and the card networks' agentic tokens. Airwallex's Airi
 * roadmap describes exactly this: delegated agent payments with spend
 * limits. See DECISIONS.md.
 */

export interface MandateRow {
  id: string;
  code: string;
  max_amount: number;
  remaining: number;
  currency: string;
  cards: string;
  expires_at: string;
  status: "active" | "revoked";
  created_at: string;
}

export interface MandateView {
  code: string;
  max_amount: number;
  remaining: number;
  currency: string;
  card_count: number;
  expires_at: string;
  /** active | revoked | expired | exhausted */
  state: string;
  created_at: string;
}

export class MandateError extends Error {}

const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 24 * 60;

export class MandateStore {
  constructor(private readonly db: Database) {}

  create(params: { cards: string[]; maxAmount: number; ttlMinutes: number }): MandateView {
    if (params.cards.length < 1 || params.cards.length > 4) {
      throw new MandateError("A mandate needs between 1 and 4 cards.");
    }
    const resolved: string[] = [];
    for (const card of params.cards) {
      const pan = resolveTestCard(card);
      if (!pan) {
        throw new MandateError(
          `"${card}" is not an accepted card. Mandates accept Airwallex's published test cards or their aliases.`,
        );
      }
      resolved.push(pan);
    }
    if (!Number.isFinite(params.maxAmount) || params.maxAmount < 1 || params.maxAmount > 100000) {
      throw new MandateError("Budget must be between 1.00 and 100,000.00 AUD.");
    }
    if (
      !Number.isFinite(params.ttlMinutes) ||
      params.ttlMinutes < MIN_TTL_MINUTES ||
      params.ttlMinutes > MAX_TTL_MINUTES
    ) {
      throw new MandateError(
        `Expiry must be between ${MIN_TTL_MINUTES} minutes and 24 hours.`,
      );
    }
    const amount = Math.round(params.maxAmount * 100) / 100;
    const code = `mdt-${randomBytes(4).toString("hex")}`;
    const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000).toISOString();
    this.db
      .prepare(
        `INSERT INTO mandates (id, code, max_amount, remaining, cards, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), code, amount, amount, JSON.stringify(resolved), expiresAt);
    return this.view(this.byCode(code)!);
  }

  byCode(code: string): MandateRow | undefined {
    return this.db.prepare(`SELECT * FROM mandates WHERE code = ?`).get(code.trim()) as
      | MandateRow
      | undefined;
  }

  status(code: string): MandateView {
    const row = this.byCode(code);
    if (!row) throw new MandateError(`No mandate with code ${code}.`);
    return this.view(row);
  }

  revoke(code: string): MandateView {
    const row = this.byCode(code);
    if (!row) throw new MandateError(`No mandate with code ${code}.`);
    this.db.prepare(`UPDATE mandates SET status = 'revoked' WHERE id = ?`).run(row.id);
    return this.view(this.byCode(code)!);
  }

  /**
   * Validate a spend against the mandate and return the backing cards.
   * Throws with an agent-readable reason if the mandate cannot cover it.
   */
  authorizeSpend(code: string, totalCents: number): { pans: string[] } {
    const row = this.byCode(code);
    if (!row) throw new MandateError(`No mandate with code ${code}.`);
    const state = this.stateOf(row);
    if (state === "revoked") throw new MandateError("This mandate has been revoked.");
    if (state === "expired") throw new MandateError("This mandate has expired.");
    if (state === "exhausted") throw new MandateError("This mandate's budget is fully spent.");
    const remainingCents = Math.round(row.remaining * 100);
    if (totalCents > remainingCents) {
      throw new MandateError(
        `This purchase (${(totalCents / 100).toFixed(2)} ${row.currency}) exceeds the mandate's remaining budget of ${row.remaining.toFixed(2)} ${row.currency}.`,
      );
    }
    return { pans: JSON.parse(row.cards) as string[] };
  }

  /** Record a captured spend. Refunds deliberately do NOT restore budget. */
  recordSpend(code: string, amountCents: number): void {
    const row = this.byCode(code);
    if (!row) return;
    const remaining = Math.max(0, Math.round(row.remaining * 100) - amountCents) / 100;
    this.db.prepare(`UPDATE mandates SET remaining = ? WHERE id = ?`).run(remaining, row.id);
  }

  private stateOf(row: MandateRow): string {
    if (row.status === "revoked") return "revoked";
    if (Date.parse(row.expires_at) < Date.now()) return "expired";
    if (row.remaining <= 0) return "exhausted";
    return "active";
  }

  private view(row: MandateRow): MandateView {
    return {
      code: row.code,
      max_amount: row.max_amount,
      remaining: row.remaining,
      currency: row.currency,
      card_count: (JSON.parse(row.cards) as string[]).length,
      expires_at: row.expires_at,
      state: this.stateOf(row),
      created_at: row.created_at,
    };
  }
}

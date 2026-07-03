#!/usr/bin/env node
/**
 * MCP server for the split-checkout demo. Gives an AI agent tools to browse
 * the demo store and complete a purchase split across multiple cards on
 * Airwallex's sandbox: authorize every card, capture together only if all
 * holds succeed, refund pro-rata. Test cards only; no real money exists
 * anywhere in this system.
 *
 * Point it at a running instance with SPLIT_CHECKOUT_URL (defaults to the
 * hosted demo).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.SPLIT_CHECKOUT_URL ?? "https://split-checkout-demo.fly.dev").replace(/\/$/, "");

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body;
}

function orderSummary(order) {
  return {
    order_id: order.id,
    order_ref: order.merchant_order_ref,
    status: order.status,
    total: `${order.total_amount} ${order.currency}`,
    refunded: order.refunded_amount > 0 ? `${order.refunded_amount} ${order.currency}` : undefined,
    cards: order.slots.map((s, i) => ({
      card: i + 1,
      amount: s.amount,
      status: s.status,
      airwallex_intent_id: s.intent_id,
      refunded: s.refunded_amount > 0 ? s.refunded_amount : undefined,
      error: s.error_message ?? undefined,
    })),
  };
}

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

const server = new McpServer({ name: "split-checkout", version: "0.1.0" });

server.tool(
  "list_products",
  "List the demo store's products (sku, name, price). Prices are in AUD on the Airwallex sandbox.",
  {},
  async () => asText(await api("/api/products")),
);

server.tool(
  "split_purchase",
  "Buy a product with the payment split across multiple cards. Every card is authorized without being charged; capture happens together only if ALL holds succeed, so a declined card never strands a charged one. splits must sum exactly to the product price. cards accepts aliases: 'success', 'success_mastercard', 'decline', 'insufficient_funds' (declines only on an $80.51 part), '3ds_challenge' (cannot complete server-side), or published Airwallex test PANs. Returns the order with real sandbox PaymentIntent ids.",
  {
    sku: z.string().describe("Product sku from list_products"),
    splits: z.array(z.number()).min(1).describe("Amount per card; must sum to the product price"),
    cards: z.array(z.string()).min(1).describe("One card (alias or test PAN) per split part"),
  },
  async ({ sku, splits, cards }) => {
    const order = await api("/api/agent/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, splits, cards }),
    });
    return asText(orderSummary(order));
  },
);

server.tool(
  "order_status",
  "Get the current state of an order group and its per-card slots.",
  { order_id: z.string() },
  async ({ order_id }) => asText(orderSummary(await api(`/api/orders/${order_id}`))),
);

server.tool(
  "refund_order",
  "Refund a captured order. Omit amount for a full refund. The amount is allocated pro-rata across the cards in proportion to what each paid, exact to the cent, as real Airwallex sandbox refunds.",
  { order_id: z.string(), amount: z.number().optional() },
  async ({ order_id, amount }) =>
    asText(
      orderSummary(
        await api(`/api/orders/${order_id}/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(amount === undefined ? {} : { amount }),
        }),
      ),
    ),
);

server.tool(
  "cancel_order",
  "Abandon an uncaptured order: every authorization hold is explicitly reversed (cancelled at Airwallex), nothing is charged.",
  { order_id: z.string() },
  async ({ order_id }) =>
    asText(orderSummary(await api(`/api/orders/${order_id}/abandon`, { method: "POST" }))),
);

const transport = new StdioServerTransport();
await server.connect(transport);

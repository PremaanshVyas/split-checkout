import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router, json } from "express";
import { z } from "zod";
import { getProduct, searchProducts } from "../catalog.js";
import type { OrderItemRequest, OrderService, OrderView } from "../orders/service.js";
import { TEST_CARD_ALIASES, resolveTestCard } from "../orders/testCards.js";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless) hosted by the demo
 * itself: add the deployment's /mcp URL to Claude or Cursor and an agent
 * can browse the catalog and complete split-card purchases with no
 * install. Tool shapes follow the conventions the field is converging on
 * (Shopify storefront MCP's search_catalog/get_product; browse tools are
 * open while the payment tool is hard-gated to published test cards).
 */

function orderSummary(order: OrderView) {
  return {
    order_id: order.id,
    order_ref: order.merchant_order_ref,
    status: order.status,
    total: `${order.total_amount} ${order.currency}`,
    refunded: order.refunded_amount > 0 ? `${order.refunded_amount} ${order.currency}` : undefined,
    items: order.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      color: i.color ?? undefined,
    })),
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

const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function buildMcpServer(service: OrderService): McpServer {
  const server = new McpServer({ name: "split-checkout", version: "1.0.0" });

  server.tool(
    "search_catalog",
    "Search the demo store's catalog. All filters are optional and combinable. Returns matching products (sku, name, category, price in AUD, colors, rating, stock) plus facet counts so you can refine.",
    {
      query: z.string().optional().describe("Free-text search over names, descriptions, tags"),
      category: z
        .string()
        .optional()
        .describe(
          "One of: espresso machines, grinders, kettles, brewers, scales, accessories, bundles",
        ),
      color: z.string().optional().describe("e.g. matte black, brushed steel, white, walnut"),
      min_price: z.number().optional(),
      max_price: z.number().optional(),
      in_stock: z.boolean().optional().describe("Only products currently in stock"),
      sort: z.enum(["price_asc", "price_desc", "rating", "reviews"]).optional(),
    },
    async ({ query, category, color, min_price, max_price, in_stock, sort }) => {
      const result = searchProducts({
        ...(query !== undefined ? { q: query } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(min_price !== undefined ? { minPrice: min_price } : {}),
        ...(max_price !== undefined ? { maxPrice: max_price } : {}),
        ...(in_stock !== undefined ? { inStock: in_stock } : {}),
        ...(sort !== undefined ? { sort } : {}),
      });
      return asText({
        total: result.total,
        products: result.products.map((p) => ({
          sku: p.sku,
          name: p.name,
          category: p.category,
          price: p.price,
          currency: p.currency,
          colors: p.colors,
          rating: p.rating,
          reviews: p.reviews,
          stock: p.stock,
          tagline: p.tagline,
        })),
        facets: result.facets,
      });
    },
  );

  server.tool(
    "get_product",
    "Full details for one product by sku, including description, color options, stock, and tags.",
    { sku: z.string() },
    async ({ sku }) => {
      const product = getProduct(sku);
      if (!product) return asText({ error: `No product with sku ${sku}` });
      return asText(product);
    },
  );

  server.tool(
    "split_purchase",
    "Buy one or more products with payment split across multiple cards. Every card is authorized without being charged; capture happens together only if ALL holds succeed, so a declined card never strands a charged one. Provide one card per split part. If splits is omitted, the cart total is divided evenly across the cards. cards accepts aliases: 'success', 'success_mastercard', 'decline', 'insufficient_funds' (declines only on an $80.51 part), '3ds_challenge' (cannot complete without a browser), or published Airwallex test PANs. Real card numbers are rejected. Returns the order with real sandbox PaymentIntent ids.",
    {
      items: z
        .array(
          z.object({
            sku: z.string(),
            quantity: z.number().int().min(1).max(10).optional(),
            color: z.string().optional().describe("Must be one of the product's colors"),
          }),
        )
        .min(1),
      cards: z.array(z.string()).min(1).describe("One card (alias or test PAN) per split part"),
      splits: z
        .array(z.number())
        .optional()
        .describe("Amount per card; must sum to the cart total. Omit to split evenly."),
    },
    async ({ items, cards, splits }) => {
      const resolved: { pan: string }[] = [];
      for (const card of cards) {
        const pan = resolveTestCard(card);
        if (!pan) {
          return asText({
            error:
              `"${card}" is not an accepted card. Only Airwallex's published sandbox test cards ` +
              `or these aliases work: ${Object.keys(TEST_CARD_ALIASES).join(", ")}.`,
          });
        }
        resolved.push({ pan });
      }
      let parts = splits;
      if (!parts) {
        // Even split, exact to the cent: remainder cents go to the first cards.
        let totalCents = 0;
        for (const item of items) {
          const product = getProduct(item.sku);
          if (!product) return asText({ error: `No product with sku ${item.sku}` });
          totalCents += Math.round(product.price * 100) * (item.quantity ?? 1);
        }
        const base = Math.floor(totalCents / cards.length);
        parts = cards.map(
          (_, i) => (base + (i < totalCents - base * cards.length ? 1 : 0)) / 100,
        );
      }
      const cleanItems: OrderItemRequest[] = items.map((i) => ({
        sku: i.sku,
        ...(i.quantity !== undefined ? { quantity: i.quantity } : {}),
        ...(i.color !== undefined ? { color: i.color } : {}),
      }));
      const order = await service.agentCheckout(cleanItems, parts, resolved);
      return asText(orderSummary(order));
    },
  );

  server.tool(
    "order_status",
    "Current state of an order: items, per-card payment slots, refunds.",
    { order_id: z.string() },
    async ({ order_id }) => asText(orderSummary(service.getOrder(order_id))),
  );

  server.tool(
    "refund_order",
    "Refund a captured order. Omit amount for a full refund. The amount is allocated pro-rata across the cards in proportion to what each paid, exact to the cent, as real Airwallex sandbox refunds.",
    { order_id: z.string(), amount: z.number().optional() },
    async ({ order_id, amount }) => asText(orderSummary(await service.refundOrder(order_id, amount))),
  );

  server.tool(
    "cancel_order",
    "Abandon an uncaptured order: every authorization hold is explicitly reversed at Airwallex, nothing is charged.",
    { order_id: z.string() },
    async ({ order_id }) => asText(orderSummary(await service.abandonOrder(order_id))),
  );

  return server;
}

/** Stateless Streamable HTTP: one server+transport pair per request. */
export function mcpRouter(service: OrderService): Router {
  const router = Router();

  router.post("/mcp", json(), async (req, res) => {
    const server = buildMcpServer(service);
    // The SDK's types are not authored for exactOptionalPropertyTypes;
    // sessionIdGenerator: undefined is the documented stateless mode.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("mcp request failed:", err);
      if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
    }
  });

  // Stateless server: no long-lived streams or sessions to GET or DELETE.
  router.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Stateless MCP endpoint: POST only" });
  });
  router.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Stateless MCP endpoint: POST only" });
  });

  return router;
}

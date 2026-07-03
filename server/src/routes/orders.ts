import { Router } from "express";
import { getProduct, searchProducts, type SearchParams } from "../catalog.js";
import { TEST_CARD_ALIASES, resolveTestCard } from "../orders/testCards.js";

function isNumberList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number");
}

function isItemList(v: unknown): v is { sku: string; quantity?: number; color?: string }[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).sku === "string" &&
        ((item as Record<string, unknown>).quantity === undefined ||
          typeof (item as Record<string, unknown>).quantity === "number") &&
        ((item as Record<string, unknown>).color === undefined ||
          typeof (item as Record<string, unknown>).color === "string"),
    )
  );
}
import {
  NotFoundError,
  RefundError,
  SplitAmountError,
  type OrderService,
} from "../orders/service.js";
import { MandateError, type MandateStore } from "../orders/mandates.js";
import { AirwallexApiError } from "../airwallex/client.js";

export function ordersRouter(service: OrderService, mandates: MandateStore): Router {
  const router = Router();

  router.post("/mandates", (req, res, next) => {
    try {
      const { cards, max_amount, ttl_minutes } = req.body ?? {};
      if (
        !Array.isArray(cards) ||
        !cards.every((c: unknown) => typeof c === "string") ||
        typeof max_amount !== "number" ||
        typeof ttl_minutes !== "number"
      ) {
        res.status(400).json({
          error: "Body must be { cards: string[], max_amount: number, ttl_minutes: number }",
        });
        return;
      }
      res.status(201).json(mandates.create({ cards, maxAmount: max_amount, ttlMinutes: ttl_minutes }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/mandates/:code", (req, res, next) => {
    try {
      res.json(mandates.status(req.params.code));
    } catch (err) {
      next(err);
    }
  });

  router.post("/mandates/:code/revoke", (req, res, next) => {
    try {
      res.json(mandates.revoke(req.params.code));
    } catch (err) {
      next(err);
    }
  });

  /** Agent checkout gated by a mandate: budget, expiry, and cards enforced server-side. */
  router.post("/mandates/:code/checkout", async (req, res, next) => {
    try {
      const { items, splits } = req.body ?? {};
      if (!isItemList(items) || (splits !== undefined && !isNumberList(splits))) {
        res.status(400).json({
          error: "Body must be { items: {sku, quantity?, color?}[], splits?: number[] }",
        });
        return;
      }
      res.status(201).json(await service.mandateCheckout(req.params.code, items, splits));
    } catch (err) {
      next(err);
    }
  });

  router.get("/products", (req, res) => {
    const { q, category, color, tag, sort } = req.query;
    const num = (v: unknown) => (typeof v === "string" && v !== "" ? Number(v) : undefined);
    res.json(
      searchProducts({
        ...(typeof q === "string" ? { q } : {}),
        ...(typeof category === "string" ? { category } : {}),
        ...(typeof color === "string" ? { color } : {}),
        ...(typeof tag === "string" ? { tag } : {}),
        ...(num(req.query.min_price) !== undefined ? { minPrice: num(req.query.min_price)! } : {}),
        ...(num(req.query.max_price) !== undefined ? { maxPrice: num(req.query.max_price)! } : {}),
        ...(req.query.in_stock === "true" ? { inStock: true } : {}),
        ...(typeof sort === "string" ? { sort: sort as NonNullable<SearchParams["sort"]> } : {}),
      }),
    );
  });

  router.get("/products/:sku", (req, res) => {
    const product = getProduct(req.params.sku);
    if (!product) {
      res.status(404).json({ error: `No product with sku ${req.params.sku}` });
      return;
    }
    res.json(product);
  });

  router.post("/orders", async (req, res, next) => {
    try {
      const { items, splits } = req.body ?? {};
      if (!isItemList(items) || !isNumberList(splits)) {
        res.status(400).json({
          error:
            "Body must be { items: {sku, quantity?, color?}[], splits: number[] }",
        });
        return;
      }
      res.status(201).json(await service.createSplitOrder(items, splits));
    } catch (err) {
      next(err);
    }
  });

  router.get("/orders/:orderId", (req, res, next) => {
    try {
      res.json(service.getOrder(req.params.orderId));
    } catch (err) {
      next(err);
    }
  });

  router.post("/orders/:orderId/slots/:slotId/verify", async (req, res, next) => {
    try {
      const clientErrorCode =
        typeof req.body?.client_error_code === "string" ? req.body.client_error_code : undefined;
      res.json(await service.verifySlot(req.params.orderId, req.params.slotId, clientErrorCode));
    } catch (err) {
      next(err);
    }
  });

  router.post("/orders/:orderId/slots/:slotId/refresh-secret", async (req, res, next) => {
    try {
      res.json(await service.refreshSlotSecret(req.params.orderId, req.params.slotId));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Agent checkout (MCP demo): the full split flow in one call. Cards are
   * aliases ("success", "decline", "insufficient_funds", ...) or published
   * Airwallex test PANs; anything else is rejected before any API call.
   */
  router.post("/agent/checkout", async (req, res, next) => {
    try {
      const { items, splits, cards } = req.body ?? {};
      if (
        !isItemList(items) ||
        !isNumberList(splits) ||
        !Array.isArray(cards) ||
        !cards.every((c: unknown) => typeof c === "string")
      ) {
        res.status(400).json({
          error:
            "Body must be { items: {sku, quantity?, color?}[], splits: number[], cards: string[] }",
        });
        return;
      }
      const resolved: { pan: string }[] = [];
      for (const card of cards as string[]) {
        const pan = resolveTestCard(card);
        if (!pan) {
          res.status(400).json({
            error:
              `"${card}" is not an accepted card. This demo only accepts Airwallex's published ` +
              `sandbox test cards or the aliases: ${Object.keys(TEST_CARD_ALIASES).join(", ")}.`,
          });
          return;
        }
        resolved.push({ pan });
      }
      res.status(201).json(await service.agentCheckout(items, splits, resolved));
    } catch (err) {
      next(err);
    }
  });

  router.post("/orders/:orderId/refund", async (req, res, next) => {
    try {
      const amount = req.body?.amount;
      if (amount !== undefined && typeof amount !== "number") {
        res.status(400).json({ error: "amount must be a number when provided" });
        return;
      }
      res.json(await service.refundOrder(req.params.orderId, amount));
    } catch (err) {
      next(err);
    }
  });

  router.post("/orders/:orderId/abandon", async (req, res, next) => {
    try {
      res.json(await service.abandonOrder(req.params.orderId));
    } catch (err) {
      next(err);
    }
  });

  router.use(
    (err: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
      if (res.headersSent) return next(err);
      if (
        err instanceof SplitAmountError ||
        err instanceof RefundError ||
        err instanceof MandateError
      ) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof AirwallexApiError) {
        // Surface the code but never the raw upstream message verbatim to shoppers.
        console.error(err.message);
        return res.status(502).json({ error: "Payment provider error", code: err.code });
      }
      console.error(err);
      return res.status(500).json({ error: "Internal error" });
    },
  );

  return router;
}

import { Router } from "express";
import { PRODUCTS } from "../catalog.js";
import { TEST_CARD_ALIASES, resolveTestCard } from "../orders/testCards.js";
import {
  NotFoundError,
  RefundError,
  SplitAmountError,
  type OrderService,
} from "../orders/service.js";
import { AirwallexApiError } from "../airwallex/client.js";

export function ordersRouter(service: OrderService): Router {
  const router = Router();

  router.get("/products", (_req, res) => {
    res.json(PRODUCTS);
  });

  router.post("/orders", async (req, res, next) => {
    try {
      const { sku, splits } = req.body ?? {};
      if (
        typeof sku !== "string" ||
        !Array.isArray(splits) ||
        !splits.every((n: unknown) => typeof n === "number")
      ) {
        res.status(400).json({ error: "Body must be { sku: string, splits: number[] }" });
        return;
      }
      res.status(201).json(await service.createSplitOrder(sku, splits));
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
      const { sku, splits, cards } = req.body ?? {};
      if (
        typeof sku !== "string" ||
        !Array.isArray(splits) ||
        !splits.every((n: unknown) => typeof n === "number") ||
        !Array.isArray(cards) ||
        !cards.every((c: unknown) => typeof c === "string")
      ) {
        res.status(400).json({
          error: "Body must be { sku: string, splits: number[], cards: string[] }",
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
      res.status(201).json(await service.agentCheckout(sku, splits, resolved));
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
      if (err instanceof SplitAmountError || err instanceof RefundError) {
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

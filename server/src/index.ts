import "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { AirwallexClient } from "./airwallex/client.js";
import { OrderStore } from "./orders/store.js";
import { OrderService } from "./orders/service.js";
import { ordersRouter } from "./routes/orders.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { mcpRouter } from "./routes/mcp.js";
import { MandateStore } from "./orders/mandates.js";

const config = loadConfig();
const db = openDatabase();
const airwallex = new AirwallexClient(config);
const mandates = new MandateStore(db);
const service = new OrderService(new OrderStore(db), airwallex, mandates);

const app = express();

// Webhooks mount before the JSON parser: signature verification runs on
// the raw request body.
app.use("/api", webhooksRouter(service, config.airwallexWebhookSecret));

// Remote MCP endpoint: agents connect to <host>/mcp with no install.
app.use(mcpRouter(service, mandates));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api", ordersRouter(service, mandates));

// In production the server also serves the built frontend (single deploy).
// WEB_DIST overrides the dev-layout default (compiled output nests deeper).
const webDist =
  process.env.WEB_DIST ?? path.resolve(fileURLToPath(import.meta.url), "../../../web/dist");
app.use(express.static(webDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found. Run `npm run build` to build the frontend.");
  });
});

// Hold-reversal sweep: any order still uncaptured after ORDER_TTL has been
// walked away from, so cancel its holds instead of letting them dangle
// (Visa best practice: reverse within 24h; unmatched auths incur fees).
// TTL matches the 60-minute client_secret lifetime: past it, the checkout
// session can't continue anyway.
const ORDER_TTL_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  service
    .expireStaleOrders(ORDER_TTL_MS)
    .then((n) => {
      if (n > 0) console.log(`hold sweep: reversed ${n} stale order group(s)`);
    })
    .catch((err) => console.error("hold sweep failed:", err));
}, SWEEP_INTERVAL_MS).unref();

app.listen(config.port, () => {
  console.log(`split-checkout server listening on http://localhost:${config.port}`);
});

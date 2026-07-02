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

const config = loadConfig();
const db = openDatabase();
const airwallex = new AirwallexClient(config);
const service = new OrderService(new OrderStore(db), airwallex);

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api", ordersRouter(service));

// In production the server also serves the built frontend (single deploy).
const webDist = path.resolve(fileURLToPath(import.meta.url), "../../../web/dist");
app.use(express.static(webDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found — run `npm run build` to build the frontend.");
  });
});

app.listen(config.port, () => {
  console.log(`split-checkout server listening on http://localhost:${config.port}`);
});

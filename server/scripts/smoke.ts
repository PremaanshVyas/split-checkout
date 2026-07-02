/**
 * M1 proof: authenticate to the Airwallex sandbox, create a PaymentIntent,
 * retrieve it, and print the intent ID + status.
 *
 * Run: npm run smoke --workspace=server   (requires a filled-in .env)
 */
import "../src/env.js";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { AirwallexClient } from "../src/airwallex/client.js";

const config = loadConfig();
const client = new AirwallexClient(config);

const orderRef = `smoke-${randomUUID().slice(0, 8)}`;
console.log(`Creating PaymentIntent (merchant_order_id=${orderRef})...`);

const created = await client.createPaymentIntent({
  amount: 10.0, // NOT $8x.xx; those amounts trigger sandbox error responses
  currency: "AUD",
  merchantOrderId: orderRef,
});
console.log(`  created: id=${created.id} status=${created.status} amount=${created.amount} ${created.currency}`);
console.log(`  client_secret present: ${Boolean(created.client_secret)}`);

const retrieved = await client.retrievePaymentIntent(created.id);
console.log(`  retrieved: id=${retrieved.id} status=${retrieved.status}`);

const cancelled = await client.cancelPaymentIntent(created.id, "smoke test cleanup");
console.log(`  cancelled: status=${cancelled.status}`);

console.log("\nM1 smoke test passed.");

/** Debug helper: dump an intent's status + latest attempt. Usage: tsx scripts/inspect-intent.ts <intent_id> */
import "../src/env.js";
import { loadConfig } from "../src/config.js";
import { AirwallexClient } from "../src/airwallex/client.js";

const intentId = process.argv[2];
if (!intentId) throw new Error("usage: tsx scripts/inspect-intent.ts <intent_id>");

const client = new AirwallexClient(loadConfig());
const intent = await client.retrievePaymentIntent(intentId);
console.log(JSON.stringify(intent, null, 2));

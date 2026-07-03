/**
 * Probe: can the sandbox confirm a PaymentIntent SERVER-SIDE with test-card
 * details and auto_capture:false? (Native API path; needed for agent-driven
 * checkout where no browser card element exists.)
 */
import "../src/env.js";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.js";

const config = loadConfig();

const login = await fetch(`${config.airwallexBaseUrl}/api/v1/authentication/login`, {
  method: "POST",
  headers: { "x-client-id": config.airwallexClientId, "x-api-key": config.airwallexApiKey },
});
const { token } = (await login.json()) as { token: string };
const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// 1. create intent
const create = await fetch(`${config.airwallexBaseUrl}/api/v1/pa/payment_intents/create`, {
  method: "POST",
  headers: authed,
  body: JSON.stringify({
    request_id: randomUUID(),
    amount: 12.34,
    currency: "AUD",
    merchant_order_id: `probe-confirm-${randomUUID().slice(0, 8)}`,
  }),
});
const intent = (await create.json()) as { id: string; status: string };
console.log("created:", intent.id, intent.status);

// 2. confirm server-side with a test card, auto_capture false
const confirm = await fetch(
  `${config.airwallexBaseUrl}/api/v1/pa/payment_intents/${intent.id}/confirm`,
  {
    method: "POST",
    headers: authed,
    body: JSON.stringify({
      request_id: randomUUID(),
      payment_method: {
        type: "card",
        card: {
          number: "4035501000000008",
          expiry_month: "12",
          expiry_year: "2030",
          cvc: "123",
          name: "Agent Test",
        },
      },
      payment_method_options: { card: { auto_capture: false } },
    }),
  },
);
console.log("confirm HTTP:", confirm.status);
const confirmed = (await confirm.json()) as Record<string, unknown>;
console.log(JSON.stringify(confirmed, null, 2).slice(0, 700));

// 3. if it authorized, capture then cancel-check
if ((confirmed.status as string) === "REQUIRES_CAPTURE") {
  const capture = await fetch(
    `${config.airwallexBaseUrl}/api/v1/pa/payment_intents/${intent.id}/capture`,
    { method: "POST", headers: authed, body: JSON.stringify({ request_id: randomUUID() }) },
  );
  const captured = (await capture.json()) as { status: string };
  console.log("capture:", capture.status, captured.status);
}

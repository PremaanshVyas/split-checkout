import { init, createElement } from "@airwallex/components-sdk";

export type CardElement = Awaited<ReturnType<typeof createCardElement>>;

let sdkReady: Promise<unknown> | null = null;

/** init() runs once per page; elements are created per confirm attempt. */
function ensureInit(): Promise<unknown> {
  sdkReady ??= init({ env: "demo", enabledElements: ["payments"], locale: "en" });
  return sdkReady;
}

/**
 * A card element is mounted once per payment flow (Airwallex constraint),
 * so each slot/attempt gets a freshly created element bound to one confirm.
 * `autoCapture: false` is the whole trick: confirm places a hold, capture
 * happens later, server-side, only when every card in the order holds.
 */
export async function createCardElement(container: HTMLElement) {
  await ensureInit();
  const card = await createElement("card", { autoCapture: false });
  card.mount(container);
  return card;
}

export interface ConfirmParams {
  intentId: string;
  clientSecret: string;
}

/** Resolves on success; rejects with `{ code?, message? }` on decline. */
export async function confirmHold(card: CardElement, params: ConfirmParams) {
  return card.confirm({
    intent_id: params.intentId,
    client_secret: params.clientSecret,
    // Belt and braces: the element was created with autoCapture: false,
    // and the confirm carries the same instruction (precedence between
    // the two is undocumented, so they must agree).
    payment_method_options: { card: { auto_capture: false } },
  });
}

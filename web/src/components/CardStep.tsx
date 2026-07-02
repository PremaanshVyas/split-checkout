import { useEffect, useRef, useState } from "react";
import { createCardElement, confirmHold, type CardElement } from "../awx";
import type { SlotView } from "../types";

interface Props {
  slot: SlotView;
  stepNumber: number;
  totalSlots: number;
  clientSecret: string | undefined;
  currency: string;
  /** Reports the confirm outcome so the server can verify the true status. */
  onConfirmSettled: (slotId: string, clientErrorCode?: string) => Promise<void>;
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error("confirm timed out"), { code: "confirm_timeout" })),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * One card entry step. The Airwallex card element is mounted once per
 * payment flow, so every attempt (first try or post-decline retry)
 * creates a fresh element — `attempt` in the effect deps drives that.
 */
export function CardStep({
  slot,
  stepNumber,
  totalSlots,
  clientSecret,
  currency,
  onConfirmSettled,
}: Props) {
  const single = totalSlots === 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<CardElement | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let element: CardElement | null = null;
    setReady(false);

    (async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      element = await createCardElement(containerRef.current);
      if (cancelled) {
        element.destroy();
        return;
      }
      cardRef.current = element;
      element.on("ready", () => setReady(true));
    })();

    return () => {
      cancelled = true;
      element?.destroy();
      cardRef.current = null;
    };
  }, [slot.id, attempt]);

  async function placeHold() {
    if (!cardRef.current || !clientSecret) return;
    setBusy(true);
    let clientErrorCode: string | undefined;
    try {
      // An abandoned 3DS challenge would otherwise leave confirm() pending
      // forever — give up after a generous window and let the shopper retry.
      await withTimeout(
        confirmHold(cardRef.current, { intentId: slot.intent_id, clientSecret }),
        90_000,
      );
    } catch (err) {
      clientErrorCode = (err as { code?: string })?.code;
    }
    // Success or decline, the server re-checks the intent — the client
    // callback is never trusted as the source of truth.
    await onConfirmSettled(slot.id, clientErrorCode);
    setBusy(false);
    setAttempt((a) => a + 1); // fresh element if this step is retried
  }

  return (
    <section className="card-step">
      <h2>{single ? `Pay ${fmt(slot.amount, currency)}` : `Card ${stepNumber} — ${fmt(slot.amount, currency)}`}</h2>
      {!single && (
        <p className="muted">
          This places a hold only. <strong>You will not be charged yet</strong> — no money moves
          until every card in this order is authorized.
        </p>
      )}

      {slot.error_message && (
        <p className="error" role="alert">
          {slot.error_message}
        </p>
      )}

      <div ref={containerRef} className="card-element-container" />

      <button className="primary" disabled={!ready || busy} onClick={placeHold}>
        {busy
          ? single
            ? "Processing…"
            : "Placing hold…"
          : single
            ? `Pay ${fmt(slot.amount, currency)}`
            : `Place hold for ${fmt(slot.amount, currency)}`}
      </button>
      {busy && (
        <p className="muted small">
          If your bank asks you to verify this payment, a verification window will open.
        </p>
      )}
    </section>
  );
}

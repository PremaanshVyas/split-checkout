/**
 * Single hero product. Price lives server-side only — the client sends a
 * proposed split, never a price. High-ticket so a two-card split makes
 * intuitive sense.
 */
export const PRODUCT = {
  sku: "aurora-ex-9",
  name: "Aurora EX-9 Espresso Machine",
  description:
    "Dual-boiler, PID-controlled espresso machine with a commercial-grade 58mm group head. The kind of purchase you split with a housemate.",
  price: 1200.0,
  currency: "AUD",
} as const;

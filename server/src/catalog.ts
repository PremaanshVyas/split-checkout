/**
 * Store catalog. Prices live server-side only — the client sends a product
 * sku and a proposed split, never a price. High-ticket items make a
 * two-card split intuitive; the kettle is there to show the flow also
 * works for smaller carts.
 */
export interface Product {
  sku: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  /** Emoji used as the product visual — keeps the demo self-contained. */
  art: string;
}

export const PRODUCTS: Product[] = [
  {
    sku: "aurora-ex-9",
    name: "Aurora EX-9 Espresso Machine",
    tagline: "Dual boiler · PID · 58mm group",
    description:
      "Dual-boiler, PID-controlled espresso machine with a commercial-grade 58mm group head. The kind of purchase you split with a housemate.",
    price: 1200.0,
    currency: "AUD",
    art: "☕",
  },
  {
    sku: "aurora-grinder-64",
    name: "Aurora 64 Flat-Burr Grinder",
    tagline: "64mm burrs · single dose",
    description:
      "Single-dosing flat-burr grinder with stepless adjustment and near-zero retention. The upgrade that outlives three espresso machines.",
    price: 485.0,
    currency: "AUD",
    art: "🌀",
  },
  {
    sku: "aurora-kettle",
    name: "Aurora Gooseneck Kettle",
    tagline: "Variable temp · 0.9L",
    description:
      "Variable-temperature gooseneck kettle with a flow rate made for pour-over. Precise enough to be annoying about it.",
    price: 189.0,
    currency: "AUD",
    art: "🫖",
  },
  {
    sku: "aurora-barista-bundle",
    name: "Barista Station Bundle",
    tagline: "Machine + grinder + bench kit",
    description:
      "The EX-9, the 64 grinder, tamper, distribution tool, scale, and knock box. Everything a serious home bar needs, in one (large) box.",
    price: 1950.0,
    currency: "AUD",
    art: "🧰",
  },
];

export function getProduct(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

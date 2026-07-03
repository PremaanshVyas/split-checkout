/**
 * Store catalog. Prices live server-side only; the client sends skus and
 * quantities, never prices. Every attribute here is a filter axis for
 * both the web store and the MCP agent tools (category, color, price,
 * stock, tags, rating), which is what makes agent-driven shopping
 * genuinely useful rather than a toy.
 *
 * Stock is static demo data: orders validate against it but do not
 * decrement it, so the demo can never wedge itself into an empty store.
 */
export interface Product {
  sku: string;
  name: string;
  category: Category;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  colors: string[];
  rating: number;
  reviews: number;
  stock: number;
  tags: string[];
  /** Emoji fallback for compact contexts. */
  art: string;
  /** Product photo, served from the web build (see ATTRIBUTIONS.md). */
  image: string;
}

export type Category =
  | "espresso machines"
  | "grinders"
  | "kettles"
  | "brewers"
  | "scales"
  | "accessories"
  | "bundles";

export const PRODUCTS: Product[] = [
  {
    sku: "aurora-ex-9",
    image: "/products/aurora-ex-9.jpg",
    name: "Aurora EX-9 Espresso Machine",
    category: "espresso machines",
    tagline: "Dual boiler · PID · 58mm group",
    description:
      "Dual-boiler, PID-controlled espresso machine with a commercial-grade 58mm group head. The kind of purchase you split with a housemate.",
    price: 1200.0,
    currency: "AUD",
    colors: ["brushed steel", "matte black"],
    rating: 4.8,
    reviews: 214,
    stock: 7,
    tags: ["dual boiler", "pid", "flagship"],
    art: "☕",
  },
  {
    sku: "aurora-ex-5",
    image: "/products/aurora-ex-5.jpg",
    name: "Aurora EX-5 Espresso Machine",
    category: "espresso machines",
    tagline: "Single boiler · thermoblock steam",
    description:
      "A compact single-boiler machine with fast thermoblock steam. The sensible first serious machine.",
    price: 649.0,
    currency: "AUD",
    colors: ["matte black", "cream"],
    rating: 4.5,
    reviews: 388,
    stock: 15,
    tags: ["compact", "starter"],
    art: "☕",
  },
  {
    sku: "aurora-lever-one",
    image: "/products/aurora-lever-one.jpg",
    name: "Aurora Lever One",
    category: "espresso machines",
    tagline: "Manual lever · spring assisted",
    description:
      "A spring-lever machine for people who want to feel the shot. No pump, no electronics in the pull, no excuses.",
    price: 1750.0,
    currency: "AUD",
    colors: ["chrome", "walnut"],
    rating: 4.9,
    reviews: 96,
    stock: 3,
    tags: ["lever", "manual", "flagship"],
    art: "🫗",
  },
  {
    sku: "aurora-grinder-64",
    image: "/products/aurora-grinder-64.jpg",
    name: "Aurora 64 Flat-Burr Grinder",
    category: "grinders",
    tagline: "64mm burrs · single dose",
    description:
      "Single-dosing flat-burr grinder with stepless adjustment and near-zero retention. The upgrade that outlives three espresso machines.",
    price: 485.0,
    currency: "AUD",
    colors: ["matte black", "white"],
    rating: 4.7,
    reviews: 502,
    stock: 22,
    tags: ["single dose", "flat burr"],
    art: "🌀",
  },
  {
    sku: "aurora-grinder-83",
    image: "/products/aurora-grinder-83.jpg",
    name: "Aurora 83 Pro Grinder",
    category: "grinders",
    tagline: "83mm burrs · shop grade",
    description:
      "83mm flat burrs and a motor that shrugs at back-to-back doubles. For the home bar that behaves like a cafe.",
    price: 899.0,
    currency: "AUD",
    colors: ["matte black", "brushed steel"],
    rating: 4.8,
    reviews: 143,
    stock: 5,
    tags: ["flat burr", "prosumer"],
    art: "🌀",
  },
  {
    sku: "aurora-hand-mill",
    image: "/products/aurora-hand-mill.jpg",
    name: "Aurora Hand Mill",
    category: "grinders",
    tagline: "48mm conical · travel ready",
    description:
      "A pocketable conical hand grinder with click-stepped adjustment. Aeropress's best friend.",
    price: 129.0,
    currency: "AUD",
    colors: ["space grey", "olive"],
    rating: 4.6,
    reviews: 831,
    stock: 40,
    tags: ["travel", "conical", "manual"],
    art: "⚙️",
  },
  {
    sku: "aurora-kettle",
    image: "/products/aurora-kettle.jpg",
    name: "Aurora Gooseneck Kettle",
    category: "kettles",
    tagline: "Variable temp · 0.9L",
    description:
      "Variable-temperature gooseneck kettle with a flow rate made for pour-over. Precise enough to be annoying about it.",
    price: 189.0,
    currency: "AUD",
    colors: ["matte black", "white", "copper"],
    rating: 4.7,
    reviews: 655,
    stock: 31,
    tags: ["gooseneck", "pour over"],
    art: "🫖",
  },
  {
    sku: "aurora-kettle-stove",
    image: "/products/aurora-kettle-stove.jpg",
    name: "Aurora Stovetop Gooseneck",
    category: "kettles",
    tagline: "Induction ready · 1.0L",
    description: "The unpowered sibling: a balanced stovetop gooseneck for camp stoves and purists.",
    price: 79.0,
    currency: "AUD",
    colors: ["brushed steel"],
    rating: 4.4,
    reviews: 289,
    stock: 18,
    tags: ["gooseneck", "stovetop"],
    art: "🫖",
  },
  {
    sku: "aurora-dripper",
    image: "/products/aurora-dripper.jpg",
    name: "Aurora Ceramic Dripper",
    category: "brewers",
    tagline: "Cone dripper · size 02",
    description: "A thick-walled ceramic cone that holds its heat through the whole pour.",
    price: 49.0,
    currency: "AUD",
    colors: ["white", "matte black", "terracotta"],
    rating: 4.6,
    reviews: 1024,
    stock: 60,
    tags: ["pour over", "ceramic"],
    art: "🍶",
  },
  {
    sku: "aurora-press",
    image: "/products/aurora-press.jpg",
    name: "Aurora Immersion Press",
    category: "brewers",
    tagline: "Full immersion · 350ml",
    description: "A travel-proof immersion brewer with a proper metal filter. Forgiving, fast, delicious.",
    price: 65.0,
    currency: "AUD",
    colors: ["smoke", "clear"],
    rating: 4.5,
    reviews: 2210,
    stock: 0,
    tags: ["immersion", "travel"],
    art: "🧋",
  },
  {
    sku: "aurora-cold-tower",
    image: "/products/aurora-cold-tower.jpg",
    name: "Aurora Cold Drip Tower",
    category: "brewers",
    tagline: "Slow drip · 600ml",
    description:
      "An eight-hour cold drip tower in glass and walnut. Completely impractical and utterly beautiful.",
    price: 349.0,
    currency: "AUD",
    colors: ["walnut"],
    rating: 4.3,
    reviews: 77,
    stock: 4,
    tags: ["cold brew", "glass", "statement"],
    art: "⏳",
  },
  {
    sku: "aurora-scale",
    image: "/products/aurora-scale.jpg",
    name: "Aurora Brew Scale",
    category: "scales",
    tagline: "0.1g · auto timer",
    description: "A splash-proof scale with flow-rate readout and an auto-start shot timer.",
    price: 119.0,
    currency: "AUD",
    colors: ["matte black"],
    rating: 4.6,
    reviews: 468,
    stock: 26,
    tags: ["scale", "timer"],
    art: "⚖️",
  },
  {
    sku: "aurora-tamper",
    image: "/products/aurora-tamper.jpg",
    name: "Aurora Precision Tamper",
    category: "accessories",
    tagline: "58.5mm · calibrated 15kg",
    description: "A calibrated-force tamper with a flat 58.5mm base. Consistency you can feel click.",
    price: 89.0,
    currency: "AUD",
    colors: ["brushed steel", "matte black", "walnut"],
    rating: 4.7,
    reviews: 312,
    stock: 34,
    tags: ["tamper", "58.5mm"],
    art: "🔨",
  },
  {
    sku: "aurora-milk-jug",
    image: "/products/aurora-milk-jug.jpg",
    name: "Aurora Milk Pitcher",
    category: "accessories",
    tagline: "450ml · sharp spout",
    description: "A sharp-spouted pitcher for latte art that actually lands where you aim it.",
    price: 45.0,
    currency: "AUD",
    colors: ["brushed steel", "matte black", "white"],
    rating: 4.5,
    reviews: 590,
    stock: 48,
    tags: ["milk", "latte art"],
    art: "🥛",
  },
  {
    sku: "aurora-knock-box",
    image: "/products/aurora-knock-box.jpg",
    name: "Aurora Knock Box",
    category: "accessories",
    tagline: "Solid ash bar · rubber core",
    description: "A weighted knock box that stays put and never rings.",
    price: 69.0,
    currency: "AUD",
    colors: ["ash", "matte black"],
    rating: 4.4,
    reviews: 201,
    stock: 12,
    tags: ["knock box"],
    art: "🪵",
  },
  {
    sku: "aurora-barista-bundle",
    image: "/products/aurora-barista-bundle.jpg",
    name: "Barista Station Bundle",
    category: "bundles",
    tagline: "EX-9 + 64 grinder + bench kit",
    description:
      "The EX-9, the 64 grinder, tamper, distribution tool, scale, and knock box. Everything a serious home bar needs, in one (large) box.",
    price: 1950.0,
    currency: "AUD",
    colors: ["matte black"],
    rating: 4.9,
    reviews: 58,
    stock: 2,
    tags: ["bundle", "flagship", "gift"],
    art: "🧰",
  },
];

export function getProduct(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export interface SearchParams {
  q?: string;
  category?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  tag?: string;
  sort?: "price_asc" | "price_desc" | "rating" | "reviews";
}

export interface SearchResult {
  products: Product[];
  total: number;
  facets: {
    categories: Record<string, number>;
    colors: Record<string, number>;
    price_range: { min: number; max: number } | null;
  };
}

export function searchProducts(params: SearchParams): SearchResult {
  const q = params.q?.toLowerCase().trim();
  const matched = PRODUCTS.filter((p) => {
    if (q) {
      const haystack = [p.name, p.tagline, p.description, p.category, ...p.tags, ...p.colors]
        .join(" ")
        .toLowerCase();
      if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
    }
    if (params.category && p.category !== params.category.toLowerCase()) return false;
    if (params.color && !p.colors.some((c) => c.includes(params.color!.toLowerCase()))) return false;
    if (params.minPrice !== undefined && p.price < params.minPrice) return false;
    if (params.maxPrice !== undefined && p.price > params.maxPrice) return false;
    if (params.inStock && p.stock <= 0) return false;
    if (params.tag && !p.tags.includes(params.tag.toLowerCase())) return false;
    return true;
  });

  const sorted = [...matched];
  switch (params.sort) {
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      sorted.sort((a, b) => b.rating - a.rating);
      break;
    case "reviews":
      sorted.sort((a, b) => b.reviews - a.reviews);
      break;
  }

  const categories: Record<string, number> = {};
  const colors: Record<string, number> = {};
  for (const p of matched) {
    categories[p.category] = (categories[p.category] ?? 0) + 1;
    for (const c of p.colors) colors[c] = (colors[c] ?? 0) + 1;
  }
  const prices = matched.map((p) => p.price);
  return {
    products: sorted,
    total: matched.length,
    facets: {
      categories,
      colors,
      price_range: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    },
  };
}

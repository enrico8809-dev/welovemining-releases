import { Category, Product, Shop } from "./types";

export const CATEGORIES: Category[] = [
  "Flower",
  "Pre-rolls",
  "Edibles",
  "Vapes",
  "Concentrates",
  "CBD",
  "Accessories",
];

export const CATEGORY_EMOJI: Record<Category, string> = {
  Flower: "🌿",
  "Pre-rolls": "🚬",
  Edibles: "🍪",
  Vapes: "💨",
  Concentrates: "🍯",
  CBD: "🧴",
  Accessories: "🛠️",
};

export const SHOPS: Shop[] = [
  {
    id: "s1",
    name: "Green Room Dispensary",
    tagline: "Premium flower & artisanal edibles",
    area: "Sea Point, Cape Town",
    rating: 4.8,
    ratingCount: 1240,
    distanceKm: 1.7,
    etaMin: 25,
    etaMax: 40,
    deliveryFee: 25,
    minOrder: 150,
    categories: ["Flower", "Pre-rolls", "Edibles", "CBD"],
    emoji: "🌿",
    featured: true,
    open: true,
  },
  {
    id: "s2",
    name: "High Society",
    tagline: "Top-shelf strains, fast delivery",
    area: "Sandton, Johannesburg",
    rating: 4.6,
    ratingCount: 980,
    distanceKm: 3.2,
    etaMin: 30,
    etaMax: 50,
    deliveryFee: 30,
    minOrder: 200,
    categories: ["Flower", "Vapes", "Concentrates", "Pre-rolls"],
    emoji: "🔥",
    featured: true,
    open: true,
  },
  {
    id: "s3",
    name: "Durban Poison Co.",
    tagline: "Coastal classics & local genetics",
    area: "Morningside, Durban",
    rating: 4.7,
    ratingCount: 654,
    distanceKm: 2.4,
    etaMin: 20,
    etaMax: 35,
    deliveryFee: 20,
    minOrder: 120,
    categories: ["Flower", "Pre-rolls", "Edibles"],
    emoji: "🌊",
    open: true,
  },
  {
    id: "s4",
    name: "The CBD Wellness Bar",
    tagline: "Wellness-first, low-THC & CBD",
    area: "Stellenbosch",
    rating: 4.9,
    ratingCount: 410,
    distanceKm: 4.8,
    etaMin: 35,
    etaMax: 55,
    deliveryFee: 35,
    minOrder: 100,
    categories: ["CBD", "Edibles", "Accessories"],
    emoji: "🧘",
    open: true,
  },
  {
    id: "s5",
    name: "Kush Corner",
    tagline: "Value buds & bulk deals",
    area: "Centurion, Pretoria",
    rating: 4.4,
    ratingCount: 1520,
    distanceKm: 5.5,
    etaMin: 40,
    etaMax: 60,
    deliveryFee: 25,
    minOrder: 150,
    categories: ["Flower", "Pre-rolls", "Concentrates", "Accessories"],
    emoji: "💚",
    open: false,
  },
];

export const PRODUCTS: Product[] = [
  // Green Room (s1)
  { id: "p1", shopId: "s1", name: "OG Kush (3.5g)", description: "Earthy, piney indica-dominant hybrid.", price: 180, category: "Flower", thc: "THC 22%", emoji: "🌿", popular: true },
  { id: "p2", shopId: "s1", name: "Lemon Haze (3.5g)", description: "Zesty sativa for a bright, social high.", price: 175, category: "Flower", thc: "THC 20%", emoji: "🍋" },
  { id: "p3", shopId: "s1", name: "House Pre-roll (1g)", description: "Hand-rolled daily-driver joint.", price: 60, category: "Pre-rolls", thc: "THC 18%", emoji: "🚬", popular: true },
  { id: "p4", shopId: "s1", name: "Dark Choc Brownie", description: "Rich brownie, 20mg THC per piece.", price: 95, category: "Edibles", thc: "20mg", emoji: "🍫" },
  { id: "p5", shopId: "s1", name: "CBD Calm Drops 15ml", description: "Full-spectrum CBD oil, 500mg.", price: 220, category: "CBD", emoji: "🧴" },

  // High Society (s2)
  { id: "p6", shopId: "s2", name: "Gelato (3.5g)", description: "Dessert-sweet, balanced hybrid.", price: 240, category: "Flower", thc: "THC 26%", emoji: "🍨", popular: true },
  { id: "p7", shopId: "s2", name: "Runtz (3.5g)", description: "Fruity, candy-like top-shelf flower.", price: 250, category: "Flower", thc: "THC 25%", emoji: "🍬" },
  { id: "p8", shopId: "s2", name: "Live Resin Cart (0.5g)", description: "Full-flavour vape cartridge, 510 thread.", price: 320, category: "Vapes", thc: "THC 85%", emoji: "💨", popular: true },
  { id: "p9", shopId: "s2", name: "Shatter (1g)", description: "Glass-clear concentrate dab.", price: 280, category: "Concentrates", thc: "THC 80%", emoji: "🍯" },
  { id: "p10", shopId: "s2", name: "Infused Pre-roll (1g)", description: "Flower rolled with kief & distillate.", price: 110, category: "Pre-rolls", thc: "THC 35%", emoji: "🔥" },

  // Durban Poison Co. (s3)
  { id: "p11", shopId: "s3", name: "Durban Poison (3.5g)", description: "Legendary local pure sativa.", price: 160, category: "Flower", thc: "THC 19%", emoji: "🌊", popular: true },
  { id: "p12", shopId: "s3", name: "Swazi Gold (3.5g)", description: "Heritage landrace sativa.", price: 150, category: "Flower", thc: "THC 18%", emoji: "🌅" },
  { id: "p13", shopId: "s3", name: "Gummy Bears (10pk)", description: "5mg THC each, mixed fruit.", price: 120, category: "Edibles", thc: "50mg total", emoji: "🐻", popular: true },
  { id: "p14", shopId: "s3", name: "Beach Pre-roll (1g)", description: "Smooth sativa for the promenade.", price: 55, category: "Pre-rolls", thc: "THC 17%", emoji: "🚬" },

  // CBD Wellness Bar (s4)
  { id: "p15", shopId: "s4", name: "CBD Sleep Gummies", description: "CBD + melatonin, 25mg CBD each.", price: 180, category: "Edibles", emoji: "😴", popular: true },
  { id: "p16", shopId: "s4", name: "Full-Spectrum Oil 30ml", description: "1000mg CBD, MCT carrier.", price: 380, category: "CBD", emoji: "🧴" },
  { id: "p17", shopId: "s4", name: "Recovery Balm", description: "Topical CBD balm for muscles.", price: 160, category: "CBD", emoji: "🧴" },
  { id: "p18", shopId: "s4", name: "Glass Storage Jar", description: "UV-tint airtight stash jar.", price: 90, category: "Accessories", emoji: "🫙" },

  // Kush Corner (s5)
  { id: "p19", shopId: "s5", name: "Daily Bud (7g)", description: "Great-value hybrid for everyday.", price: 220, category: "Flower", thc: "THC 16%", emoji: "💚", popular: true },
  { id: "p20", shopId: "s5", name: "Budget Pre-roll 3pk", description: "Three 1g joints, mixed strains.", price: 130, category: "Pre-rolls", thc: "THC 15%", emoji: "🚬" },
  { id: "p21", shopId: "s5", name: "Bubble Hash (1g)", description: "Solventless concentrate.", price: 200, category: "Concentrates", thc: "THC 55%", emoji: "🍯" },
  { id: "p22", shopId: "s5", name: "Grinder (4-piece)", description: "Aluminium herb grinder.", price: 150, category: "Accessories", emoji: "🛠️" },
];

export function shopById(id: string): Shop | undefined {
  return SHOPS.find((s) => s.id === id);
}

export function productsForShop(shopId: string): Product[] {
  return PRODUCTS.filter((p) => p.shopId === shopId);
}

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

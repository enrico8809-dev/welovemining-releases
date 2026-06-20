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
  {
    id: "s6",
    name: "Table Mountain Greens",
    tagline: "Craft cultivars from the Cape",
    area: "City Bowl, Cape Town",
    rating: 4.7,
    ratingCount: 720,
    distanceKm: 2.9,
    etaMin: 25,
    etaMax: 45,
    deliveryFee: 28,
    minOrder: 150,
    categories: ["Flower", "Vapes", "Edibles", "CBD"],
    emoji: "⛰️",
    featured: true,
    open: true,
  },
  {
    id: "s7",
    name: "Jozi Buds",
    tagline: "Inner-city dispensary, late hours",
    area: "Maboneng, Johannesburg",
    rating: 4.5,
    ratingCount: 1130,
    distanceKm: 4.1,
    etaMin: 30,
    etaMax: 50,
    deliveryFee: 30,
    minOrder: 180,
    categories: ["Flower", "Pre-rolls", "Concentrates", "Vapes"],
    emoji: "🏙️",
    open: true,
  },
  {
    id: "s8",
    name: "Garden Route Greens",
    tagline: "Outdoor-grown & sun-cured",
    area: "George, Western Cape",
    rating: 4.6,
    ratingCount: 305,
    distanceKm: 6.2,
    etaMin: 40,
    etaMax: 65,
    deliveryFee: 35,
    minOrder: 120,
    categories: ["Flower", "Edibles", "CBD"],
    emoji: "🌲",
    open: true,
  },
  {
    id: "s9",
    name: "Bay Bud Co.",
    tagline: "Windy City's freshest",
    area: "Summerstrand, Gqeberha",
    rating: 4.3,
    ratingCount: 488,
    distanceKm: 3.7,
    etaMin: 30,
    etaMax: 55,
    deliveryFee: 25,
    minOrder: 130,
    categories: ["Flower", "Pre-rolls", "Vapes", "Accessories"],
    emoji: "🌬️",
    open: true,
  },
  {
    id: "s10",
    name: "Karoo Kush",
    tagline: "Big-sky bud, fair prices",
    area: "Westdene, Bloemfontein",
    rating: 4.2,
    ratingCount: 367,
    distanceKm: 7.1,
    etaMin: 45,
    etaMax: 70,
    deliveryFee: 30,
    minOrder: 120,
    categories: ["Flower", "Pre-rolls", "Edibles", "Concentrates"],
    emoji: "🌵",
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

  // Table Mountain Greens (s6)
  { id: "p23", shopId: "s6", name: "Cape Haze (3.5g)", description: "Bright citrus sativa, terpene-rich.", price: 210, category: "Flower", thc: "THC 23%", emoji: "🍊", popular: true },
  { id: "p24", shopId: "s6", name: "Fynbos OG (3.5g)", description: "Earthy indica with a herbal nose.", price: 200, category: "Flower", thc: "THC 21%", emoji: "🌿" },
  { id: "p25", shopId: "s6", name: "Disposable Vape (1g)", description: "Rechargeable all-in-one vape pen.", price: 280, category: "Vapes", thc: "THC 80%", emoji: "💨", popular: true },
  { id: "p26", shopId: "s6", name: "Salted Caramel Bites", description: "Dark chocolate edibles, 10mg each.", price: 130, category: "Edibles", thc: "100mg total", emoji: "🍬" },
  { id: "p27", shopId: "s6", name: "CBD Roll-On", description: "Cooling menthol + CBD relief.", price: 140, category: "CBD", emoji: "🧴" },

  // Jozi Buds (s7)
  { id: "p28", shopId: "s7", name: "Maboneng Mints (3.5g)", description: "Cool minty hybrid, heavy trichomes.", price: 230, category: "Flower", thc: "THC 24%", emoji: "🌱", popular: true },
  { id: "p29", shopId: "s7", name: "City Lights (3.5g)", description: "Uplifting sativa for busy days.", price: 215, category: "Flower", thc: "THC 22%", emoji: "✨" },
  { id: "p30", shopId: "s7", name: "Rosin (1g)", description: "Premium solventless concentrate.", price: 340, category: "Concentrates", thc: "THC 75%", emoji: "🍯" },
  { id: "p31", shopId: "s7", name: "Diamond Cart (0.5g)", description: "THCa diamond vape cartridge.", price: 330, category: "Vapes", thc: "THC 88%", emoji: "💎", popular: true },
  { id: "p32", shopId: "s7", name: "Twin Pre-roll Pack", description: "Two 1g joints of house flower.", price: 100, category: "Pre-rolls", thc: "THC 19%", emoji: "🚬" },

  // Garden Route Greens (s8)
  { id: "p33", shopId: "s8", name: "Sun-Cured Sativa (3.5g)", description: "Outdoor-grown, smooth and clean.", price: 145, category: "Flower", thc: "THC 17%", emoji: "☀️", popular: true },
  { id: "p34", shopId: "s8", name: "Forest Indica (3.5g)", description: "Relaxing nighttime indica.", price: 155, category: "Flower", thc: "THC 20%", emoji: "🌲" },
  { id: "p35", shopId: "s8", name: "Honey Granola Bar", description: "Infused snack bar, 15mg THC.", price: 85, category: "Edibles", thc: "15mg", emoji: "🍯" },
  { id: "p36", shopId: "s8", name: "CBD Tincture 20ml", description: "750mg CBD daily wellness drops.", price: 260, category: "CBD", emoji: "🧴" },

  // Bay Bud Co. (s9)
  { id: "p37", shopId: "s9", name: "Bay Breeze (3.5g)", description: "Coastal hybrid, tropical aroma.", price: 170, category: "Flower", thc: "THC 19%", emoji: "🏝️", popular: true },
  { id: "p38", shopId: "s9", name: "Windy City Haze (3.5g)", description: "Energetic sativa, citrus finish.", price: 165, category: "Flower", thc: "THC 18%", emoji: "🍋" },
  { id: "p39", shopId: "s9", name: "Pod Vape (0.5g)", description: "Compact pod-style vape device.", price: 250, category: "Vapes", thc: "THC 78%", emoji: "💨" },
  { id: "p40", shopId: "s9", name: "Rolling Kit", description: "Papers, tips, tray & lighter.", price: 110, category: "Accessories", emoji: "🛠️", popular: true },

  // Karoo Kush (s10)
  { id: "p41", shopId: "s10", name: "Karoo Classic (7g)", description: "Big-value hybrid, dry-climate grown.", price: 200, category: "Flower", thc: "THC 16%", emoji: "🌵", popular: true },
  { id: "p42", shopId: "s10", name: "Desert Pre-roll 3pk", description: "Three 1g joints, easygoing high.", price: 120, category: "Pre-rolls", thc: "THC 15%", emoji: "🚬" },
  { id: "p43", shopId: "s10", name: "Fruit Chews (10pk)", description: "5mg THC each, assorted flavours.", price: 110, category: "Edibles", thc: "50mg total", emoji: "🍬" },
  { id: "p44", shopId: "s10", name: "Crumble (1g)", description: "Crumbly wax concentrate.", price: 190, category: "Concentrates", thc: "THC 70%", emoji: "🍯" },
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

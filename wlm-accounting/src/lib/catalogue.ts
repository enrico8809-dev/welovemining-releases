// ASIC product catalogue, transcribed from supplier price lists.
//
// Two pricing conventions appear in these lists and both are kept as-is rather
// than flattened, because the per-terahash ones re-price whenever the hashrate
// of the actual unit differs:
//
//   "unit"        — a flat USD price for the machine (L9 16G: $2600)
//   "perTerahash" — USD per TH, multiplied by the unit's hashrate (S21++ 235T @ $6.50/T)
//
// Where a supplier quoted a band (Whatsminer "$5.4–6.0/T", or a list of
// hashrates), the low end is stored as the price and the band is kept in
// `priceUsdMax` / `hashrateMax` so nothing is silently rounded into a single
// number the supplier never actually quoted.

export type PriceMode = "unit" | "perTerahash";

export type Category =
  | "btc_air"
  | "btc_hydro"
  | "btc_oil"
  | "ltc_doge"
  | "zec"
  | "kas_dash"
  | "solo"
  | "container"
  | "spares";

export interface Product {
  id: string;
  name: string;
  category: Category;
  supplier: string;
  region: "HK" | "USA";
  priceMode: PriceMode;
  /** USD per unit, or USD per TH when priceMode is "perTerahash". */
  priceUsd: number;
  /** Upper bound when the supplier quoted a range. */
  priceUsdMax?: number;
  /** Terahash for BTC miners; native unit (G/M) noted in `spec` for others. */
  hashrate?: number;
  hashrateMax?: number;
  watts?: number;
  wattsMax?: number;
  warranty: boolean;
  /** Free-text spec shown under the name, e.g. "16.5G" or "840K". */
  spec?: string;
  note?: string;
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "btc_air", label: "BTC Air" },
  { id: "btc_hydro", label: "BTC Hydro" },
  { id: "btc_oil", label: "BTC Oil" },
  { id: "ltc_doge", label: "LTC / DOGE" },
  { id: "zec", label: "ZEC" },
  { id: "kas_dash", label: "KAS / DASH" },
  { id: "solo", label: "Solo / Bitaxe" },
  { id: "container", label: "Containers" },
  { id: "spares", label: "Spares" },
];

const LEED = "LeedMiner";
const LETINE = "Letine";

export const CATALOGUE: Product[] = [
  // ---------------------------------------------------------------- LeedMiner
  // ZEC — priced by delivery month, so each month is its own line.
  { id: "leed-z15pro-dec", name: "Z15Pro", spec: "840K", category: "zec", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 6900, warranty: true, note: "December delivery" },
  { id: "leed-z15pro-jan", name: "Z15Pro", spec: "840K", category: "zec", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 6300, warranty: true, note: "January delivery" },
  { id: "leed-z15k-sep", name: "Z15K", spec: "525K", category: "zec", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 5250, warranty: true, note: "September delivery" },
  { id: "leed-z15k-dec", name: "Z15K", spec: "525K", category: "zec", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 3700, warranty: true, note: "December delivery" },
  { id: "leed-z15k-janfeb", name: "Z15K", spec: "525K", category: "zec", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 3300, warranty: true, note: "Jan–Feb delivery" },
  { id: "leed-z15k-mar", name: "Z15K", spec: "525K", category: "zec", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2900, warranty: true, note: "March delivery" },

  // LTC/DOGE
  { id: "leed-l9-17g", name: "L9", spec: "17G", category: "ltc_doge", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2850, warranty: true },
  { id: "leed-l9-165g", name: "L9", spec: "16.5G", category: "ltc_doge", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2750, warranty: true },
  { id: "leed-l9-16g", name: "L9", spec: "16G", category: "ltc_doge", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2650, warranty: true },
  { id: "leed-l9-165g-now", name: "L9", spec: "16.5G", category: "ltc_doge", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2620, warranty: false },
  { id: "leed-l9-16g-now", name: "L9", spec: "16G", category: "ltc_doge", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2520, warranty: false },
  { id: "leed-l9-15g-now", name: "L9", spec: "15G", category: "ltc_doge", supplier: LEED, region: "HK", priceMode: "unit", priceUsd: 2350, warranty: false },

  // BTC air
  { id: "leed-s19kpro-120", name: "S19K Pro", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 3.25, hashrate: 120, warranty: true, note: "September" },
  { id: "leed-s19kpro-120-mix", name: "S19K Pro Mix", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 3.15, hashrate: 120, warranty: true, note: "September" },
  { id: "leed-s19jxp-151", name: "S19J XP", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 3.05, hashrate: 151, warranty: true },
  { id: "leed-s19jxp-143", name: "S19J XP", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 2.85, hashrate: 143, warranty: true },
  { id: "leed-s19jxp-136", name: "S19J XP", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 2.65, hashrate: 136, warranty: true },
  { id: "leed-s19xp-141", name: "S19 XP", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 2.85, hashrate: 141, warranty: true },
  { id: "leed-s19xp-134", name: "S19 XP", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 2.65, hashrate: 134, warranty: true },
  { id: "leed-s21pp-235", name: "S21++", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 6.4, hashrate: 235, warranty: true },
  { id: "leed-s21pp-225", name: "S21++", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 5.8, hashrate: 225, warranty: true },
  { id: "leed-s21pp-216", name: "S21++", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 5.7, hashrate: 216, warranty: true },
  { id: "leed-s21-151", name: "S21", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 5.3, hashrate: 151, warranty: true },

  // BTC hydro
  { id: "leed-s21jxp-hyd-495", name: "S21J XP Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 11.8, hashrate: 495, warranty: true },
  { id: "leed-s21exp-hyd-430", name: "S21e XP Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 8.4, hashrate: 430, warranty: true },
  { id: "leed-s21p-hyd-395", name: "S21+ Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 6.4, hashrate: 395, warranty: true },
  { id: "leed-s21p-hyd-358", name: "S21+ Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 6.3, hashrate: 358, warranty: true },
  { id: "leed-s21e-hyd-332", name: "S21e Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 4.7, hashrate: 332, warranty: true },
  { id: "leed-s21e-hyd-310", name: "S21e Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 4.5, hashrate: 310, warranty: true },
  { id: "leed-s21-hyd-319", name: "S21 Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 4.6, hashrate: 319, warranty: false },
  { id: "leed-s19xpp-hyd-293", name: "S19XP+ Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 3.8, hashrate: 293, warranty: true },
  { id: "leed-s19xp-hyd-257", name: "S19XP Hyd", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 2.7, hashrate: 257, warranty: true },
  { id: "leed-s23e-u2h-865", name: "S23e U2H", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 10.8, hashrate: 865, warranty: true, note: "Nov–Jan mix" },

  // Whatsminer — supplier quoted efficiency and price as bands, no hashrate given.
  { id: "leed-m50sp", name: "M50S+", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 3.7, priceUsdMax: 4.1, watts: 24, wattsMax: 26, warranty: true, note: "Hashrate varies — confirm per unit" },
  { id: "leed-m50spp", name: "M50S++", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 3.9, priceUsdMax: 4.6, watts: 22, wattsMax: 25, warranty: true, note: "Hashrate varies — confirm per unit" },
  { id: "leed-m60", name: "M60", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 4.2, priceUsdMax: 5.4, watts: 19, wattsMax: 23, warranty: true, note: "Hashrate varies — confirm per unit" },
  { id: "leed-m61", name: "M61", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 4.5, priceUsdMax: 5.8, watts: 18, wattsMax: 22, warranty: true, note: "Hashrate varies — confirm per unit" },
  { id: "leed-m61s", name: "M61S", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 5.4, priceUsdMax: 6.0, watts: 17.5, wattsMax: 19, warranty: true, note: "Hashrate varies — confirm per unit" },
  { id: "leed-m61sp", name: "M61S+", category: "btc_air", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 6.3, priceUsdMax: 7.0, watts: 16, wattsMax: 17.5, warranty: true, note: "Hashrate varies — confirm per unit" },
  { id: "leed-m63", name: "M63", category: "btc_hydro", supplier: LEED, region: "HK", priceMode: "perTerahash", priceUsd: 4.2, priceUsdMax: 4.8, watts: 19, wattsMax: 21, warranty: true, note: "Hashrate varies — confirm per unit" },

  // ------------------------------------------------------------------ Letine
  { id: "let-ks7-30", name: "KS7", category: "kas_dash", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1150, hashrate: 30, warranty: false },
  { id: "let-d9-1770g", name: "D9 Mix", spec: "1770G", category: "kas_dash", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1180, warranty: true, note: "7 days" },

  { id: "let-l9-16g", name: "L9", spec: "16G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2600, warranty: true },
  { id: "let-l9-165g", name: "L9", spec: "16.5G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2700, warranty: true },
  { id: "let-l9-17g", name: "L9", spec: "17G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2800, warranty: true },
  { id: "let-l9-15g-now", name: "L9", spec: "15G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2180, warranty: false },
  { id: "let-l9-165g-now", name: "L9", spec: "16.5G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2400, warranty: false },
  { id: "let-l7-9050m", name: "L7", spec: "9050M", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 650, warranty: true },
  { id: "let-l7-8800m", name: "L7", spec: "8800M", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 630, warranty: true },
  { id: "let-l11-20g-now", name: "L11", spec: "20G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 4300, warranty: false },
  { id: "let-u2l9-hyd-27g", name: "U2L9 Hyd Mix", spec: "27G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 5670, warranty: true, note: "7 days" },
  { id: "let-dghydro1-20g", name: "DG Hydro1", spec: "20G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1550, warranty: true },
  { id: "let-dghydro1-21g", name: "DG Hydro1", spec: "21G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1625, warranty: true },
  { id: "let-dg1p-14g-now", name: "DG1+", spec: "14G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1230, warranty: false },
  { id: "let-d1mini-22g", name: "D1 MINI Pre", spec: "2.2G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 620, warranty: true },
  { id: "let-fluminer-l2", name: "Fluminer L2", spec: "1.2G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 370, warranty: true },
  { id: "let-fluminer-l1pro", name: "Fluminer L1 Pro", spec: "6G", category: "ltc_doge", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1120, warranty: true },

  // Antminer air — Letine quotes a total and a $/T; the total is authoritative.
  { id: "let-s21-151", name: "S21", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 800, hashrate: 151, warranty: true, note: "$5.3/T" },
  { id: "let-s21pp-216", name: "S21++", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1274, hashrate: 216, warranty: true, note: "$5.9/T" },
  { id: "let-s21pp-225", name: "S21++", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1417, hashrate: 225, warranty: true, note: "$6.3/T" },
  { id: "let-s21pp-235", name: "S21++", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1528, hashrate: 235, warranty: true, note: "$6.5/T" },
  { id: "let-s21prop-234", name: "S21 Pro+", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1661, hashrate: 234, warranty: true, note: "$7.1/T" },
  { id: "let-s21prop-245", name: "S21 Pro+", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2009, hashrate: 245, warranty: true, note: "$8.2/T" },
  { id: "let-s21xp-270", name: "S21 XP", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 3240, hashrate: 270, warranty: true, note: "$12/T" },

  // Antminer hydro
  { id: "let-s19xpp-hyd-293", name: "S19XP+ Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1113, hashrate: 293, warranty: true, note: "$3.8/T · 15 days" },
  { id: "let-s21e-hyd-310", name: "S21E Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1488, hashrate: 310, warranty: true, note: "$4.8/T" },
  { id: "let-s21e-hyd-332", name: "S21E Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1660, hashrate: 332, warranty: true, note: "$5/T" },
  { id: "let-s21p-hyd-358", name: "S21+ Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2291, hashrate: 358, warranty: true, note: "$6.4/T" },
  { id: "let-s21p-hyd-395", name: "S21+ Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2607, hashrate: 395, warranty: true, note: "$6.6/T" },
  { id: "let-s21exp-hyd-430", name: "S21exp Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 3784, hashrate: 430, warranty: true, note: "$8.8/T" },
  { id: "let-s21jxp-hyd-495", name: "S21J XP Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 5940, hashrate: 495, warranty: true, note: "$12/T" },
  { id: "let-s23-hyd-563", name: "S23 Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 12893, hashrate: 563, warranty: true, note: "$22.9/T · 5 days" },
  { id: "let-s21exp-hyd-3u-860", name: "S21e XP Hyd 3U", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 7482, hashrate: 860, warranty: true, note: "$8.7/T · 7 days" },

  // Oil cooling
  { id: "let-s21-imm-215", name: "S21 IMM", category: "btc_oil", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1269, hashrate: 215, warranty: true, note: "$5.9/T" },
  { id: "let-s21-imm-227", name: "S21 IMM", category: "btc_oil", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1385, hashrate: 227, warranty: true, note: "$6.1/T" },
  { id: "let-s21xp-imm-300", name: "S21 XP IMM", category: "btc_oil", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 3630, hashrate: 300, warranty: true, note: "$12.1/T · 10 days" },

  // Sealminer
  { id: "let-a2pro-256", name: "Sealminer A2 Pro", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 2786, hashrate: 256, warranty: true, note: "14.9J · $10.8/T · 3 days" },
  { id: "let-a3pro-hyd-666", name: "Sealminer A3 Pro Hyd", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 8580, hashrate: 666, warranty: true, note: "12.5J · $13/T · 3 days" },

  // Whatsminer air — hashrate options given as a list; low/high stored.
  { id: "let-m50sp-24w", name: "M50S+ 24W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 4.1, hashrate: 130, hashrateMax: 146, watts: 24, warranty: true, note: "130–146T options" },
  { id: "let-m50sp-23w", name: "M50S+ 23W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 4.3, hashrate: 144, hashrateMax: 148, watts: 23, warranty: true, note: "144/146/148T" },
  { id: "let-m60-199w", name: "M60 19.9W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 5.1, hashrate: 154, hashrateMax: 166, watts: 19.9, warranty: true, note: "154–166T" },
  { id: "let-m61-21w", name: "M61 21W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 4.9, hashrate: 180, hashrateMax: 184, watts: 21, warranty: true, note: "180/182/184T" },
  { id: "let-m61s-185w", name: "M61S 18.5W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 5.7, hashrate: 204, hashrateMax: 220, watts: 18.5, warranty: true, note: "204–220T" },
  { id: "let-m61sp-17w", name: "M61S+ 17W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 6.5, hashrate: 220, hashrateMax: 238, watts: 17, warranty: true, note: "220–238T" },
  { id: "let-m61sp-165w", name: "M61S+ 16.5W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 6.7, hashrate: 240, hashrateMax: 250, watts: 16.5, warranty: true, note: "240–250T" },
  { id: "let-m70s-135w", name: "M70S 13.5W", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 11.7, hashrate: 256, hashrateMax: 262, watts: 13.5, warranty: true, note: "256–262T" },

  // Whatsminer hydro
  { id: "let-m63-199w", name: "M63 19.9W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 4.7, hashrate: 340, hashrateMax: 376, watts: 19.9, warranty: true, note: "340–376T" },
  { id: "let-m63s-185w", name: "M63S 18.5W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 6.5, hashrate: 372, hashrateMax: 402, watts: 18.5, warranty: true, note: "372–402T" },
  { id: "let-m63sp-17w", name: "M63S+ 17W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 7, hashrate: 398, hashrateMax: 414, watts: 17, warranty: true, note: "398–414T" },
  { id: "let-m63spp-16w", name: "M63S++ 16W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 7.6, hashrate: 442, hashrateMax: 452, watts: 16, warranty: true, note: "442–452T" },
  { id: "let-m63spp-15w", name: "M63S++ 15W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 8, hashrate: 482, hashrateMax: 492, watts: 15, warranty: true, note: "482–492T" },
  { id: "let-m65sp-17w", name: "M65S+ 17W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 6.1, hashrate: 400, hashrateMax: 414, watts: 17, warranty: true, note: "400–414T" },
  { id: "let-m7d-145w", name: "M7D 14.5W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 8.6, hashrate: 606, hashrateMax: 624, watts: 14.5, warranty: true, note: "606–624T" },
  { id: "let-m7ds-135w", name: "M7DS 13.5W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 10.1, hashrate: 648, hashrateMax: 696, watts: 13.5, warranty: true, note: "648–696T" },
  { id: "let-m74sp-125w", name: "M74S+ 12.5W", category: "btc_hydro", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 13.3, hashrate: 324, hashrateMax: 330, watts: 12.5, warranty: true, note: "324/330T" },

  // Whatsminer oil
  { id: "let-m66-199w", name: "M66 19.9W", category: "btc_oil", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 6, hashrate: 246, hashrateMax: 276, watts: 19.9, warranty: true, note: "246–276T" },
  { id: "let-m66sp-17w", name: "M66S+ 17W", category: "btc_oil", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 7, hashrate: 284, hashrateMax: 318, watts: 17, warranty: true, note: "284–318T" },

  // Avalon & Fluminer
  { id: "let-a15pro", name: "Avalon A15 Pro", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "perTerahash", priceUsd: 4.8, hashrate: 215, hashrateMax: 218, warranty: false, note: "215/218T" },
  { id: "let-a15-197", name: "Avalon A15", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 906, hashrate: 197, warranty: true, note: "$4.6/T · 10 days" },
  { id: "let-a15-203", name: "Avalon A15", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 954, hashrate: 203, warranty: true, note: "$4.7/T · 10 days" },
  { id: "let-nano3s-6", name: "Avalon Nano3s", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 215, hashrate: 6, warranty: true },
  { id: "let-mini3-375", name: "Avalon Mini3", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 819, hashrate: 37.5, warranty: true },
  { id: "let-avalonq-90", name: "Avalon Q", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1365, hashrate: 90, warranty: true },
  { id: "let-fluminer-t3-105", name: "Fluminer T3", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1280, hashrate: 105, warranty: true },
  { id: "let-fluminer-t3-110", name: "Fluminer T3", category: "btc_air", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 1380, hashrate: 110, warranty: true },

  // Bitaxe / solo
  { id: "let-gamma-601", name: "Bitaxe Gamma 601", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 45, hashrate: 1.2, watts: 18, warranty: true },
  { id: "let-gamma-601-max", name: "Bitaxe Gamma601 Max", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 67, hashrate: 1.9, warranty: true },
  { id: "let-gt-801", name: "Bitaxe GT 801", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 79, hashrate: 2.4, watts: 40, warranty: true },
  { id: "let-supra-hex-702", name: "Supra Hex 702", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 125, hashrate: 4.2, watts: 90, warranty: true },
  { id: "let-nerdqaxe-pp", name: "NerdQaxe++", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 140, hashrate: 4.8, watts: 75, warranty: true },
  { id: "let-nerdqaxe-pp-rev61", name: "NerdQaxe++ Rev6.1", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 170, hashrate: 6, watts: 100, warranty: true },
  { id: "let-nerdqx-8", name: "NerdQX", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 215, hashrate: 8, watts: 140, warranty: true },
  { id: "let-nerdoctaxe-96", name: "NerdOCTaxe", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 239, hashrate: 9.6, watts: 160, warranty: true },
  { id: "let-nerdoctaxe-12", name: "NerdOCTaxe", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 289, hashrate: 12, watts: 200, warranty: true },
  { id: "let-dx01", name: "DX 01", spec: "60MH/s", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 105, watts: 18, warranty: true },
  { id: "let-nexus-l1", name: "Nexus L1", spec: "330MH/s", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 209, watts: 70, warranty: true },
  { id: "let-nerdqaxe-pp-hyd", name: "NerdQaxe++ Hydro", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 160, hashrate: 4.8, watts: 75, warranty: true },
  { id: "let-nerdqaxe-pp-hyd-rev61", name: "NerdQaxe++ Hydro Rev6.1", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 185, hashrate: 6, watts: 100, warranty: true },
  { id: "let-nerdoctaxe-hyd-11", name: "NerdOCTaxe Rev2.2 Hydro", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 279, hashrate: 11, watts: 200, warranty: true },
  { id: "let-nerdoctaxe-hyd-138", name: "NerdOCTaxe Hydro", category: "solo", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 330, hashrate: 13.8, watts: 230, warranty: true },

  // Containers & spares
  { id: "let-antspace-hd5", name: "ANTSPACE HD5", spec: "1500KW · 308 racks", category: "container", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 66000, warranty: true, note: "45–60 days" },
  { id: "let-antspace-hw5", name: "ANTSPACE HW5", spec: "1200KW · 210 racks", category: "container", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 45000, warranty: true, note: "30–45 days" },
  { id: "let-radiator-12kw", name: "12KW Radiator", spec: "Auto temp control", category: "spares", supplier: LETINE, region: "HK", priceMode: "unit", priceUsd: 299, warranty: true },

  // USA stock
  { id: "let-usa-s21pp-235", name: "S21++", category: "btc_air", supplier: LETINE, region: "USA", priceMode: "perTerahash", priceUsd: 7.6, hashrate: 235, warranty: true, note: "USA stock" },
  { id: "let-usa-s21pp-225", name: "S21++", category: "btc_air", supplier: LETINE, region: "USA", priceMode: "perTerahash", priceUsd: 7.5, hashrate: 225, warranty: true, note: "USA stock" },
  { id: "let-usa-s21pp-216", name: "S21++", category: "btc_air", supplier: LETINE, region: "USA", priceMode: "perTerahash", priceUsd: 7.4, hashrate: 216, warranty: true, note: "USA stock" },
  { id: "let-usa-s21prop-245", name: "S21 Pro+", category: "btc_air", supplier: LETINE, region: "USA", priceMode: "perTerahash", priceUsd: 9.3, hashrate: 245, warranty: true, note: "USA stock" },
  { id: "let-usa-s21prop-234", name: "S21 Pro+", category: "btc_air", supplier: LETINE, region: "USA", priceMode: "perTerahash", priceUsd: 8.6, hashrate: 234, warranty: true, note: "USA stock" },
  { id: "let-usa-l9-16g", name: "L9", spec: "16G", category: "ltc_doge", supplier: LETINE, region: "USA", priceMode: "unit", priceUsd: 2780, warranty: true, note: "USA stock" },
  { id: "let-usa-avalonq-90", name: "Avalon Q", category: "btc_air", supplier: LETINE, region: "USA", priceMode: "unit", priceUsd: 1320, hashrate: 90, warranty: true, note: "USA stock" },
];

/** USD for one unit. Per-terahash products need a hashrate to resolve. */
export function unitPriceUsd(p: Product, hashrateOverride?: number): number {
  if (p.priceMode === "unit") return p.priceUsd;
  const th = hashrateOverride ?? p.hashrate ?? 0;
  return p.priceUsd * th;
}

/** Display label: "S21++ 235T" or "L9 16G". */
export function productLabel(p: Product): string {
  if (p.spec) return `${p.name} ${p.spec}`;
  if (p.hashrate) {
    const range = p.hashrateMax && p.hashrateMax !== p.hashrate ? `–${p.hashrateMax}` : "";
    return `${p.name} ${p.hashrate}${range}T`;
  }
  return p.name;
}

export function findProduct(id: string): Product | undefined {
  return CATALOGUE.find((p) => p.id === id);
}

export function categoryLabel(id: Category): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function searchCatalogue(query: string, category?: Category): Product[] {
  const q = query.trim().toLowerCase();
  return CATALOGUE.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    return (
      productLabel(p).toLowerCase().includes(q) ||
      p.supplier.toLowerCase().includes(q) ||
      (p.note ?? "").toLowerCase().includes(q)
    );
  });
}

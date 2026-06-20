export type Category = "Flower" | "Pre-rolls" | "Edibles" | "Vapes" | "Concentrates" | "CBD" | "Accessories";

export interface Product {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  thc?: string; // e.g. "THC 22%"
  emoji: string; // lightweight visual placeholder (no remote images required)
  popular?: boolean;
}

export interface Shop {
  id: string;
  name: string;
  tagline: string;
  area: string; // suburb / city
  rating: number; // 0..5
  ratingCount: number;
  distanceKm: number;
  etaMin: number;
  etaMax: number;
  deliveryFee: number;
  minOrder: number;
  categories: Category[];
  emoji: string;
  featured?: boolean;
  open: boolean;
}

export interface CartLine {
  productId: string;
  qty: number;
}

export type PaymentMethodId = "payfast" | "yoco" | "ozow" | "snapscan" | "card" | "cash";

export type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface Order {
  id: string;
  shopId: string;
  shopName: string;
  lines: { name: string; qty: number; price: number }[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tip: number;
  total: number;
  paymentMethod: PaymentMethodId;
  paymentRef?: string;
  address: string;
  createdAt: number;
  status: OrderStatus;
  etaMin: number;
  etaMax: number;
}

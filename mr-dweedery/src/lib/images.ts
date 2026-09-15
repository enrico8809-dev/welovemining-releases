// Static image maps. React Native's bundler needs literal require() paths, so
// these are generated to match the ids in data.ts and the tiles in assets/.
import { ImageSourcePropType } from "react-native";

export const PRODUCT_IMAGES: Record<string, ImageSourcePropType> = {
  p1: require("../../assets/products/p1.png"),
  p2: require("../../assets/products/p2.png"),
  p3: require("../../assets/products/p3.png"),
  p4: require("../../assets/products/p4.png"),
  p5: require("../../assets/products/p5.png"),
  p6: require("../../assets/products/p6.png"),
  p7: require("../../assets/products/p7.png"),
  p8: require("../../assets/products/p8.png"),
  p9: require("../../assets/products/p9.png"),
  p10: require("../../assets/products/p10.png"),
  p11: require("../../assets/products/p11.png"),
  p12: require("../../assets/products/p12.png"),
  p13: require("../../assets/products/p13.png"),
  p14: require("../../assets/products/p14.png"),
  p15: require("../../assets/products/p15.png"),
  p16: require("../../assets/products/p16.png"),
  p17: require("../../assets/products/p17.png"),
  p18: require("../../assets/products/p18.png"),
  p19: require("../../assets/products/p19.png"),
  p20: require("../../assets/products/p20.png"),
  p21: require("../../assets/products/p21.png"),
  p22: require("../../assets/products/p22.png"),
  p23: require("../../assets/products/p23.png"),
  p24: require("../../assets/products/p24.png"),
  p25: require("../../assets/products/p25.png"),
  p26: require("../../assets/products/p26.png"),
  p27: require("../../assets/products/p27.png"),
  p28: require("../../assets/products/p28.png"),
  p29: require("../../assets/products/p29.png"),
  p30: require("../../assets/products/p30.png"),
  p31: require("../../assets/products/p31.png"),
  p32: require("../../assets/products/p32.png"),
  p33: require("../../assets/products/p33.png"),
  p34: require("../../assets/products/p34.png"),
  p35: require("../../assets/products/p35.png"),
  p36: require("../../assets/products/p36.png"),
  p37: require("../../assets/products/p37.png"),
  p38: require("../../assets/products/p38.png"),
  p39: require("../../assets/products/p39.png"),
  p40: require("../../assets/products/p40.png"),
  p41: require("../../assets/products/p41.png"),
  p42: require("../../assets/products/p42.png"),
  p43: require("../../assets/products/p43.png"),
  p44: require("../../assets/products/p44.png"),
};

export const SHOP_IMAGES: Record<string, ImageSourcePropType> = {
  s1: require("../../assets/shops/s1.png"),
  s2: require("../../assets/shops/s2.png"),
  s3: require("../../assets/shops/s3.png"),
  s4: require("../../assets/shops/s4.png"),
  s5: require("../../assets/shops/s5.png"),
  s6: require("../../assets/shops/s6.png"),
  s7: require("../../assets/shops/s7.png"),
  s8: require("../../assets/shops/s8.png"),
  s9: require("../../assets/shops/s9.png"),
  s10: require("../../assets/shops/s10.png"),
};

export function productImage(id: string): ImageSourcePropType | undefined {
  return PRODUCT_IMAGES[id];
}

export function shopImage(id: string): ImageSourcePropType | undefined {
  return SHOP_IMAGES[id];
}

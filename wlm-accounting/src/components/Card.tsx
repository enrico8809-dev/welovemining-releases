import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { C, ELEV, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

type Accent = "orange" | "green" | "red" | "none";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tints the border and washes the surface — used for money-coded cards. */
  accent?: Accent;
  /** Raised cards sit on the higher-elevation surface (hero panels). */
  raised?: boolean;
  /** Section label rendered above the content. */
  title?: string;
  /** Optional control shown opposite the title. */
  action?: React.ReactNode;
  onPress?: () => void;
  /** Stagger index for the entrance animation. */
  index?: number;
}

const BORDER: Record<Accent, string> = {
  orange: C.orangeLine,
  green: C.greenDim,
  red: C.redDim,
  none: C.lineSoft,
};

/** A wash, not a fill — the accent should read without shouting. */
const WASH: Record<Accent, string | null> = {
  orange: null,
  green: "rgba(52,211,153,0.05)",
  red: "rgba(248,113,113,0.05)",
  none: null,
};

export default function Card({
  children,
  style,
  accent = "none",
  raised = false,
  title,
  action,
  onPress,
  index = 0,
}: CardProps) {
  const backgroundColor = WASH[accent] ?? (raised ? C.panel3 : C.panel);

  const body = (
    <>
      {(title || action) && (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      {children}
    </>
  );

  const cardStyle = [styles.card, { borderColor: BORDER[accent], backgroundColor }, style];

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(320)}>
      {onPress ? (
        <Pressable
          style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
          onPress={() => {
            haptics.tap();
            onPress();
          }}
        >
          {body}
        </Pressable>
      ) : (
        <View style={cardStyle}>{body}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: R.lg,
    borderWidth: 1,
    padding: S.lg,
    ...ELEV.card,
  },
  pressed: { backgroundColor: C.panel3, transform: [{ scale: 0.99 }] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: S.md,
  },
  title: { ...T.label, color: C.mute },
});

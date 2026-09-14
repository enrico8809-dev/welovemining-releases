import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { C, ELEV, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

type Accent = "orange" | "green" | "red" | "none";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: Accent;
  /** Section label rendered above the content. */
  title?: string;
  /** Optional control shown opposite the title. */
  action?: React.ReactNode;
  onPress?: () => void;
  /** Stagger index for the entrance animation. */
  index?: number;
}

const ACCENTS: Record<Accent, string> = {
  orange: C.orange,
  green: C.green,
  red: C.red,
  none: C.line,
};

export default function Card({
  children,
  style,
  accent = "none",
  title,
  action,
  onPress,
  index = 0,
}: CardProps) {
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

  const cardStyle = [styles.card, { borderColor: ACCENTS[accent] }, style];

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
    backgroundColor: C.panel,
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

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { C, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

const WLM_MARK = require("../assets/wlm-mark.png");

interface HeaderProps {
  /** Replaces the brand lockup with a title + back button on pushed screens. */
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}

export default function Header({ title, subtitle, onBack, action }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + S.sm }]}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => {
            haptics.tap();
            onBack();
          }}
          style={styles.back}
        >
          <ChevronLeft color={C.text} size={22} />
        </Pressable>
      ) : (
        <View style={styles.badge}>
          <Image source={WLM_MARK} style={styles.mark} resizeMode="contain" />
        </View>
      )}

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? "WLM ACCOUNTING"}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle ?? "WeLoveMining Pty Ltd"}
        </Text>
      </View>

      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.lg,
    paddingBottom: S.lg,
    gap: S.md,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { width: 30, height: 30 },
  titles: { flex: 1 },
  title: { ...T.title, color: C.text },
  subtitle: { ...T.caption, color: C.mute, marginTop: 1 },
});

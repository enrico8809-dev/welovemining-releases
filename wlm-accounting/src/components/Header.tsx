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

/**
 * Brand header: glowing logo badge, split-colour wordmark, and a date chip when
 * there's room for it. The date only shows on the brand lockup — on a pushed
 * screen the subtitle is carrying more useful information.
 */
export default function Header({ title, subtitle, onBack, action }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const isBrand = !title && !onBack;

  const today = new Date().toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <View style={[styles.row, { paddingTop: insets.top + S.md }]}>
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
        <View style={styles.badgeOuter}>
          <View style={styles.badge}>
            <Image source={WLM_MARK} style={styles.mark} resizeMode="contain" />
          </View>
        </View>
      )}

      <View style={styles.titles}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Text style={styles.title} numberOfLines={1}>
            <Text style={{ color: C.orange }}>WLM</Text> ACCOUNTING
          </Text>
        )}
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle ?? "WeLoveMining Pty Ltd"}
        </Text>
      </View>

      {action}
      {isBrand && !action && (
        <View style={styles.dateChip}>
          <Text style={styles.dateText}>{today}</Text>
        </View>
      )}
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
  badgeOuter: {
    padding: 2,
    borderRadius: R.md,
    backgroundColor: C.orangeSoft,
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: R.md - 2,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: "rgba(247,147,26,0.35)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: R.md,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { width: 30, height: 30 },
  titles: { flex: 1 },
  title: { ...T.title, color: C.text },
  subtitle: { ...T.caption, color: C.mute, marginTop: 1 },
  dateChip: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: R.pill,
    paddingHorizontal: S.md,
    paddingVertical: 6,
  },
  dateText: { ...T.caption, color: C.mute },
});

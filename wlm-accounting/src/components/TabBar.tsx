import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from "react-native-reanimated";
import { BarChart3, BookOpen, Boxes, FileText, Home, PlusCircle } from "lucide-react-native";
import { C, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

const ICONS: Record<string, React.ComponentType<{ color: string; size: number }>> = {
  Home,
  Ledger: BookOpen,
  Add: PlusCircle,
  Invoices: FileText,
  Stock: Boxes,
  Reports: BarChart3,
};

/**
 * Custom tab bar: an orange indicator springs to the active tab, and the active
 * icon lifts slightly. Labels are always present, so the indicator is decoration
 * rather than the only signal of where you are.
 */
export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const count = state.routes.length;

  const progress = useDerivedValue(() =>
    withSpring(state.index, { damping: 18, stiffness: 180 })
  );

  const indicator = useAnimatedStyle(() => ({
    left: `${(progress.value * 100) / count}%`,
    width: `${100 / count}%`,
  }));

  // Android draws edge-to-edge, so the system nav/gesture bar sits on top of us.
  // Reserve its full height plus a small buffer — on Samsung's gesture navigation
  // the reported inset is short of where the gesture pill actually floats, which
  // left the tab labels sitting underneath it.
  const bottomInset = Math.max(insets.bottom, S.sm) + (insets.bottom > 0 ? S.sm : S.md);

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset }]}>
      <Animated.View style={[styles.indicatorSlot, indicator]}>
        <View style={styles.indicator} />
      </Animated.View>

      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const Icon = ICONS[route.name] ?? Home;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            haptics.tap();
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={onPress}
            style={styles.tab}
          >
            <View style={[styles.iconWrap, focused && styles.iconWrapOn]}>
              <Icon color={focused ? C.orange : C.mute} size={19} />
            </View>
            <Text style={[styles.label, focused && styles.labelOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: S.sm,
  },
  indicatorSlot: {
    position: "absolute",
    top: 0,
    alignItems: "center",
  },
  indicator: {
    width: 24,
    height: 3,
    borderBottomLeftRadius: R.sm,
    borderBottomRightRadius: R.sm,
    backgroundColor: C.orange,
  },
  tab: { flex: 1, alignItems: "center", gap: 2, paddingTop: S.xs },
  iconWrap: { padding: 2 },
  iconWrapOn: { transform: [{ translateY: -1 }] },
  label: { ...T.caption, fontSize: 10, color: C.mute },
  labelOn: { color: C.orange },
});

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react-native";
import { C, ELEV, R, S, T } from "../lib/theme";
import * as haptics from "../lib/haptics";

type ToastKind = "success" | "error" | "warning" | "info";

interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastApi {
  show: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

// Status colour never travels alone — each kind ships with its own icon.
const KINDS = {
  success: { color: C.green, Icon: CheckCircle2 },
  error: { color: C.red, Icon: XCircle },
  warning: { color: C.amber, Icon: AlertTriangle },
  info: { color: C.orange, Icon: Info },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (text: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, text }]);
      if (kind === "success") haptics.success();
      else if (kind === "error") haptics.error();
      else if (kind === "warning") haptics.warn();
      setTimeout(() => dismiss(id), 2800);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View style={[styles.host, { top: insets.top + S.sm }]} pointerEvents="box-none">
        {toasts.map((t) => {
          const { color, Icon } = KINDS[t.kind];
          return (
            <Animated.View key={t.id} entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)}>
              <Pressable style={[styles.toast, { borderColor: color }]} onPress={() => dismiss(t.id)}>
                <Icon color={color} size={18} />
                <Text style={styles.text} numberOfLines={2}>
                  {t.text}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: S.lg,
    right: S.lg,
    zIndex: 1000,
    gap: S.sm,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    backgroundColor: C.panel3,
    borderWidth: 1,
    borderRadius: R.md,
    paddingVertical: S.md,
    paddingHorizontal: S.lg,
    ...ELEV.card,
  },
  text: { ...T.body, color: C.text, flex: 1 },
});

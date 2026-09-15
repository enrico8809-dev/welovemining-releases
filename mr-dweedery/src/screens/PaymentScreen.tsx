import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Button from "../components/Button";
import { useStore } from "../lib/StoreContext";
import {
  ChargeRequest,
  GatewayCheckout,
  PAY_CANCEL_URL,
  PAY_RETURN_URL,
  chargeYocoToken,
  createGatewayCheckout,
  PAYMENTS_CONFIG,
} from "../lib/payments";
import { fmt } from "../lib/format";
import { C } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

type Phase = "loading" | "webview" | "processing" | "error";

function escapeAttr(v: string): string {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function formHtml(checkout: GatewayCheckout): string {
  const inputs = Object.entries(checkout.fields || {})
    .map(([k, v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}">`)
    .join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,Roboto,sans-serif;background:#F2F4F3;color:#1E2522;
text-align:center;padding-top:80px}</style></head>
<body onload="document.forms[0].submit()">
<form action="${escapeAttr(checkout.url)}" method="post">${inputs}</form>
<p>Redirecting to secure checkout…</p></body></html>`;
}

function yocoHtml(publicKey: string, cents: number, reference: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,Roboto,sans-serif;background:#F2F4F3;color:#1E2522;text-align:center;padding-top:60px}</style>
<script src="https://js.yoco.com/sdk/v1/yoco-sdk-web.js"></script></head>
<body><p id="s">Opening secure card form…</p>
<script>
function send(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));}
try{
  var yoco=new window.YocoSDK({publicKey:"${escapeAttr(publicKey)}"});
  yoco.showPopup({amountInCents:${cents},currency:"ZAR",name:"Mr Dweedery",description:"${escapeAttr(reference)}",
    callback:function(r){ if(r.error){send({type:"error",message:r.error.message});} else {send({type:"token",token:r.id});} }});
}catch(e){send({type:"error",message:String(e)});}
</script></body></html>`;
}

export default function PaymentScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "Payment">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { placeOrder } = useStore();
  const { order, email } = route.params;

  const req = useMemo<ChargeRequest>(
    () => ({ method: order.paymentMethod, amount: order.total, orderId: order.id, reference: order.id, customerEmail: email }),
    [order, email]
  );

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);

  const finalizeSuccess = useCallback(
    async (reference: string) => {
      setPhase("processing");
      await placeOrder({ ...order, paymentRef: reference, status: "placed" });
      navigation.reset({
        index: 1,
        routes: [{ name: "Tabs" }, { name: "OrderTracking", params: { orderId: order.id } }],
      });
    },
    [order, placeOrder, navigation]
  );

  const fail = useCallback((msg: string) => {
    setError(msg);
    setPhase("error");
  }, []);

  // Kick off the gateway-specific flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (order.paymentMethod === "card" || order.paymentMethod === "yoco") {
          const key = PAYMENTS_CONFIG.yoco.publicKey;
          if (!key) throw new Error("Yoco public key is not configured.");
          if (!cancelled) {
            setHtml(yocoHtml(key, Math.round(order.total * 100), order.id));
            setPhase("webview");
          }
          return;
        }
        // Redirect / QR gateways.
        const checkout = await createGatewayCheckout(req);
        if (cancelled) return;
        if (order.paymentMethod === "snapscan") {
          setUri(checkout.url); // GET page with the QR
        } else {
          setHtml(formHtml(checkout)); // PayFast / Ozow auto-submit POST form
        }
        setPhase("webview");
      } catch (e: any) {
        if (!cancelled) fail(e?.message ?? "Could not start payment.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order, req, fail]);

  // Yoco token → backend charge.
  const onMessage = useCallback(
    async (e: WebViewMessageEvent) => {
      let msg: { type?: string; token?: string; message?: string } = {};
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === "token" && msg.token) {
        setPhase("processing");
        const result = await chargeYocoToken(msg.token, req);
        if (result.ok) finalizeSuccess(result.reference);
        else fail(result.message);
      } else if (msg.type === "error") {
        fail(msg.message || "Card payment failed.");
      }
    },
    [req, finalizeSuccess, fail]
  );

  // Intercept the hosted-checkout return/cancel deep links (PayFast/Ozow).
  const onShouldStart = useCallback(
    (request: { url: string }) => {
      if (request.url.startsWith(PAY_RETURN_URL)) {
        finalizeSuccess(order.id);
        return false;
      }
      if (request.url.startsWith(PAY_CANCEL_URL)) {
        navigation.goBack();
        return false;
      }
      return true;
    },
    [order.id, finalizeSuccess, navigation]
  );

  if (phase === "loading" || phase === "processing") {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={styles.centerText}>
          {phase === "processing" ? "Confirming your payment…" : "Starting secure checkout…"}
        </Text>
      </SafeAreaView>
    );
  }

  if (phase === "error") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errEmoji}>⚠️</Text>
        <Text style={styles.errTitle}>Payment not completed</Text>
        <Text style={styles.centerText}>{error}</Text>
        <Button label="Back to checkout" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <WebView
        originWhitelist={["*"]}
        source={html ? { html } : { uri: uri! }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        style={styles.web}
      />
      {order.paymentMethod === "snapscan" ? (
        <View style={styles.snapFooter}>
          <Text style={styles.snapNote}>
            Scan the code with the SnapScan app to pay {fmt(order.total)}. Tap below once it's done.
          </Text>
          <Button label="I've completed payment" onPress={() => finalizeSuccess(order.id)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  web: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: 28 },
  centerText: { color: C.mute, fontSize: 14, marginTop: 14, textAlign: "center", lineHeight: 20 },
  errEmoji: { fontSize: 44 },
  errTitle: { color: C.text, fontSize: 20, fontWeight: "800", marginTop: 10 },
  snapFooter: { padding: 16, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, gap: 10 },
  snapNote: { color: C.mute, fontSize: 13, textAlign: "center" },
});

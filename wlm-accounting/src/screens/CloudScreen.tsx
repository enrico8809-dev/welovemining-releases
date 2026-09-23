import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react-native";
import Header from "../components/Header";
import Card from "../components/Card";
import Button from "../components/Button";
import Field from "../components/Field";
import SegmentedControl from "../components/SegmentedControl";
import { useToast } from "../components/Toast";
import { useLedger } from "../lib/LedgerContext";
import {
  CloudUser,
  checkServer,
  claimServer,
  inviteUser,
  listUsers,
  removeUser,
  signIn,
} from "../lib/sync";
import { fmtDate } from "../lib/format";
import { C, R, S, T } from "../lib/theme";
import { RootStackParamList } from "../navigation/routes";

type Mode = "signin" | "claim";

export default function CloudScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  const { cloud, syncing, lastSync, pendingSync, connectCloud, disconnectCloud, syncNow } =
    useLedger();

  const [serverUrl, setServerUrl] = useState("https://accounting.welovemining.co.za");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [serverClaimed, setServerClaimed] = useState<boolean | null>(null);

  const [users, setUsers] = useState<CloudUser[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"bookkeeper" | "viewer">("bookkeeper");

  const isOwner = cloud?.user.role === "owner";

  useEffect(() => {
    if (!cloud || !isOwner) return;
    listUsers(cloud)
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, [cloud, isOwner]);

  const probe = async () => {
    setBusy(true);
    try {
      const health = await checkServer(serverUrl);
      setServerClaimed(health.claimed);
      // An unclaimed server needs an owner before anyone can sign in.
      setMode(health.claimed ? "signin" : "claim");
      toast.show(
        health.claimed
          ? "Server reachable — sign in"
          : "Server reachable and unclaimed — create the owner account"
      );
    } catch (e) {
      setServerClaimed(null);
      toast.show((e as Error).message || "Couldn't reach that server", "error");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      const result =
        mode === "claim"
          ? await claimServer(serverUrl, email, password, name || "Owner")
          : await signIn(serverUrl, email, password, inviteCode || undefined);

      await connectCloud({
        serverUrl: serverUrl.replace(/\/+$/, ""),
        token: result.token,
        user: result.user,
        lastSyncAt: 0,
      });
      setPassword("");
      setInviteCode("");
      toast.show(`Signed in as ${result.user.name}`);

      // First sync straight away, so the books are shared before they close the app.
      const outcome = await syncNow();
      if (outcome.ok) {
        toast.show(`Synced — ${outcome.pushed} up, ${outcome.pulled} down`);
      }
    } catch (e) {
      toast.show((e as Error).message || "Couldn't sign in", "error");
    } finally {
      setBusy(false);
    }
  };

  const doSync = async () => {
    const outcome = await syncNow();
    if (!outcome.ok) {
      toast.show(outcome.error ?? "Sync failed", "error");
      return;
    }
    if (outcome.readOnly) {
      toast.show(`Pulled ${outcome.pulled} — your account is view-only`, "warning");
      return;
    }
    toast.show(`Synced — ${outcome.pushed} up, ${outcome.pulled} down`);
  };

  const signOut = () => {
    Alert.alert(
      "Sign out of the cloud?",
      "Your books stay on this phone. They just stop syncing until you sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await disconnectCloud();
            toast.show("Signed out");
          },
        },
      ]
    );
  };

  const invite = async () => {
    if (!cloud) return;
    setBusy(true);
    try {
      const result = await inviteUser(cloud, newEmail, newEmail, newRole);
      setUsers((prev) => [...prev, result.user]);
      setNewEmail("");
      // No mail server here on purpose — the code is shown once for the owner
      // to pass on however they like.
      Alert.alert(
        "Invite created",
        `Give ${result.user.email} this code:\n\n${result.inviteCode}\n\nThey enter it with a new password the first time they sign in.`
      );
    } catch (e) {
      toast.show((e as Error).message || "Couldn't create the invite", "error");
    } finally {
      setBusy(false);
    }
  };

  const kick = (user: CloudUser) => {
    if (!cloud) return;
    Alert.alert(`Remove ${user.email}?`, "They lose access immediately.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeUser(cloud, user.id);
            setUsers((prev) => prev.filter((u) => u.id !== user.id));
            toast.show("Removed");
          } catch (e) {
            toast.show((e as Error).message || "Couldn't remove them", "error");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header
        title="CLOUD"
        subtitle={cloud ? cloud.user.email : "Not connected"}
        onBack={() => nav.goBack()}
      />

      <View style={styles.body}>
        {cloud ? (
          <>
            <Card index={0} accent="green">
              <View style={styles.statusRow}>
                <View style={styles.statusIcon}>
                  <Cloud color={C.green} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>{cloud.user.name}</Text>
                  <Text style={styles.statusNote}>
                    {cloud.user.email} · {roleLabel(cloud.user.role)}
                  </Text>
                  <Text style={styles.statusNote}>{cloud.serverUrl}</Text>
                </View>
              </View>

              <View style={styles.syncRow}>
                <Text style={styles.syncText}>
                  {cloud.lastSyncedIso
                    ? `Last synced ${new Date(cloud.lastSyncedIso).toLocaleString("en-ZA")}`
                    : "Not synced yet"}
                </Text>
                {lastSync?.error && <Text style={styles.syncError}>{lastSync.error}</Text>}
                <Text style={styles.note}>
                  {syncing
                    ? "Syncing now…"
                    : pendingSync
                      ? "Sending your latest changes…"
                      : "Syncing happens on its own — when you open the app, shortly after anything changes, and every minute while it's in front of you. The button is only for hurrying it along."}
                </Text>
              </View>

              <Button
                label={syncing ? "Syncing…" : "Sync now"}
                onPress={doSync}
                loading={syncing}
                icon={<RefreshCw color={C.bg} size={16} />}
                size="lg"
              />
              <Button
                label="Sign out"
                variant="secondary"
                onPress={signOut}
                icon={<CloudOff color={C.text} size={16} />}
                style={{ marginTop: S.sm }}
              />
            </Card>

            {cloud.user.role === "viewer" && (
              <Card index={1} accent="orange">
                <Text style={styles.note}>
                  Your account is view-only. You'll receive everyone else's changes, but
                  anything you capture on this phone stays on this phone.
                </Text>
              </Card>
            )}

            {isOwner && (
              <>
                <Card index={2} title="PEOPLE">
                  {users.length === 0 ? (
                    <Text style={styles.note}>Just you so far.</Text>
                  ) : (
                    users.map((u) => (
                      <View key={u.id} style={styles.userRow}>
                        <View style={styles.userIcon}>
                          {u.pendingInvite ? (
                            <UserPlus color={C.amber} size={15} />
                          ) : (
                            <CheckCircle2 color={C.green} size={15} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userEmail} numberOfLines={1}>
                            {u.email}
                          </Text>
                          <Text style={styles.userMeta}>
                            {roleLabel(u.role)}
                            {u.pendingInvite
                              ? " · invite not yet used"
                              : u.lastSeenAt
                                ? ` · last seen ${fmtDate(new Date(u.lastSeenAt).toISOString().slice(0, 10))}`
                                : ""}
                          </Text>
                        </View>
                        {u.id !== cloud.user.id && (
                          <Pressable hitSlop={8} onPress={() => kick(u)}>
                            <Trash2 color={C.mute} size={15} />
                          </Pressable>
                        )}
                      </View>
                    ))
                  )}
                </Card>

                <Card index={3} title="ADD SOMEONE">
                  <Field
                    label="EMAIL"
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="bookkeeper@welovemining.co.za"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <View style={{ height: S.lg }} />
                  <Text style={styles.fieldLabel}>ACCESS</Text>
                  <SegmentedControl
                    options={[
                      { id: "bookkeeper", label: "Can edit" },
                      { id: "viewer", label: "View only" },
                    ]}
                    value={newRole}
                    onChange={setNewRole}
                  />
                  <Button
                    label="Create invite"
                    variant="secondary"
                    onPress={invite}
                    loading={busy}
                    icon={<UserPlus color={C.text} size={16} />}
                    style={{ marginTop: S.lg }}
                  />
                  <Text style={styles.note}>
                    You'll get a code to pass on. They set their own password the first
                    time they sign in.
                  </Text>
                </Card>
              </>
            )}
          </>
        ) : (
          <>
            <Card index={0} title="SERVER">
              <Text style={styles.note}>
                The address of your own server, reached through the Cloudflare tunnel.
                Your books never leave your hardware.
              </Text>
              <View style={{ height: S.lg }} />
              <Field
                label="ADDRESS"
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                placeholder="https://accounting.welovemining.co.za"
              />
              <Button
                label="Check connection"
                variant="secondary"
                onPress={probe}
                loading={busy}
                style={{ marginTop: S.md }}
              />
              {serverClaimed !== null && (
                <Text style={serverClaimed ? styles.okNote : styles.warnNote}>
                  {serverClaimed
                    ? "Reachable, and already set up."
                    : "Reachable, and waiting for its first account."}
                </Text>
              )}
            </Card>

            <Card index={1} title={mode === "claim" ? "CREATE THE OWNER" : "SIGN IN"}>
              {mode === "claim" && (
                <>
                  <Text style={styles.note}>
                    This server has no accounts yet. The first one becomes the owner and
                    can invite everyone else.
                  </Text>
                  <View style={{ height: S.lg }} />
                  <Field label="YOUR NAME" value={name} onChangeText={setName} autoCapitalize="words" />
                  <View style={{ height: S.lg }} />
                </>
              )}

              <Field
                label="EMAIL"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={{ height: S.lg }} />
              <Field
                label={mode === "claim" ? "CHOOSE A PASSWORD" : "PASSWORD"}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
              />
              {mode === "signin" && (
                <>
                  <View style={{ height: S.lg }} />
                  <Field
                    label="INVITE CODE (FIRST TIME ONLY)"
                    value={inviteCode}
                    onChangeText={(v) => setInviteCode(v.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="Leave blank if you already have an account"
                    mono
                  />
                </>
              )}

              <Button
                label={mode === "claim" ? "Create account" : "Sign in"}
                onPress={connect}
                loading={busy}
                size="lg"
                style={{ marginTop: S.lg }}
              />
              <Text style={styles.note}>
                At least 10 characters. This is your books on the open internet — a short
                password is the weak link, not the tunnel.
              </Text>
            </Card>

            <Card index={2} title="HOW THIS WORKS">
              <Text style={styles.explain}>
                The app keeps working with no signal. Everything you capture is saved on
                the phone first, then exchanged with the server when you sync. If two
                devices change the same thing, the later change wins.
              </Text>
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "viewer") return "View only";
  return "Can edit";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: S.huge },
  body: { paddingHorizontal: S.lg, gap: S.lg },
  statusRow: { flexDirection: "row", gap: S.md, alignItems: "center" },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: { ...T.bodyBold, color: C.text },
  statusNote: { ...T.caption, color: C.mute, marginTop: 2 },
  syncRow: { marginVertical: S.lg },
  syncText: { ...T.small, color: C.textDim },
  syncError: { ...T.caption, color: C.red, marginTop: S.xs },
  note: { ...T.caption, color: C.mute, marginTop: S.md, lineHeight: 17 },
  okNote: { ...T.caption, color: C.green, marginTop: S.md },
  warnNote: { ...T.caption, color: C.amber, marginTop: S.md },
  explain: { ...T.small, color: C.textDim, lineHeight: 20 },
  fieldLabel: { ...T.label, color: C.mute, marginBottom: S.sm },
  userRow: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm },
  userIcon: {
    width: 28,
    height: 28,
    borderRadius: R.pill,
    backgroundColor: C.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  userEmail: { ...T.small, color: C.text },
  userMeta: { ...T.caption, color: C.mute, marginTop: 2 },
});

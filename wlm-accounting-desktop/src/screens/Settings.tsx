import { useEffect, useState } from "react";
import { Cloud, Download, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import { normaliseLedger } from "@engine/ledgerModel";
import { CloudUser, claimServer, checkServer, inviteUser, listUsers, removeUser, signIn } from "@engine/sync";
import { MONTHS, abs, fmt, fmtDate } from "@engine/format";
import Screen from "../components/Screen";
import {
  Card,
  Field,
  Modal,
  MoneyInput,
  NumberInput,
  Pill,
  Select,
  TextInput,
} from "../components/ui";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function Settings() {
  const {
    settings,
    updateSettings,
    openingBank,
    setOpeningBank,
    exportSnapshot,
    replaceLedger,
    cloud,
    connectCloud,
    disconnectCloud,
    lastSync,
  } = useLedger();
  const toast = useToast();

  const [opening, setOpening] = useState(openingBank ? abs(openingBank) : "");
  const [ledgerPath, setLedgerPath] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    api.ledger.path().then(setLedgerPath);
  }, []);

  const set = (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch);
  const bank = settings.bank;
  const landed = settings.landedCost;

  const backup = async () => {
    const path = await api.saveTextFile(
      `wlm-accounting-${new Date().toISOString().slice(0, 10)}.json`,
      ["json"],
      JSON.stringify(exportSnapshot(), null, 2)
    );
    if (path) toast.show("Backup saved");
  };

  const restore = async () => {
    const picked = await api.openTextFile("Backup", ["json"]);
    if (!picked) return;
    try {
      await replaceLedger(normaliseLedger(JSON.parse(picked.text)));
      toast.show("Books restored from backup");
    } catch {
      toast.show("That file isn't a WLM Accounting backup", "error");
    }
  };

  const pickLogo = async () => {
    const picked = await api.pickImage();
    if (!picked) return;
    if (picked.bytes > 400_000) {
      toast.show("That image is over 400KB — use a smaller one so it syncs quickly", "error");
      return;
    }
    await set({ logo: picked.dataUri });
    toast.show("Logo updated — it syncs to the phone too");
  };

  return (
    <Screen title="Settings" subtitle="Company, banking, costing and the cloud">
      <div className="stack" style={{ maxWidth: 1100 }}>
        <Card title="COMPANY">
          <div className="grid cols-3">
            <Field label="REGISTERED NAME">
              <TextInput value={settings.companyName} onChange={(v) => set({ companyName: v })} />
            </Field>
            <Field label="TRADING NAME">
              <TextInput value={settings.tradingName} onChange={(v) => set({ tradingName: v })} />
            </Field>
            <Field label="REGISTRATION NUMBER">
              <TextInput
                value={settings.registrationNumber}
                onChange={(v) => set({ registrationNumber: v })}
              />
            </Field>
            <Field label="EMAIL">
              <TextInput value={settings.email} onChange={(v) => set({ email: v })} />
            </Field>
            <Field label="PHONE">
              <TextInput value={settings.phone} onChange={(v) => set({ phone: v })} />
            </Field>
            <Field label="WEBSITE">
              <TextInput value={settings.website} onChange={(v) => set({ website: v })} />
            </Field>
            <Field label="ADDRESS">
              <TextInput value={settings.address} onChange={(v) => set({ address: v })} />
            </Field>
            <Field label="INVOICE FOOTER">
              <TextInput
                value={settings.invoiceFooter}
                onChange={(v) => set({ invoiceFooter: v })}
              />
            </Field>
            <Field label="LOGO">
              <div className="row">
                {settings.logo ? (
                  <img
                    src={settings.logo}
                    alt="Company logo"
                    style={{ height: 34, maxWidth: 120, objectFit: "contain" }}
                  />
                ) : (
                  <span className="hint">None yet</span>
                )}
                <span className="spacer" />
                <button className="btn small" onClick={pickLogo}>
                  <ImageIcon size={13} /> Choose
                </button>
              </div>
            </Field>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Not VAT-registered, so no VAT appears on any document. The logo is stored inside the
            books as an image, not as a file path, so it reaches every device that syncs.
          </div>
        </Card>

        <Card title="BANK DETAILS ON INVOICES">
          <div className="grid cols-3">
            <Field label="BANK">
              <TextInput value={bank.bankName} onChange={(v) => set({ bank: { ...bank, bankName: v } })} />
            </Field>
            <Field label="ACCOUNT NAME">
              <TextInput
                value={bank.accountName}
                onChange={(v) => set({ bank: { ...bank, accountName: v } })}
              />
            </Field>
            <Field label="ACCOUNT NUMBER">
              <TextInput
                value={bank.accountNumber}
                onChange={(v) => set({ bank: { ...bank, accountNumber: v } })}
              />
            </Field>
            <Field label="BRANCH CODE">
              <TextInput
                value={bank.branchCode}
                onChange={(v) => set({ bank: { ...bank, branchCode: v } })}
              />
            </Field>
            <Field label="ACCOUNT TYPE">
              <TextInput
                value={bank.accountType}
                onChange={(v) => set({ bank: { ...bank, accountType: v } })}
              />
            </Field>
            <Field label="SWIFT">
              <TextInput value={bank.swift} onChange={(v) => set({ bank: { ...bank, swift: v } })} />
            </Field>
          </div>
        </Card>

        <Card title="OPENING BANK BALANCE">
          <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
            <Field label="BALANCE WHEN THE BOOKS START">
              <div style={{ width: 220 }}>
                <MoneyInput value={opening} onChange={setOpening} />
              </div>
            </Field>
            <button
              className="btn"
              onClick={async () => {
                const n = Number(opening.replace(/[R\s,]/g, ""));
                await setOpeningBank(Number.isFinite(n) ? n : 0);
                toast.show("Opening balance saved — Dr Bank / Cr Owner Contribution");
              }}
            >
              Save
            </button>
            <span className="hint">Currently {fmt(openingBank)}</span>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            This posts both sides: the bank is debited and owner contribution credited, so
            starting with money in the account doesn't push the books out of balance.
          </div>
        </Card>

        <Card title="IMPORT & LANDED COST">
          <div className="grid cols-4">
            <Field label="USD / ZAR RATE">
              <NumberInput
                value={landed.usdZarRate}
                onChange={(n) => set({ landedCost: { ...landed, usdZarRate: n } })}
                suffix="R"
              />
            </Field>
            <Field label="EXTRA UNIT SHIPPING (USD)">
              <NumberInput
                value={landed.extraShippingPerUnitUsd}
                onChange={(n) => set({ landedCost: { ...landed, extraShippingPerUnitUsd: n } })}
                suffix="$"
              />
            </Field>
            <Field label="CLEARING PER SHIPMENT (ZAR)">
              <NumberInput
                value={landed.clearingZar}
                onChange={(n) => set({ landedCost: { ...landed, clearingZar: n } })}
                suffix="R"
              />
            </Field>
            <Field label="TARGET GROSS MARGIN (%)">
              <NumberInput
                value={settings.targetMarginPct}
                onChange={(n) => set({ targetMarginPct: n })}
                suffix="%"
              />
            </Field>
          </div>

          <div className="card flush" style={{ marginTop: 14 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Shipping tier · up to this many units</th>
                  <th className="right" style={{ width: 180 }}>
                    Total USD
                  </th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {landed.shippingTiers.map((tier, index) => (
                  <tr key={index}>
                    <td className="wide">
                      <div style={{ width: 120 }}>
                        <NumberInput
                          value={tier.upToQty}
                          onChange={(n) => {
                            const tiers = [...landed.shippingTiers];
                            tiers[index] = { ...tier, upToQty: n || 1 };
                            set({ landedCost: { ...landed, shippingTiers: tiers } });
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <NumberInput
                        value={tier.totalUsd}
                        suffix="$"
                        onChange={(n) => {
                          const tiers = [...landed.shippingTiers];
                          tiers[index] = { ...tier, totalUsd: n };
                          set({ landedCost: { ...landed, shippingTiers: tiers } });
                        }}
                      />
                    </td>
                    <td>
                      {landed.shippingTiers.length > 1 && (
                        <button
                          className="btn ghost small"
                          onClick={() =>
                            set({
                              landedCost: {
                                ...landed,
                                shippingTiers: landed.shippingTiers.filter((_, i) => i !== index),
                              },
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <button
                      className="btn small ghost"
                      onClick={() => {
                        const next = Math.max(...landed.shippingTiers.map((t) => t.upToQty)) + 1;
                        set({
                          landedCost: {
                            ...landed,
                            shippingTiers: [...landed.shippingTiers, { upToQty: next, totalUsd: 0 }],
                          },
                        });
                      }}
                    >
                      <Plus size={13} /> Add tier
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="hint" style={{ marginTop: 10 }}>
            The rate seeded here is a placeholder. Every landed cost, and every price suggested
            from one, is only as right as this number.
          </div>
        </Card>

        <Card title="FINANCIAL YEAR & DOCUMENTS">
          <div className="grid cols-3">
            <Field label="YEAR STARTS IN">
              <Select
                value={String(settings.fyStartMonth)}
                onChange={(v) => set({ fyStartMonth: Number(v) })}
                options={MONTHS.map((m, i) => ({ id: String(i), label: m }))}
              />
            </Field>
            <Field label="PAYMENT TERMS (DAYS)">
              <NumberInput
                value={settings.defaultPaymentTermsDays}
                onChange={(n) => set({ defaultPaymentTermsDays: n })}
              />
            </Field>
            <Field label="QUOTE VALID FOR (DAYS)">
              <NumberInput
                value={settings.quoteValidityDays}
                onChange={(n) => set({ quoteValidityDays: n })}
              />
            </Field>
          </div>
        </Card>

        <CloudCard
          cloud={cloud}
          lastSync={lastSync}
          onSignIn={() => setSigningIn(true)}
          onSignOut={async () => {
            await disconnectCloud();
            toast.show("Signed out — the books stay on this machine");
          }}
        />

        <Card title="BACKUP">
          <div className="row">
            <button className="btn" onClick={backup}>
              <Download size={14} /> Save a backup
            </button>
            <button className="btn" onClick={restore}>
              <Upload size={14} /> Restore from a backup
            </button>
            <span className="spacer" />
            <span className="hint">Restoring replaces everything on this machine.</span>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            The books live at <span className="num">{ledgerPath || "…"}</span>. They are written
            whole each time, to a temporary file that is then renamed, so a crash mid-save can
            never leave a half-written ledger. The previous version is kept next to it.
          </div>
        </Card>
      </div>

      {signingIn && (
        <SignInDialog
          onClose={() => setSigningIn(false)}
          onDone={async (session) => {
            await connectCloud(session);
            setSigningIn(false);
            toast.show(`Signed in as ${session.user.name}`);
          }}
        />
      )}
    </Screen>
  );
}

function CloudCard({
  cloud,
  lastSync,
  onSignIn,
  onSignOut,
}: {
  cloud: ReturnType<typeof useLedger>["cloud"];
  lastSync: ReturnType<typeof useLedger>["lastSync"];
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const toast = useToast();
  const [users, setUsers] = useState<CloudUser[] | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!cloud) {
      setUsers(null);
      return;
    }
    listUsers(cloud)
      .then((r) => setUsers(r.users))
      .catch(() => setUsers(null));
  }, [cloud]);

  if (!cloud) {
    return (
      <Card title="CLOUD SYNC">
        <div className="row">
          <Cloud size={16} className="muted" />
          <span>
            Not connected. The books are on this machine only — nothing leaves it, and nothing
            arrives from the phone.
          </span>
          <span className="spacer" />
          <button className="btn primary" onClick={onSignIn}>
            Connect to your server
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="CLOUD SYNC"
      action={
        <button className="btn small ghost" onClick={onSignOut}>
          Sign out
        </button>
      }
    >
      <div className="row">
        <Pill tone="good">connected</Pill>
        <span>
          {cloud.user.name} · {cloud.user.email} · {cloud.user.role}
        </span>
        <span className="spacer" />
        <span className="hint">
          {cloud.lastSyncedIso
            ? `Last synced ${fmtDate(cloud.lastSyncedIso.slice(0, 10))}`
            : "Not synced yet"}
          {lastSync && !lastSync.ok ? ` · ${lastSync.error}` : ""}
        </span>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        {cloud.serverUrl}
      </div>

      {users && (
        <div className="card flush" style={{ marginTop: 14 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Who</th>
                <th style={{ width: 130 }}>Role</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="wide">
                    {u.name} <span className="muted">{u.email}</span>
                  </td>
                  <td>{u.role}</td>
                  <td>
                    {u.pendingInvite ? (
                      <Pill tone="warning">invited</Pill>
                    ) : (
                      <Pill tone="good">active</Pill>
                    )}
                  </td>
                  <td>
                    {u.id !== cloud.user.id && cloud.user.role === "owner" && (
                      <button
                        className="btn ghost small"
                        onClick={async () => {
                          await removeUser(cloud, u.id);
                          setUsers((list) => list?.filter((x) => x.id !== u.id) ?? null);
                          toast.show(`${u.name} removed`);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>
                  {cloud.user.role === "owner" && (
                    <button className="btn small ghost" onClick={() => setInviting(true)}>
                      <Plus size={13} /> Invite someone
                    </button>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onDone={(user) => {
            setUsers((list) => [...(list ?? []), user]);
            setInviting(false);
          }}
        />
      )}
    </Card>
  );
}

function InviteDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (user: CloudUser) => void;
}) {
  const { cloud } = useLedger();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"bookkeeper" | "viewer">("bookkeeper");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    if (!cloud) return;
    setBusy(true);
    try {
      const result = await inviteUser(cloud, email.trim(), name.trim(), role);
      setCode(result.inviteCode);
      onDone(result.user);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't send that invite", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Invite someone to the books"
      onClose={onClose}
      footer={
        code ? (
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn primary" onClick={invite} disabled={busy || !email || !name}>
              Send invite
            </button>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
          </>
        )
      }
    >
      {code ? (
        <div className="stack">
          <div>
            Give this code to {name}. They enter it with their email and a password of their own
            choosing, on the phone or on Windows.
          </div>
          <div className="num" style={{ fontSize: 22, letterSpacing: 2 }}>
            {code}
          </div>
        </div>
      ) : (
        <div className="grid cols-3">
          <Field label="NAME">
            <TextInput value={name} onChange={setName} autoFocus />
          </Field>
          <Field label="EMAIL">
            <TextInput value={email} onChange={setEmail} type="email" />
          </Field>
          <Field label="ROLE">
            <Select
              value={role}
              onChange={(v) => setRole(v)}
              options={[
                { id: "bookkeeper" as const, label: "Bookkeeper — can change the books" },
                { id: "viewer" as const, label: "Viewer — read only" },
              ]}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function SignInDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (session: ReturnType<typeof useLedger>["cloud"] & object) => void;
}) {
  const toast = useToast();
  const [serverUrl, setServerUrl] = useState("https://");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [claiming, setClaiming] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      const health = await checkServer(serverUrl.trim());
      setClaiming(!health.claimed);
      toast.show(
        health.claimed
          ? "Server found — sign in"
          : "Server found and unclaimed — the first account becomes the owner"
      );
    } catch {
      toast.show("Couldn't reach that address", "error");
    } finally {
      setBusy(false);
    }
  };

  const go = async () => {
    setBusy(true);
    try {
      const url = serverUrl.trim();
      const result = claiming
        ? await claimServer(url, email.trim(), password, name.trim())
        : await signIn(url, email.trim(), password, inviteCode.trim() || undefined);

      onDone({
        serverUrl: url,
        token: result.token,
        user: result.user,
        lastSyncAt: 0,
      });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Sign in failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Connect to your server"
      subtitle="The one running behind your Cloudflare Tunnel"
      onClose={onClose}
      footer={
        <>
          {claiming === null ? (
            <button className="btn primary" onClick={check} disabled={busy}>
              Find the server
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={go}
              disabled={busy || !email || !password || (claiming && !name)}
            >
              {claiming ? "Claim and sign in" : "Sign in"}
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="SERVER ADDRESS">
          <TextInput
            value={serverUrl}
            onChange={setServerUrl}
            placeholder="https://books.welovemining.co.za"
            autoFocus
          />
        </Field>

        {claiming !== null && (
          <div className="grid cols-2">
            <Field label="EMAIL">
              <TextInput value={email} onChange={setEmail} type="email" />
            </Field>
            <Field label="PASSWORD">
              <TextInput value={password} onChange={setPassword} type="password" />
            </Field>
            {claiming && (
              <Field label="YOUR NAME">
                <TextInput value={name} onChange={setName} />
              </Field>
            )}
            {!claiming && (
              <Field label="INVITE CODE (FIRST TIME ONLY)">
                <TextInput value={inviteCode} onChange={setInviteCode} />
              </Field>
            )}
          </div>
        )}

        <div className="hint">
          Syncing sends the books to your own server and nowhere else. Each record carries the
          time it changed, and the newest version of each wins — so the phone and this machine
          can both be used without either overwriting the other's work wholesale.
        </div>
      </div>
    </Modal>
  );
}

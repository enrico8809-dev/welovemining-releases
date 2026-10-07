import { useMemo, useState } from "react";
import { useLedger } from "@engine/LedgerContext";
import {
  RECIPES,
  Recipe,
  Txn,
  findRecipe,
  isReasonableDate,
} from "@engine/accounting";
import { findAsset, zarForUnits } from "@engine/crypto";
import { abs, fmt, parseAmount, todayISO } from "@engine/format";
import { Field, Modal, MoneyInput, NumberInput, Select, TextInput } from "../components/ui";
import { DateInput } from "../components/ui";

/**
 * Capture, the way the app has always done it: pick what happened, and the
 * double entry follows. There is no way in this dialog to type a debit and a
 * credit yourself, which is the whole point — the recipe decides both sides.
 *
 * A coin entry asks for two figures: the units, which is the fact from the
 * exchange, and what they were worth in rands that day. The rate is neither
 * asked for nor stored — it is the one divided by the other, and three numbers
 * where two will do is three numbers to disagree with each other.
 */
export default function CaptureDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Txn;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { accounts, addTxn, updateTxn, settings } = useLedger();

  const [recipeId, setRecipeId] = useState(existing?.recipe ?? RECIPES[0].id);
  const [amount, setAmount] = useState(existing ? abs(existing.amount) : "");
  const [desc, setDesc] = useState(existing?.desc ?? "");
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [pickedAccount, setPickedAccount] = useState<string>(() => {
    if (!existing) return "";
    const recipe = findRecipe(existing.recipe);
    if (!recipe?.pick) return "";
    return recipe.pick === "debit" ? existing.debit : existing.credit;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const namedAssets = settings.crypto.assets.filter((a) => !!a.symbol.trim());
  const [assetSymbol, setAssetSymbol] = useState(
    existing?.crypto?.asset ?? namedAssets[0]?.symbol ?? ""
  );
  const [units, setUnits] = useState(existing?.crypto?.units ?? 0);
  // An existing entry keeps the rands it was saved with: it happened at the
  // rate it happened at, not at today's.
  const [zarTouched, setZarTouched] = useState(!!existing);

  const recipe = useMemo<Recipe>(
    () => findRecipe(recipeId) ?? RECIPES[0],
    [recipeId]
  );

  const asset = useMemo(
    () => findAsset(settings.crypto, assetSymbol),
    [settings.crypto, assetSymbol]
  );

  const pickable = useMemo(() => {
    if (!recipe.pick) return [];
    const types = recipe.pickTypes ?? [];
    return accounts
      .filter((a) => (types.length ? types.includes(a.type) : true))
      .map((a) => ({ id: a.id, label: a.name }));
  }, [recipe, accounts]);

  const chosenAccount = recipe.pick ? pickedAccount || pickable[0]?.id : undefined;

  const debit = recipe.pick === "debit" ? chosenAccount ?? recipe.debit : recipe.debit;
  const credit = recipe.pick === "credit" ? chosenAccount ?? recipe.credit : recipe.credit;

  const numeric = parseAmount(amount);
  const impliedRate = units > 0 && Number.isFinite(numeric) && numeric > 0 ? numeric / units : null;

  /** Entering coins fills the rands in at the stored rate, until that is edited. */
  const changeUnits = (n: number) => {
    setUnits(n);
    if (zarTouched || !asset || asset.rateZar <= 0 || n <= 0) return;
    setAmount(abs(zarForUnits(n, asset.rateZar)));
  };

  const save = async () => {
    const found: Record<string, string> = {};
    const isCrypto = !!recipe.crypto;

    if (!Number.isFinite(numeric) || numeric <= 0) found.amount = "Enter an amount";
    if (isCrypto && units <= 0) found.units = "Enter how many coins moved";
    if (isCrypto && !assetSymbol.trim()) found.units = "Pick which coin this was";
    if (!desc.trim()) found.desc = "Say what it was for";
    if (!isReasonableDate(date)) found.date = "Check the date";
    setErrors(found);
    if (Object.keys(found).length) return;

    const txn: Txn = {
      id: existing?.id ?? `txn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      desc: desc.trim(),
      amount: numeric,
      debit,
      credit,
      recipe: recipe.id,
      ...(isCrypto ? { crypto: { asset: assetSymbol.trim().toUpperCase(), units } } : {}),
    };

    if (existing) {
      await updateTxn(txn);
      onSaved("Entry updated");
    } else {
      await addTxn(txn);
      onSaved(`${fmt(numeric)} captured`);
    }
    onClose();
  };

  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <Modal
      title={existing ? "Edit entry" : "New entry"}
      subtitle={recipe.hint}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={save}>
            {existing ? "Save changes" : "Capture"}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <span className="hint">
            Dr {name(debit)} · Cr {name(credit)}
          </span>
        </>
      }
    >
      <div className="stack">
        <Field label="WHAT HAPPENED">
          <Select
            value={recipeId}
            onChange={(id) => {
              setRecipeId(id);
              setPickedAccount("");
            }}
            options={RECIPES.map((r) => ({ id: r.id, label: r.label }))}
          />
        </Field>

        {recipe.pick && (
          <Field
            label={recipe.pick === "debit" ? "WHICH EXPENSE / ACCOUNT" : "WHICH ACCOUNT"}
          >
            <Select
              value={chosenAccount ?? ""}
              onChange={setPickedAccount}
              options={pickable}
            />
          </Field>
        )}

        {!!recipe.crypto && (
          <div className="grid cols-2">
            <Field label="COIN">
              {namedAssets.length ? (
                <Select
                  value={assetSymbol}
                  onChange={(symbol) => {
                    setAssetSymbol(symbol);
                    setZarTouched(false);
                  }}
                  options={namedAssets.map((a) => ({ id: a.symbol, label: a.symbol }))}
                />
              ) : (
                <div className="hint">Add a coin under Settings → Crypto first.</div>
              )}
            </Field>
            <Field label="UNITS" error={errors.units}>
              <NumberInput value={units} onChange={changeUnits} suffix={assetSymbol || "—"} />
            </Field>
          </div>
        )}

        <div className="grid cols-2">
          <Field
            label={recipe.crypto ? "WORTH IN RANDS ON THE DAY" : "AMOUNT"}
            error={errors.amount}
          >
            <MoneyInput
              value={amount}
              onChange={(v) => {
                if (recipe.crypto) setZarTouched(true);
                setAmount(v);
              }}
              autoFocus={!recipe.crypto}
              invalid={!!errors.amount}
            />
          </Field>
          <Field label="DATE" error={errors.date}>
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>

        {!!recipe.crypto && (
          <div className="hint">
            {impliedRate
              ? `Works out at R ${abs(impliedRate)} per ${assetSymbol || "coin"}.`
              : "The rate follows from the units and the rands — it isn't entered."}
            {asset && asset.rateZar > 0
              ? ` Rands filled in at R ${abs(asset.rateZar)} from Settings; change them if the rate you got was different.`
              : ""}
          </div>
        )}

        <Field label="DESCRIPTION" error={errors.desc}>
          <TextInput
            value={desc}
            onChange={setDesc}
            placeholder={
              recipe.crypto ? "e.g. Deposit to supplier for 2 × S21" : "e.g. S21 sale — Mining Co"
            }
            invalid={!!errors.desc}
          />
        </Field>

        <div className="hint">
          {recipe.dir === "in" ? "Money in" : "Money out"} · this posts one debit and one
          matching credit, so the books stay in balance by construction.
          {recipe.crypto === "out"
            ? " Paying coins out also posts the gain or loss against what those coins cost — you don't enter that."
            : ""}
        </div>
      </div>
    </Modal>
  );
}

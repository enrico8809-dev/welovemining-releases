import { useMemo, useState } from "react";
import { useLedger } from "@engine/LedgerContext";
import {
  RECIPES,
  Recipe,
  Txn,
  findRecipe,
  isReasonableDate,
} from "@engine/accounting";
import { abs, fmt, parseAmount, todayISO } from "@engine/format";
import { Field, Modal, MoneyInput, Select, TextInput } from "../components/ui";
import { DateInput } from "../components/ui";

/**
 * Capture, the way the app has always done it: pick what happened, and the
 * double entry follows. There is no way in this dialog to type a debit and a
 * credit yourself, which is the whole point — the recipe decides both sides.
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
  const { accounts, addTxn, updateTxn } = useLedger();

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

  const recipe = useMemo<Recipe>(
    () => findRecipe(recipeId) ?? RECIPES[0],
    [recipeId]
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

  const save = async () => {
    const found: Record<string, string> = {};
    if (!Number.isFinite(numeric) || numeric <= 0) found.amount = "Enter an amount";
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

        <div className="grid cols-2">
          <Field label="AMOUNT" error={errors.amount}>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              autoFocus
              invalid={!!errors.amount}
            />
          </Field>
          <Field label="DATE" error={errors.date}>
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>

        <Field label="DESCRIPTION" error={errors.desc}>
          <TextInput
            value={desc}
            onChange={setDesc}
            placeholder="e.g. S21 sale — Mining Co"
            invalid={!!errors.desc}
          />
        </Field>

        <div className="hint">
          {recipe.dir === "in" ? "Money in" : "Money out"} · this posts one debit and one
          matching credit, so the books stay in balance by construction.
        </div>
      </div>
    </Modal>
  );
}

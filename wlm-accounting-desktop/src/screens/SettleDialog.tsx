import { useState } from "react";
import { useLedger } from "@engine/LedgerContext";
import { BusinessDoc, cryptoDue, docTotal } from "@engine/invoices";
import { CRYPTO_ACCOUNT, findAsset, zarForUnits } from "@engine/crypto";
import { abs, fmt, fmtUnits, parseAmount, todayISO } from "@engine/format";
import { DateInput, Field, Modal, MoneyInput, NumberInput, Select } from "../components/ui";
import { useToast } from "../components/Toast";

/**
 * Settling an invoice that was paid in coins.
 *
 * What is asked for is what actually arrived, not what the invoice asked for.
 * The rate moves between issuing an invoice and being paid for it, so a
 * R100 000 invoice can be honestly settled by USDT worth R99 500 — the customer
 * sent the coins they were quoted and owes nothing. The wallet has to carry what
 * turned up or it will never agree with the exchange again, and the difference
 * is the rate moving, which belongs in crypto gains and losses rather than
 * sitting on the invoice forever as an unpaid R500.
 */
export default function SettleDialog({
  doc,
  onClose,
}: {
  doc: BusinessDoc;
  onClose: () => void;
}) {
  const { saveDoc, settings } = useLedger();
  const toast = useToast();

  const total = docTotal(doc);
  const named = settings.crypto.assets.filter((a) => !!a.symbol.trim());
  const quoted = doc.crypto ? cryptoDue(doc) : 0;

  const [symbol, setSymbol] = useState(doc.crypto?.asset ?? named[0]?.symbol ?? "");
  const [units, setUnits] = useState(quoted);
  const [zar, setZar] = useState(() => {
    const asset = findAsset(settings.crypto, doc.crypto?.asset ?? named[0]?.symbol ?? "");
    return quoted > 0 && asset && asset.rateZar > 0
      ? abs(zarForUnits(quoted, asset.rateZar))
      : abs(total);
  });
  const [date, setDate] = useState(todayISO());

  const asset = findAsset(settings.crypto, symbol);
  const zarValue = parseAmount(zar);
  const difference =
    Number.isFinite(zarValue) && zarValue > 0 ? total - zarValue : null;

  const confirm = async () => {
    if (units <= 0) {
      toast.show("Enter how many coins arrived", "error");
      return;
    }
    if (!Number.isFinite(zarValue) || zarValue <= 0) {
      toast.show("Enter what those coins were worth in rands", "error");
      return;
    }

    await saveDoc({
      ...doc,
      status: "paid",
      paidDate: date,
      settlement: { account: CRYPTO_ACCOUNT, asset: symbol.trim().toUpperCase(), units, zar: zarValue },
    });

    toast.show(
      difference !== null && Math.abs(difference) >= 0.005
        ? `${doc.number} settled — R ${abs(difference)} rate ${
            difference > 0 ? "loss" : "gain"
          } posted, receivable cleared in full`
        : `${doc.number} settled — coins in the wallet, receivable cleared`
    );
    onClose();
  };

  return (
    <Modal
      title={`${doc.number} paid in crypto`}
      subtitle={`${doc.customer} · invoiced ${fmt(total)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={confirm}>
            Confirm payment
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="stack">
        {quoted > 0 && (
          <div className="hint">
            This invoice asked for {fmtUnits(quoted, doc.crypto!.decimals)} {doc.crypto!.asset} at
            R {abs(doc.crypto!.rateZar)}. Enter what actually landed.
          </div>
        )}

        <div className="grid cols-3">
          <Field label="COIN">
            <Select
              value={symbol}
              onChange={setSymbol}
              options={named.map((a) => ({ id: a.symbol, label: a.symbol }))}
            />
          </Field>
          <Field label="COINS RECEIVED">
            <NumberInput value={units} onChange={setUnits} suffix={symbol || "—"} />
          </Field>
          <Field label="DATE RECEIVED">
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>

        <Field label="WORTH IN RANDS ON THE DAY">
          <MoneyInput value={zar} onChange={setZar} />
        </Field>

        <div className="hint">
          {difference === null
            ? "The wallet is credited with this figure, which is what those coins cost the business."
            : Math.abs(difference) < 0.005
              ? "Exactly the invoiced amount — nothing to post beyond the settlement."
              : `R ${abs(difference)} ${
                  difference > 0 ? "less" : "more"
                } than invoiced. The receivable still clears in full and the difference goes to Crypto Gains / (Losses) as a rate ${
                  difference > 0 ? "loss" : "gain"
                } — not as revenue.`}
          {asset && asset.rateZar > 0
            ? ` Settings currently say R ${abs(asset.rateZar)} per ${asset.symbol}.`
            : ""}
        </div>
      </div>
    </Modal>
  );
}

import { useMemo, useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  BusinessDoc,
  DocKind,
  LineItem,
  docTotal,
  lineTotal,
  newDoc,
  newLineItem,
} from "@engine/invoices";
import { computeLandedCost, suggestedPrice } from "@engine/inventory";
import { Product, productLabel } from "@engine/catalogue";
import { abs, fmt, parseAmount, toISO, todayISO } from "@engine/format";
import {
  DateInput,
  Field,
  Modal,
  Money,
  MoneyInput,
  Select,
  TextInput,
} from "../components/ui";
import ProductPicker from "./ProductPicker";
import { useToast } from "../components/Toast";

export default function DocEditor({
  kind,
  existing,
  onClose,
}: {
  kind: DocKind;
  existing?: BusinessDoc;
  onClose: () => void;
}) {
  const { accounts, docs, saveDoc, settings } = useLedger();
  const toast = useToast();

  const [doc, setDoc] = useState<BusinessDoc>(
    () => existing ?? withDefaultDue(newDoc(kind, docs), settings.defaultPaymentTermsDays)
  );
  const [picking, setPicking] = useState(false);

  const incomeAccounts = useMemo(
    () => accounts.filter((a) => a.type === "income").map((a) => ({ id: a.id, label: a.name })),
    [accounts]
  );

  const total = docTotal(doc);
  const isInvoice = doc.kind === "invoice";

  const patch = (p: Partial<BusinessDoc>) => setDoc((d) => ({ ...d, ...p }));

  const patchItem = (id: string, p: Partial<LineItem>) =>
    setDoc((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));

  const addLine = () => setDoc((d) => ({ ...d, items: [...d.items, newLineItem()] }));

  const removeLine = (id: string) =>
    setDoc((d) => ({
      ...d,
      items: d.items.length === 1 ? d.items : d.items.filter((i) => i.id !== id),
    }));

  /**
   * A product from the price list becomes a line at the suggested selling price
   * — landed cost marked up by the target margin — so a quote can be built
   * straight off the supplier list without working the arithmetic by hand.
   */
  const addProduct = (product: Product) => {
    const cost = computeLandedCost(product, 1, settings.landedCost);
    const price = Math.round(suggestedPrice(cost.perUnitZar, settings.targetMarginPct));

    setDoc((d) => {
      const blank = d.items.find((i) => !i.description && !i.unitPrice);
      const line: LineItem = {
        ...(blank ?? newLineItem()),
        description: productLabel(product),
        qty: 1,
        unitPrice: price,
      };
      return {
        ...d,
        items: blank ? d.items.map((i) => (i.id === blank.id ? line : i)) : [...d.items, line],
      };
    });
    setPicking(false);
  };

  const save = async (status: BusinessDoc["status"]) => {
    if (!doc.customer.trim()) {
      toast.show("Add a customer name", "error");
      return;
    }
    if (total <= 0) {
      toast.show("Add at least one line with an amount", "error");
      return;
    }
    await saveDoc({ ...doc, customer: doc.customer.trim(), status });
    toast.show(
      status === "draft"
        ? `${doc.number} saved as draft`
        : isInvoice
          ? `${doc.number} issued — Dr Receivables / Cr Sales`
          : `${doc.number} sent`
    );
    onClose();
  };

  return (
    <Modal
      wide
      title={doc.number}
      subtitle={existing ? "Editing" : isInvoice ? "New invoice" : "New quote"}
      onClose={onClose}
      footer={
        <>
          <button className="btn primary" onClick={() => save("sent")}>
            {isInvoice ? "Issue invoice" : "Send quote"}
          </button>
          <button className="btn" onClick={() => save("draft")}>
            Save as draft
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <span className="hint">Total</span>
          <span style={{ fontSize: 17 }}>
            <Money value={total} plain />
          </span>
        </>
      }
    >
      <div className="stack">
        <div className="grid cols-3">
          <Field label="CUSTOMER">
            <TextInput
              value={doc.customer}
              onChange={(v) => patch({ customer: v })}
              placeholder="e.g. Mining Co (Pty) Ltd"
              autoFocus
            />
          </Field>
          <Field label={isInvoice ? "INVOICE DATE" : "QUOTE DATE"}>
            <DateInput value={doc.date} onChange={(iso) => patch({ date: iso })} />
          </Field>
          {isInvoice ? (
            <Field label="DUE DATE">
              <DateInput
                value={doc.dueDate ?? todayISO()}
                onChange={(iso) => patch({ dueDate: iso })}
              />
            </Field>
          ) : (
            <Field label="INCOME ACCOUNT">
              <Select
                value={doc.incomeAccount}
                onChange={(id) => patch({ incomeAccount: id })}
                options={incomeAccounts}
              />
            </Field>
          )}
        </div>

        <div className="card flush">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Qty</th>
                <th>Description</th>
                <th className="right" style={{ width: 170 }}>
                  Unit price
                </th>
                <th className="right" style={{ width: 150 }}>
                  Line total
                </th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      className="input num"
                      value={item.qty ? String(item.qty) : ""}
                      placeholder="1"
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, "");
                        patchItem(item.id, { qty: digits ? Number(digits) : 0 });
                      }}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={item.description}
                      onChange={(v) => patchItem(item.id, { description: v })}
                      placeholder="e.g. Antminer S21 Hydro — 335 TH/s"
                    />
                  </td>
                  <td>
                    <MoneyInput
                      value={item.unitPrice ? abs(item.unitPrice) : ""}
                      onChange={(v) => {
                        const n = parseAmount(v);
                        patchItem(item.id, { unitPrice: Number.isFinite(n) ? n : 0 });
                      }}
                    />
                  </td>
                  <td className="right num">{abs(lineTotal(item))}</td>
                  <td>
                    <button
                      className="btn ghost small"
                      onClick={() => removeLine(item.id)}
                      disabled={doc.items.length === 1}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn small" onClick={() => setPicking(true)}>
                      <Package size={13} /> From price list
                    </button>
                    <button className="btn small ghost" onClick={addLine}>
                      <Plus size={13} /> Blank line
                    </button>
                  </div>
                </td>
                <td className="right">{fmt(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid cols-2">
          {isInvoice && (
            <Field label="INCOME ACCOUNT">
              <Select
                value={doc.incomeAccount}
                onChange={(id) => patch({ incomeAccount: id })}
                options={incomeAccounts}
              />
            </Field>
          )}
          <Field label="NOTES ON THE DOCUMENT">
            <TextInput
              value={doc.notes ?? ""}
              onChange={(v) => patch({ notes: v })}
              placeholder="Anything the customer should read"
            />
          </Field>
        </div>

        <div className="hint">
          No VAT — WeLoveMining is not VAT-registered.{" "}
          {isInvoice
            ? "Issuing posts Dr Trade Receivables / Cr Sales once. Marking it paid later posts Dr Bank / Cr Trade Receivables; it never books income again."
            : "Quotes post nothing to the books until you convert them to an invoice."}
        </div>
      </div>

      {picking && <ProductPicker onPick={addProduct} onClose={() => setPicking(false)} />}
    </Modal>
  );
}

function withDefaultDue(doc: BusinessDoc, termsDays: number): BusinessDoc {
  if (doc.kind !== "invoice") return doc;
  const due = new Date();
  due.setDate(due.getDate() + termsDays);
  return { ...doc, dueDate: toISO(due) };
}

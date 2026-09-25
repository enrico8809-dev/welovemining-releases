import { useMemo, useState } from "react";
import { FileDown, FileText, Plus } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  BusinessDoc,
  DocKind,
  convertQuoteToInvoice,
  docTotal,
  isOverdue,
  statusLabel,
  summariseReceivables,
} from "@engine/invoices";
import { buildDocHtml } from "@engine/pdfHtml";
import { fmt, fmtDateShort, todayISO } from "@engine/format";
import Screen from "../components/Screen";
import { Card, EmptyState, Money, Pill, Tile } from "../components/ui";
import DocEditor from "./DocEditor";
import { api } from "../api";
import { useToast } from "../components/Toast";

export default function Documents({ kind }: { kind: DocKind }) {
  const { docs, saveDoc, removeDoc, settings } = useLedger();
  const toast = useToast();
  const [editing, setEditing] = useState<BusinessDoc | "new" | null>(null);

  const rows = useMemo(
    () =>
      docs
        .filter((d) => d.kind === kind)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [docs, kind]
  );

  const receivables = useMemo(() => summariseReceivables(docs), [docs]);
  const noun = kind === "invoice" ? "invoice" : "quote";

  const exportPdf = async (doc: BusinessDoc) => {
    const path = await api.savePdf(buildDocHtml(doc, settings), `${doc.number}.pdf`);
    if (path) toast.show(`Saved ${doc.number}.pdf`);
  };

  const markPaid = async (doc: BusinessDoc) => {
    await saveDoc({ ...doc, status: "paid", paidDate: todayISO() });
    toast.show(`${doc.number} settled — Dr Bank / Cr Receivables. Income is not touched.`);
  };

  const issue = async (doc: BusinessDoc) => {
    await saveDoc({ ...doc, status: "sent" });
    toast.show(
      kind === "invoice"
        ? `${doc.number} issued — Dr Receivables / Cr Sales`
        : `${doc.number} sent`
    );
  };

  const convert = async (quote: BusinessDoc) => {
    const invoice = convertQuoteToInvoice(quote, docs);
    await saveDoc(invoice);
    await saveDoc({ ...quote, status: "accepted", convertedToId: invoice.id });
    toast.show(`${quote.number} became ${invoice.number}`);
  };

  return (
    <Screen
      title={kind === "invoice" ? "Invoices" : "Quotes"}
      subtitle={`${rows.length} ${noun}${rows.length === 1 ? "" : "s"}`}
      actions={
        <button className="btn primary" onClick={() => setEditing("new")}>
          <Plus size={15} /> New {noun}
        </button>
      }
    >
      <div className="stack">
        {kind === "invoice" && (
          <div className="grid cols-4">
            <Tile
              label="OUTSTANDING"
              value={fmt(receivables.outstanding)}
              foot={`${receivables.unpaidCount} unpaid`}
            />
            <Tile
              label="OVERDUE"
              value={fmt(receivables.overdue)}
              tone={receivables.overdue > 0 ? "neg" : undefined}
              foot="Past the due date"
            />
            <Tile label="SETTLED" value={fmt(receivables.paidThisPeriod)} tone="pos" />
            <Tile
              label="INVOICED"
              value={fmt(rows.reduce((sum, d) => sum + docTotal(d), 0))}
              foot="All time"
            />
          </div>
        )}

        <Card flush>
          {rows.length === 0 ? (
            <EmptyState
              icon={<FileText size={26} className="muted" />}
              title={`No ${noun}s yet`}
              body={
                kind === "invoice"
                  ? "Issuing an invoice books Dr Receivables / Cr Sales. Marking it paid clears the receivable and never books income again."
                  : "Quotes post nothing to the books until you convert one to an invoice."
              }
              action={
                <button className="btn primary" onClick={() => setEditing("new")}>
                  <Plus size={15} /> New {noun}
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Number</th>
                    <th>Customer</th>
                    <th style={{ width: 100 }}>Date</th>
                    {kind === "invoice" && <th style={{ width: 100 }}>Due</th>}
                    <th style={{ width: 110 }}>Status</th>
                    <th className="right" style={{ width: 150 }}>
                      Total
                    </th>
                    <th style={{ width: 300 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((doc) => (
                    <tr key={doc.id} className="selectable" onDoubleClick={() => setEditing(doc)}>
                      <td className="num" style={{ color: "var(--orange)" }}>
                        {doc.number}
                      </td>
                      <td className="wide">{doc.customer || "—"}</td>
                      <td className="num">{fmtDateShort(doc.date)}</td>
                      {kind === "invoice" && (
                        <td className="num">{doc.dueDate ? fmtDateShort(doc.dueDate) : "—"}</td>
                      )}
                      <td>
                        <Pill
                          tone={
                            doc.status === "paid"
                              ? "good"
                              : isOverdue(doc)
                                ? "bad"
                                : doc.status === "draft"
                                  ? "neutral"
                                  : "warning"
                          }
                        >
                          {statusLabel(doc)}
                        </Pill>
                      </td>
                      <td className="right">
                        <Money value={docTotal(doc)} plain />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                          {doc.status === "draft" && (
                            <button className="btn small" onClick={() => issue(doc)}>
                              {kind === "invoice" ? "Issue" : "Send"}
                            </button>
                          )}
                          {kind === "invoice" && doc.status === "sent" && (
                            <button className="btn small" onClick={() => markPaid(doc)}>
                              Mark paid
                            </button>
                          )}
                          {kind === "quote" && !doc.convertedToId && (
                            <button className="btn small" onClick={() => convert(doc)}>
                              To invoice
                            </button>
                          )}
                          <button className="btn small ghost" onClick={() => setEditing(doc)}>
                            Open
                          </button>
                          <button
                            className="btn small ghost"
                            title="Save as PDF"
                            onClick={() => exportPdf(doc)}
                          >
                            <FileDown size={13} />
                          </button>
                          <button
                            className="btn small ghost"
                            onClick={async () => {
                              await removeDoc(doc.id);
                              toast.show(`${doc.number} deleted`);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="hint">
          {kind === "invoice"
            ? "Revenue is recognised once, when an invoice is issued. Settling it moves money from receivables to the bank and never touches an income account again."
            : "A quote is not a transaction. Nothing reaches the books until it becomes an invoice."}
        </div>
      </div>

      {editing && (
        <DocEditor
          kind={kind}
          existing={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}

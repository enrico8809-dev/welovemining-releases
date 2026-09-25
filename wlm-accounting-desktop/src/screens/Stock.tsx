import { useMemo, useState } from "react";
import { Boxes, Minus, Plus } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  MovementKind,
  StockMovement,
  computeLandedCost,
  computeStockLevels,
  costOfIssue,
  newMovementId,
  summariseInventory,
} from "@engine/inventory";
import { Product, findProduct, productLabel } from "@engine/catalogue";
import { abs, fmt, fmtDateShort, todayISO } from "@engine/format";
import Screen from "../components/Screen";
import { Card, DateInput, EmptyState, Field, Modal, Money, NumberInput, Tile } from "../components/ui";
import ProductPicker from "./ProductPicker";
import { useToast } from "../components/Toast";

export default function Stock() {
  const { movements, settings, addMovement, removeMovement } = useLedger();
  const toast = useToast();
  const [receiving, setReceiving] = useState<Product | null>(null);
  const [picking, setPicking] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);

  const levels = useMemo(() => computeStockLevels(movements), [movements]);
  const summary = useMemo(() => summariseInventory(movements), [movements]);
  const onHand = useMemo(
    () => [...levels.values()].filter((l) => l.qty > 0),
    [levels]
  );
  const recent = useMemo(
    () => [...movements].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15),
    [movements]
  );

  return (
    <Screen
      title="Stock"
      subtitle={`${summary.totalUnits} units across ${summary.productCount} products`}
      actions={
        <button className="btn primary" onClick={() => setPicking(true)}>
          <Plus size={15} /> Receive stock
        </button>
      }
    >
      <div className="stack">
        <div className="grid cols-3">
          <Tile label="STOCK ON HAND" value={fmt(summary.totalValueZar)} foot="At weighted average cost" />
          <Tile label="UNITS" value={String(summary.totalUnits)} foot={`${summary.productCount} products`} />
          <Tile
            label="USD / ZAR"
            value={abs(settings.landedCost.usdZarRate)}
            foot="Used for every landed cost"
          />
        </div>

        <Card title="ON HAND" flush>
          {onHand.length === 0 ? (
            <EmptyState
              icon={<Boxes size={26} className="muted" />}
              title="No stock on hand"
              body="Receiving stock books Dr Inventory / Cr Bank — it's an asset swap, not an expense, so buying miners doesn't show up as a cost until you sell them."
              action={
                <button className="btn primary" onClick={() => setPicking(true)}>
                  <Plus size={15} /> Receive stock
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="right" style={{ width: 90 }}>
                      Qty
                    </th>
                    <th className="right" style={{ width: 150 }}>
                      Avg cost
                    </th>
                    <th className="right" style={{ width: 160 }}>
                      Value
                    </th>
                    <th style={{ width: 200 }} />
                  </tr>
                </thead>
                <tbody>
                  {onHand.map((level) => {
                    const product = findProduct(level.productId);
                    return (
                      <tr key={level.productId}>
                        <td className="wide">
                          {product ? productLabel(product) : level.productId}
                        </td>
                        <td className="right num">{level.qty}</td>
                        <td className="right num">{abs(level.avgCostZar)}</td>
                        <td className="right num">{abs(level.valueZar)}</td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                            <button
                              className="btn small"
                              onClick={() => product && setReceiving(product)}
                            >
                              <Plus size={12} /> In
                            </button>
                            <button
                              className="btn small"
                              onClick={() => setIssuing(level.productId)}
                            >
                              <Minus size={12} /> Out
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="right num">{abs(summary.totalValueZar)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Card title="RECENT MOVEMENTS" flush>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Date</th>
                  <th style={{ width: 90 }}>Kind</th>
                  <th>Product</th>
                  <th className="right" style={{ width: 80 }}>
                    Qty
                  </th>
                  <th className="right" style={{ width: 150 }}>
                    Value
                  </th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => {
                  const product = findProduct(m.productId);
                  return (
                    <tr key={m.id}>
                      <td className="num">{fmtDateShort(m.date)}</td>
                      <td className={m.kind === "in" ? "pos" : "neg"}>
                        {m.kind === "in" ? "Received" : m.kind === "out" ? "Sold" : "Written off"}
                      </td>
                      <td className="wide">{product ? productLabel(product) : m.productId}</td>
                      <td className="right num">{m.qty}</td>
                      <td className="right num">{abs(m.valueZar)}</td>
                      <td>
                        <button
                          className="btn ghost small"
                          onClick={async () => {
                            await removeMovement(m.id);
                            toast.show("Movement removed");
                          }}
                        >
                          Undo
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                      No movements yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="hint">
          Receiving posts Dr Inventory / Cr Bank. Selling posts Dr Cost of Sales / Cr Inventory
          at the weighted average cost, so the cost of a miner lands in the same period as the
          sale it paid for. Both are worked out from the movement, never stored separately.
        </div>
      </div>

      {picking && (
        <ProductPicker
          onPick={(product) => {
            setPicking(false);
            setReceiving(product);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {receiving && (
        <ReceiveDialog
          product={receiving}
          onClose={() => setReceiving(null)}
          onDone={async (movement) => {
            await addMovement(movement);
            toast.show(`${movement.qty} received — Dr Inventory / Cr Bank ${fmt(movement.valueZar)}`);
            setReceiving(null);
          }}
        />
      )}

      {issuing && (
        <IssueDialog
          productId={issuing}
          onHand={levels.get(issuing)?.qty ?? 0}
          costFor={(qty) => costOfIssue(movements, issuing, qty)}
          onClose={() => setIssuing(null)}
          onDone={async (movement) => {
            await addMovement(movement);
            toast.show(
              movement.kind === "out"
                ? `${movement.qty} sold — Dr Cost of Sales ${fmt(movement.valueZar)}`
                : `${movement.qty} written off`
            );
            setIssuing(null);
          }}
        />
      )}
    </Screen>
  );
}

function ReceiveDialog({
  product,
  onClose,
  onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: (movement: StockMovement) => void;
}) {
  const { settings } = useLedger();
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(todayISO());

  const cost = computeLandedCost(product, Math.max(qty, 0), settings.landedCost);

  return (
    <Modal
      title={`Receive ${productLabel(product)}`}
      subtitle={product.supplier}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn primary"
            disabled={qty <= 0}
            onClick={() =>
              onDone({
                id: newMovementId(),
                productId: product.id,
                kind: "in",
                qty,
                date,
                valueZar: cost.totalZar,
                note: `${qty} × $${abs(cost.unitUsd)} landed`,
              })
            }
          >
            Receive {qty} into stock
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid cols-2">
          <Field label="QUANTITY">
            <NumberInput value={qty} onChange={setQty} />
          </Field>
          <Field label="DATE">
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>

        <Card title="LANDED COST">
          <table className="data">
            <tbody>
              <tr>
                <td className="wide">Goods</td>
                <td className="right num">${abs(cost.goodsUsd)}</td>
              </tr>
              <tr>
                <td className="wide">Shipping</td>
                <td className="right num">${abs(cost.shippingUsd)}</td>
              </tr>
              <tr>
                <td className="wide">At R {abs(settings.landedCost.usdZarRate)} to the dollar</td>
                <td className="right num">{abs(cost.totalUsd * settings.landedCost.usdZarRate)}</td>
              </tr>
              <tr>
                <td className="wide">Clearing</td>
                <td className="right num">{abs(cost.clearingZar)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Total · {abs(cost.perUnitZar)} each</td>
                <td className="right">
                  <Money value={cost.totalZar} plain />
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </div>
    </Modal>
  );
}

function IssueDialog({
  productId,
  onHand,
  costFor,
  onClose,
  onDone,
}: {
  productId: string;
  onHand: number;
  costFor: (qty: number) => number;
  onClose: () => void;
  onDone: (movement: StockMovement) => void;
}) {
  const [qty, setQty] = useState(1);
  const [kind, setKind] = useState<MovementKind>("out");
  const [date, setDate] = useState(todayISO());
  const product = findProduct(productId);
  const tooMany = qty > onHand;

  return (
    <Modal
      title={`Take out ${product ? productLabel(product) : productId}`}
      subtitle={`${onHand} on hand`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn primary"
            disabled={qty <= 0 || tooMany}
            onClick={() =>
              onDone({
                id: newMovementId(),
                productId,
                kind,
                qty,
                date,
                valueZar: costFor(qty),
              })
            }
          >
            {kind === "out" ? "Sold" : "Write off"} {qty}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <span className="hint">
            Cost released <Money value={costFor(Math.min(qty, onHand))} plain />
          </span>
        </>
      }
    >
      <div className="grid cols-3">
        <Field label="QUANTITY" error={tooMany ? `Only ${onHand} on hand` : undefined}>
          <NumberInput value={qty} onChange={setQty} />
        </Field>
        <Field label="DATE">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="REASON">
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as MovementKind)}
          >
            <option value="out">Sold to a customer</option>
            <option value="writeoff">Written off</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

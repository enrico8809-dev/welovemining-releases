import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLedger } from "@engine/LedgerContext";
import {
  CATEGORIES,
  Category,
  Product,
  productLabel,
  searchCatalogue,
  unitPriceUsd,
} from "@engine/catalogue";
import { computeLandedCost, computeStockLevels, suggestedPrice } from "@engine/inventory";
import { abs, fmtWhole } from "@engine/format";
import { Modal, Pill, Tabs } from "../components/ui";

type Filter = Category | "all";

/**
 * The supplier price list, with what each miner actually costs landed in Rand
 * and what it should sell for at the target margin — the two numbers that
 * decide a quote, next to each other.
 */
export default function ProductPicker({
  onPick,
  onClose,
}: {
  onPick: (product: Product) => void;
  onClose: () => void;
}) {
  const { settings, movements } = useLedger();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const levels = useMemo(() => computeStockLevels(movements), [movements]);
  const results = useMemo(
    () => searchCatalogue(query, filter === "all" ? undefined : filter),
    [query, filter]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label })),
  ];

  return (
    <Modal
      wide
      title="Price list"
      subtitle={`${results.length} products · landed at R ${abs(settings.landedCost.usdZarRate)} to the dollar`}
      onClose={onClose}
    >
      <div className="stack">
        <div className="row wrap">
          <div className="money-field" style={{ width: 300, paddingLeft: 10 }}>
            <Search size={15} className="muted" />
            <input
              value={query}
              autoFocus
              placeholder="Search miners, e.g. S21 or L9"
              onChange={(e) => setQuery(e.target.value)}
              style={{ textAlign: "left", fontFamily: "var(--font-ui)" }}
            />
          </div>
          <Tabs options={filters} value={filter} onChange={setFilter} />
        </div>

        <div className="card flush">
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ width: 150 }}>Supplier</th>
                  <th className="right" style={{ width: 100 }}>
                    USD
                  </th>
                  <th className="right" style={{ width: 140 }}>
                    Landed
                  </th>
                  <th className="right" style={{ width: 140 }}>
                    Suggested
                  </th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {results.map((product) => {
                  const landed = computeLandedCost(product, 1, settings.landedCost).perUnitZar;
                  const onHand = levels.get(product.id)?.qty ?? 0;
                  return (
                    <tr
                      key={product.id}
                      className="selectable"
                      onDoubleClick={() => onPick(product)}
                    >
                      <td className="wide">
                        {productLabel(product)}{" "}
                        {onHand > 0 && <Pill tone="good">{onHand} in stock</Pill>}
                        {!product.warranty && <Pill tone="warning">no warranty</Pill>}
                      </td>
                      <td className="muted">{product.supplier}</td>
                      <td className="right num">
                        {unitPriceUsd(product) > 0 ? `$${fmtWhole(unitPriceUsd(product))}` : "—"}
                      </td>
                      <td className="right num">{landed > 0 ? abs(landed) : "set rate"}</td>
                      <td className="right num" style={{ color: "var(--orange)" }}>
                        {landed > 0
                          ? abs(Math.round(suggestedPrice(landed, settings.targetMarginPct)))
                          : "—"}
                      </td>
                      <td>
                        <button className="btn small" onClick={() => onPick(product)}>
                          Add
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                      No products match that search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hint">
          Landed cost is the supplier price at your exchange rate, plus shipping from the tier
          table and clearing. Suggested price is that cost at your target gross margin — both
          are set in Settings.
        </div>
      </div>
    </Modal>
  );
}

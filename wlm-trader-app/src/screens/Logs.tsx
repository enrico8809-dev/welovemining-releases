import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { useLoad } from "../hooks";
import { Banner, Card, Page, Segmented } from "../components/ui";

export default function Logs() {
  const { api } = useApp();
  const [level, setLevel] = useState("all");
  const load = useCallback(() => api.logs(500), [api]);
  const { data, error } = useLoad(load, 5000);
  const box = useRef<HTMLPreElement>(null);
  const lines = (data?.lines ?? []).filter((l) =>
    level === "all" ? true : level === "trades" ? /BUY|SELL|CLOSE/.test(l) : / (WARNING|ERROR) /.test(l));

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [data, level]);

  return (
    <Page title="Logs" sub="What the bot is doing, live (secrets are always blanked out)"
      actions={<Segmented value={level} onChange={setLevel}
        options={[{ value: "all", label: "All" }, { value: "trades", label: "Trades" }, { value: "problems", label: "Problems" }]} />}>
      {error && <Banner tone="error">{error}</Banner>}
      <Card>
        <pre ref={box} className="console" style={{ maxHeight: "65vh", whiteSpace: "pre-wrap" }}>
          {lines.length ? lines.map((l, i) => (
            <div key={i} style={{ color: / ERROR /.test(l) ? "var(--red)" : / WARNING /.test(l) ? "var(--amber)" : /BUY|SELL|CLOSE/.test(l) ? "var(--text)" : undefined }}>{l}</div>
          )) : "Nothing yet."}
        </pre>
      </Card>
    </Page>
  );
}

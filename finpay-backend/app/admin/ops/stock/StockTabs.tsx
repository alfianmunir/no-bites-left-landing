"use client";

/**
 * Tab switcher for the Stock screen — Ingredients & packaging vs Finished goods.
 * Both tables are server-rendered and passed in as nodes; we just toggle which is
 * visible (kept mounted via display:none so there's no refetch on switch).
 */
import { useState, type ReactNode } from "react";

export default function StockTabs({
  ingredientsLabel,
  finishedGoodsLabel,
  ingredients,
  finishedGoods,
}: {
  ingredientsLabel: string;
  finishedGoodsLabel: string;
  ingredients: ReactNode;
  finishedGoods: ReactNode;
}) {
  const [tab, setTab] = useState<"ingredients" | "fg">("ingredients");

  const tabStyle = (on: boolean): React.CSSProperties => ({
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: "8px 2px",
    marginRight: 22,
    fontSize: 13.5,
    fontWeight: on ? 900 : 700,
    color: on ? "var(--choco)" : "var(--soft)",
    borderBottom: `2.5px solid ${on ? "var(--orange)" : "transparent"}`,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div>
      <div role="tablist" style={{ display: "flex", gap: 0, borderBottom: "1.5px solid var(--line)", marginBottom: 16, overflowX: "auto" }}>
        <button role="tab" aria-selected={tab === "ingredients"} style={tabStyle(tab === "ingredients")} onClick={() => setTab("ingredients")}>
          🧺 {ingredientsLabel}
        </button>
        <button role="tab" aria-selected={tab === "fg"} style={tabStyle(tab === "fg")} onClick={() => setTab("fg")}>
          🥐 {finishedGoodsLabel}
        </button>
      </div>
      <div style={{ display: tab === "ingredients" ? "block" : "none" }}>{ingredients}</div>
      <div style={{ display: tab === "fg" ? "block" : "none" }}>{finishedGoods}</div>
    </div>
  );
}

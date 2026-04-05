"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getTradesForUser } from "@/lib/getTradesForUser";
import { getStrategiesForUser } from "@/lib/getStrategiesForUser";

/** TradeSync-style playbook / strategy theme (page-local) */
const TS = {
  bg: "#0A0A0A",
  card: "#0F0F0F",
  cardHover: "#141414",
  border: "rgba(255,255,255,0.06)",
  mint: "#00FFA3",
  orange: "#FCA311",
  text: "#FAFAFA",
  textMuted: "#A3A3A3",
  textDim: "#737373",
  whiteBtn: "#FFFFFF",
  whiteBtnText: "#0A0A0A",
};

function normalizeRules(rules) {
  if (!rules) return { entry: [], exit: [], market: [], risk: [] };
  if (typeof rules === "object" && !Array.isArray(rules)) {
    const entry = Array.isArray(rules.entry) ? rules.entry.map((r) => String(r)).filter(Boolean) : [];
    const exit = Array.isArray(rules.exit) ? rules.exit.map((r) => String(r)).filter(Boolean) : [];
    const market = Array.isArray(rules.market) ? rules.market.map((r) => String(r)).filter(Boolean) : [];
    const risk = Array.isArray(rules.risk) ? rules.risk.map((r) => String(r)).filter(Boolean) : [];
    return { entry, exit, market, risk };
  }
  if (Array.isArray(rules)) {
    return {
      entry: rules.map((r) => (typeof r === "string" ? r : String(r))).filter(Boolean),
      exit: [],
      market: [],
      risk: [],
    };
  }
  return { entry: [], exit: [], market: [], risk: [] };
}

function fmtCurrency(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function fmtCurrencyFull(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function categoryFromRules(rules) {
  const r = normalizeRules(rules);
  const tag = r.market[0] || r.entry[0] || r.exit[0];
  if (!tag) return "General";
  return tag.length > 28 ? `${tag.slice(0, 26)}…` : tag;
}

function consistencyScore(pnls) {
  if (!pnls || pnls.length < 3) return 0;
  const n = pnls.length;
  const mean = pnls.reduce((a, b) => a + b, 0) / n;
  const variance = pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(n - 1, 1);
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return 100;
  const sharpeLike = mean / sd;
  return Math.min(100, Math.max(0, (sharpeLike + 1.5) * 32));
}

function buildStrategyRow(strategy, trades) {
  const strategyTrades = trades.filter((t) => t.strategy_id === strategy.id);
  const tradeCount = strategyTrades.length;
  const wins = strategyTrades.filter((t) => t.status === "Win");
  const losses = strategyTrades.filter((t) => t.status === "Loss");
  const grossWin = wins.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0));
  const netPnl = strategyTrades.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0);
  const winRate = tradeCount ? (wins.length / tradeCount) * 100 : 0;
  const profitFactor = grossLossAbs > 0 ? grossWin / grossLossAbs : grossWin > 0 ? 99 : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLossAbs = losses.length ? grossLossAbs / losses.length : 0;
  const rrFromAvg = avgLossAbs > 0 ? avgWin / avgLossAbs : 0;
  const rrSamples = strategyTrades.map((t) => Number(t.actual_rr)).filter((v) => Number.isFinite(v) && v > 0);
  const avgRRRecorded = rrSamples.length ? rrSamples.reduce((a, b) => a + b, 0) / rrSamples.length : 0;
  const rr = avgRRRecorded > 0 ? avgRRRecorded : rrFromAvg;

  const symCounts = {};
  for (const t of strategyTrades) {
    const s = String(t.symbol || "").trim().toUpperCase();
    if (!s) continue;
    symCounts[s] = (symCounts[s] || 0) + 1;
  }
  const topSymbols = Object.entries(symCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sym]) => sym)
    .slice(0, 4);

  const dates = strategyTrades.map((t) => t.date?.slice(0, 10)).filter(Boolean);
  const lastDate = dates.length ? dates.sort().at(-1) : null;
  const activeCutoff = new Date();
  activeCutoff.setDate(activeCutoff.getDate() - 60);
  const cutStr = activeCutoff.toISOString().slice(0, 10);
  const isActive = lastDate && lastDate >= cutStr;

  const riskVals = strategyTrades.map((t) => Number(t.trade_risk)).filter((v) => Number.isFinite(v) && v > 0);
  const avgRisk = riskVals.length ? riskVals.reduce((a, b) => a + b, 0) / riskVals.length : null;

  const pnls = strategyTrades.map((t) => Number(t.net_pnl || 0));
  const cons = consistencyScore(pnls);

  return {
    ...strategy,
    tradeCount,
    netPnl,
    winRate,
    profitFactor,
    rr,
    topSymbols,
    category: categoryFromRules(strategy.rules),
    isActive,
    avgRisk,
    consistency: cons,
    grossWin,
    grossLossAbs,
  };
}

function sortRows(rows, key) {
  const copy = [...rows];
  if (key === "pnl") copy.sort((a, b) => b.netPnl - a.netPnl);
  else if (key === "wr") copy.sort((a, b) => b.winRate - a.winRate);
  else if (key === "pf") copy.sort((a, b) => b.profitFactor - a.profitFactor);
  else if (key === "consistency") copy.sort((a, b) => b.consistency - a.consistency);
  return copy;
}

export default function PlaybookPage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [topSort, setTopSort] = useState("pnl");
  const [gridSort, setGridSort] = useState("pnl");
  const [viewMode, setViewMode] = useState("grid");

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const [strategyData, tradeData] = await Promise.all([
        getStrategiesForUser({
          select: "id, name, description, rules, created_at",
          order: { column: "created_at", ascending: false },
        }),
        getTradesForUser({ orderAscending: true }).then((rows) =>
          (rows || []).map((t) => ({
            strategy_id: t.strategy_id,
            net_pnl: t.net_pnl,
            status: t.status,
            symbol: t.symbol,
            date: t.date,
            actual_rr: t.actual_rr,
            trade_risk: t.trade_risk,
          }))
        ),
      ]);

      if (ignore) return;

      setStrategies(strategyData ?? []);
      setTrades(tradeData ?? []);
      setLoading(false);
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const rows = useMemo(() => strategies.map((s) => buildStrategyRow(s, trades)), [strategies, trades]);

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.category));
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = (r.name || "").toLowerCase();
        const desc = (r.description || "").toLowerCase();
        return name.includes(q) || desc.includes(q);
      });
    }
    if (statusFilter === "active") list = list.filter((r) => r.isActive);
    if (statusFilter === "idle") list = list.filter((r) => !r.isActive);
    if (typeFilter !== "all") list = list.filter((r) => r.category === typeFilter);
    return list;
  }, [rows, search, statusFilter, typeFilter]);

  const sortedForTop = useMemo(() => sortRows(filtered, topSort), [filtered, topSort]);
  const sortedForGrid = useMemo(() => sortRows(filtered, gridSort), [filtered, gridSort]);

  const summary = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.isActive).length;
    const totalPnl = rows.reduce((s, r) => s + r.netPnl, 0);
    const withTrades = rows.filter((r) => r.tradeCount >= 3);
    let bestWr = null;
    let bestWrName = "—";
    for (const r of withTrades) {
      if (!bestWr || r.winRate > bestWr.winRate) {
        bestWr = r;
        bestWrName = r.name || "Untitled";
      }
    }
    let bestPf = null;
    let bestPfName = "—";
    for (const r of withTrades) {
      if (r.grossLossAbs <= 0) continue;
      if (!bestPf || r.profitFactor > bestPf.profitFactor) {
        bestPf = r;
        bestPfName = r.name || "Untitled";
      }
    }
    return { total, active, totalPnl, bestWrPct: bestWr ? bestWr.winRate : null, bestWrName, bestPfVal: bestPf ? bestPf.profitFactor : null, bestPfName };
  }, [rows]);

  const maxTopPnl = useMemo(() => {
    const vals = sortedForTop.map((r) => r.netPnl);
    return Math.max(...vals.map((v) => Math.abs(v)), 1);
  }, [sortedForTop]);

  const selectStyle = {
    background: TS.card,
    border: `1px solid ${TS.border}`,
    borderRadius: "10px",
    color: TS.text,
    fontSize: "12px",
    padding: "8px 12px",
    fontFamily: "system-ui, sans-serif",
    cursor: "pointer",
    minWidth: "120px",
  };

  const tabBtn = (active) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: active ? 600 : 500,
    color: active ? TS.mint : TS.textDim,
    padding: "6px 0",
    marginRight: "18px",
    borderBottom: active ? `2px solid ${TS.mint}` : "2px solid transparent",
    fontFamily: "system-ui, sans-serif",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: TS.bg,
        color: TS.text,
        padding: "28px 24px 48px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "24px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 36px)", fontWeight: 700, letterSpacing: "-0.02em" }}>Playbook</h1>
            <p style={{ margin: "8px 0 0", fontSize: "14px", color: TS.textMuted, maxWidth: "520px", lineHeight: 1.5 }}>
              Strategies, performance, and criteria — same view as your process on the charts.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            marginBottom: "24px",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: "200px", maxWidth: "360px" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: TS.textDim, fontSize: "14px" }} aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              placeholder="Search playbooks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px 10px 36px",
                borderRadius: "10px",
                border: `1px solid ${TS.border}`,
                background: TS.card,
                color: TS.text,
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle} aria-label="Filter by status">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle} aria-label="Filter by type">
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All types" : c}
              </option>
            ))}
          </select>
          <select value={gridSort} onChange={(e) => setGridSort(e.target.value)} style={selectStyle} aria-label="Sort grid">
            <option value="pnl">Sort: Total P&amp;L</option>
            <option value="wr">Sort: Win rate</option>
            <option value="pf">Sort: Profit factor</option>
            <option value="consistency">Sort: Consistency</option>
          </select>
          <div style={{ display: "flex", border: `1px solid ${TS.border}`, borderRadius: "10px", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              style={{
                padding: "8px 12px",
                border: "none",
                background: viewMode === "grid" ? TS.textDim : "transparent",
                color: viewMode === "grid" ? TS.bg : TS.textMuted,
                cursor: "pointer",
                fontSize: "12px",
              }}
              aria-pressed={viewMode === "grid"}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              style={{
                padding: "8px 12px",
                border: "none",
                borderLeft: `1px solid ${TS.border}`,
                background: viewMode === "list" ? TS.textDim : "transparent",
                color: viewMode === "list" ? TS.bg : TS.textMuted,
                cursor: "pointer",
                fontSize: "12px",
              }}
              aria-pressed={viewMode === "list"}
            >
              List
            </button>
          </div>
          <Link
            href="/playbook/new"
            style={{
              marginLeft: "auto",
              borderRadius: "10px",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              color: TS.whiteBtnText,
              background: TS.whiteBtn,
              whiteSpace: "nowrap",
            }}
          >
            + Add playbook
          </Link>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "16px",
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              color: "#FCA5A5",
              borderRadius: "10px",
              padding: "12px 14px",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "28px",
          }}
        >
          {[
            {
              label: "Playbooks",
              value: loading ? "—" : String(summary.total),
              sub: loading ? "" : `${summary.active} active`,
            },
            {
              label: "Total P&L",
              value: loading ? "—" : fmtCurrency(summary.totalPnl),
              sub: "Across all playbooks",
              valueColor: summary.totalPnl >= 0 ? TS.mint : "#F87171",
            },
            {
              label: "Best win rate",
              value: loading || summary.bestWrPct == null ? "—" : `${summary.bestWrPct.toFixed(1)}%`,
              sub: summary.bestWrName,
            },
            {
              label: "Best profit factor",
              value: loading || summary.bestPfVal == null ? "—" : summary.bestPfVal >= 99 ? "∞" : summary.bestPfVal.toFixed(2),
              sub: summary.bestPfName,
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: TS.card,
                border: `1px solid ${TS.border}`,
                borderRadius: "14px",
                padding: "18px 20px",
              }}
            >
              <div style={{ fontSize: "11px", color: TS.textDim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>{card.label}</div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: card.valueColor || TS.text, letterSpacing: "-0.02em" }}>{card.value}</div>
              {card.sub ? <div style={{ fontSize: "12px", color: TS.textMuted, marginTop: "6px" }}>{card.sub}</div> : null}
            </div>
          ))}
        </div>

        {/* Top playbooks */}
        <div
          style={{
            background: TS.card,
            border: `1px solid ${TS.border}`,
            borderRadius: "14px",
            padding: "20px 22px",
            marginBottom: "28px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Top playbooks</h2>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
              {[
                { id: "pnl", label: "Total P&L" },
                { id: "wr", label: "Win rate" },
                { id: "pf", label: "Profit factor" },
                { id: "consistency", label: "Consistency" },
              ].map((t) => (
                <button key={t.id} type="button" style={tabBtn(topSort === t.id)} onClick={() => setTopSort(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div style={{ color: TS.textMuted, fontSize: "13px", padding: "12px 0" }}>Loading…</div>
          ) : sortedForTop.length === 0 ? (
            <div style={{ color: TS.textMuted, fontSize: "13px", padding: "12px 0" }}>No playbooks match your filters.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {sortedForTop.slice(0, 8).map((row, i) => {
                const barW = maxTopPnl > 0 ? (Math.abs(row.netPnl) / maxTopPnl) * 100 : 0;
                return (
                  <li
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr minmax(120px, 28%) auto",
                      alignItems: "center",
                      gap: "14px",
                      padding: "14px 0",
                      borderTop: i === 0 ? "none" : `1px solid ${TS.border}`,
                      cursor: "pointer",
                    }}
                    onClick={() => router.push(`/playbook/${row.id}`)}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        border: `1px solid ${TS.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: TS.textMuted,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "14px" }}>{row.name || "Untitled playbook"}</div>
                      <div style={{ fontSize: "12px", color: TS.textDim, marginTop: "2px" }}>{row.category}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${barW}%`, height: "100%", background: TS.orange, borderRadius: "4px", minWidth: row.netPnl !== 0 ? "4px" : 0 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: row.netPnl >= 0 ? TS.mint : "#F87171", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {fmtCurrencyFull(row.netPnl)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Grid / list */}
        {loading ? (
          <div style={{ color: TS.textMuted, fontSize: "13px" }}>Loading playbooks…</div>
        ) : sortedForGrid.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${TS.border}`,
              borderRadius: "14px",
              padding: "40px 24px",
              textAlign: "center",
              color: TS.textMuted,
              fontSize: "14px",
            }}
          >
            No playbooks yet.{" "}
            <Link href="/playbook/new" style={{ color: TS.mint }}>
              Add your first playbook
            </Link>
            .
          </div>
        ) : viewMode === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
            {sortedForGrid.map((row) => (
              <div
                key={row.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/playbook/${row.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/playbook/${row.id}`);
                  }
                }}
                style={{
                  background: TS.card,
                  border: `1px solid ${TS.border}`,
                  borderRadius: "14px",
                  padding: "18px 18px 16px",
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = TS.cardHover;
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = TS.card;
                  e.currentTarget.style.borderColor = TS.border;
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1.3 }}>{row.name || "Untitled playbook"}</div>
                    <div style={{ fontSize: "12px", color: TS.textDim, marginTop: "4px" }}>{row.category}</div>
                  </div>
                  <span style={{ color: TS.textDim, fontSize: "18px", lineHeight: 1 }} aria-hidden>
                    ›
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                  {row.topSymbols.length ? (
                    row.topSymbols.map((sym) => (
                      <span
                        key={sym}
                        style={{
                          fontSize: "10px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,0.05)",
                          color: TS.textMuted,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {sym}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: "11px", color: TS.textDim }}>No symbols yet</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: "8px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: TS.textDim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>P&amp;L</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: row.netPnl >= 0 ? TS.mint : "#F87171", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(row.netPnl)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: TS.textDim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Win rate</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.tradeCount ? `${Math.round(row.winRate)}%` : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: TS.textDim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Trades</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.tradeCount}</div>
                  </div>
                </div>
                <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden", marginBottom: "14px" }}>
                  <div style={{ width: `${Math.min(100, row.winRate)}%`, height: "100%", background: TS.mint, borderRadius: "3px" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "11px", color: TS.textMuted }}>
                  <span>
                    <span style={{ color: TS.textDim }}>R:R </span>
                    <span style={{ color: TS.text, fontWeight: 600 }}>{row.tradeCount && row.rr > 0 ? row.rr.toFixed(2) : "—"}</span>
                  </span>
                  <span>
                    <span style={{ color: TS.textDim }}>PF </span>
                    <span style={{ color: TS.text, fontWeight: 600 }}>{row.grossLossAbs > 0 ? row.profitFactor.toFixed(2) : row.grossWin > 0 ? "∞" : "—"}</span>
                  </span>
                  <span>
                    <span style={{ color: TS.textDim }}>Win % </span>
                    <span style={{ color: TS.text, fontWeight: 600 }}>{row.tradeCount ? `${row.winRate.toFixed(1)}%` : "—"}</span>
                  </span>
                  {row.avgRisk != null ? (
                    <span>
                      <span style={{ color: TS.textDim }}>Risk </span>
                      <span style={{ color: TS.text, fontWeight: 600 }}>{row.avgRisk.toFixed(1)}%</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: TS.card, border: `1px solid ${TS.border}`, borderRadius: "14px", overflow: "hidden" }}>
            {sortedForGrid.map((row, idx) => (
              <div
                key={row.id}
                onClick={() => router.push(`/playbook/${row.id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto auto",
                  gap: "16px",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderTop: idx === 0 ? "none" : `1px solid ${TS.border}`,
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{row.name || "Untitled"}</div>
                  <div style={{ fontSize: "11px", color: TS.textDim }}>{row.category}</div>
                </div>
                <div style={{ color: TS.textMuted, fontVariantNumeric: "tabular-nums" }}>{row.tradeCount} trades</div>
                <div style={{ color: row.netPnl >= 0 ? TS.mint : "#F87171", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtCurrencyFull(row.netPnl)}</div>
                <div style={{ fontVariantNumeric: "tabular-nums" }}>{row.tradeCount ? `${row.winRate.toFixed(1)}%` : "—"}</div>
                <div style={{ fontVariantNumeric: "tabular-nums", color: TS.textMuted }}>
                  PF {row.grossLossAbs > 0 ? row.profitFactor.toFixed(2) : "—"} · R:R {row.rr > 0 ? row.rr.toFixed(2) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

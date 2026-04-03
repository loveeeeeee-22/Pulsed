"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ACCENT = "#7C3AED";

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
    return { entry: rules.map((r) => String(r)).filter(Boolean), exit: [], market: [], risk: [] };
  }
  return { entry: [], exit: [], market: [], risk: [] };
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function PlayDetailPage() {
  const { id } = useParams();
  const [strategy, setStrategy] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  useEffect(() => {
    if (!id) return;

    let ignore = false;
    async function loadData() {
      setLoading(true);
      setError(null);

      const [{ data: strategyData, error: strategyErr }, { data: tradeData, error: tradeErr }] =
        await Promise.all([
          supabase.from("strategies").select("id, name, description, rules").eq("id", id).single(),
          supabase
            .from("trades")
            .select("id, date, net_pnl, status, actual_rr")
            .eq("strategy_id", id)
            .order("date", { ascending: true }),
        ]);

      if (ignore) return;
      if (strategyErr || tradeErr) {
        setError(strategyErr?.message || tradeErr?.message || "Failed to load playbook.");
        setLoading(false);
        return;
      }

      setStrategy(strategyData);
      setTrades(tradeData ?? []);
      setLoading(false);
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [id]);

  const stats = useMemo(() => {
    const tradeCount = trades.length;
    const wins = trades.filter((t) => t.status === "Win");
    const losses = trades.filter((t) => t.status === "Loss");
    const grossWin = wins.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0);
    const grossLossAbs = Math.abs(losses.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0));
    const netPnl = trades.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0);
    const winRate = tradeCount ? (wins.length / tradeCount) * 100 : 0;
    const profitFactor = grossLossAbs > 0 ? grossWin / grossLossAbs : 0;
    const expectancy = tradeCount ? netPnl / tradeCount : 0;
    const avgWinner = wins.length ? grossWin / wins.length : 0;
    const avgLoser = losses.length ? losses.reduce((s, t) => s + Number(t.net_pnl || 0), 0) / losses.length : 0;
    const rrValues = trades.map((t) => Number(t.actual_rr)).filter((v) => Number.isFinite(v));
    const avgRR = rrValues.length ? rrValues.reduce((s, v) => s + v, 0) / rrValues.length : 0;
    const breakevenCount = trades.filter((t) => t.status === "Breakeven").length;
    const breakevenRate = tradeCount ? (breakevenCount / tradeCount) * 100 : 0;

    let cumulative = 0;
    const eqSeries = trades.map((t) => {
      cumulative += Number(t.net_pnl || 0);
      return { date: t.date, cumulative };
    });

    return {
      tradeCount,
      netPnl,
      winRate,
      profitFactor,
      expectancy,
      avgWinner,
      avgLoser,
      avgRR,
      breakevenRate,
      eqSeries,
    };
  }, [trades]);

  const eqW = 760;
  const eqH = 220;
  const eqPoints = stats.eqSeries.map((p) => p.cumulative);
  let eqPath = "";
  let eqArea = "";
  const eqCoords = [];
  if (eqPoints.length > 1) {
    const min = Math.min(0, ...eqPoints);
    const max = Math.max(0, ...eqPoints);
    const range = max - min || 1;
    const coords = eqPoints.map((v, i) => {
      const x = (i / (eqPoints.length - 1)) * eqW;
      const y = eqH - ((v - min) / range) * (eqH - 12) - 6;
      eqCoords.push({ x, y });
      return `${x},${y}`;
    });
    eqPath = "M" + coords.join("L");
    eqArea = `${eqPath}L${eqW},${eqH}L0,${eqH}Z`;
  }

  const rules = normalizeRules(strategy?.rules);

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", color: "var(--text)", padding: "24px 28px" }}>
      <div style={{ maxWidth: "1220px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
          <div>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>
              Playbook / Overview
            </p>
            <h1 style={{ margin: "6px 0 0", fontSize: "30px", fontWeight: 700 }}>
              {strategy?.name || "Play Overview"}
            </h1>
            {strategy?.description && (
              <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--text3)" }}>{strategy.description}</p>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Link href={`/playbook/${id}/edit`} style={{ textDecoration: "none", color: "#fff", background: ACCENT, border: "1px solid transparent", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", fontFamily: "monospace" }}>
              Edit Rules
            </Link>
            <Link href="/playbook" style={{ textDecoration: "none", color: "var(--text2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", fontFamily: "monospace" }}>
              Back to Playbook
            </Link>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: "12px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5", padding: "10px 12px", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "16px", color: "var(--text3)", fontSize: "13px" }}>
            Loading play details...
          </div>
        ) : (
          <>
            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "14px 16px", marginBottom: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "10px" }}>
                {[
                  { label: "Net P&L", value: fmtMoney(stats.netPnl), color: stats.netPnl >= 0 ? "#22C55E" : "#EF4444" },
                  { label: "Trades", value: stats.tradeCount, color: "var(--text)" },
                  { label: "Win Rate", value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? "#22C55E" : "#EAB308" },
                  { label: "Profit Factor", value: stats.profitFactor ? stats.profitFactor.toFixed(2) : "0.00", color: "var(--text)" },
                  { label: "Expectancy", value: fmtMoney(stats.expectancy), color: stats.expectancy >= 0 ? "#22C55E" : "#EF4444" },
                  { label: "Breakeven Rate", value: `${stats.breakevenRate.toFixed(1)}%`, color: "var(--text2)" },
                  { label: "Avg Winner", value: fmtMoney(stats.avgWinner), color: "#22C55E" },
                  { label: "Avg Loser", value: fmtMoney(stats.avgLoser), color: "#EF4444" },
                  { label: "Avg R:R", value: stats.avgRR ? stats.avgRR.toFixed(2) : "0.00", color: "var(--text)" },
                  { label: "Missed Trades", value: "0", color: "var(--text2)" },
                ].map((item) => (
                  <div key={item.label} style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg3)", padding: "10px 11px" }}>
                    <div style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "18px", fontFamily: "monospace", color: item.color, fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "14px 16px", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>Daily Net Cumulative P&L</div>
              {eqPoints.length > 1 ? (
                <div style={{ position: "relative" }}>
                  {hoverIndex !== null && stats.eqSeries[hoverIndex] && (
                    <div style={{ position: "absolute", top: "8px", right: "8px", border: "1px solid var(--border-md)", borderRadius: "8px", background: "var(--bg3)", padding: "8px 10px", zIndex: 2, pointerEvents: "none" }}>
                      <div style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--text3)" }}>
                        {stats.eqSeries[hoverIndex].date || "No date"}
                      </div>
                      <div style={{ fontSize: "12px", fontFamily: "monospace", color: eqPoints[hoverIndex] >= 0 ? "#22C55E" : "#EF4444", marginTop: "2px" }}>
                        Cumulative: {fmtMoney(eqPoints[hoverIndex])}
                      </div>
                    </div>
                  )}
                  <svg
                    width="100%"
                    height="260"
                    viewBox={`0 0 ${eqW} ${eqH}`}
                    preserveAspectRatio="none"
                    style={{ cursor: "crosshair" }}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = (e.clientX - rect.left) / rect.width;
                      const idx = Math.max(0, Math.min(eqPoints.length - 1, Math.round(ratio * (eqPoints.length - 1))));
                      setHoverIndex(idx);
                    }}
                    onMouseLeave={() => setHoverIndex(null)}
                  >
                    <defs>
                      <linearGradient id="playEqg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity="0.03" />
                      </linearGradient>
                    </defs>
                    <path d={eqArea} fill="url(#playEqg)" />
                    <path d={eqPath} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {hoverIndex !== null && eqCoords[hoverIndex] && (
                      <>
                        <line x1={eqCoords[hoverIndex].x} y1="0" x2={eqCoords[hoverIndex].x} y2={eqH} stroke={ACCENT} strokeOpacity="0.3" strokeDasharray="3 3" />
                        <circle cx={eqCoords[hoverIndex].x} cy={eqCoords[hoverIndex].y} r="4" fill={ACCENT} stroke="#fff" strokeWidth="1.5" />
                      </>
                    )}
                  </svg>
                </div>
              ) : (
                <div style={{ color: "var(--text3)", fontSize: "12px", fontFamily: "monospace", padding: "16px 0" }}>
                  Not enough trades for a cumulative curve.
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { title: "Entry criteria", list: rules.entry, key: "entry" },
                { title: "Exit criteria", list: rules.exit, key: "exit" },
                { title: "Market conditions", list: rules.market, key: "market" },
                { title: "Risk management", list: rules.risk, key: "risk" },
              ].map((block) => (
                <div key={block.key} style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "14px 16px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px" }}>{block.title}</div>
                  {block.list.length > 0 ? (
                    <ol style={{ margin: 0, paddingLeft: "18px", color: "var(--text2)", fontSize: "13px", display: "grid", gap: "6px" }}>
                      {block.list.map((rule, idx) => (
                        <li key={`${block.key}-${idx}`}>{rule}</li>
                      ))}
                    </ol>
                  ) : (
                    <div style={{ color: "var(--text3)", fontSize: "12px" }}>None defined.</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

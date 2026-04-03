"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getTradesForUser } from "@/lib/getTradesForUser";
import { getStrategiesForUser } from "@/lib/getStrategiesForUser";

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
  return `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function getStatusColor(value) {
  if (value >= 60) return "#22C55E";
  if (value >= 45) return "#EAB308";
  return "#EF4444";
}

export default function PlaybookPage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          (rows || []).map((t) => ({ strategy_id: t.strategy_id, net_pnl: t.net_pnl, status: t.status }))
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

  const rows = useMemo(() => {
    return strategies.map((strategy) => {
      const strategyTrades = trades.filter((t) => t.strategy_id === strategy.id);
      const tradeCount = strategyTrades.length;
      const wins = strategyTrades.filter((t) => t.status === "Win").length;
      const netPnl = strategyTrades.reduce((sum, t) => sum + Number(t.net_pnl || 0), 0);
      const winRate = tradeCount ? (wins / tradeCount) * 100 : 0;
      const expectancy = tradeCount ? netPnl / tradeCount : 0;
      return {
        ...strategy,
        tradeCount,
        wins,
        netPnl,
        winRate,
        expectancy,
      };
    });
  }, [strategies, trades]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page-bg)",
        color: "var(--text)",
        padding: "24px 28px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ marginBottom: "18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p style={{ fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", margin: 0 }}>
              Playbook
            </p>
            <h1 style={{ margin: "6px 0 0", fontSize: "32px", fontWeight: 700 }}>My Playbook</h1>
            <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--text3)" }}>
              Track each play, monitor win rate and expectancy, and keep criteria organized.
            </p>
          </div>
          <Link
            href="/playbook/new"
            style={{
              borderRadius: "8px",
              padding: "9px 14px",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              color: "#fff",
              background: ACCENT,
              fontFamily: "monospace",
            }}
          >
            + Create Playbook
          </Link>
        </div>

        {error && (
          <div style={{ marginBottom: "12px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#FCA5A5", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" }}>
            {error}
          </div>
        )}

        <div style={{ overflow: "hidden", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--card-bg)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.8fr 1fr 0.9fr 1fr 1.8fr", borderBottom: "1px solid var(--border)", background: "var(--bg3)", padding: "11px 14px", fontSize: "10px", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>
            <div>Playbook Name</div>
            <div>Trades</div>
            <div>Net P&amp;L</div>
            <div>Win Rate</div>
            <div>Expectancy</div>
            <div>Criteria</div>
          </div>

          {loading ? (
            <div style={{ padding: "18px 14px", fontSize: "13px", color: "var(--text3)" }}>Loading playbooks...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "22px 14px", fontSize: "13px", color: "var(--text3)" }}>
              No playbooks yet. Click <span style={{ color: "var(--text)", fontWeight: 600 }}>Create Playbook</span> to add your first one.
            </div>
          ) : (
            rows.map((row) => {
              const rules = normalizeRules(row.rules);
              const previewRules = [...rules.entry, ...rules.exit, ...rules.market, ...rules.risk];
              return (
                <div
                  key={row.id}
                  onClick={() => router.push(`/playbook/${row.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.2fr 0.8fr 1fr 0.9fr 1fr 1.8fr",
                    alignItems: "center",
                    borderBottom: "1px solid var(--border)",
                    padding: "12px 14px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name || "Untitled play"}</div>
                  </div>
                  <div style={{ fontFamily: "monospace", color: "var(--text2)" }}>{row.tradeCount}</div>
                  <div
                    style={{ fontFamily: "monospace", color: row.netPnl >= 0 ? "#22C55E" : "#EF4444" }}
                  >
                    {fmtCurrency(row.netPnl)}
                  </div>
                  <div
                    style={{ fontFamily: "monospace", color: getStatusColor(row.winRate) }}
                  >
                    {row.winRate.toFixed(1)}%
                  </div>
                  <div
                    style={{ fontFamily: "monospace", color: row.expectancy >= 0 ? "#22C55E" : "#EF4444" }}
                  >
                    {fmtCurrency(row.expectancy)}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {previewRules.length > 0 ? previewRules.slice(0, 2).join(" · ") : "No criteria yet"}
                    {previewRules.length > 2 ? "..." : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

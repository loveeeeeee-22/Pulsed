"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAccountsForUser } from "@/lib/getAccountsForUser";
import { getStrategiesForUser } from "@/lib/getStrategiesForUser";
import { computeActualRMultiple } from "@/lib/computeActualRMultiple";
import EditTradeModal from "@/components/EditTradeModal";

function parseNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

const initialForm = {
  account_id: "",
  strategy_id: "",
  date: "",
  symbol: "",
  session: "New York",
  direction: "long",
  contracts: "",
  points: "",
  gross_pnl: "",
  fees: "",
  entry_price: "",
  exit_price: "",
  entry_time: "",
  exit_time: "",
  profit_target: "",
  stop_loss: "",
  trade_risk: "",
  actual_rr: "",
  status: "Win",
  notes: "",
  mistakes: "",
  trade_grade: "",
};

const SESSION_OPTIONS = ["New York", "London", "Asian"];

const SYMBOLS_BY_ACCOUNT_TYPE = {
  futures: ["ES", "NQ", "YM", "RTY", "MES", "MNQ", "MYM", "M2K", "CL", "MCL", "GC", "MGC", "SI", "MSL"],
  crypto: ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "BNBUSD"],
  forex: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"],
};

const LAST_ACCOUNT_KEY = "lastTradeAccountId";

function normalizeRules(rules) {
  if (!rules) return { entry: [], exit: [], market: [], risk: [] }
  if (typeof rules === 'object' && !Array.isArray(rules)) {
    const entry = Array.isArray(rules.entry) ? rules.entry.map(r => String(r)).filter(Boolean) : []
    const exit = Array.isArray(rules.exit) ? rules.exit.map(r => String(r)).filter(Boolean) : []
    const market = Array.isArray(rules.market) ? rules.market.map(r => String(r)).filter(Boolean) : []
    const risk = Array.isArray(rules.risk) ? rules.risk.map(r => String(r)).filter(Boolean) : []
    return { entry, exit, market, risk }
  }
  if (Array.isArray(rules)) {
    return { entry: rules.map(r => String(r)).filter(Boolean), exit: [], market: [], risk: [] }
  }
  return { entry: [], exit: [], market: [], risk: [] }
}

export default function NewTradePage() {
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [customSymbol, setCustomSymbol] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [strategyRules, setStrategyRules] = useState({ entry: [], exit: [], market: [], risk: [] })
  const [rulesFollowed, setRulesFollowed] = useState({})
  const [editTrade, setEditTrade] = useState(null);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    const selectedAccount = accounts.find((a) => a.id === form.account_id);
    const accountType = String(selectedAccount?.type || "").toLowerCase();
    const options = SYMBOLS_BY_ACCOUNT_TYPE[accountType] || [];
    if (options.length === 0 || customSymbol) return;
    if (!form.symbol || !options.includes(form.symbol)) {
      setForm((prev) => ({ ...prev, symbol: options[0] }));
    }
  }, [accounts, form.account_id, form.symbol, customSymbol]);

  useEffect(() => {
    const selectedStrategy = strategies.find(s => s.id === form.strategy_id) || null
    if (!selectedStrategy) {
      setStrategyRules({ entry: [], exit: [], market: [], risk: [] })
      setRulesFollowed({})
      return
    }
    const nextRules = normalizeRules(selectedStrategy.rules)
    setStrategyRules(nextRules)

    const nextFollowed = {}
    nextRules.entry.forEach((_label, i) => {
      nextFollowed[`entry-${i}`] = true
    })
    nextRules.exit.forEach((_label, i) => {
      nextFollowed[`exit-${i}`] = true
    })
    nextRules.market.forEach((_label, i) => {
      nextFollowed[`market-${i}`] = true
    })
    nextRules.risk.forEach((_label, i) => {
      nextFollowed[`risk-${i}`] = true
    })
    setRulesFollowed(nextFollowed)
  }, [form.strategy_id, strategies]);

  async function loadMetadata() {
    setMetaLoading(true);
    const [nextAccounts, nextStrategies] = await Promise.all([
      getAccountsForUser().then((rows) => rows.map((a) => ({ id: a.id, name: a.name, type: a.type }))),
      getStrategiesForUser({ select: "id, name, rules", order: { column: "name", ascending: true } }),
    ]);

    setAccounts(nextAccounts);
    setStrategies(nextStrategies);

    const rawSettings = localStorage.getItem("journalSettings");
    const userDefaults = rawSettings ? JSON.parse(rawSettings) : null;
    const preferredSession = SESSION_OPTIONS.includes(userDefaults?.defaultSession)
      ? userDefaults.defaultSession
      : "New York";
    const preferredContracts =
      userDefaults?.defaultContracts != null ? String(userDefaults.defaultContracts) : "";

    const savedLastAccountId = localStorage.getItem(LAST_ACCOUNT_KEY) || "";
    const hasSavedAccount = nextAccounts.some((a) => a.id === savedLastAccountId);
    const defaultAccountId = hasSavedAccount ? savedLastAccountId : "";
    setForm((prev) => ({
      ...prev,
      account_id: defaultAccountId,
      session: preferredSession,
      contracts: preferredContracts,
    }));
    setMetaLoading(false);
  }

  const gross = parseNumber(form.gross_pnl);
  const fees = parseNumber(form.fees);
  const profitTarget = parseNumber(form.profit_target);
  const stopLoss = parseNumber(form.stop_loss);

  const netPnl = useMemo(() => {
    if (gross == null && fees == null) return null;
    const g = gross ?? 0;
    const f = fees ?? 0;
    return g - f;
  }, [gross, fees]);

  const plannedRr = useMemo(() => {
    if (
      profitTarget == null ||
      stopLoss == null ||
      stopLoss === 0
    ) {
      return null;
    }
    return profitTarget / stopLoss;
  }, [profitTarget, stopLoss]);

  const computedActualRr = useMemo(
    () => computeActualRMultiple(netPnl, parseNumber(form.trade_risk)),
    [netPnl, form.trade_risk]
  );

  const selectedAccountForLabels = accounts.find(a => a.id === form.account_id)
  const accountTypeForLabels = String(selectedAccountForLabels?.type || '').toLowerCase()
  const contractsLabel = accountTypeForLabels === 'forex' ? 'Lots' : 'Contracts'
  const pointsLabel = accountTypeForLabels === 'forex' ? 'Pips' : 'Points'

  function updateField(name, value) {
    if (name === "account_id" && typeof window !== "undefined") {
      if (value) localStorage.setItem(LAST_ACCOUNT_KEY, value);
      else localStorage.removeItem(LAST_ACCOUNT_KEY);
    }
    setForm((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);
    setError(null);

    const brokenLabels = [
      ...strategyRules.entry
        .map((label, i) => (rulesFollowed[`entry-${i}`] === false ? label : null))
        .filter(Boolean),
      ...strategyRules.exit
        .map((label, i) => (rulesFollowed[`exit-${i}`] === false ? label : null))
        .filter(Boolean),
      ...strategyRules.market
        .map((label, i) => (rulesFollowed[`market-${i}`] === false ? label : null))
        .filter(Boolean),
      ...strategyRules.risk
        .map((label, i) => (rulesFollowed[`risk-${i}`] === false ? label : null))
        .filter(Boolean),
    ]
    const computedMistakes = brokenLabels.length ? `Not followed: ${brokenLabels.join(", ")}` : null;

    const payload = {
      account_id: form.account_id || null,
      strategy_id: form.strategy_id || null,
      date: form.date || null,
      symbol: form.symbol.trim() || null,
      session: form.session.trim() || null,
      direction: form.direction || null,
      contracts: parseNumber(form.contracts),
      points: parseNumber(form.points),
      gross_pnl: gross,
      fees: fees,
      entry_price: parseNumber(form.entry_price),
      exit_price: parseNumber(form.exit_price),
      entry_time: form.entry_time || null,
      exit_time: form.exit_time || null,
      profit_target: profitTarget,
      stop_loss: stopLoss,
      trade_risk: parseNumber(form.trade_risk),
      planned_rr: plannedRr,
      actual_rr: computedActualRr ?? parseNumber(form.actual_rr),
      status: form.status.trim() || null,
      notes: form.notes.trim() || null,
      mistakes: computedMistakes,
      trade_grade: form.trade_grade.trim() || null,
      reviewed: false,
    };

    const { data: insertedTrade, error: insertError } = await supabase
      .from("trades")
      .insert(payload)
      .select("*")
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const lastAccountId = form.account_id || "";
    setSuccess(true);
    setForm((prev) => ({
      ...initialForm,
      account_id: lastAccountId,
      session: prev.session,
      contracts: prev.contracts,
    }));
    setStrategyRules({ entry: [], exit: [] })
    setRulesFollowed({})
    if (insertedTrade) setEditTrade(insertedTrade);
  }

  const inputStyle = {
    width: "100%",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--bg3)",
    color: "var(--text)",
    fontSize: "13px",
    padding: "9px 10px",
    outline: "none",
  };

  const labelStyle = {
    marginBottom: "6px",
    display: "block",
    fontSize: "11px",
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text3)",
  };

  const sectionTitleStyle = {
    marginBottom: "12px",
    fontSize: "12px",
    fontFamily: "monospace",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text2)",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", padding: "26px 24px" }}>
        <header style={{ marginBottom: "18px", borderBottom: "1px solid var(--border)", paddingBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: 0, fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}>
                Trading journal
              </p>
              <h1 style={{ margin: "6px 0 0", fontSize: "30px", fontWeight: 700 }}>
                New trade
              </h1>
              <p style={{ margin: "8px 0 0", maxWidth: "620px", fontSize: "13px", color: "var(--text3)" }}>
                Log execution, risk, and review fields. Net P&amp;L, planned R:R, and actual R
                (net P&amp;L ÷ trade risk $) update as you type when risk is set.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                if (window.history.length > 1) {
                  window.history.back();
                  return;
                }
                window.location.href = "/";
              }}
              style={{
                border: "1px solid var(--border-md)",
                background: "var(--bg3)",
                color: "var(--text2)",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "12px",
                fontFamily: "monospace",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ← Back
            </button>
          </div>
        </header>

        {success && (
          <div style={{ marginBottom: "12px", borderRadius: "8px", border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.08)", color: "#86efac", padding: "10px 12px", fontSize: "13px" }} role="status">
            Trade saved successfully.
          </div>
        )}

        {error && (
          <div style={{ marginBottom: "12px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#fca5a5", padding: "10px 12px", fontSize: "13px" }} role="alert">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "grid", gap: "18px", border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "18px" }}
        >
          <section>
            <h2 style={sectionTitleStyle}>
              Setup
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor="account_id">
                  Account
                </label>
                <select
                  id="account_id"
                  style={inputStyle}
                  value={form.account_id}
                  onChange={(e) => updateField("account_id", e.target.value)}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.type || "Unknown"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="strategy_id">
                  Playbook
                </label>
                <select
                  id="strategy_id"
                  style={inputStyle}
                  value={form.strategy_id}
                  onChange={(e) => updateField("strategy_id", e.target.value)}
                >
                  <option value="">No play selected</option>
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="date">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  required
                  style={inputStyle}
                  value={form.date}
                  onChange={(e) => updateField("date", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="symbol">
                  Symbol
                </label>
                {(() => {
                  const selectedAccount = accounts.find((a) => a.id === form.account_id);
                  const accountType = String(selectedAccount?.type || "").toLowerCase();
                  const symbolOptions = SYMBOLS_BY_ACCOUNT_TYPE[accountType] || [];
                  if (customSymbol || symbolOptions.length === 0) {
                    return (
                      <input
                        id="symbol"
                        style={inputStyle}
                        value={form.symbol}
                        onChange={(e) => updateField("symbol", e.target.value.toUpperCase())}
                        placeholder="e.g. ES, NQ"
                        required
                      />
                    );
                  }
                  return (
                    <select
                      id="symbol"
                      style={inputStyle}
                      value={form.symbol}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setCustomSymbol(true);
                          updateField("symbol", "");
                          return;
                        }
                        updateField("symbol", e.target.value);
                      }}
                      required
                    >
                      {symbolOptions.map((symbol) => (
                        <option key={symbol} value={symbol}>
                          {symbol}
                        </option>
                      ))}
                      <option value="__custom__">Custom symbol...</option>
                    </select>
                  );
                })()}
                {customSymbol && (
                  <button
                    type="button"
                    onClick={() => {
                      const selectedAccount = accounts.find((a) => a.id === form.account_id);
                      const accountType = String(selectedAccount?.type || "").toLowerCase();
                      const symbolOptions = SYMBOLS_BY_ACCOUNT_TYPE[accountType] || [];
                      setCustomSymbol(false);
                      updateField("symbol", symbolOptions[0] || "");
                    }}
                    style={{
                      marginTop: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--bg3)",
                      color: "var(--text2)",
                      borderRadius: "6px",
                      padding: "5px 8px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    Back to preset symbols
                  </button>
                )}
              </div>
              <div>
                <label style={labelStyle} htmlFor="session">
                  Session
                </label>
                <select
                  id="session"
                  style={inputStyle}
                  value={form.session}
                  onChange={(e) => updateField("session", e.target.value)}
                >
                  {SESSION_OPTIONS.map((session) => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="direction">
                  Direction
                </label>
                <select
                  id="direction"
                  style={inputStyle}
                  value={form.direction}
                  onChange={(e) => updateField("direction", e.target.value)}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  style={inputStyle}
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value)}
                >
                  <option value="Win">Win</option>
                  <option value="Loss">Loss</option>
                  <option value="Breakeven">Breakeven</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>
              Position
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor="contracts">
                  {contractsLabel}
                </label>
                <input
                  id="contracts"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.contracts}
                  onChange={(e) => updateField("contracts", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="points">
                  {pointsLabel}
                </label>
                <input
                  id="points"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.points}
                  onChange={(e) => updateField("points", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="entry_price">
                  Entry price
                </label>
                <input
                  id="entry_price"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.entry_price}
                  onChange={(e) => updateField("entry_price", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="exit_price">
                  Exit price
                </label>
                <input
                  id="exit_price"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.exit_price}
                  onChange={(e) => updateField("exit_price", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="entry_time">
                  Entry time
                </label>
                <input
                  id="entry_time"
                  type="time"
                  style={inputStyle}
                  value={form.entry_time}
                  onChange={(e) => updateField("entry_time", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="exit_time">
                  Exit time
                </label>
                <input
                  id="exit_time"
                  type="time"
                  style={inputStyle}
                  value={form.exit_time}
                  onChange={(e) => updateField("exit_time", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>
              P&amp;L
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor="gross_pnl">
                  Gross P&amp;L
                </label>
                <input
                  id="gross_pnl"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.gross_pnl}
                  onChange={(e) => updateField("gross_pnl", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="fees">
                  Fees
                </label>
                <input
                  id="fees"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.fees}
                  onChange={(e) => updateField("fees", e.target.value)}
                />
              </div>
              <div>
                <span style={labelStyle}>Net P&amp;L (auto)</span>
                <div style={{ minHeight: "38px", display: "flex", alignItems: "center", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg3)", padding: "0 10px", fontSize: "13px", fontFamily: "monospace", color: netPnl >= 0 ? "#22C55E" : "#EF4444" }} aria-live="polite">
                  {formatNum(netPnl)}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>
              Risk
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor="profit_target">
                  Profit target
                </label>
                <input
                  id="profit_target"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.profit_target}
                  onChange={(e) => updateField("profit_target", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="stop_loss">
                  Stop loss
                </label>
                <input
                  id="stop_loss"
                  type="number"
                  step="any"
                  style={inputStyle}
                  value={form.stop_loss}
                  onChange={(e) => updateField("stop_loss", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="trade_risk">
                  Trade risk
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontFamily: "monospace", color: "var(--text2)", fontSize: "13px" }}>$</span>
                  <input
                    id="trade_risk"
                    type="number"
                    step="any"
                    style={{ ...inputStyle, flex: 1 }}
                    value={form.trade_risk}
                    onChange={(e) => updateField("trade_risk", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle} htmlFor={computedActualRr != null ? undefined : "actual_rr"}>
                  {computedActualRr != null ? "Actual R (auto)" : "Actual R:R"}
                </label>
                {computedActualRr != null ? (
                  <div
                    style={{
                      ...inputStyle,
                      display: "flex",
                      alignItems: "center",
                      color: "var(--text2)",
                      fontFamily: "monospace",
                    }}
                    aria-live="polite"
                  >
                    {formatNum(computedActualRr)}R
                  </div>
                ) : (
                  <input
                    id="actual_rr"
                    type="number"
                    step="any"
                    style={inputStyle}
                    value={form.actual_rr}
                    onChange={(e) => updateField("actual_rr", e.target.value)}
                    placeholder="Or set trade risk ($) for auto"
                  />
                )}
                <div style={{ fontSize: "10px", color: "var(--text3)", marginTop: "6px", lineHeight: 1.4 }}>
                  {computedActualRr != null
                    ? "Net P&L ÷ trade risk ($)."
                    : "Enter R manually, or fill trade risk ($) and net P&L to calculate automatically."}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={labelStyle}>Planned R:R (auto)</span>
                <div style={{ minHeight: "38px", display: "flex", alignItems: "center", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg3)", padding: "0 10px", fontSize: "13px", fontFamily: "monospace", color: "var(--text2)" }} aria-live="polite">
                  {plannedRr == null ? "—" : formatNum(plannedRr)}
                  {stopLoss === 0 && profitTarget != null && (
                    <span style={{ marginLeft: "8px", fontSize: "11px", color: "#fca5a5" }}>
                      (stop loss cannot be 0)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 style={sectionTitleStyle}>
              Review
            </h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor="trade_grade">
                  Trade grade
                </label>
                <input
                  id="trade_grade"
                  style={inputStyle}
                  value={form.trade_grade}
                  onChange={(e) => updateField("trade_grade", e.target.value)}
                  placeholder="A–F or score"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", minHeight: "88px" }}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Rules you followed</label>
                <div
                  style={{
                    border: "1px solid rgba(124,58,237,0.30)",
                    borderRadius: "12px",
                    background: "rgba(124,58,237,0.08)",
                    padding: "14px 14px",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  {!form.strategy_id ? (
                    <div style={{ fontSize: "12px", color: "var(--text3)", fontFamily: "monospace" }}>
                      Select a playbook to see entry, exit, market, and risk rules.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        {[
                          { title: "Entry criteria", list: strategyRules.entry, prefix: "entry" },
                          { title: "Exit criteria", list: strategyRules.exit, prefix: "exit" },
                          { title: "Market conditions", list: strategyRules.market, prefix: "market" },
                          { title: "Risk management", list: strategyRules.risk, prefix: "risk" },
                        ].map(({ title, list, prefix }) => (
                          <div key={prefix}>
                            <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {title}
                            </div>
                            <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                              {list.length ? (
                                list.map((label, i) => {
                                  const key = `${prefix}-${i}`
                                  const checked = rulesFollowed[key] !== false
                                  return (
                                    <label
                                      key={key}
                                      style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontFamily: "monospace", fontSize: "13px" }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => setRulesFollowed(prev => ({ ...prev, [key]: e.target.checked }))}
                                        style={{ accentColor: "var(--accent)", width: "16px", height: "16px" }}
                                      />
                                      <span style={{ color: checked ? "var(--text)" : "var(--text2)" }}>{label}</span>
                                    </label>
                                  )
                                })
                              ) : (
                                <div style={{ fontSize: "12px", color: "var(--text3)", fontFamily: "monospace" }}>
                                  No {title.toLowerCase()} yet.
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text3)" }}>
                        If any rule is unchecked, we save it into <span style={{ color: "var(--accent)" }}>mistakes</span> on the trade record.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--text3)" }}>
              {metaLoading
                ? "Loading account and playbook options..."
                : "Account, playbook, session, and symbol presets are now linked to your setup."}
            </p>
            <button
              type="submit"
              disabled={submitting}
              style={{ borderRadius: "8px", border: "none", background: "#7C3AED", color: "#fff", fontSize: "12px", fontWeight: 600, fontFamily: "monospace", padding: "10px 18px", cursor: "pointer", opacity: submitting ? 0.65 : 1 }}
            >
              {submitting ? "Saving…" : "Save trade"}
            </button>
          </div>
        </form>
      </div>

      {editTrade && (
        <EditTradeModal
          trade={editTrade}
          onClose={() => setEditTrade(null)}
          onSaved={() => {
            setEditTrade(null);
            setSuccess(true);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

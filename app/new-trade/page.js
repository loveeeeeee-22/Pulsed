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

const EMOTION_PRESETS = [
  "FOMO",
  "Sad",
  "Happy",
  "Excited",
  "Angry",
  "Revenge trading",
  "Over trading",
  "Greed",
  "Fear",
  "Boredom",
  "Impatience",
  "Confident",
  "Hesitation"
];

const GRADE_LETTERS = ["A", "B", "C", "D", "F"];

const GRADE_THEME = {
  A: { background: "rgba(34,197,94,0.15)", border: "2px solid #22C55E", color: "#22C55E" },
  B: { background: "rgba(74,222,128,0.12)", border: "2px solid #4ADE80", color: "#4ADE80" },
  C: { background: "rgba(234,179,8,0.12)", border: "2px solid #EAB308", color: "#EAB308" },
  D: { background: "rgba(249,115,22,0.12)", border: "2px solid #F97316", color: "#F97316" },
  F: { background: "rgba(239,68,68,0.15)", border: "2px solid #EF4444", color: "#EF4444" },
};

const GRADE_DESCRIPTIONS = {
  A: "Excellent execution",
  B: "Good — minor issues",
  C: "Average — notable mistakes",
  D: "Poor — significant errors",
  F: "Failed to follow the plan",
};

/** Numeric weights for averaging criteria into overall (auto mode). */
const OVERALL_AUTO_SCORE = { A: 100, B: 80, C: 65, D: 50, F: 25 };

const initialSelectedGrades = {
  patience: "",
  entry: "",
  sl: "",
  tp: "",
  management: "",
  psychology: "",
  rules: "",
};

const CRITERIA_ROWS = [
  { key: "patience", label: "Patience", criterion: "Patience" },
  { key: "entry", label: "Entry execution", criterion: "Entry Execution" },
  { key: "sl", label: "Stop loss placement", criterion: "Stop Loss Placement" },
  { key: "tp", label: "Profit target", criterion: "Profit Target" },
  { key: "management", label: "Trade management", criterion: "Trade Management" },
  { key: "psychology", label: "Psychology / emotion", criterion: "Psychology / Emotion" },
  { key: "rules", label: "Rule adherence", criterion: "Rule Adherence" },
];

function averageCriteriaToOverallLetter(selectedGrades) {
  const values = Object.values(selectedGrades)
    .map((g) => OVERALL_AUTO_SCORE[String(g || "").toUpperCase()])
    .filter((n) => typeof n === "number");
  if (!values.length) return "";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= 85) return "A";
  if (avg >= 70) return "B";
  if (avg >= 55) return "C";
  if (avg >= 40) return "D";
  return "F";
}

function gradeButtonStyles(letter, selected, size) {
  const isLarge = size === "large";
  const base = {
    boxSizing: "border-box",
    flex: 1,
    minWidth: 0,
    borderRadius: "8px",
    fontWeight: 700,
    fontFamily: "monospace",
    cursor: "pointer",
    transition: "all 0.15s",
  };
  if (isLarge) {
    base.height = "48px";
    base.fontSize = "18px";
  } else {
    base.height = "36px";
    base.fontSize = "14px";
  }
  if (selected) {
    return { ...base, ...GRADE_THEME[letter] };
  }
  return {
    ...base,
    background: "var(--bg3)",
    border: "1px solid var(--border-md)",
    color: "var(--text3)",
  };
}

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
  const [selectedGrades, setSelectedGrades] = useState(() => ({ ...initialSelectedGrades }));
  const [overallGradeManual, setOverallGradeManual] = useState(false);

  async function loadMetadata() {
    setMetaLoading(true);
    const [nextAccounts, nextStrategies] = await Promise.all([
      getAccountsForUser().then((rows) => rows.map((a) => ({ id: a.id, name: a.name, type: a.type, market_type: a.market_type }))),
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

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    const selectedAccount = accounts.find((a) => a.id === form.account_id);
    const mType = String(selectedAccount?.market_type || "futures").toLowerCase();
    const options = SYMBOLS_BY_ACCOUNT_TYPE[mType] || [];
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

  const autoOverallFromCriteria = useMemo(
    () => averageCriteriaToOverallLetter(selectedGrades),
    [selectedGrades]
  );
  const effectiveTradeGrade = overallGradeManual ? form.trade_grade : autoOverallFromCriteria;

  const selectedAccountForLabels = accounts.find(a => a.id === form.account_id)
  const marketTypeForLabels = String(selectedAccountForLabels?.market_type || 'futures').toLowerCase()
  const contractsLabel = marketTypeForLabels === 'forex' ? 'Lots' : 'Contracts'
  const pointsLabel = marketTypeForLabels === 'forex' ? 'Pips' : 'Points'

  function updateField(name, value) {
    if (name === "account_id" && typeof window !== "undefined") {
      if (value) localStorage.setItem(LAST_ACCOUNT_KEY, value);
      else localStorage.removeItem(LAST_ACCOUNT_KEY);
    }
    setForm((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
    setError(null);
  }

  function setCriterionGrade(key, letter) {
    setOverallGradeManual(false);
    setSuccess(false);
    setError(null);
    setSelectedGrades((prev) => {
      const cur = prev[key];
      const nextVal = cur === letter ? "" : letter;
      return { ...prev, [key]: nextVal };
    });
  }

  function setOverallGradeClick(letter) {
    setSuccess(false);
    setError(null);
    const currentAuto = averageCriteriaToOverallLetter(selectedGrades);
    const current =
      overallGradeManual ? form.trade_grade : currentAuto;
    if (current === letter) {
      if (overallGradeManual) {
        setOverallGradeManual(false);
        updateField("trade_grade", "");
      } else {
        setSelectedGrades({ ...initialSelectedGrades });
      }
      return;
    }
    setOverallGradeManual(true);
    updateField("trade_grade", letter);
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
      trade_grade:
        (overallGradeManual ? form.trade_grade.trim() : autoOverallFromCriteria) || null,
      reviewed: false,
    };

    const { data: insertedTrade, error: insertError } = await supabase
      .from("trades")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    const newTradeId = insertedTrade.id;
    const criteriaGrades = {
      Patience: selectedGrades.patience,
      "Entry Execution": selectedGrades.entry,
      "Stop Loss Placement": selectedGrades.sl,
      "Profit Target": selectedGrades.tp,
      "Trade Management": selectedGrades.management,
      "Psychology / Emotion": selectedGrades.psychology,
      "Rule Adherence": selectedGrades.rules,
    };
    const ratingsToInsert = Object.entries(criteriaGrades)
      .filter(([, grade]) => grade)
      .map(([criterion, grade]) => ({
        trade_id: newTradeId,
        criterion,
        grade,
      }));

    let ratingsErrorMessage = null;
    if (ratingsToInsert.length > 0) {
      const { error: ratingsError } = await supabase.from("trade_ratings").insert(ratingsToInsert);
      if (ratingsError) ratingsErrorMessage = ratingsError.message;
    }

    setSubmitting(false);
    setSuccess(true);
    setError(
      ratingsErrorMessage
        ? `Trade saved, but criterion ratings could not be saved: ${ratingsErrorMessage}`
        : null
    );

    const lastAccountId = form.account_id || "";
    setForm((prev) => ({
      ...initialForm,
      account_id: lastAccountId,
      session: prev.session,
      contracts: prev.contracts,
    }));
    setSelectedGrades({ ...initialSelectedGrades });
    setOverallGradeManual(false);
    setStrategyRules({ entry: [], exit: [], market: [], risk: [] });
    setRulesFollowed({});
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
                <label style={labelStyle} htmlFor="trade-account">
                  Account
                </label>
                <select
                  id="trade-account"
                  name="account_id"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.account_id}
                  onChange={(e) => updateField("account_id", e.target.value)}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.market_type ? account.market_type.charAt(0).toUpperCase() + account.market_type.slice(1) : "Futures"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="trade-strategy">
                  Playbook
                </label>
                <select
                  id="trade-strategy"
                  name="strategy_id"
                  autoComplete="off"
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
                <label style={labelStyle} htmlFor="trade-date">
                  Date
                </label>
                <input
                  id="trade-date"
                  name="trade-date"
                  type="date"
                  autoComplete="off"
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
                  const mType = String(selectedAccount?.market_type || "futures").toLowerCase();
                  const symbolOptions = SYMBOLS_BY_ACCOUNT_TYPE[mType] || [];
                  if (customSymbol || symbolOptions.length === 0) {
                    return (
                      <input
                        id="symbol"
                        name="symbol"
                        type="text"
                        autoComplete="off"
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
                      name="symbol"
                      autoComplete="off"
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
                  name="session"
                  autoComplete="off"
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
                  name="direction"
                  autoComplete="off"
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
                  name="status"
                  autoComplete="off"
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
                  name="contracts"
                  type="number"
                  autoComplete="off"
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
                  name="points"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.points}
                  onChange={(e) => updateField("points", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="entry-price">
                  Entry price
                </label>
                <input
                  id="entry-price"
                  name="entry-price"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.entry_price}
                  onChange={(e) => updateField("entry_price", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="exit-price">
                  Exit price
                </label>
                <input
                  id="exit-price"
                  name="exit-price"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.exit_price}
                  onChange={(e) => updateField("exit_price", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="entry-time">
                  Entry time
                </label>
                <input
                  id="entry-time"
                  name="entry-time"
                  type="time"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.entry_time}
                  onChange={(e) => updateField("entry_time", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="exit-time">
                  Exit time
                </label>
                <input
                  id="exit-time"
                  name="exit-time"
                  type="time"
                  autoComplete="off"
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
                <label style={labelStyle} htmlFor="gross-pnl">
                  Gross P&amp;L
                </label>
                <input
                  id="gross-pnl"
                  name="gross-pnl"
                  type="number"
                  autoComplete="off"
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
                  name="fees"
                  type="number"
                  autoComplete="off"
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
                <label style={labelStyle} htmlFor="profit-target">
                  Profit target
                </label>
                <input
                  id="profit-target"
                  name="profit-target"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.profit_target}
                  onChange={(e) => updateField("profit_target", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="stop-loss">
                  Stop loss
                </label>
                <input
                  id="stop-loss"
                  name="stop-loss"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.stop_loss}
                  onChange={(e) => updateField("stop_loss", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="trade-risk">
                  Trade risk
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontFamily: "monospace", color: "var(--text2)", fontSize: "13px" }}>$</span>
                  <input
                    id="trade-risk"
                    name="trade-risk"
                    type="number"
                    autoComplete="off"
                    step="any"
                    style={{ ...inputStyle, flex: 1 }}
                    value={form.trade_risk}
                    onChange={(e) => updateField("trade_risk", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle} htmlFor={computedActualRr != null ? undefined : "actual-rr"}>
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
                    id="actual-rr"
                    name="actual-rr"
                    type="number"
                    autoComplete="off"
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
                <span style={labelStyle}>Overall Trade Grade</span>
                <div
                  role="group"
                  aria-label="Overall Trade Grade"
                  style={{ display: "flex", gap: "8px", marginTop: "6px" }}
                >
                  {GRADE_LETTERS.map((letter) => {
                    const selected = effectiveTradeGrade === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setOverallGradeClick(letter)}
                        style={gradeButtonStyles(letter, selected, "large")}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
                {effectiveTradeGrade && GRADE_DESCRIPTIONS[effectiveTradeGrade] ? (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: "12px",
                      color: "var(--text2)",
                      fontFamily: "monospace",
                      lineHeight: 1.4,
                    }}
                  >
                    {GRADE_DESCRIPTIONS[effectiveTradeGrade]}
                  </p>
                ) : null}
                <p
                  style={{
                    margin: effectiveTradeGrade && GRADE_DESCRIPTIONS[effectiveTradeGrade] ? "8px 0 0" : "10px 0 0",
                    fontSize: "12px",
                    color: "var(--text3)",
                    lineHeight: 1.45,
                  }}
                >
                  How well did you execute this trade overall?
                </p>
              </div>

              <div>
                <span style={labelStyle}>Rate trade</span>
                <div
                  style={{
                    marginTop: "6px",
                    border: "1px solid var(--border-md)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "var(--bg3)",
                  }}
                >
                  {CRITERIA_ROWS.map((row, idx) => (
                    <div
                      key={row.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) minmax(0,2.2fr)",
                        gap: "10px",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderBottom: idx < CRITERIA_ROWS.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          color: "var(--text2)",
                          lineHeight: 1.35,
                        }}
                      >
                        {row.label}
                      </div>
                      <div
                        role="group"
                        aria-label={`Grade for ${row.criterion}`}
                        style={{ display: "flex", gap: "6px" }}
                      >
                        {GRADE_LETTERS.map((letter) => {
                          const selected = selectedGrades[row.key] === letter;
                          return (
                            <button
                              key={letter}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setCriterionGrade(row.key, letter)}
                              style={gradeButtonStyles(letter, selected, "compact")}
                            >
                              {letter}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Emotions / Reasons
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {EMOTION_PRESETS.map((emotion) => {
                    const currentEmotions = form.notes ? form.notes.split(", ") : [];
                    const isSelected = currentEmotions.includes(emotion);
                    return (
                      <button
                        key={emotion}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            updateField("notes", currentEmotions.filter((e) => e !== emotion).join(", "));
                          } else {
                            updateField("notes", [...currentEmotions, emotion].join(", "));
                          }
                        }}
                        style={{
                          background: isSelected ? "var(--accent, #7C3AED)" : "var(--bg3)",
                          color: isSelected ? "#fff" : "var(--text2)",
                          border: isSelected ? "1px solid var(--accent, #7C3AED)" : "1px solid var(--border)",
                          borderRadius: "16px",
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontFamily: "monospace",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {emotion}
                      </button>
                    );
                  })}
                </div>
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
                                        id={`trade-rule-${key}`}
                                        name={`trade-rule-${key}`}
                                        type="checkbox"
                                        autoComplete="off"
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

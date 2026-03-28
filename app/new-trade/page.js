"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  strategy_id: "",
  date: "",
  symbol: "",
  session: "",
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
  status: "closed",
  notes: "",
  mistakes: "",
  trade_grade: "",
};

export default function NewTradePage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

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

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);
    setError(null);

    const payload = {
      account_id: null,
      strategy_id: form.strategy_id.trim() || null,
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
      actual_rr: parseNumber(form.actual_rr),
      status: form.status.trim() || null,
      notes: form.notes.trim() || null,
      mistakes: form.mistakes.trim() || null,
      trade_grade: form.trade_grade.trim() || null,
    };

    const { error: insertError } = await supabase
      .from("trades")
      .insert(payload);

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    setForm(initialForm);
  }

  const inputClass =
    "w-full rounded-md border border-red-950/60 bg-black/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/25";

  const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-red-200/80";

  return (
    <div className="min-h-full flex-1 bg-[#070707] text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <header className="mb-10 border-b border-red-950/50 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500/90">
            Trading journal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
            New trade
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500">
            Log execution, risk, and review fields. Net P&amp;L and planned R:R
            update as you type.
          </p>
        </header>

        {success && (
          <div
            className="mb-8 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200"
            role="status"
          >
            Trade saved successfully.
          </div>
        )}

        {error && (
          <div
            className="mb-8 rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-10 rounded-xl border border-red-950/40 bg-[#0c0c0c] p-6 shadow-[0_0_60px_-20px_rgba(185,28,28,0.35)] sm:p-8"
        >
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-red-500/90">
              Setup
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="strategy_id">
                  Strategy ID
                </label>
                <input
                  id="strategy_id"
                  className={inputClass}
                  value={form.strategy_id}
                  onChange={(e) => updateField("strategy_id", e.target.value)}
                  placeholder="UUID or reference"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="date">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  required
                  className={inputClass}
                  value={form.date}
                  onChange={(e) => updateField("date", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="symbol">
                  Symbol
                </label>
                <input
                  id="symbol"
                  className={inputClass}
                  value={form.symbol}
                  onChange={(e) => updateField("symbol", e.target.value)}
                  placeholder="e.g. ES, NQ"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="session">
                  Session
                </label>
                <input
                  id="session"
                  className={inputClass}
                  value={form.session}
                  onChange={(e) => updateField("session", e.target.value)}
                  placeholder="RTH, overnight…"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="direction">
                  Direction
                </label>
                <select
                  id="direction"
                  className={inputClass}
                  value={form.direction}
                  onChange={(e) => updateField("direction", e.target.value)}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value)}
                >
                  <option value="planning">Planning</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-red-500/90">
              Position
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="contracts">
                  Contracts
                </label>
                <input
                  id="contracts"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.contracts}
                  onChange={(e) => updateField("contracts", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="points">
                  Points
                </label>
                <input
                  id="points"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.points}
                  onChange={(e) => updateField("points", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="entry_price">
                  Entry price
                </label>
                <input
                  id="entry_price"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.entry_price}
                  onChange={(e) => updateField("entry_price", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="exit_price">
                  Exit price
                </label>
                <input
                  id="exit_price"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.exit_price}
                  onChange={(e) => updateField("exit_price", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="entry_time">
                  Entry time
                </label>
                <input
                  id="entry_time"
                  type="time"
                  className={inputClass}
                  value={form.entry_time}
                  onChange={(e) => updateField("entry_time", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="exit_time">
                  Exit time
                </label>
                <input
                  id="exit_time"
                  type="time"
                  className={inputClass}
                  value={form.exit_time}
                  onChange={(e) => updateField("exit_time", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-red-500/90">
              P&amp;L
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="gross_pnl">
                  Gross P&amp;L
                </label>
                <input
                  id="gross_pnl"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.gross_pnl}
                  onChange={(e) => updateField("gross_pnl", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="fees">
                  Fees
                </label>
                <input
                  id="fees"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.fees}
                  onChange={(e) => updateField("fees", e.target.value)}
                />
              </div>
              <div>
                <span className={labelClass}>Net P&amp;L (auto)</span>
                <div
                  className="flex min-h-[42px] items-center rounded-md border border-red-900/40 bg-black/80 px-3 text-sm font-mono tabular-nums text-red-300"
                  aria-live="polite"
                >
                  {formatNum(netPnl)}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-red-500/90">
              Risk
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClass} htmlFor="profit_target">
                  Profit target
                </label>
                <input
                  id="profit_target"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.profit_target}
                  onChange={(e) => updateField("profit_target", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="stop_loss">
                  Stop loss
                </label>
                <input
                  id="stop_loss"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.stop_loss}
                  onChange={(e) => updateField("stop_loss", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="trade_risk">
                  Trade risk
                </label>
                <input
                  id="trade_risk"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.trade_risk}
                  onChange={(e) => updateField("trade_risk", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="actual_rr">
                  Actual R:R
                </label>
                <input
                  id="actual_rr"
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.actual_rr}
                  onChange={(e) => updateField("actual_rr", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <span className={labelClass}>Planned R:R (auto)</span>
                <div
                  className="flex min-h-[42px] items-center rounded-md border border-red-900/40 bg-black/80 px-3 text-sm font-mono tabular-nums text-red-300"
                  aria-live="polite"
                >
                  {plannedRr == null ? "—" : formatNum(plannedRr)}
                  {stopLoss === 0 && profitTarget != null && (
                    <span className="ml-2 text-xs text-red-400/80">
                      (stop loss cannot be 0)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-red-500/90">
              Review
            </h2>
            <div className="grid gap-4">
              <div>
                <label className={labelClass} htmlFor="trade_grade">
                  Trade grade
                </label>
                <input
                  id="trade_grade"
                  className={inputClass}
                  value={form.trade_grade}
                  onChange={(e) => updateField("trade_grade", e.target.value)}
                  placeholder="A–F or score"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  className={`${inputClass} resize-y min-h-[88px]`}
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="mistakes">
                  Mistakes
                </label>
                <textarea
                  id="mistakes"
                  rows={3}
                  className={`${inputClass} resize-y min-h-[88px]`}
                  value={form.mistakes}
                  onChange={(e) => updateField("mistakes", e.target.value)}
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-red-950/40 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-600">
              Account ID is unset until authentication is added.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-red-700 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-950/50 transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save trade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

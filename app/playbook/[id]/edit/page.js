"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ACCENT = "#7C3AED";

function RuleGroupCard({ title, subtitle, rules, onAdd, onChange, onRemove, placeholderBase }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--bg3)", padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <div>
          <div style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text)", fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text3)", marginTop: "2px" }}>{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          style={{ borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text2)", fontFamily: "monospace", fontSize: "11px", padding: "6px 9px", cursor: "pointer" }}
        >
          + Add rule
        </button>
      </div>
      <div style={{ display: "grid", gap: "8px" }}>
        {rules.map((rule, idx) => (
          <div key={`${title}-${idx}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "18px", flexShrink: 0, textAlign: "center", fontSize: "11px", fontFamily: "monospace", color: "var(--text3)" }}>
              {idx + 1}.
            </div>
            <input
              value={rule}
              onChange={(e) => onChange(idx, e.target.value)}
              placeholder={`${placeholderBase} ${idx + 1}`}
              style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text)", fontSize: "13px", outline: "none", padding: "10px 12px", fontFamily: "monospace" }}
            />
            {rules.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                style={{ width: "34px", flexShrink: 0, borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card-bg)", color: "#FCA5A5", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}
                aria-label={`Remove ${title} rule ${idx + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeRules(rules) {
  if (!rules) return { entry: [""], exit: [""], market: [""], risk: [""] };
  if (typeof rules === "object" && !Array.isArray(rules)) {
    const entry = Array.isArray(rules.entry) && rules.entry.length > 0 ? rules.entry.map((r) => String(r)) : [""];
    const exit = Array.isArray(rules.exit) && rules.exit.length > 0 ? rules.exit.map((r) => String(r)) : [""];
    const market = Array.isArray(rules.market) && rules.market.length > 0 ? rules.market.map((r) => String(r)) : [""];
    const risk = Array.isArray(rules.risk) && rules.risk.length > 0 ? rules.risk.map((r) => String(r)) : [""];
    return { entry, exit, market, risk };
  }
  if (Array.isArray(rules)) {
    return { entry: rules.length > 0 ? rules.map((r) => String(r)) : [""], exit: [""], market: [""], risk: [""] };
  }
  return { entry: [""], exit: [""], market: [""], risk: [""] };
}

export default function EditPlayRulesPage() {
  const { id } = useParams();
  const router = useRouter();
  const [playName, setPlayName] = useState("");
  const [entryRules, setEntryRules] = useState([""]);
  const [exitRules, setExitRules] = useState([""]);
  const [marketRules, setMarketRules] = useState([""]);
  const [riskRules, setRiskRules] = useState([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;

    let ignore = false;
    async function loadPlay() {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("strategies")
        .select("name, rules")
        .eq("id", id)
        .single();

      if (ignore) return;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const normalized = normalizeRules(data?.rules);
      setPlayName(data?.name || "Play");
      setEntryRules(normalized.entry);
      setExitRules(normalized.exit);
      setMarketRules(normalized.market);
      setRiskRules(normalized.risk);
      setLoading(false);
    }

    loadPlay();
    return () => {
      ignore = true;
    };
  }, [id]);

  function addRule(type) {
    if (type === "entry") setEntryRules((prev) => [...prev, ""]);
    if (type === "exit") setExitRules((prev) => [...prev, ""]);
    if (type === "market") setMarketRules((prev) => [...prev, ""]);
    if (type === "risk") setRiskRules((prev) => [...prev, ""]);
  }

  function updateRule(type, index, value) {
    if (type === "entry") setEntryRules((prev) => prev.map((r, i) => (i === index ? value : r)));
    if (type === "exit") setExitRules((prev) => prev.map((r, i) => (i === index ? value : r)));
    if (type === "market") setMarketRules((prev) => prev.map((r, i) => (i === index ? value : r)));
    if (type === "risk") setRiskRules((prev) => prev.map((r, i) => (i === index ? value : r)));
  }

  function removeRule(type, index) {
    if (type === "entry") setEntryRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    if (type === "exit") setExitRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    if (type === "market") setMarketRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    if (type === "risk") setRiskRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const rules = {
      entry: entryRules.map((r) => r.trim()).filter(Boolean),
      exit: exitRules.map((r) => r.trim()).filter(Boolean),
      market: marketRules.map((r) => r.trim()).filter(Boolean),
      risk: riskRules.map((r) => r.trim()).filter(Boolean),
    };

    const { error: updateError } = await supabase.from("strategies").update({ rules }).eq("id", id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(`/playbook/${id}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg)", color: "var(--text)", padding: "24px" }}>
      <div style={{ margin: "0 auto", maxWidth: "1100px", minHeight: "calc(100vh - 120px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "820px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--card-bg)", padding: "22px", boxShadow: "0 20px 45px rgba(0,0,0,0.38)" }}>
          <div style={{ marginBottom: "18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}>
                Playbook
              </p>
              <h1 style={{ margin: "6px 0 0", fontSize: "28px", fontWeight: 700 }}>Edit Rules</h1>
              <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--text3)" }}>
                {playName}
              </p>
            </div>
            <Link href={`/playbook/${id}`} style={{ borderRadius: "7px", border: "1px solid var(--border)", color: "var(--text2)", textDecoration: "none", fontSize: "12px", fontFamily: "monospace", padding: "7px 10px" }}>
              Back
            </Link>
          </div>

          {error && (
            <div style={{ marginBottom: "12px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#FCA5A5", fontSize: "13px", padding: "9px 10px" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ fontSize: "13px", color: "var(--text3)", fontFamily: "monospace", padding: "8px 0" }}>Loading rules...</div>
          ) : (
            <form onSubmit={handleSave} style={{ display: "grid", gap: "14px" }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "12px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}>
                    Add Rules
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--text2)" }}>
                    Refine your checklist so each replayed trade can be measured against the play.
                  </div>
                </div>
                <div style={{ display: "grid", gap: "10px" }}>
                  <RuleGroupCard
                    title="Entry criteria"
                    subtitle="What must be true before entering"
                    rules={entryRules}
                    onAdd={() => addRule("entry")}
                    onChange={(idx, value) => updateRule("entry", idx, value)}
                    onRemove={(idx) => removeRule("entry", idx)}
                    placeholderBase="Entry rule"
                  />
                  <RuleGroupCard
                    title="Exit criteria"
                    subtitle="How and when this setup is managed or closed"
                    rules={exitRules}
                    onAdd={() => addRule("exit")}
                    onChange={(idx, value) => updateRule("exit", idx, value)}
                    onRemove={(idx) => removeRule("exit", idx)}
                    placeholderBase="Exit rule"
                  />
                  <RuleGroupCard
                    title="Market conditions"
                    subtitle="Sessions, volatility, context"
                    rules={marketRules}
                    onAdd={() => addRule("market")}
                    onChange={(idx, value) => updateRule("market", idx, value)}
                    onRemove={(idx) => removeRule("market", idx)}
                    placeholderBase="Market rule"
                  />
                  <RuleGroupCard
                    title="Risk management"
                    subtitle="Size, max loss, limits"
                    rules={riskRules}
                    onAdd={() => addRule("risk")}
                    onChange={(idx, value) => updateRule("risk", idx, value)}
                    onRemove={(idx) => removeRule("risk", idx)}
                    placeholderBase="Risk rule"
                  />
                </div>
              </div>

              <button type="submit" disabled={saving} style={{ width: "100%", borderRadius: "8px", border: "none", padding: "11px 12px", fontSize: "13px", fontWeight: 600, color: "#fff", background: ACCENT, cursor: "pointer", fontFamily: "monospace", opacity: saving ? 0.65 : 1 }}>
                {saving ? "Saving..." : "Save Rules"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

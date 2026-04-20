"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isStrategiesUserIdMissingError } from "@/lib/getStrategiesForUser";

const ACCENT = "#7C3AED";

function RuleGroupCard({ title, subtitle, rules, onAdd, onChange, onRemove, placeholderBase, groupKey }) {
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
              id={`playbook-new-rule-${groupKey}-${idx}`}
              name={`playbook-rule-${groupKey}`}
              type="text"
              autoComplete="off"
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

export default function NewPlaybookPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryRules, setEntryRules] = useState([""]);
  const [exitRules, setExitRules] = useState([""]);
  const [marketRules, setMarketRules] = useState([""]);
  const [riskRules, setRiskRules] = useState([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function addRule(type) {
    if (type === "entry") setEntryRules((prev) => [...prev, ""]);
    if (type === "exit") setExitRules((prev) => [...prev, ""]);
    if (type === "market") setMarketRules((prev) => [...prev, ""]);
    if (type === "risk") setRiskRules((prev) => [...prev, ""]);
  }

  function updateRule(type, index, value) {
    if (type === "entry") {
      setEntryRules((prev) => prev.map((rule, i) => (i === index ? value : rule)));
    }
    if (type === "exit") {
      setExitRules((prev) => prev.map((rule, i) => (i === index ? value : rule)));
    }
    if (type === "market") {
      setMarketRules((prev) => prev.map((rule, i) => (i === index ? value : rule)));
    }
    if (type === "risk") {
      setRiskRules((prev) => prev.map((rule, i) => (i === index ? value : rule)));
    }
  }

  function removeRule(type, index) {
    if (type === "entry") {
      setEntryRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    }
    if (type === "exit") {
      setExitRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    }
    if (type === "market") {
      setMarketRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    }
    if (type === "risk") {
      setRiskRules((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Playbook name is required.");
      return;
    }

    const rules = {
      entry: entryRules.map((line) => line.trim()).filter(Boolean),
      exit: exitRules.map((line) => line.trim()).filter(Boolean),
      market: marketRules.map((line) => line.trim()).filter(Boolean),
      risk: riskRules.map((line) => line.trim()).filter(Boolean),
    };

    setSaving(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      setSaving(false);
      setError("You must be logged in to create a playbook.");
      return;
    }

    let insertError = (
      await supabase.from("strategies").insert({
        account_id: null,
        user_id: uid,
        name: cleanName,
        description: description.trim() || null,
        rules,
      })
    ).error;

    if (insertError && isStrategiesUserIdMissingError(insertError)) {
      insertError = (
        await supabase.from("strategies").insert({
          account_id: null,
          name: cleanName,
          description: description.trim() || null,
          rules,
        })
      ).error;
    }

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/playbook");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--page-bg)",
        color: "var(--text)",
        padding: "24px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: "1100px", minHeight: "calc(100vh - 120px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "760px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--card-bg)", padding: "22px", boxShadow: "0 20px 45px rgba(0,0,0,0.38)" }}>
          <div style={{ marginBottom: "18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}>
                Playbook
              </p>
              <h1 style={{ margin: "6px 0 0", fontSize: "28px", fontWeight: 700 }}>Create Play</h1>
              <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--text3)" }}>
                Define a play with a clear description and rule-based criteria.
              </p>
            </div>
            <Link
              href="/playbook"
              style={{ borderRadius: "7px", border: "1px solid var(--border)", color: "var(--text2)", textDecoration: "none", fontSize: "12px", fontFamily: "monospace", padding: "7px 10px" }}
            >
              Back
            </Link>
          </div>

          {error && (
            <div style={{ marginBottom: "12px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#FCA5A5", fontSize: "13px", padding: "9px 10px" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
            <div>
              <label
                htmlFor="playbook-new-name"
                style={{ display: "block", marginBottom: "6px", fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}
              >
                Name
              </label>
              <input
                id="playbook-new-name"
                name="playbook-name"
                type="text"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Trap Reversal"
                style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: "14px", outline: "none", padding: "10px 12px" }}
              />
            </div>

            <div>
              <label
                htmlFor="playbook-new-description"
                style={{ display: "block", marginBottom: "6px", fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}
              >
                Description
              </label>
              <textarea
                id="playbook-new-description"
                name="playbook-description"
                rows={3}
                autoComplete="off"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When and why this play is taken..."
                style={{ width: "100%", resize: "vertical", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: "14px", outline: "none", padding: "10px 12px" }}
              />
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--card-bg)", padding: "12px" }}>
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)" }}>
                  Add Rules
                </div>
                <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--text2)" }}>
                  Build clear checklists for entries and exits to use when logging and reviewing trades.
                </div>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                <RuleGroupCard
                  title="Entry criteria"
                  subtitle="Conditions that must be true before entering"
                  groupKey="entry"
                  rules={entryRules}
                  onAdd={() => addRule("entry")}
                  onChange={(idx, value) => updateRule("entry", idx, value)}
                  onRemove={(idx) => removeRule("entry", idx)}
                  placeholderBase="Entry rule"
                />
                <RuleGroupCard
                  title="Exit criteria"
                  subtitle="Conditions for scale-out, target, or full exit"
                  groupKey="exit"
                  rules={exitRules}
                  onAdd={() => addRule("exit")}
                  onChange={(idx, value) => updateRule("exit", idx, value)}
                  onRemove={(idx) => removeRule("exit", idx)}
                  placeholderBase="Exit rule"
                />
                <RuleGroupCard
                  title="Market conditions"
                  subtitle="Sessions, volatility, news — context for taking the trade"
                  groupKey="market"
                  rules={marketRules}
                  onAdd={() => addRule("market")}
                  onChange={(idx, value) => updateRule("market", idx, value)}
                  onRemove={(idx) => removeRule("market", idx)}
                  placeholderBase="Market rule"
                />
                <RuleGroupCard
                  title="Risk management"
                  subtitle="Position size, max loss, daily limits"
                  groupKey="risk"
                  rules={riskRules}
                  onAdd={() => addRule("risk")}
                  onChange={(idx, value) => updateRule("risk", idx, value)}
                  onRemove={(idx) => removeRule("risk", idx)}
                  placeholderBase="Risk rule"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{ width: "100%", borderRadius: "8px", border: "none", padding: "11px 12px", fontSize: "13px", fontWeight: 600, color: "#fff", background: ACCENT, cursor: "pointer", fontFamily: "monospace", opacity: saving ? 0.65 : 1 }}
            >
              {saving ? "Creating..." : "Create Playbook"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

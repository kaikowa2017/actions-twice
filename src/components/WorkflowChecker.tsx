"use client";

import { useMemo, useState } from "react";
import { classifyWorkflow, type Classification } from "../lib/classify";
import { fixWorkflow } from "../lib/fix";

const BADGE: Record<
  Classification,
  { label: string; className: string }
> = {
  hard: {
    label: "Runs twice",
    className: "bg-red-500/15 text-red-400 border-red-500/40",
  },
  soft: {
    label: "Still scheduled twice",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  fixed: {
    label: "Already fixed",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  },
  ok: {
    label: "Not this pattern",
    className: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  },
};

type CheckState =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | {
      kind: "result";
      classification: Classification;
      reason: string;
      suggestedFix: string | null;
    };

export default function WorkflowChecker() {
  const [yamlText, setYamlText] = useState("");
  const [state, setState] = useState<CheckState>({ kind: "idle" });

  const placeholder = useMemo(
    () =>
      [
        "name: CI",
        "on: [push, pull_request]",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
      ].join("\n"),
    []
  );

  function onCheck() {
    const trimmed = yamlText.trim();
    if (!trimmed) {
      setState({ kind: "empty" });
      return;
    }

    let result;
    try {
      result = classifyWorkflow(trimmed);
    } catch {
      setState({
        kind: "invalid",
        message: "Could not parse that YAML. Paste a full workflow file and try again.",
      });
      return;
    }

    // classifyWorkflow returns ok for unparseable; distinguish empty-ish maps
    if (result.reason === "unparseable YAML" || result.reason === "not a workflow map") {
      setState({
        kind: "invalid",
        message:
          result.reason === "unparseable YAML"
            ? "Invalid YAML. Check indentation and quotes, then try again."
            : "That does not look like a workflow map. Paste a GitHub Actions workflow YAML.",
      });
      return;
    }

    let suggestedFix: string | null = null;
    if (result.classification === "hard" || result.classification === "soft") {
      const fixed = fixWorkflow(trimmed, "main");
      if (fixed.fixed) suggestedFix = fixed.yaml;
    }

    setState({
      kind: "result",
      classification: result.classification,
      reason: result.reason,
      suggestedFix,
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--fg)]">
          Paste a workflow YAML
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Runs entirely in your browser. Nothing is uploaded.
        </p>
      </div>

      <textarea
        value={yamlText}
        onChange={(e) => {
          setYamlText(e.target.value);
          if (state.kind !== "idle") setState({ kind: "idle" });
        }}
        placeholder={placeholder}
        spellCheck={false}
        rows={12}
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-[#0d1117] p-3 font-mono text-xs leading-5 text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-blue-500 focus:outline-none"
        aria-label="Paste a workflow YAML"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCheck}
          className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
        >
          Check
        </button>
        {state.kind === "result" && (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${BADGE[state.classification].className}`}
          >
            {BADGE[state.classification].label}
          </span>
        )}
      </div>

      {state.kind === "empty" && (
        <p className="text-sm text-amber-300">Paste a workflow YAML first.</p>
      )}

      {state.kind === "invalid" && (
        <p className="text-sm text-amber-300">{state.message}</p>
      )}

      {state.kind === "result" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">{state.reason}</p>
          {state.suggestedFix && (
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[#0d1117] px-3 py-2 text-xs font-medium text-[var(--good)]">
                Suggested fix
              </div>
              <pre className="overflow-x-auto bg-[#0d1117] p-3 text-xs leading-5 text-[var(--fg)]">
                <code>{state.suggestedFix}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// components/AgentPanel.tsx
// ─── Live animated agent execution panel ─────────────────────────────────────
// Shown when AI runs a browser agent task. Feels like watching a real agent work.

"use client";
import React, { useState, useEffect, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Loader } from "lucide-react";
import type { AgentStep } from "@/lib/agent";

interface AgentPanelProps {
  action:    string;
  portalUrl?: string;
  onClose:   () => void;
  onResult?: (data: any) => void;
  // Pass the agent context to kick off the run
  run: () => Promise<{ steps: AgentStep[]; data?: any; success: boolean }>;
}

function StepRow({ step }: { step: AgentStep }) {
  const colors = {
    pending: "rgba(255,255,255,0.2)",
    running: "#0ea5e9",
    done:    "#10b981",
    error:   "#ef4444",
  };
  const color = colors[step.status];

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "8px 0",
      opacity: step.status === "pending" ? 0.35 : 1,
      transition: "opacity 0.3s",
    }}>
      <div style={{ flexShrink: 0, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        {step.status === "running" && (
          <div style={{ width: 14, height: 14, border: `2px solid ${color}30`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        )}
        {step.status === "done" && <CheckCircle size={14} style={{ color }} />}
        {step.status === "error" && <AlertCircle size={14} style={{ color }} />}
        {step.status === "pending" && (
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: step.status === "pending" ? "rgba(255,255,255,0.4)" : "#fff", fontWeight: step.status === "running" ? 600 : 400 }}>
          {step.label}
        </div>
        {step.detail && (
          <div style={{ fontSize: 10, color: color, marginTop: 2, fontFamily: "'DM Mono', monospace" }}>
            {step.detail}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentPanel({ action, portalUrl, onClose, onResult, run }: AgentPanelProps) {
  const [steps,   setSteps]   = useState<AgentStep[]>([]);
  const [status,  setStatus]  = useState<"running" | "done" | "error">("running");
  const [result,  setResult]  = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer
  useEffect(() => {
    if (status !== "running") return;
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const execute = useCallback(async () => {
    try {
      const { steps: finalSteps, data, success } = await run();
      setSteps(finalSteps);
      setStatus(success ? "done" : "error");
      setResult(data);
      if (success && data && onResult) onResult(data);
    } catch (e: any) {
      setStatus("error");
    }
  }, [run, onResult]);

  // Use streaming for live step updates
  useEffect(() => {
    let cancelled = false;

    const runStreaming = async () => {
      const { streamAgent } = await import("@/lib/agent");

      // Build a minimal context — real context passed via `run` prop
      const collector: AgentStep[] = [];

      for await (const event of streamAgent({ action: action as any, college_id: "", portal_url: portalUrl || "" })) {
        if (cancelled) return;
        if ("type" in event && event.type === "result") {
          setResult(event.data);
          setStatus("done");
          if (onResult) onResult(event.data);
        } else {
          const step = event as AgentStep;
          collector[step.id] = step;
          setSteps([...collector]);
        }
      }
    };

    runStreaming().catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const actionLabel: Record<string, string> = {
    fetch_attendance: "Fetching Attendance",
    fetch_grades:     "Fetching Grades",
    book_lab:         "Booking Lab Slot",
    upload_notes:     "Uploading Materials",
    fetch_timetable:  "Fetching Timetable",
    fill_form:        "Auto-Filling Form",
  };

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse-ring{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.5);opacity:0}} `}</style>

      <div style={{
        background: "#0a0a10",
        border: "1px solid rgba(14,165,233,0.2)",
        borderRadius: 16, overflow: "hidden",
        animation: "fadeIn 0.25s ease",
        fontFamily: "'Outfit', sans-serif",
        minWidth: 320, maxWidth: 400,
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px",
          background: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(99,102,241,0.08))",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {status === "running" ? (
              <div style={{ position: "relative", width: 20, height: 20 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#0ea5e9", opacity: 0.3, animation: "pulse-ring 1.2s ease-out infinite" }} />
                <div style={{ position: "absolute", inset: 3, borderRadius: "50%", background: "#0ea5e9" }} />
              </div>
            ) : status === "done" ? (
              <CheckCircle size={18} style={{ color: "#10b981" }} />
            ) : (
              <AlertCircle size={18} style={{ color: "#ef4444" }} />
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {actionLabel[action] || "AI Agent Running"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace" }}>
                {status === "running" ? `${elapsed}s elapsed…` : status === "done" ? "Completed successfully" : "Encountered an error"}
              </div>
            </div>
          </div>
          {status !== "running" && (
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer" }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Portal badge */}
        {portalUrl && (
          <div style={{ padding: "6px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: status === "running" ? "#0ea5e9" : "#10b981", animation: status === "running" ? "pulse-ring 1.5s ease-out infinite" : "none" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>{portalUrl}</span>
          </div>
        )}

        {/* Steps */}
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column" }}>
          {steps.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
              <div style={{ width: 14, height: 14, border: "2px solid rgba(14,165,233,0.3)", borderTopColor: "#0ea5e9", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Initialising agent…
            </div>
          ) : (
            steps.map((s, i) => <StepRow key={i} step={s} />)
          )}
        </div>

        {/* Result preview */}
        {status === "done" && result && (
          <div style={{
            margin: "0 16px 14px",
            padding: "10px 12px",
            background: "rgba(16,185,129,0.07)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
              Agent retrieved data
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Mono', monospace" }}>
              {JSON.stringify(result).slice(0, 120)}…
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "0 16px 14px", display: "flex", gap: 7 }}>
          {status === "done" && (
            <button onClick={onClose} style={{
              flex: 1, padding: "8px 0", background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)", borderRadius: 9,
              color: "#10b981", fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
            }}>
              Done ✓
            </button>
          )}
          {status === "error" && (
            <button onClick={onClose} style={{
              flex: 1, padding: "8px 0", background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9,
              color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
            }}>
              Retry
            </button>
          )}
        </div>
      </div>
    </>
  );
}
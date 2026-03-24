"use client";
// components/agent/AgentActivityPanel.tsx
// ─── Real-time Agent Activity Panel ──────────────────────────────────────────
// Dark terminal aesthetic — connects to useAgentStream for live log rendering.
// Collapsible, auto-scrolling, grouped by phase, animated.
// Drop this anywhere in your chat page.

import React, { useEffect, useRef, useState, memo } from "react";
import {
  Zap, ChevronDown, ChevronUp, X, Minimize2,
  Terminal, RefreshCw, AlertTriangle, CheckCircle, Loader,
} from "lucide-react";
import type { AgentLog, AgentResult, LogType, LogGroup } from "@/lib/useAgentStream";

// ── Constants ──────────────────────────────────────────────────────────────────
const GROUP_COLORS: Record<LogGroup, string> = {
  system:     "#6366f1",
  login:      "#0ea5e9",
  navigation: "#8b5cf6",
  extraction: "#10b981",
  api:        "#f59e0b",
  vision:     "#ec4899",
  record:     "#f97316",
};

const GROUP_LABELS: Record<LogGroup, string> = {
  system:     "System",
  login:      "Auth",
  navigation: "Navigate",
  extraction: "Extract",
  api:        "API",
  vision:     "Vision AI",
  record:     "Record",
};

// ── Log Row ────────────────────────────────────────────────────────────────────
const LogRow = memo(({ log, isLast }: { log: AgentLog; isLast: boolean }) => {
  const color   = GROUP_COLORS[log.group] || "#6366f1";
  const isError = log.type === "error";
  const isWarn  = log.type === "warn";
  const isDone  = log.type === "success";

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          8,
      padding:      "4px 0",
      opacity:      1,
      animation:    "logIn 0.18s ease",
    }}>
      {/* Status icon */}
      <div style={{ width: 16, flexShrink: 0, marginTop: 2 }}>
        {isLast && !isDone && !isError ? (
          <div style={{
            width: 10, height: 10, border: `1.5px solid ${color}`, borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.8s linear infinite", marginTop: 1,
          }} />
        ) : isError ? (
          <span style={{ color: "#ef4444", fontSize: 10 }}>✕</span>
        ) : isWarn ? (
          <span style={{ color: "#f59e0b", fontSize: 10 }}>⚠</span>
        ) : isDone ? (
          <span style={{ color: "#10b981", fontSize: 10 }}>✓</span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>·</span>
        )}
      </div>

      {/* Group pill */}
      <div style={{
        padding:      "1px 5px",
        borderRadius: 3,
        background:   `${color}18`,
        border:       `1px solid ${color}30`,
        fontSize:     9,
        fontWeight:   700,
        color,
        letterSpacing: "0.06em",
        whiteSpace:   "nowrap",
        flexShrink:   0,
        fontFamily:   "var(--mono)",
        marginTop:    1,
      }}>
        {GROUP_LABELS[log.group]}
      </div>

      {/* Message */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:   11,
          color:      isError ? "#fca5a5" : isWarn ? "#fcd34d" : isDone ? "#86efac" : "rgba(255,255,255,0.75)",
          fontFamily: "var(--mono)",
          lineHeight: 1.5,
          wordBreak:  "break-all",
        }}>
          {log.msg}
        </div>
        {log.detail && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "var(--mono)", marginTop: 1 }}>
            {log.detail}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)", flexShrink: 0, marginTop: 2 }}>
        {new Date(log.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
    </div>
  );
});
LogRow.displayName = "LogRow";

// ── Group separator ────────────────────────────────────────────────────────────
const GroupSeparator = ({ group, count }: { group: LogGroup; count: number }) => {
  const color = GROUP_COLORS[group] || "#6366f1";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 4px", opacity: 0.6 }}>
      <div style={{ height: 1, flex: 1, background: `${color}25` }} />
      <span style={{
        fontSize: 9, fontWeight: 700, fontFamily: "var(--mono)",
        color, letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {GROUP_LABELS[group]} ({count})
      </span>
      <div style={{ height: 1, flex: 1, background: `${color}25` }} />
    </div>
  );
};

// ── Status bar at top of panel ─────────────────────────────────────────────────
const StatusBar = ({ running, result }: { running: boolean; result: AgentResult | null }) => {
  if (running) return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 6px #3b82f6", animation: "pulse 1.5s ease-in-out infinite" }} />
      <span style={{ fontSize: 10, color: "#60a5fa", fontFamily: "var(--mono)", fontWeight: 600 }}>RUNNING</span>
    </div>
  );
  if (!result) return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "var(--mono)" }}>IDLE</span>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: result.success ? "#10b981" : "#ef4444" }} />
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, color: result.success ? "#4ade80" : "#f87171" }}>
        {result.success ? (result.fromCache ? "CACHE HIT" : "COMPLETE") : "FAILED"}
      </span>
    </div>
  );
};

// ── Main Panel ─────────────────────────────────────────────────────────────────
interface AgentActivityPanelProps {
  logs:       AgentLog[];
  running:    boolean;
  result:     AgentResult | null;
  onClear?:   () => void;
  onCancel?:  () => void;
  onRetrain?: () => void;
  onClose?:   () => void; // Added onClose here to fix the TypeScript error
  /** controlled open/close from parent */
  open?:      boolean;
  onToggle?:  () => void;
}

export function AgentActivityPanel({
  logs, running, result, onClear, onCancel, onRetrain, onClose, open: openProp, onToggle,
}: AgentActivityPanelProps) {
  const [openInternal, setOpenInternal] = useState(true);
  const [minimized,    setMinimized]    = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isOpen = openProp !== undefined ? openProp : openInternal;
  const toggle = onToggle || (() => setOpenInternal(p => !p));

  // Auto-scroll to bottom on new log
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  // Group logs by their group field
  const grouped: { group: LogGroup; logs: AgentLog[] }[] = [];
  let currentGroup: LogGroup | null = null;
  for (const log of logs) {
    if (log.group !== currentGroup) {
      grouped.push({ group: log.group, logs: [log] });
      currentGroup = log.group;
    } else {
      grouped[grouped.length - 1].logs.push(log);
    }
  }

  if (minimized) {
    return (
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        8,
        padding:    "6px 12px",
        background: "rgba(10,10,20,0.95)",
        border:     "1px solid rgba(99,102,241,0.3)",
        borderRadius: 8,
        cursor:     "pointer",
        backdropFilter: "blur(8px)",
      }} onClick={() => setMinimized(false)}>
        <Zap size={12} color="#6366f1" />
        <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#a5b4fc", fontWeight: 600 }}>AGENT</span>
        <StatusBar running={running} result={result} />
        {running && (
          <div style={{ width: 8, height: 8, border: "1.5px solid rgba(99,102,241,0.4)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        )}
      </div>
    );
  }

  return (
    <div style={{
      background:    "rgba(6,7,13,0.97)",
      border:        "1px solid rgba(255,255,255,0.08)",
      borderRadius:  12,
      overflow:      "hidden",
      display:       "flex",
      flexDirection: "column",
      height:        isOpen ? 420 : 40,
      transition:    "height 0.25s cubic-bezier(0.4,0,0.2,1)",
      backdropFilter: "blur(12px)",
      boxShadow:     "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15)",
      fontFamily:    "var(--mono, 'JetBrains Mono', monospace)",
    }}>
      <style>{`
        @keyframes logIn  { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1;box-shadow:0 0 6px currentColor} 50%{opacity:0.6;box-shadow:0 0 2px currentColor} }
        .agent-log-scroll { scrollbar-width:thin; scrollbar-color:rgba(99,102,241,0.3) transparent; }
        .agent-log-scroll::-webkit-scrollbar { width:3px; }
        .agent-log-scroll::-webkit-scrollbar-thumb { background:rgba(99,102,241,0.3); border-radius:10px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        height:      40,
        display:     "flex",
        alignItems:  "center",
        padding:     "0 12px",
        gap:         8,
        borderBottom: isOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
        background:  "rgba(255,255,255,0.02)",
        flexShrink:  0,
        cursor:      "pointer",
      }} onClick={toggle}>
        {/* Traffic-light dots */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28c840" }} />
        </div>

        <Zap size={11} color="#6366f1" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", letterSpacing: "0.08em", flex: 1 }}>
          AGENT ACTIVITY
        </span>

        <StatusBar running={running} result={result} />

        {logs.length > 0 && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)" }}>
            {logs.length} events
          </span>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
          {running && onCancel && (
            <button onClick={onCancel} title="Cancel" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "3px 5px", color: "rgba(255,255,255,0.3)", borderRadius: 4, display: "flex", alignItems: "center" }}>
              <X size={11} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="Close" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "3px 5px", color: "rgba(255,255,255,0.3)", borderRadius: 4, display: "flex", alignItems: "center" }}>
              <X size={11} />
            </button>
          )}
          {!running && logs.length > 0 && onClear && (
            <button onClick={onClear} title="Clear" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "3px 5px", color: "rgba(255,255,255,0.3)", borderRadius: 4, display: "flex", alignItems: "center" }}>
              <RefreshCw size={10} />
            </button>
          )}
          <button onClick={() => setMinimized(true)} title="Minimize" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "3px 5px", color: "rgba(255,255,255,0.3)", borderRadius: 4, display: "flex", alignItems: "center" }}>
            <Minimize2 size={11} />
          </button>
          <button onClick={toggle} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "3px 5px", color: "rgba(255,255,255,0.3)", borderRadius: 4, display: "flex", alignItems: "center" }}>
            {isOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        </div>
      </div>

      {/* ── Log area ── */}
      {isOpen && (
        <div
          ref={scrollRef}
          className="agent-log-scroll"
          style={{
            flex:       1,
            overflowY:  "auto",
            padding:    "10px 12px",
            display:    "flex",
            flexDirection: "column",
            gap:        0,
          }}
        >
          {logs.length === 0 && !running && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, opacity: 0.35 }}>
              <Terminal size={20} color="#6366f1" />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Waiting for agent task…
              </span>
            </div>
          )}

          {grouped.map((g, gi) => (
            <div key={gi}>
              {gi > 0 && <GroupSeparator group={g.group} count={g.logs.length} />}
              {g.logs.map((log, li) => (
                <LogRow
                  key={log.id}
                  log={log}
                  isLast={gi === grouped.length - 1 && li === g.logs.length - 1 && running}
                />
              ))}
            </div>
          ))}

          {/* Running spinner at bottom */}
          {running && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", opacity: 0.5 }}>
              <div style={{ width: 10, height: 10, border: "1.5px solid rgba(99,102,241,0.4)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 10, color: "#a5b4fc" }}>Processing…</span>
            </div>
          )}

          {/* Error: retrain prompt */}
          {result?.retrain && onRetrain && (
            <div style={{
              margin:       "10px 0 4px",
              padding:      "10px 12px",
              background:   "rgba(245,158,11,0.08)",
              border:       "1px solid rgba(245,158,11,0.2)",
              borderRadius: 8,
              display:      "flex",
              alignItems:   "center",
              gap:          10,
            }}>
              <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#fcd34d", flex: 1 }}>
                Could not locate page — workflow needs retraining
              </span>
              <button
                onClick={onRetrain}
                style={{
                  padding:      "4px 10px",
                  background:   "rgba(245,158,11,0.15)",
                  border:       "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 5,
                  color:        "#fbbf24",
                  fontSize:     10,
                  fontWeight:   700,
                  cursor:       "pointer",
                  fontFamily:   "var(--mono)",
                  letterSpacing: "0.05em",
                }}
              >
                RE-TRAIN
              </button>
            </div>
          )}

          {/* Success summary */}
          {result?.success && !running && (
            <div style={{
              margin:       "10px 0 4px",
              padding:      "8px 12px",
              background:   "rgba(16,185,129,0.07)",
              border:       "1px solid rgba(16,185,129,0.2)",
              borderRadius: 8,
              display:      "flex",
              alignItems:   "center",
              gap:          8,
            }}>
              <CheckCircle size={13} color="#10b981" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#4ade80", fontFamily: "var(--mono)" }}>
                {result.fromCache ? "Served from DB cache" : `Extracted ${Array.isArray(result.data) ? result.data.length + " records" : "data"}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Floating variant — absolute-positioned over chat ─────────────────────────
export function AgentActivityFloat(props: AgentActivityPanelProps) {
  return (
    <div style={{
      position: "absolute",
      bottom:   80,
      right:    16,
      width:    340,
      zIndex:   50,
    }}>
      <AgentActivityPanel {...props} />
    </div>
  );
}
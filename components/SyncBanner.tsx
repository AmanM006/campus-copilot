// components/SyncBanner.tsx
// ─── Shows sync status at top of page: syncing / needs reauth / synced ────────

"use client";
import React, { useState, useEffect } from "react";
import { useSyncStatus } from "@/hooks/useSyncStatus";

const STEPS = [
  "Connecting to portal…",
  "Fetching attendance…",
  "Loading subjects…",
  "Caching your data…",
];

export function SyncBanner({ email }: { email: string }) {
  const { status, hasData, lastSynced, syncing, needsReauth, triggerSync } = useSyncStatus(email);
  const [stepIdx, setStepIdx] = useState(0);

  // Cycle through steps while syncing
  useEffect(() => {
    if (!syncing) { setStepIdx(0); return; }
    const t = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 2200);
    return () => clearInterval(t);
  }, [syncing]);

  // ── Nothing to show when fully synced ────────────────────────────────────
  if (status === "active" && hasData) return null;

  // ── Needs reauth ──────────────────────────────────────────────────────────
  if (needsReauth) return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 20px", background: "rgba(239,68,68,0.08)",
      borderBottom: "1px solid rgba(239,68,68,0.2)", fontSize: 13,
    }}>
      <span style={{ fontSize: 16 }}>🔴</span>
      <span style={{ color: "rgba(255,255,255,0.7)", flex: 1 }}>
        Portal session expired — your data needs to be reconnected.
      </span>
      <button onClick={triggerSync} style={{
        padding: "5px 14px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.4)",
        background: "rgba(239,68,68,0.1)", color: "#f87171", fontSize: 12,
        cursor: "pointer", fontFamily: "'Outfit',sans-serif", fontWeight: 600,
      }}>Reconnect</button>
    </div>
  );

  // ── First-time pending (no data yet) ─────────────────────────────────────
  if (status === "pending" && !hasData) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px",
      background: "#04070e", flex: 1, gap: 20,
    }}>
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          border: "3px solid rgba(124,58,237,0.15)",
          borderTopColor: "#7c3aed",
          animation: "spin 1s linear infinite",
        }} />
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔄</span>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          Setting up your account
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
          A browser window may open — please complete the portal login
        </div>
        <div style={{ fontSize: 13, color: "#7c3aed", animation: "pulse 1.5s ease infinite" }}>
          {STEPS[stepIdx]}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 260 }}>
        {STEPS.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: i < stepIdx ? "#7c3aed" : i === stepIdx ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.06)",
              border: `2px solid ${i <= stepIdx ? "#7c3aed" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: "#fff", flexShrink: 0,
            }}>
              {i < stepIdx ? "✓" : i === stepIdx ? (
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", animation: "pulse 1s ease infinite" }} />
              ) : null}
            </div>
            <span style={{ fontSize: 13, color: i <= stepIdx ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)" }}>
              {step}
            </span>
          </div>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );

  // ── Syncing in background (has existing data, just refreshing) ────────────
  if (syncing && hasData) return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 20px", background: "rgba(124,58,237,0.06)",
      borderBottom: "1px solid rgba(124,58,237,0.12)", fontSize: 12,
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        border: "2px solid rgba(124,58,237,0.3)", borderTopColor: "#7c3aed",
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{ color: "rgba(255,255,255,0.5)" }}>🟡 Syncing your academic data…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return null;
}

// ── Compact topbar indicator ──────────────────────────────────────────────────
export function SyncIndicator({ email }: { email: string }) {
  const { status, lastSynced, syncing, needsReauth } = useSyncStatus(email);

  const label = syncing     ? "Syncing…"
    : needsReauth           ? "Needs reconnect"
    : status === "active"   ? `Synced ${_relTime(lastSynced)}`
    : "Not synced";

  const dot = syncing       ? "#f59e0b"
    : needsReauth           ? "#ef4444"
    : status === "active"   ? "#10b981"
    : "rgba(255,255,255,0.2)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", background: dot,
        animation: syncing ? "pulse 1.2s ease infinite" : "none",
      }} />
      {label}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

function _relTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}
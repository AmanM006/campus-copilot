// components/faculty/LabView.tsx
// ─── Replaces the hardcoded LabView — uses useFacultyLabRequests ──────────────

"use client";
import React, { useState } from "react";
import { CheckCircle, XCircle, Clock, Bell } from "lucide-react";
import { useFacultyLabRequests } from "@/hooks/useData";

const STATUS_COLORS: Record<string, string> = {
  pending:  "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
};

export default function LabView({
  facultyId,
  onAsk,
  setView,
}: {
  facultyId: string;
  onAsk: (q: string) => void;
  setView: (v: any) => void;
}) {
  const { requests, loading, pendingCount, updateStatus } = useFacultyLabRequests(facultyId);
  const [filter,  setFilter]  = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [updating, setUpdating] = useState<string | null>(null);

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  const handleUpdate = async (id: string, status: "approved" | "rejected") => {
    setUpdating(id);
    try { await updateStatus(id, status); }
    catch { /* handled */ }
    finally { setUpdating(null); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>
          Lab Requests
        </div>
        {pendingCount > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: "#f59e0b",
            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
            padding: "3px 10px", borderRadius: 100,
          }}>{pendingCount} pending</span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>
        Review and approve student lab access requests. Updates notify students in real-time.
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "5px 14px", borderRadius: 8, border: "none",
            cursor: "pointer", fontSize: 12, fontWeight: 500,
            fontFamily: "'Outfit',sans-serif", transition: "all 0.15s",
            background: filter === f ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.04)",
            color: filter === f ? "#38bdf8" : "rgba(255,255,255,0.4)",
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>
          Loading requests…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", padding: "32px 0", textAlign: "center" }}>
          No {filter === "all" ? "" : filter} requests found.
        </div>
      )}

      {filtered.map(req => {
        const c = STATUS_COLORS[req.status];
        const studentName = (req as any).student?.name || req.student_id;
        return (
          <div key={req.id} style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderLeft: `3px solid ${c}`,
            borderRadius: 12, padding: "14px 18px", marginBottom: 8,
          }}>
            <div style={{
              display: "flex", alignItems: "flex-start",
              justifyContent: "space-between", gap: 12,
              marginBottom: req.status === "pending" ? 12 : 0,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{studentName}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono',monospace" }}>
                    {req.student_id}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                  <strong style={{ color: "rgba(255,255,255,0.75)" }}>{req.lab_name}</strong>
                  {" · "}{req.date}{" · "}{req.slot}
                </div>
                {req.reason && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
                    "{req.reason}"
                  </div>
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, color: c,
                background: `${c}18`, border: `1px solid ${c}30`,
                padding: "3px 10px", borderRadius: 100,
                textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
              }}>{req.status}</span>
            </div>

            {req.status === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={updating === req.id}
                  onClick={() => handleUpdate(req.id, "approved")}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 5, padding: "8px 0", borderRadius: 8, border: "none",
                    background: "rgba(16,185,129,0.12)", color: "#10b981",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Outfit',sans-serif", transition: "all 0.2s",
                    opacity: updating === req.id ? 0.5 : 1,
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "#10b981"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#10b981"; }}>
                  <CheckCircle size={12} /> Approve
                </button>
                <button
                  disabled={updating === req.id}
                  onClick={() => handleUpdate(req.id, "rejected")}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 5, padding: "8px 0", borderRadius: 8, border: "none",
                    background: "rgba(239,68,68,0.08)", color: "#ef4444",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Outfit',sans-serif", transition: "all 0.2s",
                    opacity: updating === req.id ? 0.5 : 1,
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}>
                  <XCircle size={12} /> Reject
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => { setView("chat"); onAsk("Summarise all pending lab requests and suggest priorities"); }}
        style={{
          marginTop: 6, width: "100%", padding: "10px 0",
          background: "transparent", border: "1px dashed rgba(14,165,233,0.25)",
          color: "#0ea5e9", borderRadius: 9, fontSize: 12,
          cursor: "pointer", fontFamily: "'Outfit',sans-serif",
        }}>
        Ask AI to summarise requests →
      </button>
    </div>
  );
}
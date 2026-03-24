// components/faculty/AnalyticsView.tsx
// ─── Replaces the hardcoded AnalyticsView — real data from Supabase ───────────

"use client";
import React, { useState } from "react";
import { X, BarChart3, Users, AlertTriangle } from "lucide-react";
import { useFacultyAttendance, useFacultySubjects } from "@/hooks/useData";

function statusColor(s: string) {
  return s === "safe" ? "#10b981" : s === "risk" ? "#f59e0b" : "#ef4444";
}

function attendanceStatus(pct: number) {
  if (pct >= 75) return "safe";
  if (pct >= 65) return "risk";
  return "detained";
}

export default function AnalyticsView({
  facultyId,
  onAsk,
  setView,
}: {
  facultyId: string;
  onAsk: (q: string) => void;
  setView: (v: any) => void;
}) {
  const { data: attendanceMap, loading: attLoading } = useFacultyAttendance(facultyId);
  const { data: subjects, loading: subjLoading }     = useFacultySubjects(facultyId);
  const [drill,      setDrill]      = useState<"attendance" | null>(null);
  const [selSubject, setSelSubject] = useState<string>("");

  const loading = attLoading || subjLoading;

  // Flatten all records for aggregate stats
  const allRecords: any[] = Object.values(attendanceMap || {}).flat();
  const totalUniq   = new Set(allRecords.map((s: any) => s.student?.id || s.student_id)).size;
  const belowThreshold = allRecords.filter((s: any) => s.percentage < 75);
  const avgAtt      = allRecords.length
    ? Math.round(allRecords.reduce((a: number, s: any) => a + s.percentage, 0) / allRecords.length)
    : 0;
  const topPerformers = allRecords.filter((s: any) => s.percentage >= 90);

  // Set default selected subject
  const subjectCodes = Object.keys(attendanceMap || {});
  if (!selSubject && subjectCodes.length > 0) {
    // can't call setState here — use effect instead; just fall back below
  }
  const activeSubject = selSubject || subjectCodes[0] || "";

  const STATS = [
    { label: "Total Students",   val: totalUniq,              color: "#0ea5e9",  drill: false },
    { label: "Avg Attendance",   val: `${avgAtt}%`,           color: "#10b981",  drill: true  },
    { label: "Below 75%",        val: belowThreshold.length,  color: "#ef4444",  drill: true  },
    { label: "Top Performers",   val: topPerformers.length,   color: "#a78bfa",  drill: false },
  ];

  if (loading) {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading analytics…</div>
      </div>
    );
  }

  const activeRecords: any[] = (attendanceMap || {})[activeSubject] || [];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
        Analytics
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>
        Real-time data from Supabase. Click metric cards for breakdowns.
      </div>

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
        {STATS.map((c, i) => (
          <button key={i}
            onClick={() => c.drill ? setDrill("attendance") : undefined}
            style={{
              padding: "16px 18px", background: "rgba(255,255,255,0.02)",
              border: `1px solid ${c.color}25`, borderRadius: 13,
              textAlign: "left", cursor: c.drill ? "pointer" : "default",
              transition: "all 0.2s", fontFamily: "'Outfit',sans-serif",
            }}
            onMouseOver={e => { if (c.drill) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 700, color: c.color, lineHeight: 1, marginBottom: 5, letterSpacing: "-0.02em" }}>
              {c.val}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{c.label}</div>
            {c.drill && <div style={{ fontSize: 11, color: c.color }}>click to expand</div>}
          </button>
        ))}
      </div>

      {/* Drill-down: attendance breakdown */}
      {drill === "attendance" && (
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: "20px 24px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Attendance Breakdown</div>
            <button onClick={() => setDrill(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex" }}>
              <X size={15} />
            </button>
          </div>

          {/* Subject tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {subjectCodes.map(code => (
              <button key={code} onClick={() => setSelSubject(code)} style={{
                padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 600,
                background: activeSubject === code ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.04)",
                color: activeSubject === code ? "#38bdf8" : "rgba(255,255,255,0.4)",
                fontFamily: "'Outfit',sans-serif",
              }}>{code}</button>
            ))}
          </div>

          {activeRecords.slice().sort((a: any, b: any) => a.percentage - b.percentage).map((s: any, i: number) => {
            const pct = Math.round(s.percentage);
            const status = attendanceStatus(pct);
            const name = s.student?.name || s.student_id;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", minWidth: 130, flexShrink: 0 }}>{name}</div>
                <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: statusColor(status), borderRadius: 4 }} />
                </div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(status), minWidth: 36, textAlign: "right" }}>
                  {pct}%
                </div>
                <div style={{ fontSize: 10, color: statusColor(status), minWidth: 50, textAlign: "right" }}>{status}</div>
              </div>
            );
          })}

          <button onClick={() => { setView("chat"); onAsk(`Full attendance report for ${activeSubject} with recovery recommendations`); }}
            style={{
              marginTop: 10, width: "100%", padding: "9px 0",
              background: "transparent", border: "1px dashed rgba(14,165,233,0.3)",
              color: "#0ea5e9", borderRadius: 9, fontSize: 12, cursor: "pointer",
              fontFamily: "'Outfit',sans-serif",
            }}>Ask AI for full report →</button>
        </div>
      )}

      {/* Documents per subject */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Subjects Overview</div>
          {(subjects || []).map((s: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: "#fff" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{s.code}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#0ea5e9" }}>{s.document_count ?? 0} docs</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{s.student_count ?? 0} students</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>At-Risk Summary</div>
          {belowThreshold.length === 0 ? (
            <div style={{ fontSize: 13, color: "#10b981" }}>✅ All students above 75%</div>
          ) : belowThreshold.slice(0, 6).map((s: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.percentage < 65 ? "#ef4444" : "#f59e0b", flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 }}>
                {s.student?.name || s.student_id}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.percentage < 65 ? "#ef4444" : "#f59e0b" }}>
                {Math.round(s.percentage)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
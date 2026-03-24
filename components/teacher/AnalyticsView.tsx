"use client";
// components/teacher/AnalyticsView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the inline AnalyticsView in teacher/page.tsx.
// New features over old version:
//   - Subject selector shows real enrolled student list
//   - Marks section alongside attendance
//   - At-risk students pulled from DB (not computed client-side from attMap)
//   - AI prompt buttons per-subject

import React, { useState, useEffect, useCallback } from "react";
import { X, BookOpen, TrendingUp, Users, BarChart3, AlertTriangle } from "lucide-react";
import { useFacultySubjects, useFacultyAttendance } from "@/hooks/useData";
import { getSubjectAnalytics } from "@/lib/db_extended";
import { useSubjectMarks } from "@/hooks/useMarks";

function statusColor(pct: number) {
  return pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
}

function gradeLabel(pct: number) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  return "F";
}

// ── Attendance breakdown drill ─────────────────────────────────────────────────
function AttDrill({ subjectId, subjectCode, onClose, onAsk }: {
  subjectId: string; subjectCode: string;
  onClose: () => void; onAsk: (q: string) => void;
}) {
  const [analytics, setAnalytics] = useState<any>(null);
  const { data: marksData, avg: marksAvg } = useSubjectMarks(subjectId);

  useEffect(() => {
    getSubjectAnalytics(subjectId).then(setAnalytics);
  }, [subjectId]);

  if (!analytics) return <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", padding:"20px 0" }}>Loading…</div>;

  return (
    <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"20px 24px", marginBottom:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{subjectCode} — Detailed View</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
            {analytics.students.length} students · avg attendance {analytics.avg_attendance}%
            {marksData.length > 0 && ` · avg marks ${marksAvg}%`}
          </div>
        </div>
        <button onClick={onClose} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", display:"flex" }}>
          <X size={15}/>
        </button>
      </div>

      {/* Per-student table */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"rgba(255,255,255,0.02)" }}>
              {["Student","Attendance","Marks","Status"].map(h => (
                <th key={h} style={{ padding:"7px 12px", textAlign:"left", fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:".06em", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analytics.students.map((s: any, i: number) => {
              const pct      = s.attendance ? Math.round(s.attendance.percentage) : null;
              const sMark    = marksData.find((m: any) => m.student_id === s.id);
              const marksPct = sMark ? Math.round((sMark.score / (sMark.max_score || 100)) * 100) : null;
              return (
                <tr key={s.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding:"9px 12px" }}>
                    <div style={{ fontSize:13, fontWeight:500, color:"#fff" }}>{s.name}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Mono',monospace" }}>{s.email}</div>
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    {pct !== null ? (
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:80, height:5, background:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:statusColor(pct), borderRadius:3 }}/>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:statusColor(pct), fontFamily:"'Outfit',sans-serif", minWidth:36 }}>{pct}%</span>
                      </div>
                    ) : <span style={{ fontSize:12, color:"rgba(255,255,255,0.2)" }}>—</span>}
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    {marksPct !== null ? (
                      <span style={{ fontSize:12, fontWeight:700, color:statusColor(marksPct), fontFamily:"'Outfit',sans-serif" }}>
                        {gradeLabel(marksPct)} ({marksPct}%)
                      </span>
                    ) : <span style={{ fontSize:12, color:"rgba(255,255,255,0.2)" }}>—</span>}
                  </td>
                  <td style={{ padding:"9px 12px" }}>
                    {s.at_risk
                      ? <span style={{ fontSize:9, fontWeight:700, background:"rgba(245,158,11,0.12)", color:"#f59e0b", border:"1px solid rgba(245,158,11,0.25)", padding:"2px 7px", borderRadius:4 }}>AT RISK</span>
                      : <span style={{ fontSize:9, fontWeight:700, background:"rgba(16,185,129,0.1)", color:"#4ade80", border:"1px solid rgba(16,185,129,0.2)", padding:"2px 7px", borderRadius:4 }}>OK</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={() => onAsk(`Full attendance and marks report for ${subjectCode} — identify at-risk students and suggest interventions`)}
        style={{ marginTop:14, width:"100%", padding:"9px 0", background:"transparent", border:"1px dashed rgba(14,165,233,0.3)", color:"#0ea5e9", borderRadius:9, fontSize:12, cursor:"pointer", fontFamily:"'Outfit',sans-serif" }}>
        Ask AI for recommendations →
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYTICS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
interface Props {
  facultyId: string;
  onAsk:     (q: string) => void;
  setView:   (v: string) => void;
}

export function AnalyticsView({ facultyId, onAsk, setView }: Props) {
  const { data: attMap,   loading: attLoading  } = useFacultyAttendance(facultyId);
  const { data: subjects, loading: subjLoading } = useFacultySubjects(facultyId);
  const [drillSubject, setDrillSubject] = useState<{ id:string; code:string } | null>(null);

  // Flatten attendance records
  const allRecords: any[] = Object.values(attMap || {}).flat();
  const totalUniq  = new Set(allRecords.map((s: any) => s.student?.id || s.student_id)).size;
  const below75    = allRecords.filter((s: any) => s.percentage < 75);
  const avgAtt     = allRecords.length
    ? Math.round(allRecords.reduce((a, s: any) => a + s.percentage, 0) / allRecords.length)
    : 0;
  const top        = allRecords.filter((s: any) => s.percentage >= 90);

  if (attLoading || subjLoading) {
    return <div style={{ flex:1, padding:"28px 32px", fontSize:13, color:"rgba(255,255,255,0.35)" }}>Loading analytics…</div>;
  }

  const STATS = [
    { label:"Total Students", val:totalUniq,         sub:"across all subjects",  color:"#0ea5e9", drill:false },
    { label:"Avg Attendance",  val:`${avgAtt}%`,      sub:"all subjects",          color:"#10b981", drill:false },
    { label:"Below 75%",       val:below75.length,    sub:"students at risk",      color:"#ef4444", drill:true },
    { label:"Top Performers",  val:top.length,        sub:"≥90% attendance",       color:"#a78bfa", drill:false },
  ];

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:"#fff", marginBottom:6 }}>Analytics</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:22 }}>
        Live data from Supabase. Click a subject card for per-student details.
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
        {STATS.map((c, i) => (
          <div key={i} style={{ padding:"16px 18px", background:"rgba(255,255,255,0.02)", border:`1px solid ${c.color}25`, borderRadius:13 }}>
            <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:26, fontWeight:700, color:c.color, lineHeight:1, marginBottom:5, letterSpacing:"-0.02em" }}>{c.val}</div>
            <div style={{ fontSize:12, fontWeight:600, color:"#fff", marginBottom:2 }}>{c.label}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Drill-down panel */}
      {drillSubject && (
        <AttDrill
          subjectId={drillSubject.id}
          subjectCode={drillSubject.code}
          onClose={() => setDrillSubject(null)}
          onAsk={(q) => { setView("chat"); onAsk(q); }}
        />
      )}

      {/* Per-subject rows */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"20px 24px" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:14 }}>Subjects Overview</div>
          {(subjects || []).map((s: any, i: number) => {
            const records = (attMap || {})[s.code] || [];
            const subAvg  = records.length
              ? Math.round(records.reduce((a: number, r: any) => a + r.percentage, 0) / records.length)
              : null;
            return (
              <button key={i} onClick={() => setDrillSubject({ id:s.id, code:s.code })}
                style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, paddingBottom:10, borderBottom:"1px solid rgba(255,255,255,0.05)", background:"transparent", border:"none", cursor:"pointer", textAlign:"left", fontFamily:"'Outfit',sans-serif" }}
                onMouseOver={e => (e.currentTarget as HTMLButtonElement).style.opacity="0.8"}
                onMouseOut={e  => (e.currentTarget as HTMLButtonElement).style.opacity="1"}>
                <div>
                  <div style={{ fontSize:13, color:"#fff", fontWeight:500 }}>{s.name}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{s.code} · {s.student_count??0} students</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  {subAvg !== null && (
                    <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:14, fontWeight:700, color:statusColor(subAvg) }}>{subAvg}%</div>
                  )}
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)" }}>{s.document_count??0} docs · tap for details</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"20px 24px" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:14 }}>At-Risk Students</div>
          {below75.length === 0
            ? <div style={{ fontSize:13, color:"#10b981" }}>✅ All students above 75%</div>
            : below75.slice(0, 10).map((s: any, i: number) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:s.percentage<65?"#ef4444":"#f59e0b", flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {s.student?.name || s.student_id}
                  </div>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:s.percentage<65?"#ef4444":"#f59e0b", fontFamily:"'Outfit',sans-serif" }}>
                  {Math.round(s.percentage)}%
                </div>
              </div>
            ))
          }
          {below75.length > 0 && (
            <button onClick={() => { setView("chat"); onAsk("List all at-risk students below 75% attendance with their current percentages and suggest a recovery plan for each"); }}
              style={{ marginTop:10, width:"100%", padding:"8px 0", background:"transparent", border:"1px dashed rgba(239,68,68,0.25)", color:"#f87171", borderRadius:8, fontSize:11, cursor:"pointer", fontFamily:"'Outfit',sans-serif" }}>
              Ask AI for recovery plan →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
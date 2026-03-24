"use client";
// components/student/MarksPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shows marks entered by teachers. Used in:
//   - Student chat page dashboard panel (Marks tab)
//   - Student full dashboard (FullDashboard marks section)
// Real-time: teacher upserts trigger Supabase channel → instant update.

import React, { useState } from "react";
import { TrendingUp, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useStudentMarks } from "@/hooks/useMarks";

const EXAM_COLORS: Record<string, string> = {
  midsem:     "#3b82f6",
  endsem:     "#7c3aed",
  quiz:       "#10b981",
  assignment: "#f59e0b",
  practical:  "#0ea5e9",
};

function gradeColor(pct: number) {
  if (pct >= 90) return "#10b981";
  if (pct >= 75) return "#3b82f6";
  if (pct >= 60) return "#f59e0b";
  return "#ef4444";
}

function gradeLabel(pct: number) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

interface Props {
  studentId: string;
  compact?: boolean;   // true = used inside dashboard side panel
}

export function MarksPanel({ studentId, compact = false }: Props) {
  const { data, loading, bySubject, cgpaEstimate } = useStudentMarks(studentId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (code: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  };

  if (loading) return (
    <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", padding:"16px 0" }}>
      Fetching marks…
    </div>
  );

  if (data.length === 0) return (
    <div style={{ textAlign:"center", padding:compact?"24px 0":"48px 0", border:"1px dashed rgba(255,255,255,0.07)", borderRadius:12 }}>
      <BookOpen size={24} style={{ opacity:.15, marginBottom:8 }}/>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.25)" }}>No marks recorded yet.</div>
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.15)", marginTop:4 }}>
        Check back after exams — marks appear here instantly when uploaded by faculty.
      </div>
    </div>
  );

  const subjects = Object.entries(bySubject);

  return (
    <div>
      {/* Overall summary strip */}
      {!compact && cgpaEstimate !== null && (
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <div style={{ padding:"10px 14px", background:"rgba(124,58,237,0.08)", border:"1px solid rgba(124,58,237,0.2)", borderRadius:10, display:"flex", gap:10, alignItems:"center", flex:1 }}>
            <TrendingUp size={16} color="#a78bfa"/>
            <div>
              <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:22, fontWeight:700, color:"#a78bfa", lineHeight:1 }}>{cgpaEstimate}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>Est. CGPA</div>
            </div>
          </div>
          <div style={{ padding:"10px 14px", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.18)", borderRadius:10, flex:1 }}>
            <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:22, fontWeight:700, color:"#60a5fa", lineHeight:1 }}>{subjects.length}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>Subjects with marks</div>
          </div>
          <div style={{ padding:"10px 14px", background:"rgba(16,185,129,0.06)", border:"1px solid rgba(16,185,129,0.18)", borderRadius:10, flex:1 }}>
            <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:22, fontWeight:700, color:"#4ade80", lineHeight:1 }}>{data.length}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>Total exams</div>
          </div>
        </div>
      )}

      {/* Per-subject rows */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {subjects.map(([code, val]: any) => {
          const isOpen = expanded.has(code);
          const avg    = Math.round(val.exams.reduce((s: number, e: any) => s + ((e.score / (e.max_score || 100)) * 100), 0) / val.exams.length);
          const color  = gradeColor(avg);

          return (
            <div key={code} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:11, overflow:"hidden" }}>
              <button onClick={() => toggle(code)} style={{
                width:"100%", display:"flex", alignItems:"center", gap:12,
                padding:"12px 14px", background:"transparent", border:"none",
                cursor:"pointer", fontFamily:"'Outfit',sans-serif", textAlign:"left",
              }}>
                <div style={{ width:34, height:34, borderRadius:9, background:`${val.subject?.color || "#7c3aed"}18`, border:`1px solid ${val.subject?.color || "#7c3aed"}28`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:val.subject?.color || "#a78bfa", flexShrink:0 }}>
                  {code.split(" ")[1] || code.slice(0,3)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {val.subject?.name || code}
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:1 }}>
                    {val.exams.length} exam{val.exams.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:20, fontWeight:700, color, lineHeight:1 }}>
                    {gradeLabel(avg)}
                  </div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:1 }}>{avg}%</div>
                </div>
                {isOpen ? <ChevronUp size={14} color="rgba(255,255,255,0.3)"/> : <ChevronDown size={14} color="rgba(255,255,255,0.3)"/>}
              </button>

              {isOpen && (
                <div style={{ padding:"0 14px 14px" }}>
                  {val.exams.map((exam: any, i: number) => {
                    const pct   = Math.round((exam.score / (exam.max_score || 100)) * 100);
                    const ecolor = EXAM_COLORS[exam.exam_type] || "#7c3aed";
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                        <span style={{ padding:"2px 7px", borderRadius:4, fontSize:9, fontWeight:700, background:`${ecolor}14`, color:ecolor, border:`1px solid ${ecolor}25`, fontFamily:"'DM Mono',monospace", flexShrink:0, textTransform:"uppercase" }}>
                          {exam.exam_type}
                        </span>
                        <div style={{ flex:1, height:6, background:"rgba(255,255,255,0.06)", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:gradeColor(pct), borderRadius:4, transition:"width .4s ease" }}/>
                        </div>
                        <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:13, fontWeight:700, color:gradeColor(pct), minWidth:40, textAlign:"right" }}>
                          {exam.score}/{exam.max_score || 100}
                        </div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", minWidth:24 }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
"use client";
import React, { useState } from "react";
import { TrendingUp, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useStudentMarks } from "@/hooks/useMarks";

// We color the letters purely based on what string the database hands us.
function gradeColor(grade: string): string {
  const g = grade?.trim()?.toUpperCase() || "";
  if (g.startsWith("O") || g.startsWith("A")) return "#10b981";
  if (g.startsWith("B")) return "#3b82f6";
  if (g.startsWith("C") || g.startsWith("D") || g.startsWith("E") || g.startsWith("P")) return "#f59e0b";
  if (g.startsWith("F") || g.startsWith("I")) return "#ef4444";
  return "#a78bfa"; // Fallback color
}

function pctColor(pct: number): string {
  if (pct >= 80) return "#10b981";
  if (pct >= 60) return "#3b82f6";
  if (pct >= 40) return "#f59e0b";
  return "#ef4444";
}

interface Props {
  email: string;
  compact?: boolean;
}

export function MarksPanel({ email, compact = false }: Props) {
  const { data, loading, bySemester, semesters, cgpaEstimate } = useStudentMarks(email);

  const [activeSem, setActiveSem] = useState<string>("");
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const currentSem = activeSem || (semesters.length > 0 ? semesters[0] : "");
  const subjectsInSem = bySemester[currentSem] || {};

  const toggle = (code: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  };

  if (loading) return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Fetching marks…</div>;

  if (data.length === 0) return (
    <div style={{ textAlign: "center", padding: compact ? "24px 0" : "48px 0", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 12 }}>
      <BookOpen size={24} style={{ opacity: .15, marginBottom: 8 }} />
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>No marks recorded yet.</div>
    </div>
  );

  return (
    <div>
      {/* ── Summary strip ── */}
      {!compact && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          
          <div style={{ padding: "10px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 10, flex: 1 }}>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, color: "#60a5fa", lineHeight: 1 }}>{Object.keys(subjectsInSem).length}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Subjects for this sem</div>
          </div>
          <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 10, flex: 1 }}>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, color: "#4ade80", lineHeight: 1 }}>{semesters.length}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Semesters</div>
          </div>
        </div>
      )}

      {/* ── Semester selector ── */}
      {semesters.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <select
            value={currentSem}
            onChange={e => { setActiveSem(e.target.value); setExpanded(new Set()); }}
            style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#fff", fontSize: 13, cursor: "pointer", outline: "none" }}
          >
            {semesters.map((sem: string) => <option key={sem} value={sem} style={{ background: "#1a1a2e" }}>{sem}</option>)}
          </select>
        </div>
      )}

      {/* ── Subject list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(subjectsInSem).map(([code, val]: [string, any]) => {
          const isOpen = expanded.has(code);
          
          const validGrades = val.exams.filter((e: any) => e.grade && e.grade.trim() !== "");
          const hasGrade = validGrades.length > 0;
          const topGrade = hasGrade ? validGrades[0].grade.trim().toUpperCase() : "";

          const ex = val.exams[0] || {}; 
          
          // 🚨 FIX: Corrected the interpretation of "Internal Marks"
          const midsem = ex.mta_marks;
          const assignments = ex.ca_marks;
          
          // "score" maps to the "Internal Marks" column from the Result tab. 
          // If that tab hasn't populated yet (Sem 4), calculate it manually for the UI.
          const totalInternals = ex.score > 0 ? ex.score : ((midsem || 0) + (assignments || 0));
          const hasNumbers = totalInternals > 0 || assignments != null || midsem != null;

          const displayColor = hasGrade ? gradeColor(topGrade) : pctColor((totalInternals/100)*100);

          return (
            <div key={code} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, overflow: "hidden" }}>
              
              {/* Header Badge */}
              <button onClick={() => toggle(code)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#a78bfa" }}>
                  {code.replace(/[^0-9]/g, "").slice(-4) || code.slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val.subject?.name || code}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{code}</div>
                </div>
                
                {/* Grade / Total Internals Display */}
                <div style={{ textAlign: "right", flexShrink: 0, marginRight: 6 }}>
                  {hasGrade ? (
                    <>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, color: displayColor, lineHeight: 1 }}>{topGrade}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Grade</div>
                    </>
                  ) : hasNumbers ? (
                    <>
                      <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, color: displayColor, lineHeight: 1 }}>{totalInternals}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Midsem Marks</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>—</div>
                  )}
                </div>
                {isOpen ? <ChevronUp size={14} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.3)" />}
              </button>

              {/* Expanded Detailed Breakdown */}
              {isOpen && (
                <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {val.exams.map((exam: any, i: number) => {
                    const eGrade = (exam.grade || "").trim().toUpperCase();
                    const eColor = gradeColor(eGrade);
                    
                    return (
                      <div key={i} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", paddingTop: i > 0 ? 10 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                           <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: `rgba(124,58,237,0.1)`, color: "#a78bfa", border: `1px solid rgba(124,58,237,0.2)`, textTransform: "uppercase" }}>
                            {hasGrade ? "Final Result" : "Ongoing Result"}
                          </span>
                          
                          {eGrade && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Grade</span>
                              <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 700, color: eColor }}>{eGrade}</span>
                            </div>
                          )}
                        </div>

                        {/* 🚨 FIX: Correct Math and Labels! */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: 8 }}>
                            {midsem != null && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Midsems: </span> <b>{midsem}</b></div>}
                            {assignments != null && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Internal Assignments: </span> <b>{assignments}</b></div>}
                            
                            {hasNumbers && (
                                <div>
                                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Total Internals(MTA+CTA): </span> 
                                    <b style={{ color: "#fff" }}>{totalInternals}</b>
                                </div>
                            )}
                        </div>
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
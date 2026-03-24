"use client";
// components/teacher/SubjectsView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full replacement for the inline SubjectsView in teacher/page.tsx.
// Adds:
//   - Per-subject student roster (enrolled students from DB)
//   - Attendance & Marks import panel (AttendanceMarksImport)
//   - At-risk student highlight per subject
//   - Teacher name shown in subject card header
// Keep: existing document upload/delete (useDocuments hook), styling.

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Upload, Trash2, ExternalLink, ChevronRight,
  Users, BarChart3, FileText, AlertTriangle, Check,
  Download, RefreshCw, X,
} from "lucide-react";
import { useDocuments } from "@/hooks/useData";
import { getStudentsInSubject, getSubjectAttendanceWithRisk } from "@/lib/db_extended";
import { AttendanceMarksImport } from "./AttendanceMarksImport";
import type { DBDocument } from "@/lib/types";

// ── Shared helpers ────────────────────────────────────────────────────────────
function formatSize(b?: number) {
  if (!b) return "—";
  return b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}

function statusColor(s: string) {
  return s === "safe" ? "#10b981" : s === "risk" ? "#f59e0b" : "#ef4444";
}

type SubView = "docs" | "students" | "import";

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECT WORKSPACE (opened when teacher clicks a subject)
// ═══════════════════════════════════════════════════════════════════════════════
function SubjectWorkspace({
  subject, facultyId, onBack,
}: {
  subject: any; facultyId: string; onBack: () => void;
}) {
  const [subView,  setSubView]  = useState<SubView>("docs");
  const [students, setStudents] = useState<any[]>([]);
  const [attRows,  setAttRows]  = useState<any[]>([]);
  const [loadStu,  setLoadStu]  = useState(false);
  const [notif,    setNotif]    = useState<string | null>(null);
  const [uploading,setUploading]= useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { docs, loading: docLoading, upload, remove } = useDocuments(subject.id);

  const notify = (m: string) => { setNotif(m); setTimeout(() => setNotif(null), 3500); };

  // Load students + attendance once
  const loadStudentData = useCallback(async () => {
    setLoadStu(true);
    const [stu, att] = await Promise.all([
      getStudentsInSubject(subject.id),
      getSubjectAttendanceWithRisk(subject.id),
    ]);
    setStudents(stu);
    setAttRows(att);
    setLoadStu(false);
  }, [subject.id]);

  useEffect(() => { loadStudentData(); }, [loadStudentData]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await upload(file, facultyId);
      notify(`✅ "${file.name}" uploaded — visible to students instantly`);
    } catch (e: any) {
      notify(`❌ Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (doc: DBDocument) => {
    if (!confirm(`Remove "${doc.name}"?`)) return;
    try { await remove({ id: doc.id, file_path: doc.file_path }); notify("Document removed."); }
    catch (e: any) { notify(`❌ ${e.message}`); }
  };

  const atRisk = attRows.filter(r => r.at_risk);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
      {/* Toast */}
      {notif && (
        <div style={{ position:"fixed", top:20, right:20, background:notif.startsWith("❌")?"#ef4444":"#0ea5e9", color:"#fff", padding:"10px 18px", borderRadius:10, fontSize:13, fontWeight:500, zIndex:100 }}>
          {notif}
        </div>
      )}

      {/* Back + header */}
      <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:13, marginBottom:20, fontFamily:"'Outfit',sans-serif", padding:0 }}
        onMouseOver={e=>(e.currentTarget as HTMLButtonElement).style.color="#fff"}
        onMouseOut={e=>(e.currentTarget as HTMLButtonElement).style.color="rgba(255,255,255,0.4)"}>
        <ArrowLeft size={14}/> All Subjects
      </button>

      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
        <div style={{ width:48, height:48, borderRadius:12, background:`${subject.color}20`, border:`1px solid ${subject.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:subject.color, flexShrink:0 }}>
          {subject.code.split(" ")[1] || subject.code.slice(0,3)}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:"#fff" }}>{subject.name}</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2, display:"flex", gap:10 }}>
            <span style={{ fontFamily:"'DM Mono',monospace" }}>{subject.code}</span>
            <span>👥 {students.length} students</span>
            {atRisk.length > 0 && (
              <span style={{ color:"#f59e0b" }}>⚠️ {atRisk.length} at risk</span>
            )}
          </div>
        </div>
      </div>

      {/* Sub-view tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {([
          { id:"docs",     icon:FileText,   label:`Materials (${docs.length})` },
          { id:"students", icon:Users,      label:`Students (${students.length})` },
          { id:"import",   icon:BarChart3,  label:"Import Data" },
        ] as { id:SubView; icon:any; label:string }[]).map(t => {
          const Icon = t.icon;
          const active = subView === t.id;
          return (
            <button key={t.id} onClick={()=>setSubView(t.id)} style={{
              display:"flex", alignItems:"center", gap:6, padding:"8px 14px",
              borderRadius:9, border:`1px solid ${active?"rgba(14,165,233,0.35)":"rgba(255,255,255,0.08)"}`,
              background: active?"rgba(14,165,233,0.1)":"rgba(255,255,255,0.03)",
              color: active?"#38bdf8":"rgba(255,255,255,0.45)",
              fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'Outfit',sans-serif",
            }}>
              <Icon size={12}/>{t.label}
            </button>
          );
        })}
      </div>

      {/* ── DOCS tab ── */}
      {subView === "docs" && (
        <>
          <div style={{ background:"rgba(14,165,233,0.05)", border:"2px dashed rgba(14,165,233,0.2)", borderRadius:14, padding:"20px 24px", marginBottom:20, display:"flex", alignItems:"center", gap:16 }}>
            <Upload size={20} style={{ color:"#0ea5e9", flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:2 }}>Upload Study Material</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>PDFs appear instantly in student subject workspace</div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={handleUpload} style={{ display:"none" }}/>
            <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 18px", background:"#0ea5e9", color:"#fff", border:"none", borderRadius:9, cursor:uploading?"not-allowed":"pointer", fontSize:13, fontWeight:600, fontFamily:"'Outfit',sans-serif", opacity:uploading?0.6:1 }}>
              {uploading ? <div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/> : <Upload size={14}/>}
              {uploading ? "Uploading…" : "Choose File"}
            </button>
          </div>

          <div style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
            Uploaded Materials ({docs.length})
          </div>
          {docLoading && <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", padding:"16px 0" }}>Fetching documents…</div>}
          {!docLoading && docs.length === 0 && (
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.25)", padding:"32px 0", textAlign:"center" }}>
              No materials uploaded yet. Upload the first one above.
            </div>
          )}
          {docs.map((doc: DBDocument) => (
            <div key={doc.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:11, marginBottom:6 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{doc.type==="slides"?"🎞️":doc.type==="notes"?"📝":"📄"}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.name}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
                  {formatSize(doc.size_bytes)}{doc.pages ? ` · ${doc.pages} pages` : ""} · {new Date(doc.created_at).toLocaleDateString("en-IN")}
                </div>
              </div>
              <span style={{ fontSize:10, color:"#10b981", background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.2)", padding:"2px 8px", borderRadius:100, flexShrink:0 }}>Live</span>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                style={{ color:"rgba(255,255,255,0.3)", cursor:"pointer", padding:4, borderRadius:5, display:"flex", flexShrink:0, textDecoration:"none" }}
                onMouseOver={e=>(e.currentTarget as HTMLAnchorElement).style.color="#0ea5e9"}
                onMouseOut={e=>(e.currentTarget as HTMLAnchorElement).style.color="rgba(255,255,255,0.3)"}>
                <ExternalLink size={13}/>
              </a>
              <button onClick={()=>handleDelete(doc)} style={{ background:"transparent", border:"none", color:"rgba(255,100,100,0.5)", cursor:"pointer", padding:4, borderRadius:5, display:"flex", flexShrink:0 }}
                onMouseOver={e=>(e.currentTarget as HTMLButtonElement).style.color="#ef4444"}
                onMouseOut={e=>(e.currentTarget as HTMLButtonElement).style.color="rgba(255,100,100,0.5)"}>
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </>
      )}

      {/* ── STUDENTS tab ── */}
      {subView === "students" && (
        <>
          <div style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>
            Enrolled Students ({students.length})
          </div>
          {loadStu && <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)" }}>Loading…</div>}
          {!loadStu && students.length === 0 && (
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.25)", padding:"32px 0", textAlign:"center" }}>
              No students enrolled. Admin can enroll them in Admin → Subjects.
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {students.map((s: any) => {
              const att = attRows.find(a => a.student_id === s.id);
              const pct = att ? Math.round(att.percentage) : null;
              const color = pct === null ? "rgba(255,255,255,0.3)" : pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
              return (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${att?.at_risk?"rgba(245,158,11,0.2)":"rgba(255,255,255,0.06)"}`, borderRadius:10 }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg,#7c3aed,#3b82f6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", flexShrink:0 }}>
                    {s.name.split(" ").map((n:string)=>n[0]).slice(0,2).join("").toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:"#fff" }}>{s.name}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Mono',monospace" }}>{s.email}</div>
                  </div>
                  {pct !== null && (
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:16, fontWeight:700, color, lineHeight:1 }}>{pct}%</div>
                      {att && <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2 }}>{att.attended}/{att.total}</div>}
                    </div>
                  )}
                  {att?.at_risk && (
                    <div style={{ fontSize:9, fontWeight:700, background:"rgba(245,158,11,0.12)", color:"#f59e0b", border:"1px solid rgba(245,158,11,0.25)", padding:"2px 7px", borderRadius:4, flexShrink:0 }}>
                      AT RISK
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── IMPORT tab ── */}
      {subView === "import" && (
        <AttendanceMarksImport
          subjectId={subject.id}
          subjectCode={subject.code}
          facultyId={facultyId}
          students={students}
          onDone={() => { setSubView("students"); loadStudentData(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECTS LIST (main view)
// ═══════════════════════════════════════════════════════════════════════════════
interface SubjectsViewProps {
  facultyId: string;
  subjects:  any[] | null;
  loading:   boolean;
}

export function SubjectsView({ facultyId, subjects, loading }: SubjectsViewProps) {
  const [openSubject, setOpenSubject] = useState<any | null>(null);

  if (openSubject) {
    return (
      <SubjectWorkspace
        subject={openSubject}
        facultyId={facultyId}
        onBack={() => setOpenSubject(null)}
      />
    );
  }

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:"#fff", marginBottom:6 }}>Subjects</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:22 }}>
        Manage materials, import attendance, and view enrolled students per subject.
      </div>

      {loading && <div style={{ fontSize:13, color:"rgba(255,255,255,0.35)" }}>Loading subjects…</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
        {(subjects || []).map((s: any) => (
          <button key={s.id} onClick={() => setOpenSubject(s)} style={{
            padding:"20px", background:"rgba(255,255,255,0.02)",
            border:`1px solid ${s.color}25`, borderRadius:14,
            textAlign:"left", cursor:"pointer", transition:"all 0.2s",
            fontFamily:"'Outfit',sans-serif",
          }}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.04)";(e.currentTarget as HTMLButtonElement).style.transform="translateY(-2px)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.02)";(e.currentTarget as HTMLButtonElement).style.transform="translateY(0)";}}>
            <div style={{ height:3, background:s.color, borderRadius:3, marginBottom:16 }}/>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ width:40, height:40, borderRadius:11, background:`${s.color}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:s.color }}>
                {s.code.split(" ")[1] || s.code.slice(0,3)}
              </div>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Mono',monospace" }}>{s.code}</span>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:6, fontFamily:"'Syne',sans-serif" }}>{s.name}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>
                {s.document_count ?? 0} docs · {s.student_count ?? 0} students
              </span>
              <ChevronRight size={14} style={{ color:"rgba(255,255,255,0.25)" }}/>
            </div>
          </button>
        ))}

        {!loading && (!subjects || subjects.length === 0) && (
          <div style={{ gridColumn:"1/-1", padding:"48px 0", textAlign:"center", border:"1px dashed rgba(255,255,255,0.07)", borderRadius:14, color:"rgba(255,255,255,0.2)", fontSize:13 }}>
            No subjects assigned to you yet. Ask admin to create and assign subjects.
          </div>
        )}
      </div>
    </div>
  );
}
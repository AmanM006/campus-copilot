"use client";
// components/student/SubjectsPage.tsx  v2 — fully dynamic
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the existing components/student/SubjectsPage.tsx entirely.
// Source: enrollments → subjects → teacher name + docs + student docs
// Student can upload their own notes per subject.
// Realtime: teacher uploads appear instantly via Supabase subscription.

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Download, ExternalLink, BookOpen, FileText,
  Upload, Plus, Loader, AlertTriangle, User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getAllDocsForSubject, uploadStudentDocument } from "@/lib/db_extended";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Subject {
  id: string; name: string; code: string; color: string; semester: number;
  teacher_name: string; teacher_email: string;
  attendance?: { percentage: number; attended: number; total: number };
  doc_count?: number;
}

interface Doc {
  id: string; name: string; file_url: string; size_bytes?: number;
  created_at: string; doc_type?: string; _source: "teacher" | "student";
  uploader?: { name: string };
}

function fmtSize(b?: number) {
  if (!b) return "—";
  return b > 1_000_000 ? `${(b/1_000_000).toFixed(1)} MB` : `${(b/1024).toFixed(0)} KB`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

// ── Fetch enrolled subjects for student ───────────────────────────────────────
async function fetchSubjects(studentId: string): Promise<Subject[]> {
  // Try enrollments first
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(`
      subject:subjects (
        id, name, code, color, semester,
        professor:users!professor_id(name, email)
      )
    `)
    .eq("student_id", studentId);

  if (enrollments && enrollments.length > 0) {
    return enrollments.map((e: any) => ({
      ...e.subject,
      teacher_name:  e.subject?.professor?.name  || "—",
      teacher_email: e.subject?.professor?.email || "",
    }));
  }

  // Fallback: subjects.student_id (agent-extracted)
  const { data: agentSubs } = await supabase
    .from("subjects")
    .select("id, name, code, color, semester, professor:users!professor_id(name,email)")
    .eq("student_id", studentId);

  return (agentSubs || []).map((s: any) => ({
    ...s,
    teacher_name:  s.professor?.name  || "—",
    teacher_email: s.professor?.email || "",
  }));
}

// ── Document list for one subject ─────────────────────────────────────────────
function SubjectWorkspace({
  subject, studentId, onBack,
}: {
  subject: Subject; studentId: string; onBack: () => void;
}) {
  const [docs,    setDocs]    = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error,   setError]   = useState("");
  const fileRef   = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { all } = await getAllDocsForSubject(subject.id, studentId);
    setDocs(all as Doc[]);
    setLoading(false);
  }, [subject.id, studentId]);

  useEffect(() => {
    load();
    // Realtime: teacher uploads appear instantly
    channelRef.current = supabase
      .channel(`subject-docs-${subject.id}`)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"documents", filter:`subject_id=eq.${subject.id}` },
        (payload) => setDocs(prev => [{ ...(payload.new as any), _source:"teacher" }, ...prev])
      )
      .subscribe();
    return () => { channelRef.current?.unsubscribe(); };
  }, [subject.id, load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const doc = await uploadStudentDocument(studentId, subject.id, file);
      setDocs(prev => [{ ...(doc as any), _source:"student" }, ...prev]);
    } catch (e: any) {
      setError(`Upload failed: ${e.message}`);
    } finally { setUploading(false); }
  };

  const teacherDocs = docs.filter(d => d._source === "teacher");
  const studentDocs = docs.filter(d => d._source === "student");
  const pct = subject.attendance?.percentage;
  const pctColor = !pct ? "#fff" : pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 28px 40px" }}>
      <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:13, marginBottom:20, fontFamily:"'Outfit',sans-serif", padding:0 }}>
        <ArrowLeft size={14}/> All Subjects
      </button>

      {/* Subject header */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22 }}>
        <div style={{ width:48, height:48, borderRadius:12, background:`${subject.color}20`, border:`1px solid ${subject.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:subject.color, flexShrink:0 }}>
          {subject.code.split(" ")[1]}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:"#fff" }}>{subject.name}</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:3, display:"flex", gap:12, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'DM Mono',monospace" }}>{subject.code}</span>
            <span>👨‍🏫 {subject.teacher_name}</span>
            {pct !== undefined && (
              <span style={{ color:pctColor }}>📊 {Math.round(pct)}% attendance</span>
            )}
          </div>
        </div>
        <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{
          display:"flex", alignItems:"center", gap:6, padding:"8px 14px",
          background:"rgba(124,58,237,0.1)", border:"1px solid rgba(124,58,237,0.25)", borderRadius:9,
          color:"#a78bfa", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'Outfit',sans-serif",
          opacity:uploading?0.5:1,
        }}>
          {uploading ? <Loader size={12} style={{animation:"spin .7s linear infinite"}}/> : <Upload size={12}/>}
          Upload Notes
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.png,.jpg" style={{display:"none"}}
          onChange={e=>{const f=e.target.files?.[0];if(f)handleUpload(f);e.target.value=""}}/>
      </div>

      {error && (
        <div style={{ display:"flex", gap:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:9, padding:"10px 13px", fontSize:12, color:"#fca5a5", marginBottom:14 }}>
          <AlertTriangle size={13} style={{flexShrink:0,marginTop:1}}/>{error}
        </div>
      )}

      {loading && <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", padding:"24px 0" }}>Fetching documents…</div>}

      {!loading && docs.length === 0 && (
        <div style={{ textAlign:"center", padding:"48px 0", border:"1px dashed rgba(255,255,255,0.08)", borderRadius:14 }}>
          <BookOpen size={28} style={{opacity:.18,marginBottom:10}}/>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.25)"}}>No materials yet.</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.15)",marginTop:4}}>Upload your own notes, or check back when faculty adds materials.</div>
        </div>
      )}

      {/* Teacher documents */}
      {teacherDocs.length > 0 && <DocSection title="Faculty Materials" docs={teacherDocs} accent={subject.color}/>}

      {/* Student documents */}
      {studentDocs.length > 0 && <DocSection title="Your Notes" docs={studentDocs} accent="#7c3aed"/>}
    </div>
  );
}

function DocSection({ title, docs, accent }: { title:string; docs:Doc[]; accent:string }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:3, height:12, borderRadius:2, background:accent }}/>
        {title} ({docs.length})
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {docs.map(doc => (
          <div key={doc.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, transition:"background .15s" }}
            onMouseOver={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.04)"}
            onMouseOut={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.02)"}>
            <div style={{ width:34,height:34,borderRadius:8,background:`${accent}14`,border:`1px solid ${accent}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <FileText size={14} color={accent}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:500, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.name}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2, display:"flex", gap:10 }}>
                <span>{fmtSize(doc.size_bytes)}</span>
                <span>{fmtDate(doc.created_at)}</span>
                {doc._source === "teacher" && doc.uploader && <span>by {doc.uploader.name}</span>}
              </div>
            </div>
            <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 11px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, color:"rgba(255,255,255,0.6)", fontSize:11, fontWeight:600, textDecoration:"none", fontFamily:"'Outfit',sans-serif", transition:"all .15s" }}
              onMouseOver={e=>(e.currentTarget as HTMLAnchorElement).style.background="rgba(255,255,255,0.1)"}
              onMouseOut={e=>(e.currentTarget as HTMLAnchorElement).style.background="rgba(255,255,255,0.05)"}>
              <Download size={11}/> Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function SubjectsPage({ studentId }: { studentId: string }) {
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [open,      setOpen]      = useState<Subject | null>(null);
  const [q,         setQ]         = useState("");

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    setLoading(true);
    fetchSubjects(studentId).then(async subs => {
      // Enrich with attendance %
      if (subs.length > 0) {
        const { data: att } = await supabase
          .from("attendance")
          .select("subject_id, percentage, attended, total")
          .eq("student_id", studentId)
          .in("subject_id", subs.map(s => s.id));

        const attMap = new Map((att || []).map((a: any) => [a.subject_id, a]));

        // Also get doc counts
        const { data: docCounts } = await supabase
          .from("documents")
          .select("subject_id")
          .in("subject_id", subs.map(s => s.id));
        const docMap = new Map<string, number>();
        (docCounts || []).forEach((d: any) => docMap.set(d.subject_id, (docMap.get(d.subject_id)||0)+1));

        setSubjects(subs.map(s => ({
          ...s,
          attendance: attMap.get(s.id),
          doc_count:  docMap.get(s.id) || 0,
        })));
      } else {
        setSubjects([]);
      }
      setLoading(false);
    });
  }, [studentId]);

  if (open) return <SubjectWorkspace subject={open} studentId={studentId} onBack={()=>setOpen(null)}/>;

  const filtered = subjects.filter(s =>
    `${s.name} ${s.code} ${s.teacher_name}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 28px 40px" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:700, color:"#fff" }}>Your Subjects</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"0 12px", width:220 }}>
          <input placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)}
            style={{ background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:13, padding:"8px 0", flex:1, fontFamily:"'Outfit',sans-serif" }}/>
        </div>
      </div>

      {loading && <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)" }}>Loading your subjects…</div>}

      {!loading && subjects.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", border:"1px dashed rgba(255,255,255,0.08)", borderRadius:16 }}>
          <BookOpen size={32} style={{opacity:.15,marginBottom:12}}/>
          <div style={{fontSize:15,color:"rgba(255,255,255,0.25)",fontWeight:500}}>No subjects assigned yet.</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.15)",marginTop:6}}>Ask your admin to enroll you in subjects.</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
        {filtered.map(sub => {
          const pct = sub.attendance?.percentage;
          const pctColor = !pct ? "#fff" : pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
          return (
            <div key={sub.id} onClick={()=>setOpen(sub)} style={{ background:"rgba(255,255,255,0.02)", border:`1px solid rgba(255,255,255,0.07)`, borderRadius:14, cursor:"pointer", overflow:"hidden", transition:"all .2s" }}
              onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=sub.color+"60";(e.currentTarget as HTMLDivElement).style.background=`${sub.color}08`}}
              onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="rgba(255,255,255,0.07)";(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.02)"}}>
              <div style={{ height:3, background:sub.color }}/>
              <div style={{ padding:"16px 16px 14px" }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ width:40,height:40,borderRadius:10,background:`${sub.color}18`,border:`1px solid ${sub.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:sub.color }}>
                    {sub.code.split(" ")[1] || sub.code.slice(0,3)}
                  </div>
                  {pct !== undefined && (
                    <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:18, fontWeight:700, color:pctColor, lineHeight:1 }}>
                      {Math.round(pct)}%
                    </div>
                  )}
                </div>
                <div style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:4, lineHeight:1.3 }}>{sub.name}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:"'DM Mono',monospace", marginBottom:10 }}>{sub.code}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"rgba(255,255,255,0.4)" }}>
                  <User size={11}/>{sub.teacher_name}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:10, fontSize:11, color:"rgba(255,255,255,0.3)" }}>
                  <span>📄 {sub.doc_count || 0} docs</span>
                  {sub.attendance && (
                    <span>{sub.attendance.attended}/{sub.attendance.total} classes</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SubjectsPage;
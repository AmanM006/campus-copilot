"use client";
// components/admin/SubjectManagementView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full subject CRUD: create, assign teacher, enroll students, view roster.
// Drop into admin/page.tsx: replace the placeholder "Subject Management" block.
// Usage: {view === "subjects" && <SubjectManagementView />}

import React, { useState, useEffect, useCallback } from "react";
import { Plus, BookOpen, Users, UserCheck, Trash2, Check, ChevronDown, X, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createSubjectWithTeacher, assignTeacherToSubject, enrollStudents, unenrollStudent, getAllSubjectsAdmin, getStudentsInSubject } from "@/lib/db_extended";

// ── shared admin CSS variables (assumed already loaded in admin/page.tsx) ──────
const C = {
  bg0: "var(--bg,#09090f)", bg1: "var(--bg1,#0d0e18)", bg2: "var(--bg2,#11131f)",
  border: "var(--border,rgba(255,255,255,0.07))",
  text: "var(--text,#e2e8f0)", text2: "rgba(255,255,255,0.45)", text3: "rgba(255,255,255,0.25)",
  blue: "#3b82f6", green: "#10b981", red: "#ef4444", amber: "#f59e0b",
  mono: "'JetBrains Mono',monospace", font: "'Geist',system-ui,sans-serif",
};

type Subject = {
  id: string; name: string; code: string; semester: number; color: string;
  teacher_name: string; teacher_email: string; student_count: number; document_count: number;
  professor_id: string;
};
type UserRow = { id: string; email: string; name: string; role: string };

function Tag({ label, color }: { label: string; color: string }) {
  return <span style={{ padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:700, background:`${color}14`, color, border:`1px solid ${color}25`, fontFamily:C.mono }}>{label}</span>;
}

function notify(msg: string, ok = true) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position:"fixed", top:"16px", right:"16px", zIndex:"9999",
    padding:"10px 16px", borderRadius:"8px",
    background: ok ? "#166534" : "#991b1b",
    color:"#fff", fontSize:"13px", fontWeight:"500",
    boxShadow:"0 4px 20px rgba(0,0,0,.5)", animation:"none",
    maxWidth:"300px",
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function SubjectManagementView() {
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [teachers,  setTeachers]  = useState<UserRow[]>([]);
  const [students,  setStudents]  = useState<UserRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [view,      setView]      = useState<"list"|"create"|"enroll"|"roster">("list");
  const [selected,  setSelected]  = useState<Subject | null>(null);
  const [roster,    setRoster]    = useState<any[]>([]);
  const [q,         setQ]         = useState("");

  // Create form
  const [form, setForm] = useState({ name:"", code:"", semester:"4", teacherId:"", color:"#7c3aed" });
  const [busy,  setBusy]  = useState(false);

  // Enroll form
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [subs, faculty, stus] = await Promise.all([
      getAllSubjectsAdmin(),
      supabase.from("users").select("id,email,name,role").eq("role","faculty").order("name"),
      supabase.from("users").select("id,email,name,role").eq("role","student").order("name"),
    ]);
    setSubjects(subs);
    setTeachers(faculty.data || []);
    setStudents(stus.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRoster = async (sub: Subject) => {
    const rows = await getStudentsInSubject(sub.id);
    setRoster(rows);
    setSelected(sub);
    setView("roster");
  };

  const openEnroll = (sub: Subject) => {
    setSelected(sub);
    setSelectedStudents(new Set());
    setView("enroll");
  };

  // ── Create subject ─────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code || !form.teacherId) { notify("Fill all fields", false); return; }
    setBusy(true);
    try {
      await createSubjectWithTeacher({
        name:      form.name,
        code:      form.code,
        semester:  parseInt(form.semester),
        teacherId: form.teacherId,
        color:     form.color,
      });
      notify(`Subject "${form.code}" created`);
      setForm({ name:"", code:"", semester:"4", teacherId:"", color:"#7c3aed" });
      setView("list");
      load();
    } catch (err: any) {
      notify(`Error: ${err.message}`, false);
    } finally { setBusy(false); }
  };

  // ── Enroll students ────────────────────────────────────────────────────────
  const handleEnroll = async () => {
    if (!selected || selectedStudents.size === 0) return;
    setBusy(true);
    try {
      const count = await enrollStudents(selected.id, [...selectedStudents]);
      notify(`${count} students enrolled in ${selected.code}`);
      setView("list");
      load();
    } catch (err: any) {
      notify(`Error: ${err.message}`, false);
    } finally { setBusy(false); }
  };

  // ── Delete subject ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete subject ${code}? This removes all enrollments.`)) return;
    await supabase.from("subjects").delete().eq("id", id);
    notify(`${code} deleted`);
    load();
  };

  const filtered = subjects.filter(s =>
    `${s.name} ${s.code} ${s.teacher_name}`.toLowerCase().includes(q.toLowerCase())
  );

  const fieldStyle: React.CSSProperties = {
    background: C.bg2, border:`1px solid ${C.border}`, borderRadius:8,
    padding:"9px 12px", color:C.text, fontSize:13, fontFamily:C.font, outline:"none", width:"100%",
  };

  if (view === "create") return (
    <div style={{ maxWidth:560 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22 }}>
        <button onClick={()=>setView("list")} style={{ background:"transparent", border:"none", color:C.text2, cursor:"pointer", fontSize:22, lineHeight:1 }}>←</button>
        <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Create Subject</div>
      </div>
      <form onSubmit={handleCreate} style={{ display:"flex", flexDirection:"column", gap:13 }}>
        {[
          { label:"Subject Name",   key:"name",    placeholder:"Introduction to AI" },
          { label:"Subject Code",   key:"code",    placeholder:"CSS 2203" },
          { label:"Semester",       key:"semester",placeholder:"4" },
        ].map(f => (
          <div key={f.key}>
            <div style={{ fontSize:11, fontWeight:600, color:C.text3, textTransform:"uppercase", letterSpacing:".07em", marginBottom:5 }}>{f.label}</div>
            <input value={(form as any)[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
              placeholder={f.placeholder} style={fieldStyle} required />
          </div>
        ))}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:C.text3, textTransform:"uppercase", letterSpacing:".07em", marginBottom:5 }}>Assign Teacher</div>
          <select value={form.teacherId} onChange={e=>setForm(p=>({...p,teacherId:e.target.value}))} style={fieldStyle} required>
            <option value="">— Select faculty —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
          </select>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ fontSize:11, fontWeight:600, color:C.text3, textTransform:"uppercase", letterSpacing:".07em" }}>Colour</div>
          <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))}
            style={{ width:36, height:30, border:"none", background:"transparent", cursor:"pointer" }}/>
          <div style={{ width:22, height:22, borderRadius:6, background:form.color }}/>
        </div>
        <button type="submit" disabled={busy} style={{
          marginTop:4, padding:"11px 20px", background:C.blue, border:"none", borderRadius:8,
          color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:C.font,
          opacity:busy?0.5:1,
        }}>
          {busy ? "Creating…" : "Create Subject"}
        </button>
      </form>
    </div>
  );

  if (view === "enroll" && selected) {
    const alreadyEnrolled = new Set(roster.map((r:any)=>r.id));
    const available = students.filter(s => !alreadyEnrolled.has(s.id));
    return (
      <div style={{ maxWidth:600 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={()=>setView("list")} style={{ background:"transparent", border:"none", color:C.text2, cursor:"pointer", fontSize:22 }}>←</button>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Enroll Students → {selected.code}</div>
            <div style={{ fontSize:11, color:C.text3 }}>{selectedStudents.size} selected</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"0 12px" }}>
          <Search size={13} color={C.text3}/>
          <input placeholder="Search students…" value={q} onChange={e=>setQ(e.target.value)}
            style={{ background:"transparent", border:"none", outline:"none", color:C.text, fontSize:13, padding:"9px 0", flex:1, fontFamily:C.font }}/>
        </div>
        <div style={{ maxHeight:360, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:9, overflow:"hidden" }}>
          {available.filter(s=>`${s.name} ${s.email}`.toLowerCase().includes(q.toLowerCase())).map((s,i)=>(
            <div key={s.id} onClick={()=>setSelectedStudents(p=>{const n=new Set(p); n.has(s.id)?n.delete(s.id):n.add(s.id); return n;})}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", cursor:"pointer",
                background: selectedStudents.has(s.id)?"rgba(59,130,246,0.08)":"transparent",
                borderBottom: i<available.length-1?`1px solid ${C.border}`:"none",
              }}>
              <div style={{ width:18, height:18, borderRadius:4, border:`1.5px solid ${selectedStudents.has(s.id)?C.blue:C.border}`, background:selectedStudents.has(s.id)?C.blue:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {selectedStudents.has(s.id) && <Check size={11} color="#fff"/>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{s.name}</div>
                <div style={{ fontSize:10, color:C.text3, fontFamily:C.mono }}>{s.email}</div>
              </div>
            </div>
          ))}
          {available.length === 0 && <div style={{ padding:24, textAlign:"center", fontSize:13, color:C.text3 }}>All students already enrolled</div>}
        </div>
        <button disabled={selectedStudents.size===0||busy} onClick={handleEnroll}
          style={{ marginTop:12, padding:"10px 20px", background:C.green, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:C.font, opacity:selectedStudents.size===0?0.4:1 }}>
          {busy ? "Enrolling…" : `Enroll ${selectedStudents.size} Student${selectedStudents.size!==1?"s":""}`}
        </button>
      </div>
    );
  }

  if (view === "roster" && selected) return (
    <div style={{ maxWidth:640 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={()=>setView("list")} style={{ background:"transparent", border:"none", color:C.text2, cursor:"pointer", fontSize:22 }}>←</button>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{selected.code} — Student Roster</div>
          <div style={{ fontSize:11, color:C.text3 }}>{roster.length} enrolled · Teacher: {selected.teacher_name}</div>
        </div>
      </div>
      <div style={{ border:`1px solid ${C.border}`, borderRadius:9, overflow:"hidden" }}>
        {roster.length === 0 && <div style={{ padding:28, textAlign:"center", fontSize:13, color:C.text3 }}>No students enrolled yet</div>}
        {roster.map((s:any,i:number)=>(
          <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderBottom:i<roster.length-1?`1px solid ${C.border}`:"none", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
            <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#7c3aed,#3b82f6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", flexShrink:0 }}>
              {s.name.split(" ").map((n:string)=>n[0]).slice(0,2).join("").toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{s.name}</div>
              <div style={{ fontSize:10, color:C.text3, fontFamily:C.mono }}>{s.email}</div>
            </div>
            <button onClick={()=>unenrollStudent(selected.id,s.id).then(()=>{ setRoster(p=>p.filter(r=>r.id!==s.id)); load(); })}
              style={{ background:"transparent", border:`1px solid transparent`, borderRadius:6, padding:"4px 6px", cursor:"pointer", color:C.text3, transition:"all .12s" }}
              onMouseOver={e=>{(e.currentTarget).style.color=C.red;(e.currentTarget).style.borderColor="rgba(239,68,68,.2)"}}
              onMouseOut={e=>{(e.currentTarget).style.color=C.text3;(e.currentTarget).style.borderColor="transparent"}}>
              <Trash2 size={12}/>
            </button>
          </div>
        ))}
      </div>
      <button onClick={()=>openEnroll(selected)} style={{ marginTop:10, display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:`rgba(59,130,246,.1)`, border:`1px solid rgba(59,130,246,.25)`, borderRadius:8, color:C.blue, fontSize:12, cursor:"pointer", fontFamily:C.font }}>
        <Plus size={12}/> Add More Students
      </button>
    </div>
  );

  // ── Main list ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", gap:8, alignItems:"center", background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"0 12px", width:240 }}>
          <Search size={13} color={C.text3}/>
          <input placeholder="Search subjects…" value={q} onChange={e=>setQ(e.target.value)}
            style={{ background:"transparent", border:"none", outline:"none", color:C.text, fontSize:12, padding:"8px 0", flex:1, fontFamily:C.font }}/>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={load} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 12px", background:C.bg2, border:`1px solid ${C.border}`, borderRadius:7, color:C.text2, fontSize:12, cursor:"pointer", fontFamily:C.font }}>
            <RefreshCw size={12}/> Refresh
          </button>
          <button onClick={()=>setView("create")} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:C.blue, border:"none", borderRadius:7, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:C.font }}>
            <Plus size={12}/> New Subject
          </button>
        </div>
      </div>

      {loading && <div style={{ fontSize:13, color:C.text3, padding:"20px 0" }}>Loading subjects…</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
        {filtered.map(sub => (
          <div key={sub.id} style={{ background:C.bg1, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
            <div style={{ height:4, background:sub.color }}/>
            <div style={{ padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:2 }}>{sub.name}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <Tag label={sub.code} color={sub.color}/>
                    <Tag label={`Sem ${sub.semester}`} color={C.text2.replace("0.45","0.15").replace("rgba","rgba")}/>
                  </div>
                </div>
                <button onClick={()=>handleDelete(sub.id,sub.code)}
                  style={{ background:"transparent", border:"none", color:C.text3, cursor:"pointer", padding:4 }}
                  onMouseOver={e=>(e.currentTarget).style.color=C.red}
                  onMouseOut={e=>(e.currentTarget).style.color=C.text3}>
                  <Trash2 size={13}/>
                </button>
              </div>
              <div style={{ fontSize:12, color:C.text2, marginBottom:12, display:"flex", flexDirection:"column", gap:4 }}>
                <div>👨‍🏫 {sub.teacher_name || <span style={{color:C.text3}}>No teacher assigned</span>}</div>
                <div style={{ display:"flex", gap:12 }}>
                  <span>👥 {sub.student_count} students</span>
                  <span>📄 {sub.document_count} docs</span>
                </div>
              </div>
              <div style={{ display:"flex", gap:7 }}>
                <button onClick={()=>loadRoster(sub)} style={{ flex:1, padding:"7px 0", background:`rgba(59,130,246,.08)`, border:`1px solid rgba(59,130,246,.2)`, borderRadius:7, color:C.blue, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:C.font, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <Users size={11}/> Roster
                </button>
                <button onClick={()=>{ loadRoster(sub).then(()=>openEnroll(sub)); }} style={{ flex:1, padding:"7px 0", background:`rgba(16,185,129,.08)`, border:`1px solid rgba(16,185,129,.2)`, borderRadius:7, color:C.green, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:C.font, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                  <UserCheck size={11}/> Enroll
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ gridColumn:"1/-1", padding:40, textAlign:"center", background:C.bg1, border:`1px solid ${C.border}`, borderRadius:12, color:C.text3, fontSize:13 }}>
            <BookOpen size={28} style={{ opacity:.2, marginBottom:10 }}/><br/>
            No subjects yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
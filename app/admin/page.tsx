"use client";
// app/admin/page.tsx
// ─── Enterprise Admin Control Panel ──────────────────────────────────────────
// Aesthetic: hyper-refined dark enterprise — think Linear meets Vercel meets Railway.
// Font: "Instrument Sans" (display authority) + "JetBrains Mono" (data/code).
// Palette: #0a0a0f base, electric blue accent (#3b82f6), zero purple.
// This is SYSTEM ADMIN territory — dense, data-first, power-user facing.

import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, BookOpen, FileText, BarChart2, Cpu, Users, FlaskConical,
  Plug, Settings, RefreshCw, Upload, Trash2, ChevronRight, Check, X,
  AlertTriangle, CheckCircle, Database, Globe, Plus, Search,
  ArrowUpRight, Shield, Zap, LogOut, Server,
  HardDrive, ExternalLink
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSession, clearSession } from "@/lib/auth";
import { SubjectManagementView } from "@/components/admin/SubjectManagementView";

// ── Nav definition ─────────────────────────────────────────────────────────────
type View = "overview"|"subjects"|"documents"|"attendance"|"workflows"|"users"|"enrollments"|"lab"|"integrations"|"settings";

const NAV: {id:View; label:string; icon:React.ElementType; group:"platform"|"academic"|"intelligence"}[] = [
  {id:"overview",     label:"Overview",      icon:LayoutDashboard, group:"platform"},
  {id:"users",        label:"User Registry", icon:Users,           group:"platform"},
  {id:"integrations", label:"Integrations",  icon:Plug,            group:"platform"},
  {id:"settings",     label:"Settings",      icon:Settings,        group:"platform"},
  {id:"subjects",     label:"Subjects",      icon:BookOpen,        group:"academic"},
  {id:"enrollments",  label:"Class Roster",  icon:Users,           group:"academic"},
  {id:"documents",    label:"Documents",     icon:FileText,        group:"academic"},
  {id:"attendance",   label:"Attendance",    icon:BarChart2,       group:"academic"},
  {id:"lab",          label:"Lab Requests",  icon:FlaskConical,    group:"academic"},
  {id:"workflows",    label:"AI Workflows",  icon:Cpu,             group:"intelligence"},
];

const G_LABEL: Record<string,string> = { platform:"Platform", academic:"Academic", intelligence:"Intelligence" };

// ── Shared primitives ──────────────────────────────────────────────────────────

const PageHeader = ({ title, sub }: { title:string; sub:string }) => (
  <div style={{ marginBottom:22 }}>
    <div style={{ fontSize:20, fontWeight:700, color:"var(--text)", letterSpacing:"-0.02em", marginBottom:4 }}>{title}</div>
    <div style={{ fontSize:13, color:"rgba(255,255,255,.3)" }}>{sub}</div>
  </div>
);

const Toast = ({ msg }: { msg:string }) => (
  <div style={{
    position:"fixed", top:18, right:18, zIndex:9999,
    background: msg.startsWith("Error") || msg.includes("⚠️") ? "#dc2626" : "#16a34a",
    color:"#fff", padding:"10px 16px", borderRadius:8,
    fontSize:13, fontWeight:500, boxShadow:"0 4px 20px rgba(0,0,0,.5)",
    animation:"fadeUp .2s ease",
  }}>{msg}</div>
);

const Save = ({ size }: { size:number }) => <HardDrive size={size} />;
const Building = ({ size }: { size:number }) => <Server size={size} />;

const Badge = ({ color, children, style }: { color:"green"|"blue"|"amber"|"red"|"gray"; children:React.ReactNode; style?: React.CSSProperties }) => {
  const map = {
    green: "rgba(34,197,94,.12) #4ade80 rgba(34,197,94,.2)",
    blue:  "rgba(59,130,246,.12) #60a5fa rgba(59,130,246,.2)",
    amber: "rgba(245,158,11,.12) #fbbf24 rgba(245,158,11,.2)",
    red:   "rgba(239,68,68,.12) #f87171 rgba(239,68,68,.2)",
    gray:  "rgba(255,255,255,.06) rgba(255,255,255,.4) rgba(255,255,255,.08)",
  };
  const [bg, fg, br] = map[color].split(" ");
  return (
    <span style={{ background:bg, color:fg, border:`1px solid ${br}`, padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase", fontFamily:"var(--mono)", display:"inline-flex", alignItems:"center", gap:4, ...style }}>
      {children}
    </span>
  );
};
// ── Typed icon renderer ───────────────────────────────────────────────────────
function LucideIcon({ icon: Icon, size, color, style }: { 
  icon: React.ElementType; size: number; color?: string; style?: React.CSSProperties 
}) {
  const I = Icon as React.FC<{ size?: number; color?: string; style?: React.CSSProperties }>;
  return <I size={size} color={color} style={style} />;
}

const Btn = ({ variant="primary", children, onClick, disabled, small, icon: Icon }:
  { variant?:"primary"|"secondary"|"ghost"|"danger"; children?:React.ReactNode; onClick?:()=>void; disabled?:boolean; small?:boolean; icon?:React.ElementType }) => {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background:"#3b82f6", border:"1px solid #3b82f6",        color:"#fff"  },
    secondary: { background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", color:"rgba(255,255,255,.75)" },
    ghost:     { background:"transparent", border:"1px solid transparent",  color:"rgba(255,255,255,.45)" },
    danger:    { background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.2)", color:"#f87171" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant],
      display:"inline-flex", alignItems:"center", gap:6,
      padding: small ? "5px 10px" : "8px 14px",
      borderRadius:7, fontSize: small ? 11 : 12, fontWeight:600,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? .5 : 1,
      fontFamily:"var(--font)", transition:"all .15s",
    }}
      onMouseOver={e => { if (!disabled && variant==="primary") (e.currentTarget as HTMLButtonElement).style.background="#2563eb"; }}
      onMouseOut={e  => { if (!disabled && variant==="primary") (e.currentTarget as HTMLButtonElement).style.background="#3b82f6"; }}
    >
{Icon && <LucideIcon icon={Icon} size={12} />}
</button>
  );
};

const Input = ({ label, value, onChange, placeholder, hint, mono, type="text", readOnly, icon: Icon }:
  { label?:string; value:string; onChange?:(v:string)=>void; placeholder?:string; hint?:string; mono?:boolean; type?:string; readOnly?:boolean; icon?:React.ElementType }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    {label && <label style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,.35)", textTransform:"uppercase", letterSpacing:".07em" }}>{label}</label>}
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {Icon && <div style={{ position: "absolute", left: 12, color: "rgba(255,255,255,.25)", display: "flex" }}><LucideIcon icon={Icon} size={14} /></div>}
      <input type={type} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
        readOnly={readOnly}
        className="adm-field"
        style={{ fontFamily: mono ? "var(--mono)" : "var(--font)", fontSize: mono ? 12 : 13, paddingLeft: Icon ? 34 : 12, width: "100%" }} />
    </div>
    {hint && <span style={{ fontSize:11, color:"rgba(255,255,255,.25)", lineHeight:1.5 }}>{hint}</span>}
  </div>
);

// ── TABLE WRAPPER ──────────────────────────────────────────────────────────────
const Table = ({ headers, children, title, actions, count }: {
  headers:string[]; children:React.ReactNode; title?:string; actions?:React.ReactNode; count?:number;
}) => (
  <div className="adm-card">
    {(title || actions) && (
      <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {title && <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{title}</span>}
          {count !== undefined && <Badge color="gray">{count}</Badge>}
        </div>
        {actions}
      </div>
    )}
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>{headers.map(h => (
            <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:10, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", borderBottom:"1px solid var(--border)", background:"rgba(255,255,255,.015)", whiteSpace:"nowrap" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  </div>
);

const TR = ({ cells, onClick }: { cells: React.ReactNode[]; onClick?:()=>void }) => (
  <tr onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}
    onMouseOver={e => { (e.currentTarget as HTMLTableRowElement).style.background="rgba(255,255,255,.02)"; }}
    onMouseOut={e  => { (e.currentTarget as HTMLTableRowElement).style.background="transparent"; }}>
    {cells.map((c, i) => (
      <td key={i} style={{ padding:"11px 16px", fontSize:13, color:"rgba(255,255,255,.7)", borderBottom:"1px solid rgba(255,255,255,.03)", verticalAlign:"middle" }}>
        {c}
      </td>
    ))}
  </tr>
);

const Metric = ({ label, value, sub, accent, Icon }:
  { label:string; value:React.ReactNode; sub?:string; accent?:string; Icon?:React.ElementType }) => (
  <div className="adm-card" style={{ padding:"20px 22px", position:"relative", overflow:"hidden" }}>
    {Icon && <div style={{ position:"absolute", top:18, right:18, opacity:.08 }}><LucideIcon icon={Icon} size={40} color={accent||"#fff"} />
    </div>}
    <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>{label}</div>
    <div style={{ fontSize:28, fontWeight:700, color: accent||"var(--text)", letterSpacing:"-0.03em", fontFamily:"var(--mono)", marginBottom:4 }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:"rgba(255,255,255,.3)" }}>{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewView() {
  const [stats, setStats]  = useState({ students:0, faculty:0, subjects:0, docs:0, workflows:0, integrations:0, pendingLab:0 });
  const [health, setHealth] = useState<{label:string; level:"ok"|"warn"|"err"; detail:string}[]>([]);
  const [busy,   setBusy]   = useState(true);

  useEffect(() => {
    (async () => {
      const [
        { count: students },
        { count: faculty  },
        { count: subjects },
        { count: docs     },
        { count: wf       },
        { count: integ    },
        { count: lab      },
      ] = await Promise.all([
        supabase.from("users").select("*", {count:"exact",head:true}).eq("role","student"),
        supabase.from("users").select("*", {count:"exact",head:true}).in("role",["faculty","admin"]),
        supabase.from("subjects").select("*", {count:"exact",head:true}),
        supabase.from("documents").select("*", {count:"exact",head:true}),
        supabase.from("agent_workflows").select("*", {count:"exact",head:true}),
        supabase.from("integration_sources").select("*", {count:"exact",head:true}),
        supabase.from("lab_requests").select("*", {count:"exact",head:true}).eq("status","pending"),
      ]);

      setStats({
        students:     students     ?? 0,
        faculty:      faculty      ?? 0,
        subjects:     subjects     ?? 0,
        docs:         docs         ?? 0,
        workflows:    wf           ?? 0,
        integrations: integ        ?? 0,
        pendingLab:   lab          ?? 0,
      });

      setHealth([
        { label:"Supabase Realtime",  level:"ok",   detail:"Connected — sync active" },
        { label:"User accounts",      level: (students ?? 0) > 0 ? "ok" : "warn", detail: (students ?? 0) > 0 ? `${students} students registered` : "No students yet" },
        { label:"Portal integrations",level: (integ ?? 0) > 0 ? "ok" : "warn",   detail: (integ ?? 0) > 0 ? `${integ} portals connected` : "Run onboarding to connect a portal" },
        { label:"AI Workflows",       level: (wf ?? 0) > 0 ? "ok" : "warn",      detail: (wf ?? 0) > 0 ? `${wf} workflows taught` : "No workflows configured" },
        { label:"Lab requests",       level: (lab ?? 0) > 0 ? "warn" : "ok",     detail: (lab ?? 0) > 0 ? `${lab} pending approval` : "All requests resolved" },
        { label:"Documents",          level: (docs ?? 0) > 0 ? "ok" : "warn",    detail: (docs ?? 0) > 0 ? `${docs} files uploaded` : "No documents yet" },
      ]);
      setBusy(false);
    })();
  }, []);

  const metrics = [
    { label:"Students",      value: busy ? "…" : stats.students,     sub:"Total registered", accent:"#3b82f6", Icon: Users },
    { label:"Faculty",       value: busy ? "…" : stats.faculty,      sub:"Staff accounts",   accent:"#10b981", Icon: Users },
    { label:"Subjects",      value: busy ? "…" : stats.subjects,     sub:"Active this term", accent:"#8b5cf6", Icon: BookOpen },
    { label:"Documents",     value: busy ? "…" : stats.docs,         sub:"Uploaded files",   accent:"#f59e0b", Icon: FileText },
    { label:"AI Workflows",  value: busy ? "…" : stats.workflows,    sub:"Taught paths",     accent:"#06b6d4", Icon: Cpu },
    { label:"Integrations",  value: busy ? "…" : stats.integrations, sub:"Connected portals",accent:"#ec4899", Icon: Plug },
    { label:"Lab (pending)", value: busy ? "…" : stats.pendingLab,   sub:"Awaiting approval",accent: stats.pendingLab > 0 ? "#f59e0b":"#10b981", Icon: FlaskConical },
  ];

  return (
    <div>
      <PageHeader title="System Overview" sub="Live metrics across the entire college deployment" />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18 }}>
        {metrics.slice(0,4).map((m,i) => <Metric key={i} {...m} />)}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
        {metrics.slice(4).map((m,i) => <Metric key={i} {...m} />)}
      </div>

      {/* System health */}
      <div className="adm-card">
        <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>System Health</span>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }} />
            <span style={{ fontSize:11, color:"#4ade80", fontFamily:"var(--mono)" }}>All systems nominal</span>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
          {health.map((h, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 18px", borderRight: i%2===0 ? "1px solid var(--border)" : "none", borderBottom: i < health.length-2 ? "1px solid var(--border)" : "none" }}>
              <div style={{ width:30, height:30, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, background: h.level==="ok" ? "rgba(34,197,94,.1)" : h.level==="warn" ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)" }}>
                {h.level==="ok"   && <CheckCircle size={13} color="#4ade80" />}
                {h.level==="warn" && <AlertTriangle size={13} color="#fbbf24" />}
                {h.level==="err"  && <X size={13} color="#f87171" />}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{h.label}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", marginTop:1 }}>{h.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: ENROLLMENTS & ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// VIEW: ENROLLMENTS & ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────
function EnrollmentsView() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selSubject, setSelSubject] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Assign inputs
  const [newProfId, setNewProfId] = useState("");
  const [newStudentId, setNewStudentId] = useState("");
  
  // Bulk import state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const loadData = async () => {
    setLoading(true);
    // Fetch all required data in parallel
    // 🚨 FIX: Changed 'subject_enrollments' to 'enrollments' to match your schema
    const [subRes, usrRes, enrRes] = await Promise.all([
      supabase.from("subjects").select("*").order("name"),
      supabase.from("users").select("id, name, email, role").order("name"),
      supabase.from("enrollments").select("*")
    ]);
    
    setSubjects(subRes.data || []);
    setUsers(usrRes.data || []);
    setEnrollments(enrRes.data || []);
    
    // Auto-select first subject if none selected
    if (!selSubject && subRes.data && subRes.data.length > 0) {
      setSelSubject(subRes.data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const assignProfessor = async () => {
    if (!selSubject || !newProfId) return;
    setSaving(true);
    const { error } = await supabase
      .from("subjects")
      .update({ professor_id: newProfId })
      .eq("id", selSubject);
      
    setSaving(false);
    if (error) { notify(`Error: ${error.message}`); return; }
    notify("✓ Professor assigned successfully");
    setNewProfId("");
    loadData();
  };

  const enrollStudent = async () => {
    if (!selSubject || !newStudentId) return;
    setSaving(true);
    
    const existing = enrollments.find(e => e.subject_id === selSubject && e.student_id === newStudentId);
    if (existing) {
      setSaving(false);
      notify("⚠️ Student is already enrolled in this subject.");
      return;
    }

    // 🚨 FIX: Changed 'subject_enrollments' to 'enrollments'
    const { error } = await supabase
      .from("enrollments")
      .insert([{ subject_id: selSubject, student_id: newStudentId }]);
      
    setSaving(false);
    if (error) { notify(`Error: ${error.message}`); return; }
    notify("✓ Student enrolled successfully");
    setNewStudentId("");
    loadData();
  };

  // 🚨 NEW: Bulk Enroll via Pasted CSV / List
  const handleBulkEnroll = async () => {
    if (!selSubject || !bulkText.trim()) return;
    setSaving(true);

    // Split by newlines or commas
    const rawInputs = bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    
    const matchedUserIds: string[] = [];
    const notFound: string[] = [];

    // Match inputs against existing users (can match by email or ID)
    rawInputs.forEach(val => {
      const u = users.find(user => user.id === val || user.email === val);
      if (u) {
        // Prevent adding duplicates
        const alreadyEnrolled = enrollments.some(e => e.subject_id === selSubject && e.student_id === u.id);
        if (!alreadyEnrolled) matchedUserIds.push(u.id);
      } else {
        notFound.push(val);
      }
    });

    if (matchedUserIds.length === 0) {
      notify(`⚠️ No valid unenrolled students found. ${notFound.length} unmatched inputs.`);
      setSaving(false);
      return;
    }

    const inserts = matchedUserIds.map(uid => ({
      subject_id: selSubject,
      student_id: uid
    }));

    // 🚨 FIX: Changed 'subject_enrollments' to 'enrollments'
    const { error } = await supabase.from("enrollments").insert(inserts);

    setSaving(false);
    if (error) { 
      notify(`Error: ${error.message}`); 
    } else {
      notify(`✓ ${matchedUserIds.length} students enrolled! ${notFound.length > 0 ? `(${notFound.length} not found)` : ''}`);
      setBulkText("");
      setShowBulk(false);
      loadData();
    }
  };

  const removeEnrollment = async (studentId: string, studentName: string) => {
    if (!confirm(`Remove ${studentName} from this subject?`)) return;
    // 🚨 FIX: Changed 'subject_enrollments' to 'enrollments'
    await supabase.from("enrollments").delete().eq("subject_id", selSubject).eq("student_id", studentId);
    notify(`${studentName} removed`); 
    loadData();
  };

  // Filter helpers
  const activeSubData = subjects.find(s => s.id === selSubject);
  const enrolledStudentIds = enrollments.filter(e => e.subject_id === selSubject).map(e => e.student_id);
  const enrolledStudents = users.filter(u => enrolledStudentIds.includes(u.id));
  
  const availableProfessors = users.filter(u => u.role === "faculty");
  const availableStudents = users.filter(u => u.role === "student" && !enrolledStudentIds.includes(u.id));

  const darkOptionStyle = { background: "#0e1015", color: "#e2e8f0" };

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <PageHeader title="Class Enrollments" sub="Assign professors to subjects and manage student rosters" />

      {/* Subject Selector */}
      <div className="adm-card" style={{ padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6, display: "block" }}>Select Subject to Manage</label>
            <select 
              value={selSubject} 
              onChange={e => setSelSubject(e.target.value)} 
              className="adm-field" 
              style={{ width: "100%", fontSize: 14, padding: "10px 12px", fontFamily: "var(--font)", background: "rgba(255,255,255,0.03)", colorScheme: "dark" }}
            >
              {subjects.map(s => (
                <option key={s.id} value={s.id} style={darkOptionStyle}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.4)", padding: 20 }}>Loading enrollment data...</div>
      ) : !activeSubData ? (
        <div style={{ color: "rgba(255,255,255,0.4)", padding: 20 }}>Please select a subject.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, alignItems: "start" }}>
          
          {/* LEFT COL: Professor Assignment */}
          <div className="adm-card" style={{ padding: "18px 20px", borderTop: "3px solid #10b981" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Professor Assignment</div>
            
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Current Professor:</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: activeSubData.professor_id ? "#10b981" : "rgba(255,255,255,0.3)" }}>
                {activeSubData.professor_id 
                  ? (users.find(u => u.id === activeSubData.professor_id)?.name || activeSubData.professor_id) 
                  : "Unassigned"}
              </div>
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6, display: "block" }}>Change Professor</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <select 
                value={newProfId} 
                onChange={e => setNewProfId(e.target.value)} 
                className="adm-field" 
                style={{ fontFamily: "var(--font)", fontSize: 13, colorScheme: "dark" }}
              >
                <option value="" style={darkOptionStyle}>-- Select Faculty --</option>
                {availableProfessors.map(p => <option key={p.id} value={p.id} style={darkOptionStyle}>{p.name}</option>)}
              </select>
              <Btn variant="primary" onClick={assignProfessor} disabled={saving || !newProfId}>Assign Professor</Btn>
            </div>
          </div>

          {/* RIGHT COL: Student Roster */}
          <div className="adm-card" style={{ padding: "18px 20px", borderTop: "3px solid #3b82f6" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Student Roster <Badge color="blue" style={{ marginLeft: 8 }}>{enrolledStudents.length}</Badge></div>
              <button onClick={() => setShowBulk(!showBulk)} style={{ background: "transparent", border: "none", color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
                {showBulk ? "Cancel Bulk Import" : "+ Bulk Import"}
              </button>
            </div>

            {/* BULK IMPORT UI */}
            {showBulk ? (
              <div style={{ background: "rgba(59,130,246,.04)", padding: "16px", borderRadius: 8, border: "1px solid rgba(59,130,246,.15)", marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 8 }}>
                  Paste a list of Student IDs or Emails (separated by commas or newlines).
                </div>
                <textarea 
                  value={bulkText} 
                  onChange={e => setBulkText(e.target.value)} 
                  placeholder="e.g. 213CS1001@mit.edu, 213CS1002@mit.edu"
                  className="adm-field" 
                  style={{ height: 100, resize: "vertical", fontFamily: "var(--mono)", fontSize: 12, marginBottom: 12 }} 
                />
                <Btn variant="primary" icon={Database} onClick={handleBulkEnroll} disabled={saving || !bulkText.trim()}>
                  {saving ? "Processing..." : "Process Bulk Enrollment"}
                </Btn>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "rgba(59,130,246,.04)", padding: "12px", borderRadius: 8, border: "1px solid rgba(59,130,246,.15)", alignItems: "center" }}>
                <select 
                  value={newStudentId} 
                  onChange={e => setNewStudentId(e.target.value)} 
                  className="adm-field" 
                  style={{ flex: 1, fontFamily: "var(--font)", fontSize: 13, colorScheme: "dark", margin: 0 }}
                >
                  <option value="" style={darkOptionStyle}>-- Add Single Student to Class --</option>
                  {availableStudents.map(s => <option key={s.id} value={s.id} style={darkOptionStyle}>{s.name} ({s.email})</option>)}
                </select>
                <Btn variant="primary" icon={Plus} onClick={enrollStudent} disabled={saving || !newStudentId}>Add</Btn>
              </div>
            )}

            <div style={{ maxHeight: "400px", overflowY: "auto", paddingRight: 4 }}>
              {enrolledStudents.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No students enrolled.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {enrolledStudents.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{s.name}</div>
                        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{s.email}</div>
                      </div>
                      <Btn variant="ghost" small icon={X} onClick={() => removeEnrollment(s.id, s.name)}></Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: USER REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
function UsersView() {
  const [users,     setUsers]     = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [role,      setRole]      = useState<"all"|"student"|"faculty"|"admin">("all");
  const [q,         setQ]         = useState("");
  const [adding,    setAdding]    = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newEmail,  setNewEmail]  = useState("");
  const [newRole,   setNewRole]   = useState<"student"|"faculty"|"admin">("student");
  const [newDept,   setNewDept]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState("");

  const load = () => {
    setLoading(true);
    supabase.from("users").select("*").order("role").order("name")
      .then(({ data }) => { setUsers(data || []); setLoading(false); });
  };
  useEffect(load, []);

  const notify = (m:string) => { setToast(m); setTimeout(()=>setToast(""),3000); };

  const filtered = users.filter(u =>
    (role==="all" || u.role===role) &&
    `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())
  );

  const counts: Record<string,number> = { all:users.length, student:0, faculty:0, admin:0 };
  users.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; });

  const addUser = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    const id = newEmail.split("@")[0].replace(/[^a-z0-9_-]/gi,"_");
    const { error } = await supabase.from("users").upsert({ id, email:newEmail.toLowerCase(), name:newName, role:newRole, department:newDept||null }, { onConflict:"id" });
    setSaving(false);
    if (error) { notify(`Error: ${error.message}`); return; }
    notify(`✓ ${newName} added as ${newRole}`);
    setAdding(false); setNewName(""); setNewEmail(""); setNewDept("");
    load();
  };

  const deleteUser = async (id:string, name:string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await supabase.from("users").delete().eq("id", id);
    notify(`${name} removed`); load();
  };

  const AVATAR_COLOR: Record<string,string> = { student:"135deg,#7c3aed,#3b82f6", faculty:"135deg,#059669,#10b981", admin:"135deg,#1d4ed8,#3b82f6" };

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <PageHeader title="User Registry" sub="All students, faculty, and administrators in the system" />

      {/* Role tabs */}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
        {(["all","student","faculty","admin"] as const).map(r => (
          <button key={r} onClick={()=>setRole(r)} style={{
            padding:"6px 12px", borderRadius:6, border:"1px solid",
            borderColor: role===r ? "rgba(59,130,246,.4)" : "var(--border)",
            background: role===r ? "rgba(59,130,246,.1)" : "transparent",
            color: role===r ? "#60a5fa" : "rgba(255,255,255,.45)",
            fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"var(--font)",
          }}>
            {r[0].toUpperCase()+r.slice(1)} <span style={{ opacity:.6 }}>({counts[r]||0})</span>
          </button>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto", background:"rgba(255,255,255,.04)", border:"1px solid var(--border)", borderRadius:7, padding:"0 10px", width:220 }}>
          <Search size={13} color="rgba(255,255,255,.25)" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" style={{ background:"transparent", border:"none", outline:"none", color:"var(--text)", fontSize:12, padding:"8px 0", flex:1, fontFamily:"var(--font)" }} />
        </div>
        <Btn variant="primary" icon={Plus} onClick={()=>setAdding(p=>!p)}>Add User</Btn>
      </div>

      {/* Add user form */}
      {adding && (
        <div className="adm-card" style={{ padding:"18px 20px", marginBottom:14, background:"rgba(59,130,246,.04)", borderColor:"rgba(59,130,246,.15)" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:14 }}>New User</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:10, alignItems:"end" }}>
            <Input label="Full name"  value={newName}  onChange={setNewName}  placeholder="Dr. Priya Sharma" />
            <Input label="Email"      value={newEmail} onChange={setNewEmail} placeholder="email@college.edu" type="email" />
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <label style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,.35)", textTransform:"uppercase", letterSpacing:".07em" }}>Role</label>
              <select value={newRole} onChange={e=>setNewRole(e.target.value as any)} className="adm-field" style={{ fontFamily:"var(--font)", fontSize:13 }}>
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Btn variant="primary" icon={Check} onClick={addUser} disabled={saving}>{saving?"Saving…":"Add"}</Btn>
          </div>
        </div>
      )}

      <Table headers={["User","Email","Role","Department","ID","Actions"]} title="All Users" count={filtered.length}>
        {loading ? (
          <TR cells={[<span style={{color:"rgba(255,255,255,.3)"}}>Loading…</span>,"","","","",""]} />
        ) : filtered.length === 0 ? (
          <TR cells={[<span style={{color:"rgba(255,255,255,.3)"}}>No users found</span>,"","","","",""]} />
        ) : filtered.map((u,i) => (
          <TR key={i} cells={[
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:27,height:27,borderRadius:6,background:`linear-gradient(${AVATAR_COLOR[u.role]||AVATAR_COLOR.student})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>
                {(u.name||"?").split(" ").map((n:string)=>n[0]).slice(0,2).join("").toUpperCase()}
              </div>
              <span style={{color:"var(--text)",fontWeight:500}}>{u.name||"—"}</span>
            </div>,
            <span style={{fontFamily:"var(--mono)",fontSize:11}}>{u.email}</span>,
            <Badge color={u.role==="admin"?"blue":u.role==="faculty"?"green":"gray"}>{u.role}</Badge>,
            <span style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>{u.department||u.branch||"—"}</span>,
            <span style={{fontFamily:"var(--mono)",fontSize:10,color:"rgba(255,255,255,.25)"}}>{u.id}</span>,
            <div style={{display:"flex",gap:4}}>
              <Btn variant="ghost" small onClick={()=>deleteUser(u.id,u.name)} icon={Trash2}></Btn>
            </div>,
          ]} />
        ))}
      </Table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────
function DocumentsView({ adminId }: { adminId:string }) {
  const [subjects, setSubjects]  = useState<any[]>([]);
  const [subId,    setSubId]     = useState<string|null>(null);
  const [docs,     setDocs]      = useState<any[]>([]);
  const [loadDocs, setLoadDocs]  = useState(false);
  const [drag,     setDrag]      = useState(false);
  const [uploading,setUploading] = useState(false);
  const [toast,    setToast]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (m:string) => { setToast(m); setTimeout(()=>setToast(""),3000); };

  useEffect(() => {
    supabase.from("subjects").select("*").order("code")
      .then(({ data }) => setSubjects(data || []));
  }, []);

  useEffect(() => {
    if (!subId) return;
    setLoadDocs(true);
    supabase.from("documents").select("*").eq("subject_id", subId).order("created_at", { ascending:false })
      .then(({ data }) => { setDocs(data || []); setLoadDocs(false); });
  }, [subId]);

  const handleUpload = async (file: File) => {
    if (!subId) return notify("Select a subject first");
    setUploading(true);
    try {
      const path = `${subId}/${Date.now()}_${file.name}`;
      const { error: stErr } = await supabase.storage.from("documents").upload(path, file);
      if (stErr) throw stErr;
      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("documents").insert({
        subject_id:  subId,
        uploaded_by: adminId,
        name:        file.name,
        file_url:    publicUrl,
        file_path:   path,
        type:        file.name.endsWith(".pdf") ? "notes" : "slides",
        size_bytes:  file.size,
      });
      if (dbErr) throw dbErr;
      notify(`✓ "${file.name}" uploaded`);
      setSubId(s => s); // trigger reload
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (doc: any) => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocs(d => d.filter(x => x.id !== doc.id));
    notify("Document deleted");
  };

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <PageHeader title="Document Management" sub="Upload, manage, and delete documents across all subjects" />

      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:14 }}>
        {/* Subject list */}
        <div className="adm-card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:12, fontWeight:600, color:"rgba(255,255,255,.35)", textTransform:"uppercase", letterSpacing:".07em" }}>Subjects</div>
          {subjects.map(s => (
            <button key={s.id} onClick={()=>setSubId(s.id)} style={{
              display:"flex", alignItems:"center", gap:8, padding:"11px 14px", width:"100%",
              background: subId===s.id ? "rgba(59,130,246,.08)" : "transparent",
              border:"none", borderBottom:"1px solid var(--border)",
              borderLeft: subId===s.id ? "2px solid #3b82f6" : "2px solid transparent",
              cursor:"pointer", textAlign:"left", fontFamily:"var(--font)", transition:"all .12s",
            }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:s.color||"#3b82f6", flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:500, color: subId===s.id?"var(--text)":"rgba(255,255,255,.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,.25)", fontFamily:"var(--mono)", marginTop:1 }}>{s.code}</div>
              </div>
            </button>
          ))}
          {subjects.length === 0 && <div style={{ padding:"16px 14px", fontSize:12, color:"rgba(255,255,255,.3)" }}>No subjects found</div>}
        </div>

        {/* Document panel */}
        <div>
          {!subId ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:260, background:"rgba(255,255,255,.02)", border:"1px dashed var(--border)", borderRadius:10, flexDirection:"column", gap:6, color:"rgba(255,255,255,.2)" }}>
              <FileText size={24} />
              <span style={{ fontSize:12 }}>Select a subject to manage its documents</span>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onDragOver={e=>{ e.preventDefault(); setDrag(true); }}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{ e.preventDefault(); setDrag(false); const f=e.dataTransfer.files[0]; if(f) handleUpload(f); }}
                onClick={()=>fileRef.current?.click()}
                style={{
                  border:`2px dashed ${drag?"#3b82f6":"rgba(255,255,255,.1)"}`,
                  background: drag ? "rgba(59,130,246,.04)" : "transparent",
                  borderRadius:10, padding:"22px", textAlign:"center", cursor:"pointer",
                  marginBottom:12, transition:"all .2s",
                }}>
                <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.doc" style={{display:"none"}} onChange={e=>{ const f=e.target.files?.[0]; if(f) handleUpload(f); }} />
                <Upload size={18} color="rgba(255,255,255,.3)" />
                <div style={{ fontSize:13, color:"rgba(255,255,255,.5)", marginTop:6, fontWeight:500 }}>
                  {uploading ? "Uploading…" : "Drop file or click — PDF, PPTX, DOCX"}
                </div>
              </div>

              <Table headers={["File","Type","Size","Uploaded","Actions"]} title="Documents" count={docs.length}>
                {loadDocs ? <TR cells={["Loading…","","","",""]} /> : docs.length === 0 ? <TR cells={[<span style={{color:"rgba(255,255,255,.3)"}}>No documents yet</span>,"","","",""]} /> :
                  docs.map((d,i) => <TR key={i} cells={[
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:16}}>{d.type==="slides"?"🎞️":"📄"}</span>
                      <span style={{color:"var(--text)",fontWeight:500,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
                    </div>,
                    <Badge color="gray">{d.type||"file"}</Badge>,
                    <span style={{fontFamily:"var(--mono)",fontSize:11}}>{d.size_bytes ? `${(d.size_bytes/1024/1024).toFixed(1)}MB` : "—"}</span>,
                    <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>{new Date(d.created_at).toLocaleDateString("en-IN")}</span>,
                    <div style={{display:"flex",gap:4}}>
                      <a href={d.file_url} target="_blank" rel="noopener noreferrer"><Btn variant="ghost" small icon={ExternalLink}></Btn></a>
                      <Btn variant="ghost" small icon={Trash2} onClick={()=>deleteDoc(d)}></Btn>
                    </div>,
                  ]} />)
                }
              </Table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: ATTENDANCE IMPORT
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceView() {
  const [csv,    setCsv]    = useState("");
  const [rows,   setRows]   = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [toast,  setToast]  = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (m:string) => { setToast(m); setTimeout(()=>setToast(""),3000); };

  const parseCSV = (text:string): any[] => {
    const lines   = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h=>h.trim().toLowerCase());
    return lines.slice(1).map(l => {
      const vals = l.split(",").map(v=>v.trim());
      return Object.fromEntries(headers.map((h,i) => [h, vals[i]]));
    }).filter(r => r.student_id && r.subject_id);
  };

  useEffect(() => { setRows(parseCSV(csv)); }, [csv]);

  const handleFile = (f: File) => {
    const r = new FileReader();
    r.onload = e => setCsv(e.target?.result as string);
    r.readAsText(f);
  };

  const importRows = async () => {
    if (!rows.length) return;
    setSaving(true);
    let ok=0, err=0;
    for (const row of rows) {
      const { error } = await supabase.from("attendance").upsert({
        student_id: row.student_id,
        subject_id: row.subject_id,
        attended:   parseInt(row.attended)||0,
        total:      parseInt(row.total)||0,
        updated_at: new Date().toISOString(),
      }, { onConflict:"student_id,subject_id" });
      error ? err++ : ok++;
    }
    setSaving(false);
    setDone(true);
    notify(`Imported ${ok} rows${err?`, ${err} errors`:""}`);
  };

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <PageHeader title="Attendance Import" sub="Bulk import attendance records from CSV — admin-only pipeline" />

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <div className="adm-card" style={{ padding:"18px 20px" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:14 }}>Upload CSV</div>
          <div
            onClick={()=>fileRef.current?.click()}
            style={{ border:"2px dashed rgba(255,255,255,.1)", borderRadius:10, padding:"24px", textAlign:"center", cursor:"pointer", marginBottom:14 }}>
            <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFile(f); }} />
            <Upload size={20} color="rgba(255,255,255,.25)" />
            <div style={{ fontSize:13, color:"rgba(255,255,255,.45)", marginTop:7, fontWeight:500 }}>Click to upload CSV</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.25)", marginTop:4 }}>Required: student_id, subject_id, attended, total</div>
          </div>
          <div style={{ marginBottom:8, fontSize:11, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em" }}>Or paste CSV</div>
          <textarea value={csv} onChange={e=>setCsv(e.target.value)}
            placeholder={"student_id,subject_id,attended,total\n213CS1001,<uuid>,38,45"}
            className="adm-field" style={{ height:120, resize:"vertical", fontFamily:"var(--mono)", fontSize:11, width:"100%" }} />
        </div>

        <div className="adm-card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>Preview</span>
              <Badge color="gray">{rows.length} rows</Badge>
            </div>
            {done && <Badge color="green">Imported ✓</Badge>}
          </div>
          <div style={{ overflowX:"auto", maxHeight:250 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["student_id","subject_id","attended","total"].map(h => (
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".06em", borderBottom:"1px solid var(--border)", background:"rgba(255,255,255,.015)", fontFamily:"var(--mono)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.slice(0,10).map((r,i) => (
                  <tr key={i}>
                    <td style={{ padding:"8px 14px", fontSize:11, fontFamily:"var(--mono)", color:"rgba(255,255,255,.6)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{r.student_id}</td>
                    <td style={{ padding:"8px 14px", fontSize:11, fontFamily:"var(--mono)", color:"rgba(255,255,255,.4)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{r.subject_id?.slice(0,10)}…</td>
                    <td style={{ padding:"8px 14px", fontSize:11, fontFamily:"var(--mono)", color:"rgba(255,255,255,.6)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{r.attended}</td>
                    <td style={{ padding:"8px 14px", fontSize:11, fontFamily:"var(--mono)", color:"rgba(255,255,255,.6)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{r.total}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} style={{ padding:"20px 14px", textAlign:"center", fontSize:12, color:"rgba(255,255,255,.25)" }}>Upload CSV to preview data</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && !done && (
            <div style={{ padding:"14px 18px", borderTop:"1px solid var(--border)" }}>
              <Btn variant="primary" icon={Database} onClick={importRows} disabled={saving}>
                {saving ? "Importing…" : `Import ${rows.length} rows`}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: INTEGRATIONS
// ─────────────────────────────────────────────────────────────────────────────
function IntegrationsView() {
  const [source,  setSource]  = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast,   setToast]   = useState("");

  const ACTION_COLORS = [
    "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b",
    "#ef4444", "#ec4899", "#06b6d4", "#6366f1",
  ];

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  useEffect(() => {
    (async () => {
      const { data: src } = await supabase
        .from("integration_sources")
        .select("*")
        .limit(1)
        .maybeSingle();
 
      if (src) {
        const { data: wf } = await supabase
          .from("agent_workflows")
          .select("action_name");
 
        setSource({
          ...src,
          actions: (wf || []).map((w: any) => w.action_name),
        });
      }
 
      setLoading(false);
    })();
  }, []);

  const handleSync = async () => {
    if (!source) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/agent/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: source.college_name }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      notify("✓ Sync complete");
      const { data } = await supabase
        .from("integration_sources")
        .select("*")
        .limit(1)
        .maybeSingle();
      setSource(data);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <PageHeader
        title="Integrations"
        sub="Connected college portal, AI services, and data pipeline"
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
        {[
          { name: "Supabase", sub: "DB + Storage + Realtime", color: "#10b981", Icon: Database, status: "connected" },
          { name: "Azure AI", sub: "GPT-4o via AI Foundry",   color: "#3b82f6", Icon: Zap,      status: "connected" },
          { name: "Pinecone", sub: "Vector search index",      color: "#8b5cf6", Icon: Cpu,      status: "connected" },
        ].map((s, i) => (
          <div key={i} className="adm-card" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: `${s.color}15`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s.Icon size={16} color={s.color} />
              </div>
              <Badge color="green">{s.status}</Badge>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{s.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Connected Portal</div>

      {loading && (
        <div className="adm-card" style={{ padding: "28px", textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 12 }}>
          Loading…
        </div>
      )}

      {!loading && !source && (
        <div className="adm-card" style={{ padding: "32px", textAlign: "center" }}>
          <Plug size={22} color="rgba(255,255,255,.15)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.35)", marginBottom: 14 }}>No portal connected yet</div>
          <Btn variant="primary" icon={Plus} onClick={() => window.location.href = "/onboarding"}>Run Onboarding</Btn>
        </div>
      )}

      {!loading && source && (
        <div className="adm-card" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Globe size={19} color="#60a5fa" />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{source.college_name}</span>
                <Badge color="green">Connected</Badge>
              </div>
              
              <a 
                href={source.portal_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, fontFamily: "var(--mono)", color: "#60a5fa", textDecoration: "none" }}
              >
                {source.portal_url}
              </a>

              <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, color: "rgba(255,255,255,.3)" }}>
                <span>Mode: <span style={{ color: "rgba(255,255,255,.55)" }}>{source.portal_type || source.integration_type}</span></span>
                {source.updated_at && (
                  <span>Last synced: <span style={{ color: "rgba(255,255,255,.55)" }}>{new Date(source.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></span>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {(source.actions || []).map((a: string, idx: number) => {
                  const c = ACTION_COLORS[idx % ACTION_COLORS.length];
                  return (
                    <span key={a} style={{
                      padding: "2px 8px", borderRadius: 4,
                      background: `${c}15`, color: c,
                      border: `1px solid ${c}25`,
                      fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600,
                    }}>
                      {a}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
              <Btn variant="primary" icon={syncing ? undefined : RefreshCw} disabled={syncing} onClick={handleSync}>
                {syncing ? "Syncing…" : "Sync Data"}
              </Btn>
              <Btn variant="secondary" icon={RefreshCw} onClick={() => window.location.href = "/onboarding"}>
                Re-train Workflows
              </Btn>
            </div>
          </div>

          {syncing && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 8, fontSize: 12, color: "#60a5fa", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, border: "2px solid rgba(59,130,246,.3)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />
              Playwright session active — fetching latest data from portal…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: AI WORKFLOWS
// ─────────────────────────────────────────────────────────────────────────────
function WorkflowsView() {
  const [source,    setSource]    = useState<any>(null);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState<string | null>(null);
  const [toast,     setToast]     = useState("");

  const ACTION_COLORS = [
    "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b",
    "#ef4444", "#ec4899", "#06b6d4", "#6366f1",
  ];

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  useEffect(() => {
    (async () => {
      const { data: src } = await supabase
        .from("integration_sources")
        .select("*")
        .limit(1)
        .maybeSingle();

      setSource(src);

      if (src) {
        const { data: wf } = await supabase
          .from("agent_workflows")
          .select("*")
          .order("created_at", { ascending: false });
        setWorkflows(wf || []);
      }      

      setLoading(false);
    })();
  }, []);

  const runWorkflow = async (action: string) => {
    setRunning(action);
    try {
      const res = await fetch("/api/agent/run-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      notify(`✓ Workflow "${action}" executed`);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <PageHeader
        title="AI Workflow Configuration"
        sub="Navigation paths the AI uses to guide students through your portal"
      />

      {!loading && source && (
        <div className="adm-card" style={{ padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Globe size={15} color="#60a5fa" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{source.college_name}</div>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "rgba(255,255,255,.3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.portal_url}</div>
          </div>
          <Badge color="green">Connected</Badge>
          <Btn variant="primary" small icon={Plus} onClick={() => window.location.href = "/onboarding"}>
            Add Workflows
          </Btn>
        </div>
      )}

      {!loading && !source && (
        <div className="adm-card" style={{ padding: "36px", textAlign: "center" }}>
          <Cpu size={24} color="rgba(255,255,255,.12)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)", marginBottom: 14 }}>
            No portal connected — run onboarding first
          </div>
          <Btn variant="primary" icon={Plus} onClick={() => window.location.href = "/onboarding"}>Run Onboarding</Btn>
        </div>
      )}

      {!loading && source && (
        <div className="adm-card">
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Taught Workflows</span>
            <Badge color="gray">{workflows.length}</Badge>
          </div>

          {workflows.length === 0 && (
            <div style={{ padding: "32px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.25)" }}>
              No workflows recorded yet — complete onboarding to teach the AI your portal paths
            </div>
          )}

          {workflows.map((w, i) => {
            const color = ACTION_COLORS[i % ACTION_COLORS.length];
            const isRunning = running === w.action_name;
            return (
              <div
                key={i}
                style={{
                  padding: "16px 18px",
                  borderBottom: i < workflows.length - 1 ? "1px solid var(--border)" : "none",
                  borderLeft: `3px solid ${color}40`,
                  display: "flex", alignItems: "flex-start", gap: 14,
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{w.action_name}</span>
                    <Badge color="blue">{(w.steps || []).length} steps</Badge>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {(w.steps || []).slice(0, 4).map((s: any, j: number) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <ChevronRight size={10} color="rgba(255,255,255,.2)" />
                        <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "rgba(255,255,255,.4)" }}>
                          {typeof s === "string" ? s : s.path || s.target || JSON.stringify(s)}
                        </span>
                      </div>
                    ))}
                    {(w.steps || []).length > 4 && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.2)", paddingLeft: 17 }}>
                        +{w.steps.length - 4} more steps
                      </span>
                    )}
                  </div>
                </div>

                <Btn
                  variant="secondary"
                  small
                  icon={isRunning ? undefined : Zap}
                  disabled={isRunning || !!running}
                  onClick={() => runWorkflow(w.action_name)}
                >
                  {isRunning ? "Running…" : "Run"}
                </Btn>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW: SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
function SettingsView() {
  const [name,    setName]    = useState("");
  const [url,     setUrl]     = useState("");
  const [aiLevel, setAiLevel] = useState("standard");
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    supabase.from("integration_sources").select("college_name,portal_url").limit(1).maybeSingle()
      .then(({ data }) => { if (data) { setName(data.college_name||""); setUrl(data.portal_url||""); } });
  }, []);

  const save = () => { setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return (
    <div>
      <PageHeader title="System Settings" sub="Global configuration for this CampusCopilot instance" />

      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14, maxWidth:820 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div className="adm-card" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:16 }}>Institution</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <Input label="College name" value={name} onChange={setName} placeholder="IIT Bombay" icon={Server} />
              <Input label="Portal URL"   value={url}  onChange={setUrl}  placeholder="https://portal.yourcollege.edu" mono />
            </div>
          </div>

          <div className="adm-card" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:14 }}>AI Behaviour</div>
            {[
              { id:"standard",   name:"Standard",   desc:"RAG retrieval + tool calling" },
              { id:"enhanced",   name:"Enhanced",    desc:"Multi-step reasoning chains" },
              { id:"autonomous", name:"Autonomous",   desc:"Full agent mode (beta)" },
            ].map(opt => (
              <button key={opt.id} onClick={()=>setAiLevel(opt.id)} style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"12px 14px", marginBottom:6, width:"100%",
                background: aiLevel===opt.id ? "rgba(59,130,246,.08)" : "rgba(255,255,255,.02)",
                border:`1px solid ${aiLevel===opt.id?"rgba(59,130,246,.25)":"var(--border)"}`,
                borderRadius:8, cursor:"pointer", fontFamily:"var(--font)", textAlign:"left",
              }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:"var(--text)" }}>{opt.name}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", marginTop:2 }}>{opt.desc}</div>
                </div>
                {aiLevel===opt.id && <Check size={13} color="#60a5fa" />}
              </button>
            ))}
          </div>

          <Btn variant="primary" icon={saved ? Check : Save} onClick={save}>
            {saved ? "Saved ✓" : "Save Changes"}
          </Btn>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div className="adm-card" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"rgba(239,68,68,.7)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:12 }}>Danger Zone</div>
            {[
              { label:"Reset AI workflows",  desc:"Clear all navigation paths" },
              { label:"Purge documents",      desc:"Delete all uploaded files" },
              { label:"Clear attendance",     desc:"Remove all imported records" },
            ].map((a,i) => (
              <div key={i} style={{ padding:"10px 12px", background:"rgba(239,68,68,.04)", border:"1px solid rgba(239,68,68,.1)", borderRadius:7, marginBottom:8 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#f87171", marginBottom:2 }}>{a.label}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", marginBottom:8 }}>{a.desc}</div>
                <Btn variant="danger" small>Execute</Btn>
              </div>
            ))}
          </div>

          <div className="adm-card" style={{ padding:"18px 20px" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:12 }}>Build Info</div>
            {[["Version","1.0.0"],["Stack","Next.js 14 + Supabase"],["AI","GPT-4o / Azure"],["Agent","Playwright 1.40"]].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,.3)" }}>{k}</span>
                <span style={{ fontSize:12, color:"var(--text)", fontFamily:"var(--mono)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router   = useRouter();
  const [view,    setView]   = useState<View>("overview");
  const [admin,  setAdmin]  = useState({ name:"Administrator", email:"" });
  const [college,setCollege]= useState("College System");
  const [ready,  setReady]  = useState(false);
  const [time,   setTime]   = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (session.role === "student") { router.replace("/chat");    return; }
    if (session.role === "faculty") { router.replace("/teacher"); return; }
    setAdmin({ name:session.name, email:session.email });
    setReady(true);
    setTime(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}));
    const t = setInterval(()=>setTime(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})),30000);

    supabase.from("integration_sources").select("college_name").limit(1).maybeSingle()
      .then(({ data }) => { if (data?.college_name) setCollege(data.college_name); });

    return () => clearInterval(t);
  }, [router]);

  if (!ready) return (
    <div style={{ height:"100vh", background:"#0a0a0f", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:18, height:18, border:"2px solid rgba(59,130,246,.3)", borderTopColor:"#3b82f6", borderRadius:"50%", animation:"spin .7s linear infinite" }} />
    </div>
  );

  const groups = ["platform","academic","intelligence"] as const;
  const currentLabel = NAV.find(n=>n.id===view)?.label || "";
  const adminId = admin.email.split("@")[0].replace(/[^a-z0-9_-]/gi,"_");

  return (
    <div style={{ display:"flex", height:"100vh", background:"#0a0a0f", color:"#e2e8f0", overflow:"hidden", fontFamily:"var(--font)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        :root {
          --bg:      #0a0a0f;
          --bg1:     #0e1015;
          --bg2:     #131720;
          --bg3:     #1a2030;
          --border:  rgba(255,255,255,0.07);
          --text:    #e2e8f0;
          --text2:   rgba(226,232,240,0.55);
          --font:    'Instrument Sans', system-ui, sans-serif;
          --mono:    'JetBrains Mono', monospace;
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body{height:100%;overflow:hidden;}
        ::selection{background:#3b82f6;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:10px;}
        .adm-card{background:var(--bg1);border:1px solid var(--border);border-radius:10px;}
        .adm-field{background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:9px 12px;color:var(--text);outline:none;transition:border-color .2s;width:100%;display:block;}
        .adm-field:focus{border-color:rgba(59,130,246,.4);background:rgba(59,130,246,.04);}
        .adm-field::placeholder{color:rgba(255,255,255,.2);}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .view-fade{animation:fadeUp .25s ease;}
      `}</style>

      {/* ── SIDEBAR ── */}
      <aside style={{ width:210, background:"var(--bg1)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", flexShrink:0 }}>
        {/* Brand */}
        <div style={{ height:52, display:"flex", alignItems:"center", gap:9, padding:"0 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ width:26, height:26, borderRadius:6, background:"linear-gradient(135deg,#1d4ed8,#3b82f6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Shield size={13} color="#fff" />
          </div>
          <span style={{ fontSize:13, fontWeight:700, color:"var(--text)", letterSpacing:"-0.01em" }}>CampusCopilot</span>
          <span style={{ marginLeft:"auto", fontSize:8, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", background:"rgba(59,130,246,.12)", color:"#60a5fa", border:"1px solid rgba(59,130,246,.2)", padding:"2px 6px", borderRadius:3 }}>ADMIN</span>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, overflowY:"auto", padding:"8px 8px" }}>
          {groups.map(g => (
            <div key={g}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:"rgba(255,255,255,.2)", padding:"12px 10px 5px" }}>{G_LABEL[g]}</div>
              {NAV.filter(n=>n.group===g).map(item => (
                <button key={item.id} onClick={()=>setView(item.id)} style={{
                  display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                  width:"100%", background: view===item.id ? "rgba(59,130,246,.1)" : "transparent",
                  border:`1px solid ${view===item.id?"rgba(59,130,246,.2)":"transparent"}`,
                  borderRadius:6, cursor:"pointer", fontFamily:"var(--font)",
                  color: view===item.id ? "#e2e8f0" : "rgba(255,255,255,.45)",
                  fontSize:12, fontWeight: view===item.id ? 600 : 400,
                  transition:"all .12s", marginBottom:1, textAlign:"left",
                }}>
                  <LucideIcon icon={item.icon} size={13} style={{ color: view===item.id?"#3b82f6":"rgba(255,255,255,.3)", flexShrink:0 }} />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding:"10px 8px", borderTop:"1px solid var(--border)", flexShrink:0 }}>
          <button onClick={()=>{clearSession();router.replace("/login");}} style={{
            display:"flex", alignItems:"center", gap:8, padding:"7px 10px", width:"100%",
            background:"transparent", border:"1px solid transparent", borderRadius:6,
            cursor:"pointer", fontFamily:"var(--font)", color:"rgba(255,255,255,.35)",
            fontSize:12, transition:"all .12s", textAlign:"left",
          }}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color="#e2e8f0";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color="rgba(255,255,255,.35)";}}>
            <LogOut size={12} style={{flexShrink:0}}/> Sign out
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px" }}>
            <div style={{ width:26, height:26, borderRadius:6, background:"linear-gradient(135deg,#1d4ed8,#3b82f6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", flexShrink:0 }}>
              {admin.name.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{admin.name}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,.3)" }}>Administrator</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Topbar */}
        <div style={{ height:52, background:"var(--bg1)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 22px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
            <span style={{ color:"rgba(255,255,255,.3)" }}>{college}</span>
            <ChevronRight size={12} color="rgba(255,255,255,.2)" />
            <span style={{ color:"var(--text)", fontWeight:600 }}>{currentLabel}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", background:"rgba(34,197,94,.07)", border:"1px solid rgba(34,197,94,.15)", borderRadius:5, fontSize:10, color:"#4ade80", fontFamily:"var(--mono)" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 5px #22c55e", animation:"pulse 2s ease-in-out infinite" }} />
              operational
            </div>
            <div style={{ padding:"4px 10px", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:5, fontSize:10, color:"rgba(255,255,255,.3)", fontFamily:"var(--mono)" }}>
              {time}
            </div>
            <button style={{ width:30, height:30, background:"transparent", border:"1px solid var(--border)", borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,.35)" }}
              onClick={()=>router.push("/teacher")}>
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"26px 24px", background:"var(--bg)" }} key={view}>
          <div className="view-fade">
            {view === "overview"     && <OverviewView />}
            {view === "users"        && <UsersView />}
            {view === "enrollments"  && <EnrollmentsView />}
            {view === "documents"    && <DocumentsView adminId={adminId} />}
            {view === "attendance"   && <AttendanceView />}
            {view === "workflows"    && <WorkflowsView />}
            {view === "integrations" && <IntegrationsView />}
            {view === "settings"     && <SettingsView />}
            {view === "subjects" && (
              <div>
                <PageHeader title="Subject Management" sub="Create subjects, assign faculty, enroll students" />
                <SubjectManagementView />
              </div>
            )}            
            {view === "lab" && (
              <div>
                <PageHeader title="Lab Requests (Global)" sub="All requests across the college — admin override enabled" />
                <div style={{ padding:"40px", textAlign:"center", background:"var(--bg1)", border:"1px solid var(--border)", borderRadius:10, color:"rgba(255,255,255,.25)" }}>
                  <FlaskConical size={28} style={{marginBottom:10,opacity:.3}}/><br/>
                  Pull from lab_requests table with is_admin_override flag
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
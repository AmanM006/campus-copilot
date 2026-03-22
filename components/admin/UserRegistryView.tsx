"use client";
// components/admin/UserRegistryView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Drop-in replacement for the UsersView in app/admin/page.tsx.
// Features:
//  1. Bulk import — paste emails (one per line) → auto-detect role from domain
//  2. CSV upload — drag & drop, parse name/email/role columns
//  3. Single user add form
//  4. Live table with search, role filter, delete
//  5. Domain rules — shows which domains auto-provision to which role

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Search, Trash2, Upload, Users, ChevronDown, Check,
  AlertTriangle, CheckCircle, Download, RefreshCw, X, Mail,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRow { id:string; email:string; name:string; role:string; department:string; }
type Tab = "list" | "bulk" | "csv";

const AVATAR_GRAD: Record<string,string> = {
  student: "135deg,#7c3aed,#3b82f6",
  faculty: "135deg,#059669,#10b981",
  admin:   "135deg,#1d4ed8,#3b82f6",
};

// ── Shared atoms ──────────────────────────────────────────────────────────────
const Chip = ({ color, children }: { color:string; children:React.ReactNode }) => (
  <span style={{ padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase", fontFamily:"var(--mono)",
    background:`${color}15`, color, border:`1px solid ${color}25` }}>{children}</span>
);

const Toast = ({ msg, ok }: { msg:string; ok:boolean }) => (
  <div style={{ position:"fixed", top:18, right:18, zIndex:9999, padding:"10px 16px",
    background: ok ? "#16a34a" : "#dc2626", color:"#fff", borderRadius:8, fontSize:13, fontWeight:500,
    boxShadow:"0 4px 20px rgba(0,0,0,.5)", animation:"fadeUp .2s ease", maxWidth:340 }}>
    {msg}
  </div>
);

// ── Guess role from email ─────────────────────────────────────────────────────
function guessRole(email: string): "student" | "faculty" {
  const d = email.split("@")[1]?.toLowerCase() || "";
  return (d.includes("learner") || d.includes("student")) ? "student" : "faculty";
}

function emailToId(email: string) {
  return email.toLowerCase().trim().split("@")[0].replace(/[^a-z0-9_-]/gi, "_");
}

// ── Parse CSV ─────────────────────────────────────────────────────────────────
function parseCSV(text: string): { email:string; name:string; role:string }[] {
  const lines   = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const emailIdx = headers.findIndex(h => h.includes("email"));
  const nameIdx  = headers.findIndex(h => h.includes("name"));
  const roleIdx  = headers.findIndex(h => h.includes("role"));

  if (emailIdx === -1) {
    // No header row — treat each line as email
    return lines.filter(l => l.includes("@")).map(l => ({
      email: l.trim(), name: "", role: guessRole(l.trim()),
    }));
  }

  return lines.slice(1)
    .map(line => {
      const cols = line.split(",").map(c => c.trim());
      const email = cols[emailIdx] || "";
      if (!email.includes("@")) return null;
      return {
        email,
        name: nameIdx >= 0 ? cols[nameIdx] : "",
        role: roleIdx >= 0 ? cols[roleIdx] : guessRole(email),
      };
    })
    .filter(Boolean) as { email:string; name:string; role:string }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function UserRegistryView() {
  const [users,    setUsers]    = useState<UserRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<Tab>("list");
  const [roleFilter, setRoleFilter] = useState<"all"|"student"|"faculty"|"admin">("all");
  const [q,        setQ]        = useState("");
  const [toast,    setToast]    = useState<{msg:string;ok:boolean}|null>(null);
  const [college,  setCollege]  = useState("");

  // Single add
  const [newName,  setNewName]  = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole,  setNewRole]  = useState<"student"|"faculty"|"admin">("student");
  const [addOpen,  setAddOpen]  = useState(false);
  const [addBusy,  setAddBusy]  = useState(false);

  // Bulk text
  const [bulkText, setBulkText] = useState("");
  const [bulkPrev, setBulkPrev] = useState<{email:string;name:string;role:string}[]>([]);
  const [importing,setImporting]= useState(false);
  const [importRes,setImportRes]= useState<{imported:number;errors:number}|null>(null);

  // CSV
  const [csvPrev,  setCsvPrev]  = useState<{email:string;name:string;role:string}[]>([]);
  const [drag,     setDrag]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load users + college name ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: us }, { data: integ }] = await Promise.all([
      supabase.from("users").select("id,email,name,role,department").order("role").order("name"),
      supabase.from("integration_sources").select("college_name").eq("active",true).limit(1).maybeSingle(),
    ]);
    setUsers(us || []);
    if (integ?.college_name) setCollege(integ.college_name);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Parse bulk text live ──────────────────────────────────────────────────
  useEffect(() => {
    const lines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(l => l.includes("@"));
    setBulkPrev(lines.map(email => ({ email, name: "", role: guessRole(email) })));
  }, [bulkText]);

  // ── Filtered users ────────────────────────────────────────────────────────
  const filtered = users.filter(u =>
    (roleFilter === "all" || u.role === roleFilter) &&
    `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())
  );
  const counts: Record<string,number> = { all:users.length, student:0, faculty:0, admin:0 };
  users.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++; });

  // ── Add single user ───────────────────────────────────────────────────────
  const addUser = async () => {
    if (!newEmail.trim()) return;
    setAddBusy(true);
    const id   = emailToId(newEmail);
    const name = newName.trim() || newEmail.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    const { error } = await supabase.from("users").upsert({
      id, email:newEmail.toLowerCase().trim(), name, role:newRole,
      department: college || newEmail.split("@")[1],
    }, { onConflict:"id" });
    setAddBusy(false);
    if (error) { notify(`Error: ${error.message}`, false); return; }
    notify(`✓ ${name} added as ${newRole}`);
    setNewName(""); setNewEmail(""); setAddOpen(false);
    load();
  };

  // ── Bulk import ────────────────────────────────────────────────────────────
  const runBulk = async (rows: {email:string;name:string;role:string}[]) => {
    if (!rows.length) return;
    setImporting(true);
    const resp = await fetch("/api/bulk-users", {
      method:  "POST",
      headers: { "Content-Type":"application/json" },
      body:    JSON.stringify({ users: rows, collegeName: college }),
    });
    const data = await resp.json();
    setImporting(false);
    setImportRes(data);
    notify(`✓ ${data.imported} users imported${data.errors?`, ${data.errors} errors`:""}`, data.errors === 0);
    load();
  };

  // ── CSV upload ─────────────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => { const rows = parseCSV(e.target?.result as string); setCsvPrev(rows); };
    reader.readAsText(file);
  };

  // ── Delete user ────────────────────────────────────────────────────────────
  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    await supabase.from("users").delete().eq("id", id);
    notify(`${name} removed`);
    setUsers(p => p.filter(u => u.id !== id));
  };

  // ── Download CSV template ─────────────────────────────────────────────────
  const downloadTemplate = () => {
    const csv = "email,name,role\nstudent@learner.manipal.edu,John Doe,student\nfaculty@manipal.edu,Dr. Jane,faculty";
    const a   = document.createElement("a");
    a.href    = "data:text/csv," + encodeURIComponent(csv);
    a.download = "users_template.csv";
    a.click();
  };

  return (
    <div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* Page header */}
      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:20, fontWeight:700, color:"var(--text)", letterSpacing:"-0.02em", marginBottom:4 }}>User Registry</div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,.3)" }}>
          Manage all students and faculty — bulk import, CSV upload, or add individually.
          Students can log in immediately after being added.
        </div>
      </div>

      {/* Domain note */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"11px 14px", background:"rgba(59,130,246,.05)", border:"1px solid rgba(59,130,246,.15)", borderRadius:9, marginBottom:16, fontSize:12 }}>
        <Mail size={13} color="#60a5fa" style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ color:"rgba(226,232,240,.65)", lineHeight:1.7 }}>
          <strong style={{ color:"#60a5fa" }}>Auto-detection rules:</strong>
          {" "}Emails with <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 5px", borderRadius:3, fontFamily:"var(--mono)", fontSize:11 }}>learner</code> or{" "}
          <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 5px", borderRadius:3, fontFamily:"var(--mono)", fontSize:11 }}>student</code> in the domain
          → <strong>Student</strong>. All others → <strong>Faculty</strong>.
          Microsoft SSO will also auto-create accounts for registered domains.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {[["list","👥 User List"],["bulk","📋 Bulk Import"],["csv","📄 CSV Upload"]] .map(([t,l]) => (
          <button key={t} onClick={()=>setTab(t as Tab)} style={{
            padding:"7px 14px", borderRadius:7, border:`1px solid ${tab===t?"rgba(59,130,246,.35)":"var(--border)"}`,
            background: tab===t?"rgba(59,130,246,.1)":"transparent",
            color: tab===t?"#60a5fa":"rgba(255,255,255,.45)",
            fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"var(--font)",
          }}>{l}</button>
        ))}
        <button onClick={downloadTemplate} style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5, padding:"7px 12px", background:"transparent", border:"1px solid var(--border)", borderRadius:7, color:"rgba(255,255,255,.35)", fontSize:11, cursor:"pointer", fontFamily:"var(--font)" }}>
          <Download size={11}/> Template
        </button>
      </div>

      {/* ── TAB: User List ── */}
      {tab === "list" && (
        <>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:12 }}>
            {/* Role filters */}
            {(["all","student","faculty","admin"] as const).map(r => (
              <button key={r} onClick={()=>setRoleFilter(r)} style={{
                padding:"5px 11px", borderRadius:6, border:`1px solid ${roleFilter===r?"rgba(59,130,246,.35)":"var(--border)"}`,
                background:roleFilter===r?"rgba(59,130,246,.1)":"transparent",
                color:roleFilter===r?"#60a5fa":"rgba(255,255,255,.4)",
                fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"var(--font)",
              }}>
                {r[0].toUpperCase()+r.slice(1)} ({counts[r]||0})
              </button>
            ))}
            {/* Search */}
            <div style={{ display:"flex", alignItems:"center", gap:7, background:"rgba(255,255,255,.04)", border:"1px solid var(--border)", borderRadius:7, padding:"0 10px", width:220, marginLeft:"auto" }}>
              <Search size={12} color="rgba(255,255,255,.25)"/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"
                style={{ background:"transparent", border:"none", outline:"none", color:"var(--text)", fontSize:12, padding:"8px 0", flex:1, fontFamily:"var(--font)" }}/>
            </div>
            {/* Add single */}
            <button onClick={()=>setAddOpen(p=>!p)} style={{
              display:"flex", alignItems:"center", gap:5, padding:"8px 14px",
              background:"#3b82f6", border:"none", borderRadius:7,
              color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"var(--font)",
            }}>
              <Plus size={12}/> Add User
            </button>
          </div>

          {/* Single add form */}
          {addOpen && (
            <div style={{ padding:"14px 16px", background:"rgba(59,130,246,.04)", border:"1px solid rgba(59,130,246,.18)", borderRadius:10, marginBottom:12, display:"grid", gridTemplateColumns:"1fr 1fr 120px auto", gap:9, alignItems:"end" }}>
              <div>
                <div style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:5 }}>Full Name</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Dr. Priya Sharma"
                  style={{ width:"100%", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)", borderRadius:7, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"var(--font)", outline:"none" }}/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:5 }}>Email</div>
                <input type="email" value={newEmail} onChange={e=>{setNewEmail(e.target.value);setNewRole(guessRole(e.target.value));}} placeholder="email@college.edu"
                  style={{ width:"100%", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)", borderRadius:7, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"var(--mono)", outline:"none" }}/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:5 }}>Role</div>
                <select value={newRole} onChange={e=>setNewRole(e.target.value as any)}
                  style={{ width:"100%", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)", borderRadius:7, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"var(--font)", outline:"none" }}>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button onClick={addUser} disabled={!newEmail.trim()||addBusy} style={{
                padding:"8px 14px", background:newEmail.trim()?"#3b82f6":"rgba(255,255,255,.08)",
                border:"none", borderRadius:7, color:"#fff", fontSize:12, fontWeight:600,
                cursor:newEmail.trim()?"pointer":"not-allowed", fontFamily:"var(--font)", opacity:!newEmail.trim()?0.4:1,
              }}>
                {addBusy?"…":"Add"}
              </button>
            </div>
          )}

          {/* Table */}
          <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["User","Email","Role","College / Dept","ID",""].map(h=>(
                  <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:10, fontWeight:600, color:"rgba(255,255,255,.28)", textTransform:"uppercase", letterSpacing:".07em", borderBottom:"1px solid var(--border)", background:"rgba(255,255,255,.015)", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={6} style={{ padding:"20px 14px", textAlign:"center", color:"rgba(255,255,255,.3)", fontSize:12 }}>Loading…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ padding:"28px 14px", textAlign:"center" }}>
                    <div style={{ color:"rgba(255,255,255,.25)", fontSize:13, marginBottom:10 }}>No users found</div>
                    <button onClick={()=>setTab("bulk")} style={{ padding:"7px 14px", background:"rgba(59,130,246,.1)", border:"1px solid rgba(59,130,246,.25)", borderRadius:7, color:"#60a5fa", fontSize:12, cursor:"pointer", fontFamily:"var(--font)" }}>
                      Add users →
                    </button>
                  </td></tr>
                )}
                {filtered.map((u,i)=>(
                  <tr key={u.id} onMouseOver={e=>{(e.currentTarget as HTMLTableRowElement).style.background="rgba(255,255,255,.02)"}} onMouseOut={e=>{(e.currentTarget as HTMLTableRowElement).style.background="transparent"}}>
                    <td style={{ padding:"11px 14px", verticalAlign:"middle" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:27, height:27, borderRadius:6, background:`linear-gradient(${AVATAR_GRAD[u.role]||AVATAR_GRAD.student})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", flexShrink:0 }}>
                          {(u.name||"?").split(" ").map((n:string)=>n[0]).slice(0,2).join("").toUpperCase()}
                        </div>
                        <span style={{ fontSize:13, fontWeight:500, color:"var(--text)" }}>{u.name||"—"}</span>
                      </div>
                    </td>
                    <td style={{ padding:"11px 14px", fontSize:11, fontFamily:"var(--mono)", color:"rgba(255,255,255,.55)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{u.email}</td>
                    <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,.03)" }}>
                      <Chip color={u.role==="admin"?"#3b82f6":u.role==="faculty"?"#10b981":"#8b5cf6"}>{u.role}</Chip>
                    </td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:"rgba(255,255,255,.4)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{u.department||"—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:10, fontFamily:"var(--mono)", color:"rgba(255,255,255,.2)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{u.id}</td>
                    <td style={{ padding:"11px 14px", borderBottom:"1px solid rgba(255,255,255,.03)" }}>
                      <button onClick={()=>deleteUser(u.id,u.name)} style={{ background:"transparent", border:"1px solid transparent", borderRadius:6, padding:"4px 6px", cursor:"pointer", color:"rgba(255,255,255,.2)", transition:"all .12s" }}
                        onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color="#f87171";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(239,68,68,.2)"}}
                        onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color="rgba(255,255,255,.2)";(e.currentTarget as HTMLButtonElement).style.borderColor="transparent"}}>
                        <Trash2 size={12}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── TAB: Bulk Import ── */}
      {tab === "bulk" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.5)", lineHeight:1.7 }}>
            Paste student/faculty emails — one per line. Role is auto-detected from the domain.
            All users will be created with password <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 5px", borderRadius:3, fontFamily:"var(--mono)", fontSize:11 }}>demo</code>.
          </div>
          <textarea value={bulkText} onChange={e=>setBulkText(e.target.value)}
            placeholder={"aman8.mitmpl2024@learner.manipal.edu\npriya.sharma@manipal.edu\nkiran.m@learner.manipal.edu\n..."}
            style={{ height:180, resize:"vertical", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:9, padding:"11px 14px", color:"#e2e8f0", fontSize:12, fontFamily:"var(--mono)", outline:"none", lineHeight:1.8, width:"100%" }}
            onFocus={e=>(e.target.style.borderColor="rgba(59,130,246,.4)")}
            onBlur={e=>(e.target.style.borderColor="rgba(255,255,255,.08)")}/>

          {/* Preview */}
          {bulkPrev.length > 0 && (
            <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", borderRadius:9, overflow:"hidden", maxHeight:220, overflowY:"auto" }}>
              <div style={{ padding:"9px 13px", borderBottom:"1px solid rgba(255,255,255,.05)", fontSize:11, fontWeight:600, color:"rgba(255,255,255,.4)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                Preview ({bulkPrev.length} valid emails)
                <div style={{ display:"flex", gap:8 }}>
                  <span style={{ fontSize:10 }}>🎓 {bulkPrev.filter(u=>u.role==="student").length} students</span>
                  <span style={{ fontSize:10 }}>👨‍🏫 {bulkPrev.filter(u=>u.role==="faculty").length} faculty</span>
                </div>
              </div>
              {bulkPrev.slice(0,20).map((u,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 13px", borderBottom:i<bulkPrev.length-1?"1px solid rgba(255,255,255,.03)":"none" }}>
                  <Chip color={u.role==="student"?"#8b5cf6":"#10b981"}>{u.role}</Chip>
                  <span style={{ fontSize:12, fontFamily:"var(--mono)", color:"rgba(255,255,255,.65)" }}>{u.email}</span>
                </div>
              ))}
              {bulkPrev.length > 20 && <div style={{ padding:"7px 13px", fontSize:11, color:"rgba(255,255,255,.3)" }}>…and {bulkPrev.length-20} more</div>}
            </div>
          )}

          {importRes && (
            <div style={{ display:"flex", alignItems:"center", gap:9, padding:"11px 14px", background:importRes.errors===0?"rgba(16,185,129,.08)":"rgba(245,158,11,.08)", border:`1px solid ${importRes.errors===0?"rgba(16,185,129,.25)":"rgba(245,158,11,.25)"}`, borderRadius:9, fontSize:13 }}>
              {importRes.errors===0?<CheckCircle size={14} color="#10b981"/>:<AlertTriangle size={14} color="#f59e0b"/>}
              <span style={{ color:importRes.errors===0?"#4ade80":"#fbbf24" }}>
                {importRes.imported} users imported successfully{importRes.errors>0?`, ${importRes.errors} errors`:""}
              </span>
            </div>
          )}

          <button disabled={bulkPrev.length===0||importing} onClick={()=>runBulk(bulkPrev)} style={{
            display:"flex", alignItems:"center", gap:7, padding:"10px 18px", alignSelf:"flex-start",
            background:bulkPrev.length>0?"#3b82f6":"rgba(255,255,255,.06)",
            border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600,
            cursor:bulkPrev.length>0?"pointer":"not-allowed", fontFamily:"var(--font)",
            opacity:bulkPrev.length===0?0.4:1,
          }}>
            {importing ? <><div style={{ width:12,height:12,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>Importing…</>
              : <><Upload size={13}/> Import {bulkPrev.length} Users</>}
          </button>
        </div>
      )}

      {/* ── TAB: CSV Upload ── */}
      {tab === "csv" && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.5)", lineHeight:1.7 }}>
            Upload a CSV file with columns: <code style={{ background:"rgba(255,255,255,.08)", padding:"1px 5px", borderRadius:3, fontFamily:"var(--mono)", fontSize:11 }}>email, name, role</code>.
            Role column is optional — auto-detected from domain if missing.
          </div>
          <div
            onDragOver={e=>{e.preventDefault();setDrag(true)}}
            onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
            onClick={()=>fileRef.current?.click()}
            style={{
              border:`2px dashed ${drag?"#3b82f6":"rgba(255,255,255,.1)"}`,
              background:drag?"rgba(59,130,246,.04)":"transparent",
              borderRadius:10, padding:"28px", textAlign:"center", cursor:"pointer", transition:"all .2s",
            }}>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);}}/>
            <Upload size={20} color="rgba(255,255,255,.25)" style={{ marginBottom:8 }}/>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.5)", fontWeight:500 }}>Drop CSV file or click to browse</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.25)", marginTop:5 }}>email, name, role columns</div>
          </div>

          {csvPrev.length > 0 && (
            <>
              <div style={{ background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.07)", borderRadius:9, overflow:"hidden", maxHeight:240, overflowY:"auto" }}>
                <div style={{ padding:"9px 13px", borderBottom:"1px solid rgba(255,255,255,.05)", fontSize:11, fontWeight:600, color:"rgba(255,255,255,.4)" }}>
                  CSV Preview — {csvPrev.length} rows
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr>
                    {["Email","Name","Role"].map(h=><th key={h} style={{ padding:"7px 13px", textAlign:"left", fontSize:10, fontWeight:600, color:"rgba(255,255,255,.28)", textTransform:"uppercase", letterSpacing:".06em", borderBottom:"1px solid rgba(255,255,255,.05)" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {csvPrev.slice(0,15).map((r,i)=>(
                      <tr key={i}>
                        <td style={{ padding:"7px 13px", fontSize:11, fontFamily:"var(--mono)", color:"rgba(255,255,255,.65)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{r.email}</td>
                        <td style={{ padding:"7px 13px", fontSize:12, color:"rgba(255,255,255,.55)", borderBottom:"1px solid rgba(255,255,255,.03)" }}>{r.name||"—"}</td>
                        <td style={{ padding:"7px 13px", borderBottom:"1px solid rgba(255,255,255,.03)" }}>
                          <Chip color={r.role==="student"?"#8b5cf6":"#10b981"}>{r.role}</Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={()=>runBulk(csvPrev)} disabled={importing} style={{
                display:"flex", alignItems:"center", gap:7, padding:"10px 18px", alignSelf:"flex-start",
                background:"#3b82f6", border:"none", borderRadius:8, color:"#fff",
                fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"var(--font)",
              }}>
                {importing?"Importing…":<><Upload size={13}/> Import {csvPrev.length} Users</>}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
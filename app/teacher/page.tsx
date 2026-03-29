"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Bot, User, Plus, MessageSquare, Trash2,
  PanelLeftClose, PanelLeftOpen, BookOpen, FlaskConical,
  Bell, BarChart3, CheckCircle, XCircle, FileText,
  Calendar, Upload, ChevronRight, ArrowLeft, Zap, Grid, X, Clock,
  AlertTriangle, ExternalLink
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AttendanceMarksImport } from "@/components/teacher/AttendanceMarksImport";
import { getStudentsInSubject, getSubjectAnalytics } from "@/lib/db_extended";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── NEW: real-data hooks & components ─────────────────────────────────────────
import {
  useFacultySubjects,
  useFacultyLabRequests,
  useFacultyAttendance,
  useFacultySchedule,
  useDocuments,
  useNotifications,
} from "@/hooks/useData";
import NotificationBell from "@/components/NotificationBell";
import type { DBSubject, DBDocument } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────
type View = "dashboard" | "subjects" | "analytics" | "calendar" | "chat" | "lab";
interface ChatMsg { id: string; role: "user" | "assistant"; content: string; thread_id: string; }
interface Thread  { thread_id: string; title: string; }

const FACULTY_FALLBACK = {
  id: "FAC-MIT-0042", 
  name: "Dr. Priya Sharma", 
  initials: "PS",
  dept: "Computer Science & Engineering", 
  designation: "Faculty", // Updated to match your DB
  email: "priya.sharma@mit.edu" // Added email for completeness
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function getTodayName() { return new Date().toLocaleDateString("en-IN", { weekday: "long" }); }
function formatSize(bytes: number) {
  if (!bytes) return "—";
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}
function statusColor(s: string) { return s === "safe" ? "#10b981" : s === "risk" ? "#f59e0b" : "#ef4444"; }

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function SideNav({ view, setView, faculty, pendingCount, isOpen, setIsOpen, threads, activeThread, setActiveThread, onNewChat }: {
  view: View; setView: (v: View) => void; faculty: typeof FACULTY_FALLBACK; pendingCount: number;
  isOpen: boolean; setIsOpen: (b: boolean) => void; threads: Thread[]; activeThread: string | null;
  setActiveThread: (id: string) => void; onNewChat: () => void;
}) {
  const NAV = [
    { id: "dashboard" as View, icon: Grid,          label: "Dashboard" },
    { id: "subjects"  as View, icon: BookOpen,      label: "Subjects" },
    { id: "analytics" as View, icon: BarChart3,     label: "Analytics" },
    { id: "calendar"  as View, icon: Calendar,      label: "Calendar" },
    { id: "lab"       as View, icon: FlaskConical,  label: "Lab Requests" },
    { id: "chat"      as View, icon: MessageSquare, label: "AI Chat" },
  ];
  const AC = "#0ea5e9";
  return (
    <aside style={{ width: isOpen ? 220 : 0, minWidth: isOpen ? 220 : 0, background: "#070c14", borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", overflow: "hidden", transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0, zIndex: 20 }}>
      <div style={{ width: 220, height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "15px 14px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: "#fff" }}>
            Campus<span style={{ color: AC }}>Copilot</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: AC, background: `${AC}18`, border: `1px solid ${AC}30`, padding: "2px 6px", borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.05em", marginLeft: 6 }}>Faculty</span>
          </span>
          <button onClick={() => setIsOpen(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", padding: 3, borderRadius: 5 }}><PanelLeftClose size={13} /></button>
        </div>
        <nav style={{ padding: "8px 7px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setView(n.id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: view === n.id ? `${AC}18` : "transparent", color: view === n.id ? "#38bdf8" : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: view === n.id ? 600 : 400, transition: "all 0.15s", textAlign: "left", fontFamily: "'Outfit',sans-serif", position: "relative" }}>
              <n.icon size={14} style={{ flexShrink: 0 }} />
              {n.label}
              {n.id === "lab" && pendingCount > 0 && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#f59e0b", color: "#000", borderRadius: 100, padding: "1px 6px" }}>{pendingCount}</span>}
            </button>
          ))}
        </nav>
        {view === "chat" && (
          <>
            <button onClick={onNewChat} style={{ margin: "0 7px 4px", padding: "7px 10px", background: `${AC}15`, border: `1px solid ${AC}20`, borderRadius: 8, color: "#7dd3fc", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "'Outfit',sans-serif" }}>
              <Plus size={12} /> New Chat
            </button>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 7px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.07em", padding: "5px 5px 3px" }}>Recent</div>
              {threads.length === 0
                ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "4px 5px" }}>No chats yet.</div>
                : threads.map(t => (
                  <button key={t.thread_id} onClick={() => setActiveThread(t.thread_id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 7px", borderRadius: 7, border: "none", cursor: "pointer", background: activeThread === t.thread_id ? `${AC}15` : "transparent", color: activeThread === t.thread_id ? "#7dd3fc" : "rgba(255,255,255,0.4)", fontSize: 12, width: "100%", textAlign: "left", fontFamily: "'Outfit',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <MessageSquare size={10} style={{ flexShrink: 0, opacity: 0.5 }} />{t.title}
                  </button>
                ))
              }
            </div>
          </>
        )}
        {view !== "chat" && <div style={{ flex: 1 }} />}
        <div style={{ padding: "8px 7px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 9 }}>
            <div style={{ width: 27, height: 27, borderRadius: 7, background: "linear-gradient(135deg,#0ea5e9,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{faculty.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{faculty.name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{faculty.designation}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Dashboard View — live stats ───────────────────────────────────────────────
function DashboardView({ facultyId, setView, onAsk }: {
  facultyId: string; setView: (v: View) => void; onAsk: (q: string) => void;
}) {
  const { data: subjects,   loading: subjLoading } = useFacultySubjects(facultyId);
  const { data: attMap,     loading: attLoading  } = useFacultyAttendance(facultyId);
  const { requests, pendingCount, loading: labLoading } = useFacultyLabRequests(facultyId);
  const { data: schedule,   loading: schedLoading } = useFacultySchedule(facultyId);

  const today         = getTodayName();
  const todaySlots    = (schedule || []).filter((s: any) => s.day === today);
  const allStudents   = Object.values(attMap || {}).flat() as any[];
  const uniqueStudents = new Set(allStudents.map((s: any) => s.student?.id || s.student_id)).size;
  const atRisk         = allStudents.filter((s: any) => s.percentage < 75).length;
  const avgAtt         = allStudents.length
    ? Math.round(allStudents.reduce((a: number, s: any) => a + s.percentage, 0) / allStudents.length)
    : 0;

  const loading = subjLoading || attLoading || labLoading || schedLoading;

  const STATS = [
    { label: "Total Students",    val: loading ? "…" : uniqueStudents, icon: AlertTriangle, color: "#0ea5e9", action: () => setView("analytics") },
    { label: "At Risk",           val: loading ? "…" : atRisk,         icon: AlertTriangle, color: "#ef4444", action: () => setView("analytics") },
    { label: "Avg Attendance",    val: loading ? "…" : `${avgAtt}%`,   icon: BarChart3,     color: "#10b981", action: () => setView("analytics") },
    { label: "Pending Requests",  val: loading ? "…" : pendingCount,   icon: Clock,         color: "#f59e0b", action: () => setView("lab") },
  ];

  const QUICK = [
    { label: "Attendance report",   text: "Generate attendance report for all my classes — list students below 75%" },
    { label: "At-risk students",    text: "Which students are at risk of detention across all my subjects?" },
    { label: "Performance summary", text: "Give me a class performance analytics summary for this semester" },
    { label: "Draft announcement",  text: "Draft an announcement about the upcoming midsem exam schedule" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"} 👋
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {STATS.map((s, i) => (
          <button key={i} onClick={s.action} style={{ padding: "18px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, textAlign: "left", cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit',sans-serif" }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.borderColor = `${s.color}40`; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
            <s.icon size={16} style={{ color: s.color, marginBottom: 10 }} />
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1, letterSpacing: "-0.02em", marginBottom: 4 }}>{s.val}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{s.label}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Today's schedule — live from DB */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Today · {today}</div>
            <button onClick={() => setView("calendar")} style={{ fontSize: 11, color: "#0ea5e9", background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Calendar →</button>
          </div>
          {schedLoading
            ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "16px 0" }}>Loading schedule…</div>
            : todaySlots.length === 0
              ? <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", padding: "20px 0", textAlign: "center" }}>No classes today 🎉</div>
              : todaySlots.map((cls: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "rgba(255,255,255,0.35)", minWidth: 44, flexShrink: 0 }}>{cls.start_time.slice(0, 5)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{cls.subject?.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{cls.room} · {cls.type}</div>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Quick AI actions */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Quick AI Actions</div>
          {QUICK.map((p, i) => (
            <button key={i} onClick={() => { setView("chat"); onAsk(p.text); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, marginBottom: 5, cursor: "pointer", textAlign: "left", fontFamily: "'Outfit',sans-serif", transition: "all 0.15s" }}
              onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(14,165,233,0.08)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(14,165,233,0.2)"; }}
              onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.06)"; }}>
              <Zap size={11} style={{ color: "#0ea5e9", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pending lab requests preview */}
      {pendingCount > 0 && (
        <div style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 14, padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", display: "flex", alignItems: "center", gap: 6 }}><Clock size={13} />{pendingCount} lab requests need your attention</div>
            <button onClick={() => setView("lab")} style={{ fontSize: 11, color: "#f59e0b", background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Manage all →</button>
          </div>
          {requests.filter(r => r.status === "pending").slice(0, 2).map((r: any, i: number) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", padding: "5px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>{r.student?.name || r.student_id}</strong> — {r.lab_name} · {r.date} ({r.slot})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subjects View — live docs ─────────────────────────────────────────────────
function SubjectsView({ facultyId }: { facultyId: string }) {
  const { data: subjects, loading: subjLoading } = useFacultySubjects(facultyId);
  const [openId, setOpenId] = useState<string | null>(null);

  const openSubject = openId ? (subjects || []).find((s: any) => s.id === openId) : null;
  const [showImport, setShowImport] = useState(false);
  const [importStudents, setImportStudents] = useState<any[]>([]);
  useEffect(() => {
    if (openSubject) {
      getStudentsInSubject(openSubject.id).then(setImportStudents);
    }
  }, [openSubject]);
  
  // Inner doc panel
  const { docs, loading: docLoading, upload, remove } = useDocuments(openId);
  const [uploading, setUploading] = useState(false);
  const [notif,     setNotif]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (m: string) => { setNotif(m); setTimeout(() => setNotif(null), 3500); };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !openId) return;
    setUploading(true);
    try {
      await upload(file, facultyId);
      notify(`✅ "${file.name}" uploaded — visible to students instantly`);
    } catch (e: any) { notify(`❌ Upload failed: ${e.message}`); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  

  const handleDelete = async (doc: DBDocument) => {
    if (!confirm(`Remove "${doc.name}"?`)) return;
    try { await remove({ id: doc.id, file_path: doc.file_path }); notify("Document removed."); }
    catch (e: any) { notify(`❌ ${e.message}`); }
  };

  if (openSubject) return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      {notif && <div style={{ position: "fixed", top: 20, right: 20, background: notif.startsWith("❌") ? "#ef4444" : "#0ea5e9", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 100 }}>{notif}</div>}
      <button onClick={() => setOpenId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, marginBottom: 20, fontFamily: "'Outfit',sans-serif", padding: 0 }}><ArrowLeft size={14} /> All Subjects</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${openSubject.color}20`, border: `1px solid ${openSubject.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: openSubject.color }}>{openSubject.code.split(" ")[1]}</div>
        <div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>{openSubject.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{openSubject.code}</div></div>
        
        {/* NEW: Import Button */}
        <button onClick={() => setShowImport(p => !p)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", marginLeft: "auto",
          background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: 9, color: "#4ade80", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          📊 Import Attendance / Marks
        </button>
      </div>

      {/* NEW: Import Panel */}
      {showImport && (
        <div style={{ marginBottom: 20, padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
            Import Attendance & Marks — {openSubject.code}
          </div>
          <AttendanceMarksImport
            subjectId={openSubject.id}
            subjectCode={openSubject.code}
            facultyId={facultyId}
            students={importStudents}
            onDone={() => setShowImport(false)}
          />
        </div>
      )}

      <div style={{ background: "rgba(14,165,233,0.05)", border: "2px dashed rgba(14,165,233,0.2)", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <Upload size={20} style={{ color: "#0ea5e9", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 2 }}>Upload Study Material</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>PDFs appear instantly in student subject workspace</div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={handleUpload} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 9, cursor: uploading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Outfit',sans-serif", opacity: uploading ? 0.6 : 1 }}>
          {uploading ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : <Upload size={14} />}
          {uploading ? "Uploading…" : "Choose File"}
        </button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
        Uploaded Materials ({docs.length})
      </div>
      {docLoading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Fetching documents…</div>}
      {!docLoading && docs.length === 0 && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", padding: "32px 0", textAlign: "center" }}>No materials yet. Upload the first one above.</div>}
      {docs.map((doc: DBDocument) => (
        <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, marginBottom: 6 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{doc.type === "slides" ? "🎞️" : doc.type === "notes" ? "📝" : "📄"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{formatSize(doc.size_bytes)}{doc.pages ? ` · ${doc.pages} pages` : ""} · {new Date(doc.created_at).toLocaleDateString("en-IN")}</div>
          </div>
          <span style={{ fontSize: 10, color: "#10b981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", padding: "2px 8px", borderRadius: 100, flexShrink: 0 }}>Live</span>
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 4, borderRadius: 5, display: "flex", flexShrink: 0, textDecoration: "none" }}
            onMouseOver={e => (e.currentTarget.style.color = "#0ea5e9")} onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
            <ExternalLink size={13} />
          </a>
          <button onClick={() => handleDelete(doc)} style={{ background: "transparent", border: "none", color: "rgba(255,100,100,0.5)", cursor: "pointer", padding: 4, borderRadius: 5, display: "flex", flexShrink: 0 }}
            onMouseOver={e => (e.currentTarget.style.color = "#ef4444")} onMouseOut={e => (e.currentTarget.style.color = "rgba(255,100,100,0.5)")}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Subjects</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>Manage materials for each subject. Uploads appear instantly for students.</div>
      {subjLoading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading subjects…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {(subjects || []).map((s: any) => (
          <button key={s.id} onClick={() => setOpenId(s.id)} style={{ padding: "20px", background: "rgba(255,255,255,0.02)", border: `1px solid ${s.color}25`, borderRadius: 14, textAlign: "left", cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit',sans-serif" }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
            <div style={{ height: 3, background: s.color, borderRadius: 3, marginBottom: 16 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: s.color }}>{s.code.split(" ")[1]}</div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono',monospace" }}>{s.code}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, fontFamily: "'Syne',sans-serif" }}>{s.name}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.document_count ?? 0} docs · {s.student_count ?? 0} students</span>
              <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.25)" }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics View — live ─────────────────────────────────────────────────────
function AnalyticsView({ facultyId, onAsk, setView }: { facultyId: string; onAsk: (q: string) => void; setView: (v: View) => void; }) {
  const { data: attMap,    loading: attLoading  } = useFacultyAttendance(facultyId);
  const { data: subjects,  loading: subjLoading } = useFacultySubjects(facultyId);
  const [drill,      setDrill]      = useState<"attendance" | null>(null);
  const [selSubject, setSelSubject] = useState("");

  const allRecords: any[] = Object.values(attMap || {}).flat();
  const subjectCodes = Object.keys(attMap || {});
  const activeSubject = selSubject || subjectCodes[0] || "";
  
  // NEW: Fetch live student list for analytics drill down
  const [analytics, setAnalytics] = useState<any>(null);
  useEffect(() => {
    if (activeSubject) {
      getSubjectAnalytics(activeSubject).then(setAnalytics);
    }
  }, [activeSubject]);

  const activeRecords: any[] = analytics?.students || (attMap || {})[activeSubject] || [];

  const totalUniq   = new Set(allRecords.map((s: any) => s.student?.id)).size;
  const below75     = allRecords.filter((s: any) => s.percentage < 75);
  const avgAtt      = allRecords.length ? Math.round(allRecords.reduce((a, s) => a + s.percentage, 0) / allRecords.length) : 0;
  const top         = allRecords.filter((s: any) => s.percentage >= 90);

  const STATS = [
    { label: "Total Students",  val: totalUniq,   color: "#0ea5e9", drill: false },
    { label: "Avg Attendance",  val: `${avgAtt}%`, color: "#10b981", drill: true  },
    { label: "Below 75%",       val: below75.length, color: "#ef4444", drill: true },
    { label: "Top Performers",  val: top.length,  color: "#a78bfa", drill: false },
  ];

  if (attLoading) return <div style={{ flex: 1, padding: "28px 32px", fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading analytics…</div>;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Analytics</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>Live data from Supabase.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
        {STATS.map((c, i) => (
          <button key={i} onClick={() => c.drill ? setDrill("attendance") : undefined}
            style={{ padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: `1px solid ${c.color}25`, borderRadius: 13, textAlign: "left", cursor: c.drill ? "pointer" : "default", transition: "all 0.2s", fontFamily: "'Outfit',sans-serif" }}
            onMouseOver={e => { if (c.drill) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 700, color: c.color, lineHeight: 1, marginBottom: 5 }}>{c.val}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{c.label}</div>
            {c.drill && <div style={{ fontSize: 11, color: c.color }}>click to expand</div>}
          </button>
        ))}
      </div>

      {drill === "attendance" && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Attendance Breakdown</div>
            <button onClick={() => setDrill(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex" }}><X size={15} /></button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {subjectCodes.map(code => (
              <button key={code} onClick={() => setSelSubject(code)} style={{ padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: activeSubject === code ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.04)", color: activeSubject === code ? "#38bdf8" : "rgba(255,255,255,0.4)", fontFamily: "'Outfit',sans-serif" }}>{code}</button>
            ))}
          </div>
          {activeRecords.slice().sort((a: any, b: any) => a.percentage - b.percentage).map((s: any, i: number) => {
            const pct = Math.round(s.percentage);
            const status = pct >= 75 ? "safe" : pct >= 65 ? "risk" : "detained";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", minWidth: 130, flexShrink: 0 }}>{s.student?.name || s.student_id}</div>
                <div style={{ flex: 1, height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: statusColor(status), borderRadius: 4 }} />
                </div>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, color: statusColor(status), minWidth: 36, textAlign: "right" }}>{pct}%</div>
                <div style={{ fontSize: 10, color: statusColor(status), minWidth: 50, textAlign: "right" }}>{status}</div>
              </div>
            );
          })}
          <button onClick={() => { setView("chat"); onAsk(`Full attendance report for ${activeSubject} with recovery recommendations`); }}
            style={{ marginTop: 10, width: "100%", padding: "9px 0", background: "transparent", border: "1px dashed rgba(14,165,233,0.3)", color: "#0ea5e9", borderRadius: 9, fontSize: 12, cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>
            Ask AI for full report →
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Subjects Overview</div>
          {(subjects || []).map((s: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div><div style={{ fontSize: 13, color: "#fff" }}>{s.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{s.code}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: "#0ea5e9" }}>{s.document_count ?? 0} docs</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{s.student_count ?? 0} students</div></div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 14 }}>At-Risk Students</div>
          {below75.length === 0
            ? <div style={{ fontSize: 13, color: "#10b981" }}>✅ All students above 75%</div>
            : below75.slice(0, 8).map((s: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.percentage < 65 ? "#ef4444" : "#f59e0b", flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 }}>{s.student?.name || s.student_id}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.percentage < 65 ? "#ef4444" : "#f59e0b" }}>{Math.round(s.percentage)}%</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Calendar View — live schedule ────────────────────────────────────────────
function CalendarView({ facultyId }: { facultyId: string }) {
  const { data: slots, loading } = useFacultySchedule(facultyId);
  const [sel, setSel] = useState<string | null>(null);
  const today = getTodayName();
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const byDay: Record<string, any[]> = {};
  DAYS.forEach(d => (byDay[d] = []));
  (slots || []).forEach((s: any) => { if (byDay[s.day]) byDay[s.day].push(s); });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Weekly Schedule</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>Click a class slot for details.</div>
      {loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Loading schedule…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
        {DAYS.map(day => (
          <div key={day} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${day === today ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "9px 11px", background: day === today ? "rgba(14,165,233,0.1)" : "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: day === today ? "#38bdf8" : "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{day.slice(0, 3)}</div>
              {day === today && <div style={{ fontSize: 9, color: "#38bdf8", marginTop: 1 }}>Today</div>}
            </div>
            <div style={{ padding: "8px 7px", minHeight: 90, display: "flex", flexDirection: "column", gap: 5 }}>
              {byDay[day].length === 0
                ? <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: 18 }}>Free</div>
                : byDay[day].map((cls: any, i: number) => {
                  const k = `${day}-${i}`;
                  return (
                    <button key={i} onClick={() => setSel(sel === k ? null : k)} style={{ padding: "7px 9px", background: sel === k ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${sel === k ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "'Outfit',sans-serif", transition: "all 0.15s" }}>
                      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>{cls.start_time.slice(0, 5)}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "#fff", lineHeight: 1.3 }}>{cls.subject?.name}</div>
                      {sel === k && <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.4)", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 4 }}>{cls.room} · {cls.type}{cls.section ? ` · Sec ${cls.section}` : ""}</div>}
                    </button>
                  );
                })
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Lab View — live requests ──────────────────────────────────────────────────
function LabView({ facultyId, onAsk, setView }: { facultyId: string; onAsk: (q: string) => void; setView: (v: View) => void; }) {
  const { requests, loading, pendingCount, updateStatus } = useFacultyLabRequests(facultyId);
  const [filter,   setFilter]   = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const COLORS: Record<string, string> = { pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444" };
  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  const handleUpdate = async (id: string, status: "approved" | "rejected") => {
    setUpdating(id);
    try { await updateStatus(id, status); } catch { } finally { setUpdating(null); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>Lab Requests</div>
        {pendingCount > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", padding: "3px 10px", borderRadius: 100 }}>{pendingCount} pending</span>}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>Approvals send instant notifications to students.</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "'Outfit',sans-serif", transition: "all 0.15s", background: filter === f ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.04)", color: filter === f ? "#38bdf8" : "rgba(255,255,255,0.4)" }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}{f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>
      {loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "16px 0" }}>Loading requests…</div>}
      {!loading && filtered.length === 0 && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", padding: "32px 0", textAlign: "center" }}>No {filter !== "all" ? filter : ""} requests.</div>}
      {filtered.map(req => {
        const c = COLORS[req.status];
        return (
          <div key={req.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: `3px solid ${c}`, borderRadius: 12, padding: "14px 18px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: req.status === "pending" ? 12 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{(req as any).student?.name || req.student_id}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono',monospace" }}>{req.student_id}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}><strong style={{ color: "rgba(255,255,255,0.75)" }}>{req.lab_name}</strong> · {req.date} · {req.slot}</div>
                {req.reason && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>"{req.reason}"</div>}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: c, background: `${c}18`, border: `1px solid ${c}30`, padding: "3px 10px", borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>{req.status}</span>
            </div>
            {req.status === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={updating === req.id} onClick={() => handleUpdate(req.id, "approved")}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: "none", background: "rgba(16,185,129,0.12)", color: "#10b981", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit',sans-serif", transition: "all 0.2s", opacity: updating === req.id ? 0.5 : 1 }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "#10b981"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#10b981"; }}>
                  <CheckCircle size={12} /> Approve
                </button>
                <button disabled={updating === req.id} onClick={() => handleUpdate(req.id, "rejected")}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit',sans-serif", transition: "all 0.2s", opacity: updating === req.id ? 0.5 : 1 }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}>
                  <XCircle size={12} /> Reject
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button onClick={() => { setView("chat"); onAsk("Summarise all pending lab requests and recommend priorities"); }}
        style={{ marginTop: 6, width: "100%", padding: "10px 0", background: "transparent", border: "1px dashed rgba(14,165,233,0.25)", color: "#0ea5e9", borderRadius: 9, fontSize: 12, cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>
        Ask AI to summarise requests →
      </button>
    </div>
  );
}

// ─── Chat View (unchanged from original) ─────────────────────────────────────
function ChatView({ faculty, pendingPrompt, clearPendingPrompt }: { faculty: typeof FACULTY_FALLBACK; pendingPrompt: string | null; clearPendingPrompt: () => void; }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [threads,  setThreads]  = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input,    setInput]    = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const pendingFiredRef = useRef(false);
  const AC = "#0ea5e9";

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const fetchThreads = useCallback(async () => {
    const { data } = await supabase.from("messages").select("thread_id,content,created_at").eq("user_id", faculty.id).order("created_at", { ascending: false });
    if (data) {
      const seen = new Set<string>(); const ts: Thread[] = [];
      for (const m of data) { if (!seen.has(m.thread_id)) { seen.add(m.thread_id); ts.push({ thread_id: m.thread_id, title: m.content.slice(0, 30) + "…" }); } }
      setThreads(ts);
    }
  }, [faculty.id]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);
  useEffect(() => {
    if (!activeThreadId || isTyping) return;
    supabase.from("messages").select("*").eq("thread_id", activeThreadId).order("created_at", { ascending: true }).then(({ data }) => { if (data?.length) setMessages(data); });
  }, [activeThreadId]);

  useEffect(() => {
    if (pendingPrompt && !pendingFiredRef.current) { pendingFiredRef.current = true; handleSend(pendingPrompt); clearPendingPrompt(); }
    if (!pendingPrompt) pendingFiredRef.current = false;
  }, [pendingPrompt]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isTyping) return;
    const content = text.trim(); const isNew = !activeThreadId; const threadId = activeThreadId || crypto.randomUUID();
    setMessages(p => [...p, { id: Date.now().toString(), role: "user", content, thread_id: threadId }]);
    setInput(""); setIsTyping(true);
    const sid = "s-" + Date.now();
    setMessages(p => [...p, { id: sid, role: "assistant", content: "", thread_id: threadId }]); setStreamingId(sid);
    await supabase.from("messages").insert([{ user_id: faculty.id, content, role: "user", thread_id: threadId }]);
    try {
      const res = await fetch("http://localhost:8000/api/chat/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, user_id: faculty.id, history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })), role: "faculty" }) });
      if (!res.body) { setIsTyping(false); return; }
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buf = ""; let full = ""; let wb = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || "";
        let ev = ""; let ds = "";
        for (const l of lines) {
          if (l.startsWith("event:")) ev = l.slice(6).trim();
          else if (l.startsWith("data:")) ds = l.slice(5).trim();
          else if (l === "" && ev && ds) {
            try {
              const d = JSON.parse(ds);
              if (ev === "token") { wb += d.text || ""; if (/[\s\n]/.test(wb.slice(-1)) || wb.length > 15) { full += wb; wb = ""; setMessages(p => p.map(m => m.id === sid ? { ...m, content: full } : m)); await new Promise(r => setTimeout(r, 22)); } }
              else if (ev === "done") { if (wb) { full += wb; setMessages(p => p.map(m => m.id === sid ? { ...m, content: full } : m)); } await supabase.from("messages").insert([{ user_id: faculty.id, content: full, role: "assistant", thread_id: threadId }]); if (isNew) setActiveThreadId(threadId); fetchThreads(); }
              else if (ev === "error") setMessages(p => p.map(m => m.id === sid ? { ...m, content: "Something went wrong." } : m));
            } catch { } ev = ""; ds = "";
          }
        }
      }
    } catch { setMessages(p => p.map(m => m.id === sid ? { ...m, content: "Backend not reachable." } : m)); }
    setStreamingId(null); setIsTyping(false);
  };

  const PROMPTS = ["Attendance report — list all students below 75%", "Which students are at risk of detention?", "Draft midsem exam schedule announcement", "Performance analytics summary this semester", "Summarise all pending lab requests", "Help me create study plan recommendations"];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#04070e" }}>
      {messages.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 5, textAlign: "center" }}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {faculty.name.split(" ")[1]} 👋</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24, textAlign: "center" }}>{faculty.designation} · {faculty.dept}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, width: "100%", maxWidth: 620, marginBottom: 24 }}>
            {PROMPTS.map((p, i) => (<button key={i} onClick={() => handleSend(p)} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, fontSize: 12, color: "rgba(255,255,255,0.6)", cursor: "pointer", textAlign: "left", fontFamily: "'Outfit',sans-serif", transition: "all 0.2s" }} onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = `${AC}10`; (e.currentTarget as HTMLButtonElement).style.color = "#7dd3fc"; (e.currentTarget as HTMLButtonElement).style.borderColor = `${AC}30`; }} onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; }}>{p}</button>))}
          </div>
          <div style={{ width: "100%", maxWidth: 640 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "9px 10px 9px 16px" }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Ask about attendance, students, lab requests…" disabled={isTyping} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14, fontFamily: "'Outfit',sans-serif" }} />
              <button disabled={!input.trim() || isTyping} onClick={() => handleSend()} style={{ width: 32, height: 32, borderRadius: 9, background: input.trim() && !isTyping ? AC : "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: input.trim() && !isTyping ? "pointer" : "not-allowed", opacity: !input.trim() || isTyping ? 0.3 : 1 }}><Send size={14} strokeWidth={2.5} /></button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 20, paddingBottom: 32 }}>
              {messages.map(msg => (
                <div key={msg.id} style={{ display: "flex", gap: 10, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: msg.role === "assistant" ? "linear-gradient(135deg,#0ea5e9,#6366f1)" : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{msg.role === "assistant" ? <Bot size={15} /> : <User size={15} />}</div>
                  <div className="bubble" style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.85)", maxWidth: "88%", background: msg.role === "user" ? "rgba(255,255,255,0.06)" : "transparent", border: msg.role === "user" ? "1px solid rgba(255,255,255,0.08)" : "none", padding: msg.role === "user" ? "10px 14px" : "0", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "0" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ node, inline, className, children, ...props }: any) { const match = /language-(\w+)/.exec(className || ""); return !inline && match ? (<div style={{ borderRadius: 8, overflow: "hidden", margin: "12px 0" }}><div style={{ background: "#1a1a1a", padding: "5px 14px", fontSize: 10, color: "#555", borderBottom: "1px solid #222" }}>{match[1]}</div><SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: 14, background: "#141414", fontSize: 12 }} {...props}>{String(children).replace(/\n$/, "")}</SyntaxHighlighter></div>) : <code style={{ background: "rgba(255,255,255,0.09)", padding: "2px 6px", borderRadius: 4, fontSize: "0.88em", fontFamily: "DM Mono,monospace" }} {...props}>{children}</code>; } }}>{msg.content || " "}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {isTyping && !messages.find(m => m.id === streamingId) && (<div style={{ display: "flex", gap: 10 }}><div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#0ea5e9,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bot size={15} /></div><div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}><div style={{ width: 14, height: 14, border: "2px solid rgba(14,165,233,0.3)", borderTopColor: "#0ea5e9", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /><span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Thinking…</span></div></div>)}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div style={{ padding: "10px 16px 16px", background: "linear-gradient(to top,#04070e 60%,transparent)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "9px 10px 9px 16px", maxWidth: 700, margin: "0 auto" }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Ask anything…" disabled={isTyping} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14, fontFamily: "'Outfit',sans-serif" }} />
              <button disabled={!input.trim() || isTyping} onClick={() => handleSend()} style={{ width: 32, height: 32, borderRadius: 9, background: input.trim() && !isTyping ? AC : "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: input.trim() && !isTyping ? "pointer" : "not-allowed", opacity: !input.trim() || isTyping ? 0.3 : 1 }}><Send size={14} strokeWidth={2.5} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TeacherPage() {
  const router = useRouter();
  const [view,          setView]          = useState<View>("dashboard");
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [faculty,       setFaculty]       = useState(FACULTY_FALLBACK);
  const [authReady,     setAuthReady]     = useState(false);
  const [threads,       setThreads]       = useState<Thread[]>([]);
  const [activeThread,  setActiveThread]  = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Live pending count from real data - using the verified state ID
  const { pendingCount } = useFacultyLabRequests(faculty.id);

  useEffect(() => {
    // 🚨 DEMO OVERRIDE: Instantly force login as Dr. Priya Sharma
    // This bypasses the login screen entirely so you can just show the UI
    sessionStorage.setItem("cc_email", "priya.sharma@mit.edu");
    sessionStorage.setItem("cc_role", "faculty");
    sessionStorage.setItem("cc_name", "Dr. Priya Sharma");
    sessionStorage.setItem("cc_user_id", "FAC-MIT-0042");

    const email = sessionStorage.getItem("cc_email");
    const name  = sessionStorage.getItem("cc_name");
    
    // Generate initials for the avatar (e.g., "PS")
    const initials = name?.split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
    
    // Set the state perfectly so all the database hooks pull her real data
    setFaculty({ 
      ...FACULTY_FALLBACK, 
      id: "FAC-MIT-0042",
      name: name || FACULTY_FALLBACK.name, 
      initials: initials || FACULTY_FALLBACK.initials,
      email: email || "priya.sharma@mit.edu"
    });
    
    setAuthReady(true);
  }, [router]);

  if (!authReady) return null;

  const handleAsk = (q: string) => {
    setPendingPrompt(null);
    setTimeout(() => { setView("chat"); setPendingPrompt(q); }, 50);
  };

  const TITLES: Record<View, string> = { dashboard: "Dashboard", subjects: "Subjects", analytics: "Analytics", calendar: "Calendar", chat: "AI Chat", lab: "Lab Requests" };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#04070e", color: "#fff", fontFamily: "'Outfit',sans-serif", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#0ea5e9;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px;}
        button{font-family:'Outfit',sans-serif;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        .bubble p{margin-bottom:10px;}.bubble>*:last-child{margin-bottom:0;}
        .bubble ul,.bubble ol{margin-left:18px;margin-bottom:10px;}.bubble li{margin-bottom:4px;}
        .bubble h1,.bubble h2,.bubble h3{margin:14px 0 6px;color:#fff;font-weight:600;}
        .bubble table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px;}
        .bubble th{background:rgba(14,165,233,0.12);color:#38bdf8;padding:7px 12px;border:1px solid rgba(14,165,233,0.2);text-align:left;font-weight:600;font-size:12px;}
        .bubble td{padding:6px 12px;border:1px solid rgba(255,255,255,0.07);color:rgba(255,255,255,0.8);}
        .bubble tr:nth-child(even) td{background:rgba(255,255,255,0.02);}
      `}</style>

      <SideNav
        view={view} setView={setView} faculty={faculty}
        pendingCount={pendingCount} isOpen={sidebarOpen} setIsOpen={setSidebarOpen}
        threads={threads} activeThread={activeThread}
        setActiveThread={id => { setActiveThread(id); setView("chat"); }}
        onNewChat={() => { setActiveThread(null); setView("chat"); }}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", display: "flex", padding: 4, borderRadius: 6, marginRight: 4 }}><PanelLeftOpen size={16} /></button>}
            <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: "#fff" }}>{TITLES[view]}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Live notification bell */}
            <NotificationBell userId={faculty.id} />
            <button onClick={() => { sessionStorage.clear(); router.replace("/login"); }}
              style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", background: "transparent", border: "1px solid rgba(255,255,255,0.07)", padding: "5px 12px", borderRadius: 8, cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.2)"; }}
              onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Views — all wired to real data */}
        {view === "dashboard" && <DashboardView facultyId={faculty.id} setView={setView} onAsk={handleAsk} />}
        {view === "subjects"  && <SubjectsView  facultyId={faculty.id} />}
        {view === "analytics" && <AnalyticsView facultyId={faculty.id} onAsk={handleAsk} setView={setView} />}
        {view === "calendar"  && <CalendarView  facultyId={faculty.id} />}
        {view === "lab"       && <LabView       facultyId={faculty.id} onAsk={handleAsk} setView={setView} />}
        {view === "chat"      && <ChatView      faculty={faculty} pendingPrompt={pendingPrompt} clearPendingPrompt={() => setPendingPrompt(null)} />}
      </div>
    </div>
  );
}
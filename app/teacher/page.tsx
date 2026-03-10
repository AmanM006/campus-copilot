"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Bot, User, Plus, MessageSquare, Settings, Trash2,
  PanelLeftClose, PanelLeftOpen, PanelRightClose,
  Users, BookOpen, FlaskConical, Bell, BarChart3,
  CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ArrowLeft, FileText, Calendar
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message { id?: string; role: "user"|"assistant"; content: string; thread_id: string; }
interface Thread { thread_id: string; title: string; }

// ─── Hardcoded Faculty Data (replace with SSO) ────────────────────────────────
const FACULTY = {
  id: "FAC-MIT-0042",
  name: "Dr. Priya Sharma",
  initials: "PS",
  dept: "Computer Science & Engineering",
  designation: "Associate Professor",
  subjects: ["CSS 2203 – Introduction to AI", "CSS 2202 – Design & Analysis of Algorithms"],
};

// ─── Hardcoded Class Data ─────────────────────────────────────────────────────

const CLASS_ATTENDANCE: Record<string, Array<{id:string; name:string; percent:number; status:"safe"|"risk"|"detained"}>> = {
  "CSS 2203": [
    { id:"213CS1001", name:"Aman Mehta",        percent:72, status:"risk" },
    { id:"213CS1002", name:"Priya Nair",         percent:91, status:"safe" },
    { id:"213CS1003", name:"Rohan Verma",        percent:58, status:"detained" },
    { id:"213CS1004", name:"Sneha Kulkarni",     percent:83, status:"safe" },
    { id:"213CS1005", name:"Dev Patel",          percent:76, status:"safe" },
    { id:"213CS1006", name:"Ananya Rao",         percent:69, status:"risk" },
    { id:"213CS1007", name:"Kabir Singh",        percent:88, status:"safe" },
    { id:"213CS1008", name:"Meera Iyer",         percent:61, status:"detained" },
    { id:"213CS1009", name:"Arjun Reddy",        percent:94, status:"safe" },
    { id:"213CS1010", name:"Fatima Sheikh",      percent:77, status:"safe" },
  ],
  "CSS 2202": [
    { id:"213CS1001", name:"Aman Mehta",        percent:91, status:"safe" },
    { id:"213CS1002", name:"Priya Nair",         percent:88, status:"safe" },
    { id:"213CS1003", name:"Rohan Verma",        percent:71, status:"risk" },
    { id:"213CS1004", name:"Sneha Kulkarni",     percent:95, status:"safe" },
    { id:"213CS1005", name:"Dev Patel",          percent:64, status:"risk" },
    { id:"213CS1006", name:"Ananya Rao",         percent:55, status:"detained" },
    { id:"213CS1007", name:"Kabir Singh",        percent:82, status:"safe" },
    { id:"213CS1008", name:"Meera Iyer",         percent:79, status:"safe" },
    { id:"213CS1009", name:"Arjun Reddy",        percent:90, status:"safe" },
    { id:"213CS1010", name:"Fatima Sheikh",      percent:73, status:"risk" },
  ],
};

const LAB_BOOKING_REQUESTS = [
  { id:"BK001", student:"Aman Mehta",   studentId:"213CS1001", lab:"Robotics Lab",   date:"2026-03-12", slot:"Afternoon", reason:"Final year project work",       status:"pending" },
  { id:"BK002", student:"Dev Patel",    studentId:"213CS1005", lab:"OSDL Lab",       date:"2026-03-13", slot:"Morning",   reason:"OS assignment completion",      status:"pending" },
  { id:"BK003", student:"Priya Nair",   studentId:"213CS1002", lab:"AI/ML Lab",      date:"2026-03-14", slot:"Morning",   reason:"ML model training",             status:"approved" },
  { id:"BK004", student:"Kabir Singh",  studentId:"213CS1007", lab:"CNC Lab",        date:"2026-03-15", slot:"Afternoon", reason:"Manufacturing assignment",      status:"rejected" },
  { id:"BK005", student:"Meera Iyer",   studentId:"213CS1008", lab:"Electronics Lab",date:"2026-03-16", slot:"Morning",   reason:"Circuit design verification",   status:"pending" },
];

const GRIEVANCES = [
  { id:"GRV001", student:"Rohan Verma",   category:"academic",        subject:"Attendance marking error in CSS 2203",   date:"2026-03-08", urgency:"high",   status:"open" },
  { id:"GRV002", student:"Ananya Rao",    category:"infrastructure",  subject:"Projector not working in LH-102",        date:"2026-03-07", urgency:"medium", status:"resolved" },
  { id:"GRV003", student:"Meera Iyer",    category:"academic",        subject:"Grade discrepancy in midterm",           date:"2026-03-06", urgency:"high",   status:"open" },
  { id:"GRV004", student:"Dev Patel",     category:"administrative",  subject:"Late fee waiver request",                date:"2026-03-05", urgency:"low",    status:"open" },
];

const UPCOMING_CLASSES = [
  { time:"09:00", end:"10:00", subject:"Design & Analysis of Algorithms", room:"LH-102", section:"B", students:62 },
  { time:"11:30", end:"13:30", subject:"AI Lab",                           room:"CC-4",   section:"A", students:30 },
  { time:"14:30", end:"15:30", subject:"Introduction to AI",               room:"LH-205", section:"A", students:68 },
];

const FACULTY_QUICK_PROMPTS = [
  { icon: Users,      label: "Attendance report",  text: "Generate an attendance report for CSS 2203 — list students below 75%" },
  { icon: BarChart3,  label: "Class analytics",    text: "Give me a performance analytics summary for my classes this semester" },
  { icon: Bell,       label: "Send notice",         text: "Draft a notice to students about the upcoming midsem exam schedule" },
  { icon: FileText,   label: "Grade summary",       text: "Summarise the grade distribution for CSS 2203 midsem" },
  { icon: FlaskConical, label: "Lab requests",      text: "Show me all pending lab booking requests that need my approval" },
  { icon: AlertTriangle, label: "At-risk students", text: "Which students are at risk of being detained due to low attendance?" },
];

// ─── Lab Request Card ─────────────────────────────────────────────────────────
function LabRequestCard({ req, onUpdate }: { req: typeof LAB_BOOKING_REQUESTS[0]; onUpdate: (id:string, status:string) => void }) {
  const statusColors: Record<string, string> = { pending:"#f59e0b", approved:"#10b981", rejected:"#ef4444" };
  const color = statusColors[req.status];
  return (
    <div className="req-card">
      <div className="req-top">
        <div className="req-info">
          <div className="req-student">{req.student}</div>
          <div className="req-meta">{req.studentId} · {req.lab}</div>
          <div className="req-meta">{req.date} · {req.slot}</div>
          <div className="req-reason">"{req.reason}"</div>
        </div>
        <span className="req-badge" style={{ color, background:`${color}15`, border:`1px solid ${color}30` }}>
          {req.status}
        </span>
      </div>
      {req.status === "pending" && (
        <div className="req-actions">
          <button className="req-approve" onClick={() => onUpdate(req.id, "approved")}><CheckCircle size={12}/> Approve</button>
          <button className="req-reject"  onClick={() => onUpdate(req.id, "rejected")}><XCircle size={12}/> Reject</button>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Panel (Faculty) ────────────────────────────────────────────────
function FacultyDashboard({ onClose, onAsk }: { onClose:()=>void; onAsk:(q:string)=>void }) {
  const [activeTab, setActiveTab]   = useState<"today"|"attendance"|"requests"|"grievances">("today");
  const [selectedClass, setSelectedClass] = useState("CSS 2203");
  const [bookings, setBookings] = useState(LAB_BOOKING_REQUESTS);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });

  const students = CLASS_ATTENDANCE[selectedClass] || [];
  const safe     = students.filter(s => s.status === "safe").length;
  const atRisk   = students.filter(s => s.status === "risk").length;
  const detained = students.filter(s => s.status === "detained").length;
  const pending  = bookings.filter(b => b.status === "pending").length;
  const openGrievances = GRIEVANCES.filter(g => g.status === "open").length;

  const updateBooking = (id: string, status: string) => {
    setBookings(prev => prev.map(b => b.id === id ? {...b, status} : b));
  };

  return (
    <aside className="dash-panel">
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="dash-greeting">Dr. {FACULTY.name.split(" ")[1]} 👋</div>
          <div className="dash-time">{timeStr} · {now.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" })}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><PanelRightClose size={17}/></button>
      </div>

      {/* Faculty strip */}
      <div className="student-strip">
        <div className="student-avatar" style={{ background:"linear-gradient(135deg,#0ea5e9,#6366f1)" }}>{FACULTY.initials}</div>
        <div className="student-info">
          <div className="student-name">{FACULTY.name}</div>
          <div className="student-meta">{FACULTY.designation} · {FACULTY.dept.split(" ")[0]} Dept.</div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:18, fontWeight:700, color:"#0ea5e9" }}>{students.length}</div>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Students</div>
        </div>
      </div>

      {/* Stat row */}
      <div className="stat-cards">
        <div className={`stat-card ${atRisk+detained > 0 ? "stat-danger":"stat-ok"}`}>
          <div className="stat-icon"><Users size={13}/></div>
          <div className="stat-val">{atRisk+detained}</div>
          <div className="stat-label">At risk</div>
          <div className="stat-sub">{detained} detained</div>
        </div>
        <div className={`stat-card ${pending > 0 ? "stat-warn-card":"stat-ok"}`}>
          <div className="stat-icon"><FlaskConical size={13}/></div>
          <div className="stat-val">{pending}</div>
          <div className="stat-label">Lab requests</div>
          <div className="stat-sub">Pending approval</div>
        </div>
        <div className={`stat-card ${openGrievances > 0 ? "stat-danger":"stat-ok"}`}>
          <div className="stat-icon"><Bell size={13}/></div>
          <div className="stat-val">{openGrievances}</div>
          <div className="stat-label">Grievances</div>
          <div className="stat-sub">Open tickets</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="dash-tabs" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        {(["today","attendance","requests","grievances"] as const).map(t => (
          <button key={t} className={`dash-tab ${activeTab===t?"active":""}`} onClick={() => setActiveTab(t)}
            style={{ fontSize:10 }}>
            {t==="today"?"Today":t==="attendance"?"Attend.":t==="requests"?"Labs":"Issues"}
          </button>
        ))}
      </div>

      <div className="dash-body">

        {/* ── TODAY ── */}
        {activeTab === "today" && (
          <div className="sched-wrap">
            <div className="sched-day-header">
              <span className="sched-day-label">Today's Classes</span>
            </div>
            {UPCOMING_CLASSES.map((cls, i) => (
              <div key={i} className="sched-row upcoming">
                <div className="sched-time-col"><span className="sched-time">{cls.time}</span></div>
                <div className="sched-bar upcoming"/>
                <div className="sched-info">
                  <div className="sched-subj">{cls.subject}</div>
                  <div className="sched-meta">
                    {cls.room} · Sec {cls.section} ·
                    <span style={{ color:"#60a5fa" }}> {cls.students} students</span>
                  </div>
                </div>
              </div>
            ))}
            <button className="dash-ask-btn" onClick={() => onAsk("Summarise what I need to prepare for today's classes")}>
              Ask AI to prep briefing →
            </button>
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {activeTab === "attendance" && (
          <div className="att-wrap">
            {/* Class selector */}
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              {Object.keys(CLASS_ATTENDANCE).map(cls => (
                <button key={cls} onClick={() => setSelectedClass(cls)}
                  style={{ flex:1, padding:"6px 8px", borderRadius:8, border:"none", cursor:"pointer",
                    fontFamily:"'Outfit',sans-serif", fontSize:10, fontWeight:600, transition:"all 0.2s",
                    background: selectedClass===cls ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.03)",
                    color: selectedClass===cls ? "#38bdf8" : "rgba(255,255,255,0.4)" }}>
                  {cls}
                </button>
              ))}
            </div>
            {/* Summary bar */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:10 }}>
              {[["Safe",safe,"#10b981"],["At risk",atRisk,"#f59e0b"],["Detained",detained,"#ef4444"]].map(([l,v,c]) => (
                <div key={l as string} style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${(c as string)}25`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
                  <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:16, fontWeight:700, color:c as string }}>{v as number}</div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.05em", marginTop:2 }}>{l as string}</div>
                </div>
              ))}
            </div>
            {/* Student list */}
            {students.map((s, i) => {
              const color = s.status==="safe" ? "#10b981" : s.status==="risk" ? "#f59e0b" : "#ef4444";
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
                  background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)",
                  borderRadius:9, marginBottom:4 }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:`${color}18`, border:`1px solid ${color}30`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11, fontWeight:700, color, flexShrink:0 }}>
                    {s.name.split(" ").map((n:string) => n[0]).join("")}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:"#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.name}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)" }}>{s.id}</div>
                  </div>
                  <div style={{ fontFamily:"'Outfit',sans-serif", fontSize:14, fontWeight:700, color, flexShrink:0 }}>{s.percent}%</div>
                </div>
              );
            })}
            <button className="dash-ask-btn" onClick={() => onAsk(`Generate a detailed attendance report for ${selectedClass} with recommendations for at-risk students`)}>
              Ask AI for full report →
            </button>
          </div>
        )}

        {/* ── LAB REQUESTS ── */}
        {activeTab === "requests" && (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {bookings.map((req) => (
              <LabRequestCard key={req.id} req={req} onUpdate={updateBooking}/>
            ))}
            <button className="dash-ask-btn" onClick={() => onAsk("Summarise all pending lab booking requests and suggest which to prioritise")}>
              Ask AI to summarise →
            </button>
          </div>
        )}

        {/* ── GRIEVANCES ── */}
        {activeTab === "grievances" && (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {GRIEVANCES.map((g, i) => {
              const urgColor = g.urgency==="high" ? "#ef4444" : g.urgency==="medium" ? "#f59e0b" : "#60a5fa";
              return (
                <div key={i} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)",
                  borderLeft:`3px solid ${urgColor}`, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#fff", flex:1 }}>{g.subject}</div>
                    <span style={{ fontSize:9, fontWeight:700, color: g.status==="open"?"#f59e0b":"#10b981",
                      background: g.status==="open"?"rgba(245,158,11,0.1)":"rgba(16,185,129,0.1)",
                      padding:"2px 7px", borderRadius:100, flexShrink:0, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                      {g.status}
                    </span>
                  </div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>{g.student} · {g.category} · {g.date}</div>
                </div>
              );
            })}
            <button className="dash-ask-btn" onClick={() => onAsk("Help me draft a response to the open academic grievances from students")}>
              Ask AI to draft response →
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Main Teacher Page ────────────────────────────────────────────────────────
export default function TeacherPage() {
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [threads,        setThreads]        = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input,          setInput]          = useState("");
  const [isTyping,       setIsTyping]       = useState(false);
  const [isSidebarOpen,  setIsSidebarOpen]  = useState(true);
  const [isDashOpen,     setIsDashOpen]     = useState(true);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchThreads = useCallback(async () => {
    const { data } = await supabase.from("messages").select("thread_id, content, created_at")
      .eq("user_id", FACULTY.id).order("created_at", { ascending: true });
    if (data) {
      const map: Record<string,string> = {};
      data.forEach(m => { if (!map[m.thread_id]) map[m.thread_id] = m.content.slice(0,28)+"…"; });
      setThreads(Object.entries(map).map(([id,title]) => ({ thread_id:id, title })).reverse());
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);
  useEffect(() => {
    if (!activeThreadId) return;
    supabase.from("messages").select("*").eq("thread_id", activeThreadId)
      .order("created_at", { ascending:true })
      .then(({ data }) => { if (data) setMessages(data); });
  }, [activeThreadId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, isTyping]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isTyping) return;
    const userContent = text.trim();
    const threadId = activeThreadId || crypto.randomUUID();
    if (!activeThreadId) setActiveThreadId(threadId);
    setMessages(p => [...p, { role:"user", content:userContent, thread_id:threadId }]);
    setInput(""); setIsTyping(true);
    try {
      await supabase.from("messages").insert([{ user_id:FACULTY.id, content:userContent, role:"user", thread_id:threadId }]);
      const history = messages.slice(-4).map(m => ({ role:m.role, content:m.content }));
      const res = await fetch("http://localhost:8000/api/chat", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ message:userContent, user_id:FACULTY.id, history, role:"faculty" }),
      });
      const data = await res.json();
      await supabase.from("messages").insert([{ user_id:FACULTY.id, content:data.reply, role:"assistant", thread_id:threadId }]);
      setMessages(p => [...p, { role:"assistant", content:data.reply, thread_id:threadId }]);
      fetchThreads();
    } catch {
      setMessages(p => [...p, { role:"assistant", content:"I hit a snag. Please try again.", thread_id:threadId }]);
    } finally { setIsTyping(false); }
  };

  const deleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation(); setDeletingId(threadId);
    await supabase.from("messages").delete().eq("thread_id", threadId).eq("user_id", FACULTY.id);
    setThreads(p => p.filter(t => t.thread_id !== threadId));
    if (activeThreadId === threadId) { setActiveThreadId(null); setMessages([]); }
    setDeletingId(null);
  };

  const startNewChat = () => { setActiveThreadId(null); setMessages([]); inputRef.current?.focus(); };
  const isChatEmpty = messages.length === 0;

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        ::selection { background:#0ea5e9; color:#fff; }
        ::-webkit-scrollbar { width:3px; } ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:10px; }

        .root { font-family:'Outfit',sans-serif; background:#05080f; color:#fff; height:100vh; display:flex; overflow:hidden; position:relative; }
        .root::before { content:''; position:fixed; top:-200px; right:-100px; width:500px; height:500px; background:radial-gradient(circle,rgba(14,165,233,0.05) 0%,transparent 70%); pointer-events:none; animation:ambient 14s ease-in-out infinite alternate; }
        @keyframes ambient { 0%{transform:translate(0,0)} 100%{transform:translate(-40px,50px)} }

        /* Sidebar */
        .sidebar { background:#070c14; border-right:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; z-index:20; transition:width 0.3s cubic-bezier(0.4,0,0.2,1); overflow:hidden; white-space:nowrap; }
        .sidebar.open { width:252px; } .sidebar.closed { width:0; border:none; }
        .sidebar-inner { width:252px; height:100%; display:flex; flex-direction:column; }
        .sb-brand { padding:18px 18px 14px; display:flex; align-items:center; justify-content:space-between; }
        .sb-logo { font-family:'Outfit',sans-serif; font-weight:700; font-size:15px; color:#fff; text-decoration:none; letter-spacing:-0.01em; }
        .sb-logo span { color:#0ea5e9; }
        .sb-role-badge { font-size:9px; font-weight:700; color:#0ea5e9; background:rgba(14,165,233,0.12); border:1px solid rgba(14,165,233,0.2); padding:2px 8px; border-radius:100px; letter-spacing:0.05em; text-transform:uppercase; margin-left:6px; }
        .icon-btn { background:transparent; border:none; color:rgba(255,255,255,0.35); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:5px; border-radius:7px; transition:all 0.2s; }
        .icon-btn:hover { background:rgba(255,255,255,0.07); color:#fff; }
        .sb-new-btn { margin:0 10px 8px; background:rgba(14,165,233,0.1); color:#7dd3fc; border:1px solid rgba(14,165,233,0.18); padding:10px 14px; border-radius:10px; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; font-family:'Outfit',sans-serif; }
        .sb-new-btn:hover { background:rgba(14,165,233,0.18); color:#fff; }
        .sb-history { flex:1; overflow-y:auto; padding:0 8px; }
        .sb-section-label { font-size:10px; font-weight:600; color:rgba(255,255,255,0.2); text-transform:uppercase; letter-spacing:0.08em; padding:10px 10px 5px; }
        .sb-thread { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; color:rgba(255,255,255,0.5); font-size:13px; cursor:pointer; transition:all 0.2s; margin-bottom:1px; }
        .sb-thread:hover { background:rgba(255,255,255,0.05); color:#fff; }
        .sb-thread:hover .sb-del { opacity:1; }
        .sb-thread.active { background:rgba(14,165,233,0.1); color:#7dd3fc; }
        .sb-thread-title { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sb-del { opacity:0; transition:opacity 0.2s; background:transparent; border:none; color:rgba(255,100,100,0.6); cursor:pointer; display:flex; padding:2px; border-radius:4px; flex-shrink:0; }
        .sb-del:hover { color:#ef4444; background:rgba(239,68,68,0.1); }
        .sb-footer { padding:10px; border-top:1px solid rgba(255,255,255,0.05); }
        .sb-user-row { display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; cursor:pointer; transition:background 0.2s; }
        .sb-user-row:hover { background:rgba(255,255,255,0.04); }
        .sb-avatar { width:30px; height:30px; border-radius:8px; background:linear-gradient(135deg,#0ea5e9,#6366f1); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff; flex-shrink:0; }
        .sb-uname { font-size:13px; font-weight:500; color:#fff; overflow:hidden; text-overflow:ellipsis; }
        .sb-usub  { font-size:11px; color:rgba(255,255,255,0.3); }

        /* Main */
        .main { flex:1; display:flex; flex-direction:column; background:#05080f; min-width:0; }
        .topbar { height:52px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; border-bottom:1px solid rgba(255,255,255,0.04); flex-shrink:0; }
        .topbar-left { display:flex; align-items:center; gap:8px; }
        .topbar-right { display:flex; align-items:center; gap:6px; }
        .dash-toggle { display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; border:none; cursor:pointer; font-family:'Outfit',sans-serif; font-size:12px; font-weight:500; transition:all 0.2s; }
        .dash-toggle.on  { background:rgba(14,165,233,0.1); color:#7dd3fc; }
        .dash-toggle.off { background:transparent; color:rgba(255,255,255,0.35); }
        .dash-toggle:hover { background:rgba(14,165,233,0.12); color:#7dd3fc; }

        /* Chat */
        .chat-scroll { flex:1; overflow-y:auto; padding:32px 16px 16px; display:flex; flex-direction:column; align-items:center; }
        .chat-inner { width:100%; max-width:700px; display:flex; flex-direction:column; gap:24px; padding-bottom:40px; }
        .msg-row { display:flex; gap:12px; width:100%; animation:msg-in 0.3s ease; }
        @keyframes msg-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-row.user { flex-direction:row-reverse; }
        .msg-avatar { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }
        .msg-avatar.assistant { background:linear-gradient(135deg,#0ea5e9,#6366f1); }
        .msg-avatar.user { background:rgba(255,255,255,0.08); }
        .bubble { font-size:14px; line-height:1.75; color:rgba(255,255,255,0.85); max-width:88%; }
        .bubble p { margin-bottom:10px; } .bubble > *:last-child { margin-bottom:0; } .bubble > *:first-child { margin-top:0; }
        .bubble ul, .bubble ol { margin-left:18px; margin-bottom:10px; } .bubble li { margin-bottom:4px; }
        .bubble.user { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); padding:10px 14px; border-radius:14px; border-top-right-radius:4px; width:fit-content; align-self:flex-end; }
        .ai-thinking { width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#0ea5e9,#6366f1); animation:pulse-spin 1.8s ease infinite; flex-shrink:0; margin-top:2px; }
        @keyframes pulse-spin { 0%{transform:scale(0.9)rotate(0deg);opacity:0.7} 50%{transform:scale(1.1)rotate(180deg);opacity:1;box-shadow:0 0 16px rgba(14,165,233,0.4)} 100%{transform:scale(0.9)rotate(360deg);opacity:0.7} }

        /* Empty state */
        .empty-state { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 20px; width:100%; max-width:700px; margin:0 auto; }
        .empty-greeting { font-family:'Outfit',sans-serif; font-size:24px; font-weight:700; letter-spacing:-0.02em; margin-bottom:6px; text-align:center; }
        .empty-sub { font-size:14px; color:rgba(255,255,255,0.4); margin-bottom:32px; text-align:center; }
        .prompt-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; width:100%; margin-bottom:32px; }
        .prompt-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); padding:11px 13px; border-radius:11px; font-size:12px; color:rgba(255,255,255,0.6); cursor:pointer; transition:all 0.2s; display:flex; align-items:center; gap:8px; text-align:left; font-family:'Outfit',sans-serif; }
        .prompt-card:hover { background:rgba(14,165,233,0.08); color:#7dd3fc; border-color:rgba(14,165,233,0.25); transform:translateY(-1px); }

        /* Input */
        .input-wrap { width:100%; padding:12px 16px 18px; }
        .input-wrap.bottom { background:linear-gradient(to top,#05080f 60%,transparent); }
        .input-wrap.center { padding:0; display:flex; justify-content:center; width:100%; }
        .input-box { width:100%; max-width:700px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:14px; display:flex; align-items:center; padding:9px 10px 9px 16px; transition:all 0.25s; }
        .input-box:focus-within { border-color:rgba(14,165,233,0.4); background:rgba(255,255,255,0.055); box-shadow:0 0 0 3px rgba(14,165,233,0.06); }
        .chat-input { flex:1; background:transparent; border:none; outline:none; color:#fff; font-size:14px; font-family:'Outfit',sans-serif; }
        .chat-input::placeholder { color:rgba(255,255,255,0.28); }
        .send-btn { width:32px; height:32px; border-radius:9px; background:#0ea5e9; color:#fff; display:flex; align-items:center; justify-content:center; border:none; cursor:pointer; transition:all 0.2s; flex-shrink:0; }
        .send-btn:disabled { opacity:0.2; cursor:not-allowed; background:rgba(255,255,255,0.08); }
        .send-btn:not(:disabled):hover { background:#0284c7; transform:scale(1.06); }
        .input-hint { text-align:center; margin-top:10px; font-size:11px; color:rgba(255,255,255,0.18); }

        /* Dashboard panel */
        .dash-panel-wrap { transition:width 0.3s cubic-bezier(0.4,0,0.2,1); overflow:hidden; }
        .dash-panel-wrap.open { width:320px; } .dash-panel-wrap.closed { width:0; }
        .dash-panel { width:320px; height:100%; background:#070c14; border-left:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; overflow:hidden; }
        .dash-header { padding:16px 16px 12px; display:flex; align-items:flex-start; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); flex-shrink:0; }
        .dash-greeting { font-family:'Outfit',sans-serif; font-size:14px; font-weight:700; color:#fff; }
        .dash-time { font-size:11px; color:rgba(255,255,255,0.3); margin-top:2px; }
        .student-strip { display:flex; align-items:center; gap:10px; padding:12px 14px; margin:10px 10px 0; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; flex-shrink:0; }
        .student-avatar { width:34px; height:34px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff; flex-shrink:0; }
        .student-info { flex:1; min-width:0; }
        .student-name { font-size:13px; font-weight:600; color:#fff; }
        .student-meta { font-size:10px; color:rgba(255,255,255,0.35); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .stat-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; padding:10px 10px 0; flex-shrink:0; }
        .stat-card { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 10px 8px; }
        .stat-card.stat-ok { border-color:rgba(16,185,129,0.15); }
        .stat-card.stat-danger { border-color:rgba(239,68,68,0.2); }
        .stat-card.stat-warn-card { border-color:rgba(245,158,11,0.2); }
        .stat-card.stat-info { border-color:rgba(14,165,233,0.15); }
        .stat-icon { color:rgba(255,255,255,0.3); margin-bottom:4px; }
        .stat-val  { font-family:'Outfit',sans-serif; font-size:18px; font-weight:700; color:#fff; line-height:1; letter-spacing:-0.01em; }
        .stat-label{ font-size:10px; color:rgba(255,255,255,0.35); margin-top:2px; }
        .stat-sub  { font-size:9px; color:rgba(255,255,255,0.25); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dash-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; padding:10px 10px 0; flex-shrink:0; }
        .dash-tab { padding:7px 0; border-radius:8px; border:none; cursor:pointer; font-size:10px; font-weight:500; font-family:'Outfit',sans-serif; transition:all 0.2s; }
        .dash-tab.active { background:rgba(14,165,233,0.15); color:#38bdf8; }
        .dash-tab:not(.active) { background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.4); }
        .dash-tab:not(.active):hover { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.7); }
        .dash-body { flex:1; overflow-y:auto; padding:10px 10px 16px; }
        .dash-ask-btn { width:100%; background:transparent; border:1px dashed rgba(255,255,255,0.1); color:rgba(255,255,255,0.35); padding:8px 0; border-radius:9px; font-size:11px; cursor:pointer; transition:all 0.2s; font-family:'Outfit',sans-serif; margin-top:6px; }
        .dash-ask-btn:hover { border-color:rgba(14,165,233,0.4); color:#7dd3fc; }

        /* Schedule reuse */
        .sched-wrap { display:flex; flex-direction:column; gap:4px; }
        .sched-day-header { display:flex; align-items:center; justify-content:space-between; padding:6px 2px 4px; }
        .sched-day-label { font-size:10px; font-weight:700; color:rgba(255,255,255,0.3); text-transform:uppercase; letter-spacing:0.07em; }
        .sched-row { display:flex; align-items:center; gap:8px; padding:7px 8px; border-radius:9px; }
        .sched-row.upcoming { }
        .sched-time-col { width:36px; flex-shrink:0; }
        .sched-time { font-family:'DM Mono',monospace; font-size:10px; color:rgba(255,255,255,0.35); }
        .sched-bar { width:2px; height:32px; border-radius:2px; flex-shrink:0; }
        .sched-bar.upcoming { background:rgba(255,255,255,0.15); }
        .sched-info { flex:1; min-width:0; }
        .sched-subj { font-size:12px; font-weight:500; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sched-meta { font-size:10px; color:rgba(255,255,255,0.35); display:flex; align-items:center; gap:4px; }
        .att-wrap { display:flex; flex-direction:column; gap:4px; }

        /* Lab request card */
        .req-card { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 12px; }
        .req-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px; }
        .req-info { flex:1; min-width:0; }
        .req-student { font-size:12px; font-weight:600; color:#fff; margin-bottom:2px; }
        .req-meta { font-size:10px; color:rgba(255,255,255,0.35); }
        .req-reason { font-size:10px; color:rgba(255,255,255,0.4); font-style:italic; margin-top:3px; }
        .req-badge { font-size:9px; font-weight:700; padding:2px 8px; border-radius:100px; text-transform:uppercase; letter-spacing:0.04em; flex-shrink:0; }
        .req-actions { display:flex; gap:6px; }
        .req-approve { flex:1; display:flex; align-items:center; justify-content:center; gap:5px; padding:6px 0; border-radius:7px; border:none; background:rgba(16,185,129,0.12); color:#10b981; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Outfit',sans-serif; }
        .req-approve:hover { background:#10b981; color:#fff; }
        .req-reject  { flex:1; display:flex; align-items:center; justify-content:center; gap:5px; padding:6px 0; border-radius:7px; border:none; background:rgba(239,68,68,0.08); color:#ef4444; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Outfit',sans-serif; }
        .req-reject:hover  { background:#ef4444; color:#fff; }
      `}</style>

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen?"open":"closed"}`}>
        <div className="sidebar-inner">
          <div className="sb-brand">
            <div style={{ display:"flex", alignItems:"center" }}>
              <Link href="/" className="sb-logo">Campus<span>Copilot</span></Link>
              <span className="sb-role-badge">Faculty</span>
            </div>
            <button className="icon-btn" onClick={() => setIsSidebarOpen(false)}><PanelLeftClose size={16}/></button>
          </div>
          <button className="sb-new-btn" onClick={startNewChat}><Plus size={14}/> New Chat</button>
          <div className="sb-history">
            <div className="sb-section-label">Recent</div>
            {threads.length === 0
              ? <div style={{ fontSize:12, color:"rgba(255,255,255,0.2)", padding:"4px 10px" }}>No chats yet.</div>
              : threads.map(t => (
                <div key={t.thread_id} className={`sb-thread ${activeThreadId===t.thread_id?"active":""}`}
                  onClick={() => setActiveThreadId(t.thread_id)}>
                  <MessageSquare size={12} style={{ flexShrink:0, opacity:0.5 }}/>
                  <span className="sb-thread-title">{t.title}</span>
                  <button className="sb-del" onClick={(e) => deleteThread(t.thread_id, e)}><Trash2 size={12}/></button>
                </div>
              ))
            }
          </div>
          <div className="sb-footer">
            <div className="sb-user-row">
              <div className="sb-avatar">{FACULTY.initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="sb-uname">{FACULTY.name}</div>
                <div className="sb-usub">{FACULTY.designation}</div>
              </div>
              <Settings size={13} style={{ color:"rgba(255,255,255,0.25)", flexShrink:0 }}/>
            </div>
          </div>
        </div>
      </aside>

      {/* Main chat */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            {!isSidebarOpen && <button className="icon-btn" onClick={() => setIsSidebarOpen(true)}><PanelLeftOpen size={18}/></button>}
            {!isSidebarOpen && <span style={{ fontFamily:"'Outfit',sans-serif", fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.5)" }}>Campus<span style={{ color:"#0ea5e9" }}>Copilot</span> <span style={{ fontSize:10, color:"#0ea5e9", background:"rgba(14,165,233,0.12)", padding:"1px 7px", borderRadius:100 }}>Faculty</span></span>}
          </div>
          <div className="topbar-right">
            <button className={`dash-toggle ${isDashOpen?"on":"off"}`} onClick={() => setIsDashOpen(p=>!p)}>
              <BarChart3 size={14}/> Dashboard
            </button>
          </div>
        </header>

        {isChatEmpty ? (
          <div className="empty-state">
            <div className="empty-greeting">
              Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, {FACULTY.name.split(" ")[1]} 👋
            </div>
            <p className="empty-sub">{FACULTY.designation} · {FACULTY.dept}</p>
            <div className="prompt-grid">
              {FACULTY_QUICK_PROMPTS.map((p, i) => (
                <button key={i} className="prompt-card" onClick={() => handleSend(p.text)}>
                  <p.icon size={13} style={{ flexShrink:0, opacity:0.6 }}/>{p.label}
                </button>
              ))}
            </div>
            <div className="input-wrap center" style={{ width:"100%", maxWidth:700 }}>
              <div className="input-box">
                <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleSend()} placeholder="Ask anything — attendance, grades, lab approvals…" disabled={isTyping}/>
                <button className="send-btn" disabled={!input.trim()||isTyping} onClick={() => handleSend()}>
                  <Send size={14} strokeWidth={2.5}/>
                </button>
              </div>
              <p className="input-hint">AI responses based on class data. Verify before acting.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="chat-scroll">
              <div className="chat-inner">
                {messages.map((msg, i) => (
                  <div key={i} className={`msg-row ${msg.role}`}>
                    <div className={`msg-avatar ${msg.role}`}>
                      {msg.role==="assistant" ? <Bot size={15}/> : <User size={15}/>}
                    </div>
                    <div className={`bubble ${msg.role}`}>
                      <ReactMarkdown components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className||"");
                          return !inline && match ? (
                            <div style={{ borderRadius:8, overflow:"hidden", margin:"12px 0" }}>
                              <div style={{ background:"#1a1a1a", padding:"5px 14px", fontSize:10, color:"#555", borderBottom:"1px solid #222" }}>{match[1]}</div>
                              <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div"
                                customStyle={{ margin:0, padding:14, background:"#141414", fontSize:12 }} {...props}>
                                {String(children).replace(/\n$/,"")}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code style={{ background:"rgba(255,255,255,0.09)", padding:"2px 6px", borderRadius:4, fontSize:"0.88em", fontFamily:"DM Mono,monospace" }} {...props}>{children}</code>
                          );
                        }
                      }}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                {isTyping && <div className="msg-row assistant"><div className="ai-thinking"/></div>}
                <div ref={messagesEndRef}/>
              </div>
            </div>
            <div className="input-wrap bottom">
              <div className="input-box" style={{ maxWidth:700, margin:"0 auto" }}>
                <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleSend()} placeholder="Message Campus Copilot (Faculty)…" disabled={isTyping}/>
                <button className="send-btn" disabled={!input.trim()||isTyping} onClick={() => handleSend()}>
                  <Send size={14} strokeWidth={2.5}/>
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Right dashboard */}
      <div className={`dash-panel-wrap ${isDashOpen?"open":"closed"}`}>
        {isDashOpen && <FacultyDashboard onClose={() => setIsDashOpen(false)} onAsk={handleSend}/>}
      </div>
    </div>
  );
}
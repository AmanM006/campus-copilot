"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Bot, User, Plus, MessageSquare, Settings,
  Search, LayoutGrid, Calendar, Trash2,
  PanelLeftClose, PanelLeftOpen, FlaskConical, FileText,
  Bell, BarChart3, TrendingUp, X, ChevronRight,
  ChevronLeft, Clock, AlertTriangle, CheckCircle,
  BookOpen, Zap, ArrowLeft, Circle, Dot,
  PanelRightClose, Eye, Filter
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  thread_id: string;
  action?: ToolAction | null;
}
interface Thread { thread_id: string; title: string; }
interface ToolAction {
  type: string; tool_name: string; status: string;
  details: Record<string, any>;
}

// ─── Hardcoded Student Data (replace with real SSO/DB pull) ──────────────────

const STUDENT = {
  id: "213ME1034",
  name: "Aman Mehta",
  program: "SCE",
  program_code: "953",
  semester: 4,
  branch: "Computer Science & Engineering",
  cgpa: 8.4,
  initials: "AM",
  year: "2nd Year",
};

// Real exam data from IV Sem Midterm TT PDF — program 953 SCE
// daysLeft is computed at runtime — do NOT hardcode it here
const EXAM_SCHEDULE_RAW = [
  { code: "MAT 2201", subject: "Probability and Optimization",           date: "2026-03-06", day: "Fri", time: "8:30 AM – 10:00 AM" },
  { code: "CSS 2201", subject: "Database Systems",                        date: "2026-03-07", day: "Sat", time: "8:30 AM – 10:00 AM" },
  { code: "CSS 2202", subject: "Design & Analysis of Algorithms",         date: "2026-03-09", day: "Mon", time: "8:30 AM – 10:00 AM" },
  { code: "CSS 2203", subject: "Introduction to Artificial Intelligence", date: "2026-03-10", day: "Tue", time: "8:30 AM – 10:00 AM" },
  { code: "CSS 2204", subject: "Operating Systems",                       date: "2026-03-11", day: "Wed", time: "8:30 AM – 10:00 AM" },
];

const TIMETABLE: Record<string, Array<{time: string; end: string; subject: string; room: string; type: string; startH: number; startM: number; endH: number; endM: number}>> = {
  Monday:    [
    { time: "08:00", end: "09:00", subject: "Probability & Optimization", room: "LH-301", type: "lecture", startH:8,startM:0,endH:9,endM:0 },
    { time: "09:00", end: "10:00", subject: "Database Systems",           room: "LH-204", type: "lecture", startH:9,startM:0,endH:10,endM:0 },
    { time: "10:15", end: "11:15", subject: "Design & Analysis of Algo",  room: "LH-102", type: "lecture", startH:10,startM:15,endH:11,endM:15 },
    { time: "11:30", end: "13:30", subject: "OS Lab",                     room: "OSDL-B", type: "lab",     startH:11,startM:30,endH:13,endM:30 },
    { time: "14:30", end: "15:30", subject: "Operating Systems",          room: "LH-301", type: "lecture", startH:14,startM:30,endH:15,endM:30 },
  ],
  Tuesday:   [
    { time: "08:00", end: "09:00", subject: "Intro to AI",                room: "LH-205", type: "lecture", startH:8,startM:0,endH:9,endM:0 },
    { time: "09:00", end: "10:00", subject: "Operating Systems",          room: "LH-301", type: "lecture", startH:9,startM:0,endH:10,endM:0 },
    { time: "11:00", end: "13:00", subject: "DBMS Lab",                   room: "LAB-4",  type: "lab",     startH:11,startM:0,endH:13,endM:0 },
    { time: "14:00", end: "15:00", subject: "Probability & Optimization", room: "LH-102", type: "lecture", startH:14,startM:0,endH:15,endM:0 },
  ],
  Wednesday: [
    { time: "08:00", end: "09:00", subject: "Database Systems",           room: "LH-204", type: "lecture", startH:8,startM:0,endH:9,endM:0 },
    { time: "09:15", end: "10:15", subject: "Design & Analysis of Algo",  room: "LH-102", type: "lecture", startH:9,startM:15,endH:10,endM:15 },
    { time: "10:30", end: "11:30", subject: "Intro to AI",                room: "LH-205", type: "lecture", startH:10,startM:30,endH:11,endM:30 },
    { time: "14:00", end: "15:00", subject: "Operating Systems",          room: "LH-301", type: "lecture", startH:14,startM:0,endH:15,endM:0 },
  ],
  Thursday:  [
    { time: "08:00", end: "09:00", subject: "Probability & Optimization", room: "LH-301", type: "lecture", startH:8,startM:0,endH:9,endM:0 },
    { time: "10:00", end: "12:00", subject: "Algorithms Lab",             room: "CC-3",   type: "lab",     startH:10,startM:0,endH:12,endM:0 },
    { time: "13:00", end: "14:00", subject: "Database Systems",           room: "LH-204", type: "lecture", startH:13,startM:0,endH:14,endM:0 },
    { time: "14:00", end: "15:00", subject: "Intro to AI",                room: "LH-205", type: "lecture", startH:14,startM:0,endH:15,endM:0 },
  ],
  Friday:    [
    { time: "08:00", end: "09:00", subject: "Design & Analysis of Algo",  room: "LH-102", type: "lecture", startH:8,startM:0,endH:9,endM:0 },
    { time: "09:00", end: "10:00", subject: "Operating Systems",          room: "LH-301", type: "lecture", startH:9,startM:0,endH:10,endM:0 },
    { time: "10:15", end: "11:15", subject: "Intro to AI",                room: "LH-205", type: "lecture", startH:10,startM:15,endH:11,endM:15 },
  ],
  Saturday:  [
    { time: "08:00", end: "09:00", subject: "Database Systems",           room: "LH-204", type: "lecture", startH:8,startM:0,endH:9,endM:0 },
    { time: "09:00", end: "10:00", subject: "Probability & Optimization", room: "LH-102", type: "lecture", startH:9,startM:0,endH:10,endM:0 },
  ],
  Sunday: [],
};

const ATTENDANCE = [
  { code: "MAT 2201", name: "Probability & Optimization",          attended: 38, total: 45, percent: 84,
    missed: [
      { date: "2026-02-03", reason: "Medical leave" },
      { date: "2026-02-14", reason: "Not marked" },
      { date: "2026-02-21", reason: "Late arrival" },
      { date: "2026-03-01", reason: "Not marked" },
    ]
  },
  { code: "CSS 2201", name: "Database Systems",                     attended: 29, total: 42, percent: 69,
    missed: [
      { date: "2026-01-20", reason: "Medical leave" },
      { date: "2026-01-27", reason: "Not marked" },
      { date: "2026-02-03", reason: "Not marked" },
      { date: "2026-02-10", reason: "Personal" },
      { date: "2026-02-17", reason: "Not marked" },
      { date: "2026-02-24", reason: "Late arrival" },
      { date: "2026-03-02", reason: "Not marked" },
      { date: "2026-03-03", reason: "Not marked" },
      { date: "2026-03-04", reason: "Personal" },
    ]
  },
  { code: "CSS 2202", name: "Design & Analysis of Algorithms",      attended: 40, total: 44, percent: 91,
    missed: [
      { date: "2026-02-10", reason: "Not marked" },
      { date: "2026-02-28", reason: "Medical leave" },
    ]
  },
  { code: "CSS 2203", name: "Introduction to Artificial Intelligence", attended: 31, total: 43, percent: 72,
    missed: [
      { date: "2026-01-22", reason: "Not marked" },
      { date: "2026-02-05", reason: "Medical leave" },
      { date: "2026-02-12", reason: "Personal" },
      { date: "2026-02-19", reason: "Not marked" },
      { date: "2026-03-02", reason: "Not marked" },
    ]
  },
  { code: "CSS 2204", name: "Operating Systems",                    attended: 22, total: 24, percent: 92,
    missed: [
      { date: "2026-02-16", reason: "Medical leave" },
      { date: "2026-02-23", reason: "Not marked" },
    ]
  },
];

const QUICK_PROMPTS = [
  { icon: Calendar,   label: "Book robotics lab",    text: "Book the robotics lab for tomorrow at 3pm" },
  { icon: BarChart3,  label: "My attendance",        text: "Show my full attendance summary" },
  { icon: FlaskConical, label: "Lab prerequisites",  text: "What are the prerequisites for CNC machining lab?" },
  { icon: FileText,   label: "Bonafide cert",         text: "I need a bonafide certificate for a bank account" },
  { icon: Bell,       label: "Latest notices",        text: "Show me the latest campus announcements" },
  { icon: TrendingUp, label: "My CGPA",               text: "What are my current grades and CGPA?" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayName(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-IN", { weekday: "long" });
}
function getClassStatus(startH: number, startM: number, endH: number, endM: number) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (nowMins > endMins) return "done";
  if (nowMins >= startMins) return "current";
  return "upcoming";
}
function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// ─── Tool Call Card ───────────────────────────────────────────────────────────

function ToolCallCard({ action }: { action: ToolAction }) {
  const [confirmed, setConfirmed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  if (action.tool_name !== "book_lab_slot") return null;
  const d = action.details;
  return (
    <div className="tool-card">
      <div className="tool-card-header">
        <FlaskConical size={14} />
        <span>LAB BOOKING REQUEST</span>
        {!confirmed && !cancelled && <span className="badge badge-warn">Pending</span>}
        {confirmed && <span className="badge badge-ok">Confirmed ✓</span>}
        {cancelled && <span className="badge badge-err">Cancelled</span>}
      </div>
      <div className="tool-card-grid">
        {[["Lab", d.lab_name], ["Date", d.date], ["Slot", d.slot || "—"], ["Purpose", d.purpose || "—"]].map(([l, v]) => (
          <div key={l} className="tool-card-cell"><div className="tc-label">{l}</div><div className="tc-val">{v}</div></div>
        ))}
      </div>
      {!confirmed && !cancelled && (
        <div className="tool-card-actions">
          <button className="tc-btn tc-confirm" onClick={() => setConfirmed(true)}>Confirm Booking</button>
          <button className="tc-btn tc-cancel"  onClick={() => setCancelled(true)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Timetable Popup ─────────────────────────────────────────────────────────

function TimetablePopup({ day, onClose, onAsk }: { day: string; onClose: () => void; onAsk: (q:string)=>void }) {
  const classes = TIMETABLE[day] || [];
  const isToday = day === getDayName(0);
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-box" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <div>
            <div className="popup-title">{day}'s Schedule</div>
            <div className="popup-sub">{isToday ? "Today" : "Tomorrow"} · {classes.length} classes</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>
        {classes.length === 0 ? (
          <div className="popup-empty">No classes scheduled 🎉</div>
        ) : (
          <div className="popup-timeline">
            {classes.map((cls, i) => {
              const status = isToday ? getClassStatus(cls.startH, cls.startM, cls.endH, cls.endM) : "upcoming";
              return (
                <div key={i} className={`ptl-row ${status}`}>
                  <div className="ptl-time">
                    <span className="ptl-start">{cls.time}</span>
                    <span className="ptl-end">{cls.end}</span>
                  </div>
                  <div className="ptl-dot-col">
                    <div className={`ptl-dot ${status}`}/>
                    {i < classes.length - 1 && <div className="ptl-line"/>}
                  </div>
                  <div className={`ptl-card ${status}`}>
                    <div className="ptl-subject">{cls.subject}</div>
                    <div className="ptl-meta">
                      {cls.room}
                      <span className={`ptl-type ${cls.type}`}>{cls.type}</span>
                      {status === "current" && <span className="ptl-now">● NOW</span>}
                      {status === "done" && <span className="ptl-done">Done</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="popup-footer">
          <button className="popup-ask-btn" onClick={() => { onAsk(`Show my full week timetable`); onClose(); }}>
            Ask AI for full week →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance Detail Page ───────────────────────────────────────────────────

function AttendanceDetail({ subject, onBack }: { subject: typeof ATTENDANCE[0]; onBack: () => void }) {
  const color = subject.percent >= 75 ? "#10b981" : subject.percent >= 65 ? "#f59e0b" : "#ef4444";
  const canBunk = subject.percent >= 75 ? Math.floor((subject.attended - 0.75 * subject.total) / 0.75) : 0;
  const needAttend = subject.percent < 75 ? Math.ceil((0.75 * subject.total - subject.attended) / 0.25) : 0;
  const months: Record<string, typeof subject.missed> = {};
  subject.missed.forEach(m => {
    const mon = new Date(m.date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    if (!months[mon]) months[mon] = [];
    months[mon].push(m);
  });

  return (
    <div className="detail-page">
      <button className="detail-back" onClick={onBack}><ArrowLeft size={14}/> Back</button>
      <div className="detail-hero">
        <div className="detail-code">{subject.code}</div>
        <div className="detail-name">{subject.name}</div>
        <div className="detail-pct" style={{ color }}>{subject.percent}%</div>
        <div className="detail-bar-wrap">
          <div className="detail-bar-bg">
            <div className="detail-bar-fill" style={{ width: `${subject.percent}%`, background: color }}/>
            <div className="detail-75-marker"/>
          </div>
          <div className="detail-75-label">75%</div>
        </div>
        <div className="detail-stats-row">
          <div className="detail-stat"><span className="ds-val">{subject.attended}</span><span className="ds-label">Attended</span></div>
          <div className="detail-stat"><span className="ds-val">{subject.total - subject.attended}</span><span className="ds-label">Missed</span></div>
          <div className="detail-stat"><span className="ds-val">{subject.total}</span><span className="ds-label">Total</span></div>
          <div className="detail-stat">
            <span className="ds-val" style={{ color }}>
              {canBunk > 0 ? `+${canBunk}` : `-${needAttend}`}
            </span>
            <span className="ds-label">{canBunk > 0 ? "Can miss" : "Need"}</span>
          </div>
        </div>
      </div>
      <div className="detail-section-title">Missed Classes</div>
      {Object.entries(months).map(([month, missed]) => (
        <div key={month} className="detail-month-group">
          <div className="detail-month-label">{month}</div>
          {missed.map((m, i) => (
            <div key={i} className="detail-missed-row">
              <div className="dmr-dot"/>
              <div className="dmr-date">{new Date(m.date).toLocaleDateString("en-IN", { day: "numeric", weekday: "short", month: "short" })}</div>
              <div className="dmr-reason">{m.reason}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Attendance Ring ──────────────────────────────────────────────────────────

function AttendanceRing({ percent, size = 48 }: { percent: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (percent / 100) * circ;
  const color = percent >= 75 ? "#10b981" : percent >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }}/>
    </svg>
  );
}

// ─── Dashboard Panel ──────────────────────────────────────────────────────────

function DashboardPanel({ onClose, onAsk }: { onClose: () => void; onAsk: (q: string) => void }) {
  const [activeTab, setActiveTab] = useState<"schedule"|"attendance"|"exams">("schedule");
  const [timetableDay, setTimetableDay] = useState<string | null>(null);
  const [attendanceDetail, setAttendanceDetail] = useState<typeof ATTENDANCE[0] | null>(null);

  const now = new Date();
  const todayName = getDayName(0);
  const tomorrowName = getDayName(1);
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const todayClasses = TIMETABLE[todayName] || [];
  const tomorrowClasses = TIMETABLE[tomorrowName] || [];
  const overallPct = Math.round(ATTENDANCE.reduce((s, a) => s + a.percent, 0) / ATTENDANCE.length);
  const atRisk = ATTENDANCE.filter(a => a.percent < 75).length;
  // Filter out past exams using real current date — exam is "past" once the day has ended
  const examsWithDays = EXAM_SCHEDULE_RAW
    .map(e => ({ ...e, daysLeft: daysUntil(e.date) }))
    .filter(e => e.daysLeft >= 0);
  const nextExam = examsWithDays[0];

  // Get current or next class for today
  let activeClass = todayClasses.find(c => getClassStatus(c.startH, c.startM, c.endH, c.endM) === "current");
  if (!activeClass) activeClass = todayClasses.find(c => getClassStatus(c.startH, c.startM, c.endH, c.endM) === "upcoming");

  if (attendanceDetail && activeTab === "attendance") {
    return (
      <aside className="dash-panel">
        <div className="dash-header">
          <button className="icon-btn" onClick={() => setAttendanceDetail(null)} style={{ marginRight: 8 }}><ArrowLeft size={16}/></button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Attendance Detail</span>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }}><PanelRightClose size={17}/></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 20px" }}>
          <AttendanceDetail subject={attendanceDetail} onBack={() => setAttendanceDetail(null)}/>
        </div>
      </aside>
    );
  }

  return (
    <>
      {timetableDay && (
        <TimetablePopup day={timetableDay} onClose={() => setTimetableDay(null)} onAsk={onAsk}/>
      )}
      <aside className="dash-panel">
        {/* Header */}
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Hi, {STUDENT.name.split(" ")[0]} 👋</div>
            <div className="dash-time">{timeStr} · {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><PanelRightClose size={17}/></button>
        </div>

        {/* Student info strip */}
        <div className="student-strip">
          <div className="student-avatar">{STUDENT.initials}</div>
          <div className="student-info">
            <div className="student-name">{STUDENT.name}</div>
            <div className="student-meta">{STUDENT.id} · {STUDENT.branch} · Sem {STUDENT.semester}</div>
          </div>
          <div className="student-cgpa">
            <div className="cgpa-val">{STUDENT.cgpa}</div>
            <div className="cgpa-label">CGPA</div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="stat-cards">
          <div className={`stat-card ${overallPct < 75 ? "stat-danger" : "stat-ok"}`}>
            <div className="stat-icon"><BarChart3 size={13}/></div>
            <div className="stat-val">{overallPct}%</div>
            <div className="stat-label">Attendance</div>
            <div className="stat-sub">{atRisk > 0 ? `${atRisk} subject${atRisk>1?"s":""} at risk` : "All subjects safe"}</div>
          </div>
          <div className={`stat-card ${!nextExam ? "stat-ok" : nextExam.daysLeft <= 3 ? "stat-danger" : nextExam.daysLeft <= 7 ? "stat-warn-card" : "stat-ok"}`}>
            <div className="stat-icon"><BookOpen size={13}/></div>
            <div className="stat-val">{nextExam ? `${nextExam.daysLeft}d` : "All done"}</div>
            <div className="stat-label">Next exam</div>
            <div className="stat-sub">{nextExam ? nextExam.code : "No upcoming"}</div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-icon"><Clock size={13}/></div>
            <div className="stat-val">{activeClass ? activeClass.time : "—"}</div>
            <div className="stat-label">{activeClass ? (getClassStatus(activeClass.startH,activeClass.startM,activeClass.endH,activeClass.endM)==="current" ? "In class" : "Next class") : "Free now"}</div>
            <div className="stat-sub" style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeClass ? activeClass.room : "No more today"}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="dash-tabs">
          {(["schedule","attendance","exams"] as const).map(t => (
            <button key={t} className={`dash-tab ${activeTab===t?"active":""}`} onClick={() => setActiveTab(t)}>
              {t === "schedule" ? "Schedule" : t === "attendance" ? "Attendance" : "Exams"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="dash-body">

          {/* ── SCHEDULE ── */}
          {activeTab === "schedule" && (
            <div className="sched-wrap">
              {/* Today */}
              <div className="sched-day-header">
                <span className="sched-day-label">Today · {todayName}</span>
                <button className="sched-expand-btn" onClick={() => setTimetableDay(todayName)}>
                  <Eye size={12}/> Expand
                </button>
              </div>
              {todayClasses.length === 0 ? (
                <div className="sched-empty">No classes today 🎉</div>
              ) : todayClasses.map((cls, i) => {
                const status = getClassStatus(cls.startH, cls.startM, cls.endH, cls.endM);
                return (
                  <div key={i} className={`sched-row ${status}`}>
                    <div className="sched-time-col">
                      <span className="sched-time">{cls.time}</span>
                    </div>
                    <div className={`sched-bar ${status}`}/>
                    <div className="sched-info">
                      <div className="sched-subj">{cls.subject}</div>
                      <div className="sched-meta">{cls.room} · <span className={`sched-type ${cls.type}`}>{cls.type}</span>
                        {status === "current" && <span className="sched-now">NOW</span>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Tomorrow */}
              <div className="sched-day-header" style={{ marginTop: 16 }}>
                <span className="sched-day-label">Tomorrow · {tomorrowName}</span>
                <button className="sched-expand-btn" onClick={() => setTimetableDay(tomorrowName)}>
                  <Eye size={12}/> Expand
                </button>
              </div>
              {tomorrowClasses.length === 0 ? (
                <div className="sched-empty">No classes tomorrow 🎉</div>
              ) : tomorrowClasses.slice(0, 3).map((cls, i) => (
                <div key={i} className="sched-row upcoming">
                  <div className="sched-time-col"><span className="sched-time">{cls.time}</span></div>
                  <div className="sched-bar upcoming"/>
                  <div className="sched-info">
                    <div className="sched-subj">{cls.subject}</div>
                    <div className="sched-meta">{cls.room} · <span className={`sched-type ${cls.type}`}>{cls.type}</span></div>
                  </div>
                </div>
              ))}
              {tomorrowClasses.length > 3 && (
                <button className="sched-more-btn" onClick={() => setTimetableDay(tomorrowName)}>
                  +{tomorrowClasses.length - 3} more classes →
                </button>
              )}
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {activeTab === "attendance" && (
            <div className="att-wrap">
              {ATTENDANCE.map((sub, i) => {
                const color = sub.percent >= 75 ? "#10b981" : sub.percent >= 65 ? "#f59e0b" : "#ef4444";
                const canBunk = sub.percent >= 75 ? Math.floor((sub.attended - 0.75 * sub.total) / 0.75) : 0;
                const needAttend = sub.percent < 75 ? Math.ceil((0.75 * sub.total - sub.attended) / 0.25) : 0;
                return (
                  <div key={i} className="att-card" onClick={() => setAttendanceDetail(sub)}>
                    <div className="att-top">
                      <AttendanceRing percent={sub.percent} size={40}/>
                      <div className="att-info">
                        <div className="att-name">{sub.name}</div>
                        <div className="att-code">{sub.code} · {sub.attended}/{sub.total} classes</div>
                      </div>
                      <div className="att-pct" style={{ color }}>{sub.percent}%</div>
                    </div>
                    <div className="att-progress">
                      <div className="att-prog-fill" style={{ width: `${sub.percent}%`, background: color }}/>
                      <div className="att-75-line"/>
                    </div>
                    <div className="att-status-row">
                      <span style={{ fontSize:10, color: sub.percent >= 75 ? "#10b981" : "#ef4444" }}>
                        {sub.percent >= 75 ? "● Sufficient" : "● Below threshold"}
                      </span>
                      <span className="att-detail-link">View details →</span>
                    </div>
                  </div>
                );
              })}
              <button className="dash-ask-btn" onClick={() => onAsk("Analyse my full attendance and give me a recovery plan")}>
                Ask AI to analyse →
              </button>
            </div>
          )}

          {/* ── EXAMS ── */}
          {activeTab === "exams" && (
            <div className="exam-wrap">
              <div className="exam-header-note">IV Sem Midterm · March 2026 · 8:30–10:00 AM</div>
              {examsWithDays.map((ex, i) => {
                const urgent = ex.daysLeft <= 2;
                const soon   = ex.daysLeft <= 5;
                const accentColor = urgent ? "#ef4444" : soon ? "#f59e0b" : "#10b981";
                return (
                  <div key={i} className="exam-card" style={{ borderLeftColor: accentColor }}>
                    <div className="exam-left">
                      <div className="exam-countdown" style={{ color: accentColor }}>
                        {ex.daysLeft === 0 ? "TODAY" : ex.daysLeft === 1 ? "TOMORROW" : `${ex.daysLeft}d`}
                      </div>
                      <div className="exam-day">{ex.day}</div>
                    </div>
                    <div className="exam-mid">
                      <div className="exam-subj">{ex.subject}</div>
                      <div className="exam-code">{ex.code}</div>
                      <div className="exam-date">{new Date(ex.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {ex.time}</div>
                    </div>
                    {urgent && <div className="exam-alert-dot"/>}
                  </div>
                );
              })}
              <button className="dash-ask-btn" onClick={() => onAsk("Create a study schedule for my upcoming midsem exams")}>
                Ask AI to make study plan →
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [threads,        setThreads]        = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input,          setInput]          = useState("");
  const [isTyping,       setIsTyping]       = useState(false);
  const [currentView,    setCurrentView]    = useState<"chat"|"settings">("chat");
  const [isSidebarOpen,  setIsSidebarOpen]  = useState(true);
  const [isDashOpen,     setIsDashOpen]     = useState(true);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchThreads = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages").select("thread_id, content, created_at")
      .eq("user_id", STUDENT.id).order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(m => { if (!map[m.thread_id]) map[m.thread_id] = m.content.slice(0, 28) + "…"; });
      setThreads(Object.entries(map).map(([id, title]) => ({ thread_id: id, title })).reverse());
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  useEffect(() => {
    if (!activeThreadId) return;
    supabase.from("messages").select("*").eq("thread_id", activeThreadId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMessages(data); });
  }, [activeThreadId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isTyping) return;
    const userContent = text.trim();
    const threadId = activeThreadId || crypto.randomUUID();
    if (!activeThreadId) setActiveThreadId(threadId);
    setMessages(p => [...p, { role: "user", content: userContent, thread_id: threadId }]);
    setInput("");
    setIsTyping(true);
    try {
      await supabase.from("messages").insert([{ user_id: STUDENT.id, content: userContent, role: "user", thread_id: threadId }]);
      const history = messages.slice(-4).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userContent, user_id: STUDENT.id, history }),
      });
      const data = await res.json();
      await supabase.from("messages").insert([{ user_id: STUDENT.id, content: data.reply, role: "assistant", thread_id: threadId }]);
      setMessages(p => [...p, { role: "assistant", content: data.reply, thread_id: threadId, action: data.action }]);
      fetchThreads();
    } catch (e) {
      console.error(e);
      setMessages(p => [...p, { role: "assistant", content: "I hit a snag. Please try again.", thread_id: threadId }]);
    } finally { setIsTyping(false); }
  };

  const deleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(threadId);
    await supabase.from("messages").delete().eq("thread_id", threadId).eq("user_id", STUDENT.id);
    setThreads(p => p.filter(t => t.thread_id !== threadId));
    if (activeThreadId === threadId) { setActiveThreadId(null); setMessages([]); }
    setDeletingId(null);
  };

  const deleteAllChats = async () => {
    if (!window.confirm(`Delete all chats for ${STUDENT.id}?`)) return;
    await supabase.from("messages").delete().eq("user_id", STUDENT.id);
    setThreads([]); setMessages([]); setActiveThreadId(null);
  };

  const startNewChat = () => { setActiveThreadId(null); setMessages([]); inputRef.current?.focus(); };
  const isChatEmpty = messages.length === 0;

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }

        .root {
          font-family: 'Outfit', sans-serif;
          background: #060608;
          color: #fff;
          height: 100vh;
          display: flex;
          overflow: hidden;
          position: relative;
        }
        /* Ambient background glow */
        .root::before {
          content: '';
          position: fixed;
          top: -200px; left: -200px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%);
          pointer-events: none;
          animation: ambient-drift 12s ease-in-out infinite alternate;
        }
        .root::after {
          content: '';
          position: fixed;
          bottom: -200px; right: 100px;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%);
          pointer-events: none;
          animation: ambient-drift 15s ease-in-out infinite alternate-reverse;
        }
        @keyframes ambient-drift { 0% { transform: translate(0,0); } 100% { transform: translate(60px, 40px); } }

        /* ── SIDEBAR ── */
        .sidebar {
          background: #0a0a0e;
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex; flex-direction: column; z-index: 20;
          transition: width 0.3s cubic-bezier(0.4,0,0.2,1);
          overflow: hidden; white-space: nowrap;
        }
        .sidebar.open { width: 252px; } .sidebar.closed { width: 0; border: none; }
        .sidebar-inner { width: 252px; height: 100%; display: flex; flex-direction: column; }
        .sb-brand { padding: 18px 18px 14px; display: flex; align-items: center; justify-content: space-between; }
        .sb-logo { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px; color: #fff; letter-spacing: -0.02em; text-decoration: none; }
        .sb-logo span { color: #7c3aed; }
        .icon-btn { background: transparent; border: none; color: rgba(255,255,255,0.35); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 5px; border-radius: 7px; transition: all 0.2s; }
        .icon-btn:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .sb-new-btn { margin: 0 10px 8px; background: rgba(124,58,237,0.12); color: #c4b5fd; border: 1px solid rgba(124,58,237,0.2); padding: 10px 14px; border-radius: 10px; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; }
        .sb-new-btn:hover { background: rgba(124,58,237,0.2); color: #fff; }
        .sb-history { flex: 1; overflow-y: auto; padding: 0 8px; }
        .sb-section-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 10px 5px; }
        .sb-thread { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; color: rgba(255,255,255,0.5); font-size: 13px; cursor: pointer; transition: all 0.2s; margin-bottom: 1px; group: true; }
        .sb-thread:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .sb-thread:hover .sb-del { opacity: 1; }
        .sb-thread.active { background: rgba(124,58,237,0.1); color: #c4b5fd; }
        .sb-thread-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sb-del { opacity: 0; transition: opacity 0.2s; background: transparent; border: none; color: rgba(255,100,100,0.6); cursor: pointer; display: flex; padding: 2px; border-radius: 4px; flex-shrink: 0; }
        .sb-del:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
        .sb-del.spinning { animation: spin 0.5s linear; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .sb-footer { padding: 10px; border-top: 1px solid rgba(255,255,255,0.05); }
        .sb-user-row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
        .sb-user-row:hover { background: rgba(255,255,255,0.04); }
        .sb-avatar { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #3b82f6); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .sb-uname { font-size: 13px; font-weight: 500; color: #fff; overflow: hidden; text-overflow: ellipsis; }
        .sb-usub  { font-size: 11px; color: rgba(255,255,255,0.3); }

        /* ── MAIN CHAT ── */
        .main { flex: 1; display: flex; flex-direction: column; background: #060608; min-width: 0; position: relative; }
        .topbar { height: 52px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid rgba(255,255,255,0.04); flex-shrink: 0; z-index: 10; }
        .topbar-left { display: flex; align-items: center; gap: 8px; }
        .topbar-right { display: flex; align-items: center; gap: 6px; }
        .dash-toggle { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500; transition: all 0.2s; }
        .dash-toggle.on  { background: rgba(124,58,237,0.12); color: #c4b5fd; }
        .dash-toggle.off { background: transparent; color: rgba(255,255,255,0.35); }
        .dash-toggle:hover { background: rgba(124,58,237,0.15); color: #c4b5fd; }

        /* ── CHAT AREA ── */
        .chat-scroll { flex: 1; overflow-y: auto; padding: 32px 16px 16px; display: flex; flex-direction: column; align-items: center; }
        .chat-inner { width: 100%; max-width: 700px; display: flex; flex-direction: column; gap: 24px; padding-bottom: 40px; }
        .msg-row { display: flex; gap: 12px; width: 100%; animation: msg-in 0.3s ease; }
        @keyframes msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .msg-row.user { flex-direction: row-reverse; }
        .msg-avatar { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .msg-avatar.assistant { background: linear-gradient(135deg, #7c3aed, #3b82f6); }
        .msg-avatar.user { background: rgba(255,255,255,0.08); }
        .bubble { font-size: 14px; line-height: 1.75; color: rgba(255,255,255,0.85); max-width: 88%; }
        .bubble p { margin-bottom: 10px; } .bubble > *:last-child { margin-bottom: 0; } .bubble > *:first-child { margin-top: 0; }
        .bubble h1, .bubble h2, .bubble h3 { margin: 18px 0 8px; font-family: 'Syne', sans-serif; font-weight: 600; }
        .bubble ul, .bubble ol { margin-left: 18px; margin-bottom: 10px; } .bubble li { margin-bottom: 4px; }
        .bubble.user { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); padding: 10px 14px; border-radius: 14px; border-top-right-radius: 4px; width: fit-content; align-self: flex-end; }

        /* Tool card */
        .tool-card { margin-top: 10px; background: rgba(124,58,237,0.07); border: 1px solid rgba(124,58,237,0.22); border-radius: 14px; padding: 14px 16px; max-width: 380px; }
        .tool-card-header { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; font-size: 11px; font-weight: 700; color: #a78bfa; letter-spacing: 0.06em; }
        .badge { margin-left: auto; font-size: 10px; padding: 2px 8px; border-radius: 100px; font-weight: 600; }
        .badge-warn { color: #f59e0b; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); }
        .badge-ok   { color: #10b981; background: rgba(16,185,129,0.1); }
        .badge-err  { color: #ef4444; background: rgba(239,68,68,0.1); }
        .tool-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
        .tool-card-cell { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 10px; }
        .tc-label { font-size: 9px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .tc-val { font-size: 13px; color: #fff; font-weight: 500; }
        .tool-card-actions { display: flex; gap: 6px; }
        .tc-btn { flex: 1; padding: 8px 0; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; border: none; }
        .tc-confirm { background: #7c3aed; color: #fff; } .tc-confirm:hover { background: #6d28d9; }
        .tc-cancel  { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.1)!important; }

        /* Typing */
        .ai-thinking { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #3b82f6); animation: pulse-spin 1.8s ease infinite; flex-shrink: 0; margin-top: 2px; }
        @keyframes pulse-spin { 0%{transform:scale(0.9)rotate(0deg);opacity:0.7} 50%{transform:scale(1.1)rotate(180deg);opacity:1;box-shadow:0 0 16px rgba(124,58,237,0.45)} 100%{transform:scale(0.9)rotate(360deg);opacity:0.7} }

        /* Empty state */
        .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 20px; width: 100%; max-width: 700px; margin: 0 auto; }
        .empty-greeting { font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px; text-align: center; }
        .empty-sub { font-size: 14px; color: rgba(255,255,255,0.4); margin-bottom: 32px; text-align: center; }
        .prompt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; width: 100%; margin-bottom: 32px; }
        .prompt-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); padding: 11px 13px; border-radius: 11px; font-size: 12px; color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; text-align: left; font-family: 'Outfit', sans-serif; }
        .prompt-card:hover { background: rgba(124,58,237,0.08); color: #c4b5fd; border-color: rgba(124,58,237,0.25); transform: translateY(-1px); }

        /* Input */
        .input-wrap { width: 100%; padding: 12px 16px 18px; }
        .input-wrap.bottom { background: linear-gradient(to top, #060608 60%, transparent); }
        .input-wrap.center { padding: 0; display: flex; justify-content: center; width: 100%; }
        .input-box { width: 100%; max-width: 700px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; display: flex; align-items: center; padding: 9px 10px 9px 16px; transition: all 0.25s; }
        .input-box:focus-within { border-color: rgba(124,58,237,0.45); background: rgba(255,255,255,0.055); box-shadow: 0 0 0 3px rgba(124,58,237,0.07); }
        .chat-input { flex: 1; background: transparent; border: none; outline: none; color: #fff; font-size: 14px; font-family: 'Outfit', sans-serif; }
        .chat-input::placeholder { color: rgba(255,255,255,0.28); }
        .send-btn { width: 32px; height: 32px; border-radius: 9px; background: #7c3aed; color: #fff; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
        .send-btn:disabled { opacity: 0.2; cursor: not-allowed; background: rgba(255,255,255,0.08); }
        .send-btn:not(:disabled):hover { background: #6d28d9; transform: scale(1.06); }
        .input-hint { text-align: center; margin-top: 10px; font-size: 11px; color: rgba(255,255,255,0.18); }

        /* ── DASHBOARD PANEL ── */
        .dash-panel-wrap { transition: width 0.3s cubic-bezier(0.4,0,0.2,1); overflow: hidden; }
        .dash-panel-wrap.open { width: 320px; } .dash-panel-wrap.closed { width: 0; }
        .dash-panel { width: 320px; height: 100%; background: #0a0a0e; border-left: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; overflow: hidden; }
        .dash-header { padding: 16px 16px 12px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
        .dash-greeting { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; color: #fff; }
        .dash-time { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px; }
        .student-strip { display: flex; align-items: center; gap: 10px; padding: 12px 14px; margin: 10px 10px 0; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; flex-shrink: 0; }
        .student-avatar { width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(135deg, #7c3aed, #3b82f6); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .student-info { flex: 1; min-width: 0; }
        .student-name { font-size: 13px; font-weight: 600; color: #fff; }
        .student-meta { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .student-cgpa { text-align: right; flex-shrink: 0; }
        .cgpa-val { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #10b981; }
        .cgpa-label { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.06em; }
        .stat-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px 10px 0; flex-shrink: 0; }
        .stat-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 10px 8px; position: relative; overflow: hidden; }
        .stat-card.stat-ok     { border-color: rgba(16,185,129,0.15); }
        .stat-card.stat-danger { border-color: rgba(239,68,68,0.2); }
        .stat-card.stat-warn-card { border-color: rgba(245,158,11,0.2); }
        .stat-card.stat-info   { border-color: rgba(59,130,246,0.15); }
        .stat-icon { color: rgba(255,255,255,0.3); margin-bottom: 4px; }
        .stat-val  { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #fff; line-height: 1; letter-spacing: -0.01em; }
        .stat-label{ font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 2px; }
        .stat-sub  { font-size: 9px; color: rgba(255,255,255,0.25); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dash-tabs { display: flex; gap: 4px; padding: 10px 10px 0; flex-shrink: 0; }
        .dash-tab { flex: 1; padding: 7px 0; border-radius: 8px; border: none; cursor: pointer; font-size: 11px; font-weight: 500; font-family: 'Outfit', sans-serif; transition: all 0.2s; text-transform: capitalize; }
        .dash-tab.active { background: rgba(124,58,237,0.18); color: #a78bfa; }
        .dash-tab:not(.active) { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.4); }
        .dash-tab:not(.active):hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }
        .dash-body { flex: 1; overflow-y: auto; padding: 10px 10px 16px; }

        /* Schedule */
        .sched-wrap { display: flex; flex-direction: column; gap: 4px; }
        .sched-day-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 2px 4px; }
        .sched-day-label { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.07em; }
        .sched-expand-btn { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #7c3aed; background: rgba(124,58,237,0.1); border: none; padding: 3px 8px; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; }
        .sched-expand-btn:hover { background: rgba(124,58,237,0.2); }
        .sched-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 9px; transition: background 0.2s; }
        .sched-row.current { background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.2); }
        .sched-row.done { opacity: 0.4; }
        .sched-row.upcoming { }
        .sched-time-col { width: 36px; flex-shrink: 0; }
        .sched-time { font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.35); }
        .sched-bar { width: 2px; height: 32px; border-radius: 2px; flex-shrink: 0; }
        .sched-bar.current { background: #7c3aed; }
        .sched-bar.done { background: rgba(255,255,255,0.1); }
        .sched-bar.upcoming { background: rgba(255,255,255,0.15); }
        .sched-info { flex: 1; min-width: 0; }
        .sched-subj { font-size: 12px; font-weight: 500; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sched-meta { font-size: 10px; color: rgba(255,255,255,0.35); display: flex; align-items: center; gap: 5px; }
        .sched-type.lecture { color: rgba(255,255,255,0.35); }
        .sched-type.lab { color: #60a5fa; }
        .sched-now { font-size: 9px; background: rgba(124,58,237,0.25); color: #c4b5fd; padding: 1px 6px; border-radius: 4px; font-weight: 700; letter-spacing: 0.04em; }
        .sched-empty { font-size: 12px; color: rgba(255,255,255,0.25); padding: 10px 4px; }
        .sched-more-btn { background: transparent; border: 1px dashed rgba(255,255,255,0.1); color: rgba(255,255,255,0.35); padding: 7px 0; border-radius: 8px; font-size: 11px; cursor: pointer; transition: all 0.2s; width: 100%; font-family: 'Outfit', sans-serif; }
        .sched-more-btn:hover { border-color: rgba(124,58,237,0.4); color: #a78bfa; }

        /* Attendance */
        .att-wrap { display: flex; flex-direction: column; gap: 6px; }
        .att-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 11px; padding: 11px 12px; cursor: pointer; transition: all 0.2s; }
        .att-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(124,58,237,0.2); }
        .att-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .att-info { flex: 1; min-width: 0; }
        .att-name { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .att-code { font-size: 10px; color: rgba(255,255,255,0.35); margin-top: 1px; }
        .att-pct  { font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 700; flex-shrink: 0; }
        .att-progress { height: 3px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: visible; position: relative; margin-bottom: 6px; }
        .att-prog-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
        .att-75-line { position: absolute; top: -3px; left: 75%; width: 1px; height: 9px; background: rgba(255,255,255,0.2); }
        .att-bunk-row { display: flex; align-items: center; justify-content: space-between; font-size: 10px; }
        .att-status-row { display: flex; align-items: center; justify-content: space-between; font-size: 10px; margin-top: 2px; }
        .att-safe { color: #10b981; } .att-danger { color: #ef4444; }
        .att-detail-link { color: rgba(255,255,255,0.3); font-size: 10px; }

        /* Attendance detail page */
        .detail-page { padding: 0; }
        .detail-back { background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 12px; display: flex; align-items: center; gap: 5px; cursor: pointer; font-family: 'Outfit', sans-serif; padding: 8px 0; margin-bottom: 6px; transition: color 0.2s; }
        .detail-back:hover { color: #fff; }
        .detail-hero { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
        .detail-code { font-size: 10px; color: rgba(255,255,255,0.3); font-family: 'DM Mono', monospace; letter-spacing: 0.06em; margin-bottom: 4px; }
        .detail-name { font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 10px; }
        .detail-pct  { font-family: 'Outfit', sans-serif; font-size: 32px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 10px; }
        .detail-bar-wrap { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; }
        .detail-bar-bg { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 4px; position: relative; overflow: visible; }
        .detail-bar-fill { height: 100%; border-radius: 4px; transition: width 0.7s ease; }
        .detail-75-marker { position: absolute; left: 75%; top: -4px; width: 2px; height: 14px; background: rgba(255,255,255,0.3); border-radius: 1px; }
        .detail-75-label { font-size: 9px; color: rgba(255,255,255,0.3); font-family: 'DM Mono', monospace; }
        .detail-stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
        .detail-stat { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 6px; text-align: center; }
        .ds-val { display: block; font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 600; color: #fff; }
        .ds-label { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.05em; }
        .detail-section-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; }
        .detail-month-group { margin-bottom: 12px; }
        .detail-month-label { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 600; margin-bottom: 6px; }
        .detail-missed-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.1); border-radius: 8px; margin-bottom: 4px; }
        .dmr-dot { width: 5px; height: 5px; border-radius: 50%; background: #ef4444; flex-shrink: 0; }
        .dmr-date { font-size: 12px; color: rgba(255,255,255,0.7); font-family: 'DM Mono', monospace; font-size: 11px; }
        .dmr-reason { font-size: 11px; color: rgba(255,255,255,0.35); margin-left: auto; }
        .dash-ask-btn { width: 100%; background: transparent; border: 1px dashed rgba(255,255,255,0.1); color: rgba(255,255,255,0.35); padding: 8px 0; border-radius: 9px; font-size: 11px; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; margin-top: 6px; }
        .dash-ask-btn:hover { border-color: rgba(124,58,237,0.4); color: #a78bfa; }

        /* Exams */
        .exam-wrap { display: flex; flex-direction: column; gap: 5px; }
        .exam-header-note { font-size: 9px; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 2px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 4px; }
        .exam-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-left: 3px solid transparent; border-radius: 10px; transition: all 0.2s; overflow: hidden; }
        .exam-card:hover { background: rgba(255,255,255,0.04); }
        .exam-left { text-align: center; flex-shrink: 0; width: 56px; min-width: 56px; overflow: hidden; }
        .exam-countdown { font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 700; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: clip; }
        .exam-day { font-size: 9px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 3px; }
        .exam-mid { flex: 1; min-width: 0; overflow: hidden; }
        .exam-subj { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .exam-code { font-size: 10px; color: rgba(255,255,255,0.35); font-family: 'DM Mono', monospace; margin-top: 1px; }
        .exam-date { font-size: 10px; color: rgba(255,255,255,0.3); margin-top: 2px; }
        .exam-alert-dot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: blink 1.2s ease infinite; flex-shrink: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

        /* ── TIMETABLE POPUP ── */
        .popup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; animation: fade-in 0.2s ease; }
        @keyframes fade-in { from{opacity:0} to{opacity:1} }
        .popup-box { background: #0f0f14; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; width: 440px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; animation: slide-up 0.25s ease; }
        @keyframes slide-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .popup-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 20px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .popup-title { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 700; color: #fff; }
        .popup-sub { font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 2px; }
        .popup-empty { padding: 32px; text-align: center; color: rgba(255,255,255,0.35); font-size: 14px; }
        .popup-timeline { overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 0; }
        .ptl-row { display: flex; gap: 12px; align-items: flex-start; }
        .ptl-time { width: 48px; flex-shrink: 0; padding-top: 6px; }
        .ptl-start { display: block; font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.5); }
        .ptl-end   { display: block; font-family: 'DM Mono', monospace; font-size: 9px;  color: rgba(255,255,255,0.25); }
        .ptl-dot-col { display: flex; flex-direction: column; align-items: center; padding-top: 8px; }
        .ptl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .ptl-dot.current  { background: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
        .ptl-dot.upcoming { background: rgba(255,255,255,0.2); }
        .ptl-dot.done     { background: rgba(255,255,255,0.1); }
        .ptl-line { width: 1px; flex: 1; min-height: 24px; background: rgba(255,255,255,0.07); margin: 3px 0; }
        .ptl-card { flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 8px 12px; margin-bottom: 6px; }
        .ptl-card.current { background: rgba(124,58,237,0.07); border-color: rgba(124,58,237,0.25); }
        .ptl-card.done    { opacity: 0.45; }
        .ptl-subject { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 3px; }
        .ptl-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(255,255,255,0.4); }
        .ptl-type.lecture { color: rgba(255,255,255,0.35); } .ptl-type.lab { color: #60a5fa; }
        .ptl-now  { font-size: 9px; background: rgba(124,58,237,0.25); color: #c4b5fd; padding: 1px 7px; border-radius: 5px; font-weight: 700; }
        .ptl-done { font-size: 9px; color: rgba(255,255,255,0.2); }
        .popup-footer { padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.06); }
        .popup-ask-btn { width: 100%; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.2); color: #a78bfa; padding: 10px 0; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif; }
        .popup-ask-btn:hover { background: rgba(124,58,237,0.2); }

        /* ── SETTINGS ── */
        .settings-wrap { flex: 1; overflow-y: auto; background: #060608; }
        .settings-nav  { height: 52px; display: flex; align-items: center; padding: 0 20px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .back-btn { background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 13px; display: flex; align-items: center; gap: 7px; cursor: pointer; font-family: 'Outfit', sans-serif; transition: color 0.2s; }
        .back-btn:hover { color: #fff; }
        .settings-inner { max-width: 520px; margin: 32px auto; padding: 0 24px; display: flex; flex-direction: column; gap: 32px; }
        .settings-section h2 { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 700; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.07); margin-bottom: 18px; }
        .setting-row { display: flex; flex-direction: column; gap: 5px; }
        .setting-row label { font-size: 13px; color: #fff; font-weight: 500; }
        .setting-desc { font-size: 12px; color: rgba(255,255,255,0.3); }
        .setting-input { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #fff; padding: 11px 13px; border-radius: 9px; font-size: 13px; outline: none; font-family: 'Outfit', sans-serif; transition: all 0.2s; }
        .setting-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.08); }
        .danger-zone { background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.12); border-radius: 12px; padding: 18px; }
        .danger-btn { background: rgba(239,68,68,0.08); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 9px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; font-family: 'Outfit', sans-serif; transition: all 0.2s; display: flex; align-items: center; gap: 7px; margin-top: 12px; }
        .danger-btn:hover { background: #ef4444; color: #fff; }
      `}</style>

      {/* ── LEFT SIDEBAR ── */}
      <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-inner">
          <div className="sb-brand">
            <Link href="/" className="sb-logo">Campus<span>Copilot</span></Link>
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
                  <button
                    className={`sb-del ${deletingId===t.thread_id?"spinning":""}`}
                    onClick={(e) => deleteThread(t.thread_id, e)}
                    title="Delete chat"
                  >
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))
            }
          </div>
          <div className="sb-footer">
            <div className="sb-user-row" onClick={() => setCurrentView("settings")}>
              <div className="sb-avatar">{STUDENT.initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="sb-uname">{STUDENT.name}</div>
                <div className="sb-usub">{STUDENT.id} · {STUDENT.year}</div>
              </div>
              <Settings size={13} style={{ color:"rgba(255,255,255,0.25)", flexShrink:0 }}/>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      {currentView === "settings" ? (
        <div className="settings-wrap" style={{ flex:1 }}>
          <header className="settings-nav">
            <button className="back-btn" onClick={() => setCurrentView("chat")}>← Back to Chat</button>
          </header>
          <div className="settings-inner">
            <div className="settings-section">
              <h2>Account</h2>
              <div className="setting-row">
                <label>Student ID</label>
                <p className="setting-desc">Linked via Microsoft SSO — read-only in production.</p>
                <input className="setting-input" value={STUDENT.id} readOnly/>
              </div>
              <div className="setting-row" style={{ marginTop:12 }}>
                <label>Branch</label>
                <input className="setting-input" value={STUDENT.branch} readOnly/>
              </div>
            </div>
            <div className="settings-section">
              <h2>Data</h2>
              <div className="danger-zone">
                <div className="setting-row">
                  <label style={{ color:"#ef4444" }}>Clear All Chat History</label>
                  <p className="setting-desc">Permanently deletes all conversations for <strong>{STUDENT.id}</strong>.</p>
                </div>
                <button className="danger-btn" onClick={deleteAllChats}>
                  <Trash2 size={13}/> Delete All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              {!isSidebarOpen && (
                <button className="icon-btn" onClick={() => setIsSidebarOpen(true)}><PanelLeftOpen size={18}/></button>
              )}
              {!isSidebarOpen && (
                <span style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.5)", letterSpacing:"-0.01em" }}>
                  Campus<span style={{ color:"#7c3aed" }}>Copilot</span>
                </span>
              )}
            </div>
            <div className="topbar-right">
              <button className={`dash-toggle ${isDashOpen?"on":"off"}`} onClick={() => setIsDashOpen(p=>!p)}>
                <LayoutGrid size={14}/> Dashboard
              </button>
            </div>
          </header>

          {isChatEmpty ? (
            <div className="empty-state">
              <div className="empty-greeting">
                Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {STUDENT.name.split(" ")[0]} 👋
              </div>
              <p className="empty-sub">Your campus assistant is ready — {STUDENT.branch}, Sem {STUDENT.semester}</p>
              <div className="prompt-grid">
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} className="prompt-card" onClick={() => handleSend(p.text)}>
                    <p.icon size={13} style={{ flexShrink:0, opacity:0.6 }}/>{p.label}
                  </button>
                ))}
              </div>
              <div className="input-wrap center" style={{ width:"100%", maxWidth:700 }}>
                <div className="input-box">
                  <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleSend()} placeholder="Ask anything about your campus…" disabled={isTyping}/>
                  <button className="send-btn" disabled={!input.trim()||isTyping} onClick={() => handleSend()}>
                    <Send size={14} strokeWidth={2.5}/>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-scroll">
                <div className="chat-inner">
                  {messages.map((msg, i) => (
                    <div key={i} className={`msg-row ${msg.role}`}>
                      <div className={`msg-avatar ${msg.role}`}>
                        {msg.role === "assistant" ? <Bot size={15}/> : <User size={15}/>}
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
                              <code style={{ background:"rgba(255,255,255,0.09)", padding:"2px 6px", borderRadius:4, fontSize:"0.88em", fontFamily:"DM Mono, monospace" }} {...props}>{children}</code>
                            );
                          }
                        }}>
                          {msg.content}
                        </ReactMarkdown>
                        {msg.action && <ToolCallCard action={msg.action}/>}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="msg-row assistant">
                      <div className="ai-thinking"/>
                    </div>
                  )}
                  <div ref={messagesEndRef}/>
                </div>
              </div>
              <div className="input-wrap bottom">
                <div className="input-box" style={{ maxWidth:700, margin:"0 auto" }}>
                  <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleSend()} placeholder="Message Campus Copilot…" disabled={isTyping}/>
                  <button className="send-btn" disabled={!input.trim()||isTyping} onClick={() => handleSend()}>
                    <Send size={14} strokeWidth={2.5}/>
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      )}

      {/* ── RIGHT DASHBOARD ── */}
      <div className={`dash-panel-wrap ${isDashOpen?"open":"closed"}`}>
        {isDashOpen && <DashboardPanel onClose={() => setIsDashOpen(false)} onAsk={handleSend}/>}
      </div>
    </div>
  );
}
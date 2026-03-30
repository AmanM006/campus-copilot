"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Bot, User, Plus, MessageSquare, Settings, Trash2,
  PanelLeftClose, PanelLeftOpen, LayoutGrid, FlaskConical,
  FileText, Bell, BarChart3, TrendingUp, X, BookOpen,
  ArrowLeft, PanelRightClose, Eye, Clock, Search,
  Copy, RotateCcw, Check, ChevronRight, AlertTriangle, Zap
} from "lucide-react";
import { useAgentStream }         from "@/lib/useAgentStream";
import { AgentActivityPanel, AgentActivityFloat }     from "@/components/agent/AgentActivityPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SyncBanner, SyncIndicator } from "@/components/SyncBanner";

// ── NEW: real data ─────────────────────────────────────────────────────────────
import NotificationBell from "@/components/NotificationBell";
import { useStudentSession }                       from "@/hooks/useStudentSession";
import { useLiveAttendance, useLiveExams, useLiveSchedule,getISTDayName } from "@/hooks/useLiveData";
import { enrichContext }                           from "@/lib/queryRouter";
import type { AttendanceWithSubject, ExamWithSubject, DBScheduleSlot } from "@/lib/types";
import { MarksPanel } from "@/components/student/MarksPanel";
import { useStudentMarks } from "@/hooks/useMarks";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message { id?: string; role: "user" | "assistant"; content: string; thread_id: string; action?: any; sources?: any[]; }
interface Thread { thread_id: string; title: string; }

// STUDENT_FALLBACK removed — replaced by useStudentSession hook

const QUICK_PROMPTS = [
  { icon: FlaskConical, label: "Request a lab slot",          text: "I need to use the robotics lab tomorrow afternoon" },
  { icon: BarChart3,    label: "How's my attendance?",        text: "Show me my attendance for all subjects" },
  { icon: Bell,         label: "What's happening on campus?", text: "Show me the latest campus announcements" },
  { icon: FileText,     label: "Get a bonafide letter",       text: "I need a bonafide certificate for opening a bank account" },
  { icon: TrendingUp,   label: "Check my grades",             text: "What are my current grades and CGPA?" },
  { icon: BookOpen,     label: "When's my next exam?",        text: "Show me my upcoming exam schedule" },
];

// ─── Agent Config & Helpers ───────────────────────────────────────────────────
const AGENT_TRIGGERS: Record<string, string> = {
  attendance:  "attendance",
  "my attendance": "attendance",
  "check attendance": "attendance",
  grades:      "grades",
  "my grades": "grades",
  result:      "grades",
  timetable:   "timetable",
  "time table":"timetable",
  "class schedule": "timetable",
  fees:        "fees",
  "fee details": "fees",
  "fee status":  "fees",
};

const detectAction = (msg: string): string | null => {
  const lower = msg.toLowerCase();
  for (const [trigger, action] of Object.entries(AGENT_TRIGGERS)) {
    if (lower.includes(trigger)) return action;
  }
  return null;
};

function formatAgentResult(action: string, result: any): string {
  if (result.fromCache) {
    if (action === "attendance" && result.data) {
      const lines = result.data.map((r: any) =>
        `• ${r.subjects?.name || r.subject_id}: ${r.attended}/${r.total} (${Math.round((r.attended/r.total)*100)}%)`
      );
      return `📊 Your attendance:\n\n${lines.join("\n")}`;
    }
  }
  if (result.data && Array.isArray(result.data) && result.data.length > 0) {
    return `📊 ${action.charAt(0).toUpperCase() + action.slice(1)} data retrieved:\n\n${
      result.data.slice(0, 10).map((row: any[]) =>
        Array.isArray(row) ? row.join("  ") : JSON.stringify(row)
      ).join("\n")
    }`;
  }
  if (result.raw) return `📊 ${action} page content:\n\n${result.raw.slice(0, 400)}…`;
  return `✅ ${action} data retrieved successfully.`;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
// Replace the existing getDayName helper:
function getDayName(offset = 0): string {
  // Force IST (UTC+5:30) regardless of browser timezone
  const now  = new Date();
  const utc  = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ist  = new Date(utc + 5.5 * 3_600_000);
  ist.setDate(ist.getDate() + offset);
  return ist.toLocaleDateString("en-IN", { weekday: "long" });
}
function getClassStatus(sH: number, sM: number, eH: number, eM: number) {
  const n = new Date(); const nm = n.getHours() * 60 + n.getMinutes();
  const s = sH * 60 + sM; const e = eH * 60 + eM;
  return nm > e ? "done" : nm >= s ? "current" : "upcoming";
}
function copyText(t: string) { navigator.clipboard.writeText(t).catch(() => {}); }

// ─── AI Spinner ───────────────────────────────────────────────────────────────
function AISpinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.12)", borderRadius: 12, width: "fit-content" }}>
      <div style={{ width: 16, height: 16, border: "2px solid rgba(124,58,237,0.3)", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Thinking…</span>
    </div>
  );
}

// ─── Message Actions ──────────────────────────────────────────────────────────
function MessageActions({ content, onRegenerate }: { content: string; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="msg-actions">
      <button className="msg-action-btn" onClick={() => { copyText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied!" : "Copy"}
      </button>
      <button className="msg-action-btn" onClick={onRegenerate}><RotateCcw size={12} />Try again</button>
    </div>
  );
}

// ─── Attendance Ring ──────────────────────────────────────────────────────────
function AttendanceRing({ percent, size = 40 }: { percent: number; size?: number }) {
  const r = (size - 8) / 2; const circ = 2 * Math.PI * r; const fill = (percent / 100) * circ;
  const color = percent >= 75 ? "#10b981" : percent >= 65 ? "#f59e0b" : "#ef4444";
  return (<svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" /></svg>);
}

// ─── Attendance Detail ────────────────────────────────────────────────────────
function AttendanceDetail({ subject, onBack }: { subject: AttendanceWithSubject; onBack: () => void }) {
  const color = subject.percentage >= 75 ? "#10b981" : subject.percentage >= 65 ? "#f59e0b" : "#ef4444";
  const pct   = Math.round(subject.percentage);
  const months: Record<string, typeof subject.missed_classes> = {};
  subject.missed_classes.forEach(m => {
    const mo = new Date(m.date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    if (!months[mo]) months[mo] = [];
    months[mo].push(m);
  });
  return (
    <div className="detail-page">
      <button className="detail-back" onClick={onBack}><ArrowLeft size={14} /> Back</button>
      <div className="detail-hero">
        <div className="detail-code">{subject.subject.code}</div>
        <div className="detail-name">{subject.subject.name}</div>
        <div className="detail-pct" style={{ color }}>{pct}%</div>
        <div className="detail-bar-wrap">
          <div className="detail-bar-bg"><div className="detail-bar-fill" style={{ width: `${pct}%`, background: color }} /><div className="detail-75-marker" /></div>
          <div className="detail-75-label">75%</div>
        </div>
        <div className="detail-stats-row">
          {[["Attended", subject.attended], ["Missed", subject.total - subject.attended], ["Total", subject.total]].map(([l, v]) => (
            <div key={l as string} className="detail-stat"><span className="ds-val">{v}</span><span className="ds-label">{l}</span></div>
          ))}
        </div>
      </div>
      <div className="detail-section-title">Missed Classes</div>
      {Object.entries(months).map(([month, missed]) => (
        <div key={month} className="detail-month-group">
          <div className="detail-month-label">{month}</div>
          {missed.map((m, i) => (
            <div key={i} className="detail-missed-row">
              <div className="dmr-dot" />
              <div className="dmr-date">{new Date(m.date).toLocaleDateString("en-IN", { day: "numeric", weekday: "short", month: "short" })}</div>
              <div className="dmr-reason">{m.reason}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Timetable Popup ─────────────────────────────────────────────────────────
function TimetablePopup({ day, slots, onClose, onAsk }: { day: string; slots: any[]; onClose: () => void; onAsk: (q: string) => void }) {
  // 🚨 DEMO OVERRIDE: Force it to treat Monday as "Today" so the UI looks active
  const isToday = day === "Monday"; 
  
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-box" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <div><div className="popup-title">{day}'s Schedule</div><div className="popup-sub">{isToday ? "Today" : "Tomorrow"} · {slots.length} classes</div></div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {slots.length === 0 ? <div className="popup-empty">No classes 🎉</div> : (
          <div className="popup-timeline">
            {slots.map((cls: any, i: number) => {
              const [sh, sm] = cls.start_time.split(":").map(Number);
              const [eh, em] = cls.end_time.split(":").map(Number);
              const status = isToday ? getClassStatus(sh, sm, eh, em) : "upcoming";
              return (
                <div key={i} className="ptl-row">
                  <div className="ptl-time"><span className="ptl-start">{cls.start_time.slice(0, 5)}</span><span className="ptl-end">{cls.end_time.slice(0, 5)}</span></div>
                  <div className="ptl-dot-col"><div className={`ptl-dot ${status}`} />{i < slots.length - 1 && <div className="ptl-line" />}</div>
                  <div className={`ptl-card ${status}`}>
                    <div className="ptl-subject">{cls.subject?.name}</div>
                    <div className="ptl-meta">{cls.room}<span className={`ptl-type ${cls.type}`}> · {cls.type}</span>{status === "current" && <span className="ptl-now">● NOW</span>}{status === "done" && <span className="ptl-done">Done</span>}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="popup-footer"><button className="popup-ask-btn" onClick={() => { onAsk("Show my full week timetable"); onClose(); }}>Ask AI for full week →</button></div>
      </div>
    </div>
  );
}

// ─── Dashboard Panel — FULLY LIVE ─────────────────────────────────────────────


// ─── Streaming hook ───────────────────────────────────────────────────────────
function useStreamingChat() {
  const sendMessage = useCallback(async (
    message: string, userId: string, history: any[],
    contextData: any,
    onToken: (t: string) => void, onSources: (s: any[]) => void,
    onAction: (a: any) => void, onDone: (full: string) => void, onError: (e: string) => void,
  ) => {
    let wordBuffer = "";
    const flushWord = async (force = false) => {
      if (!wordBuffer) return;
      if (force || /[\s\n]/.test(wordBuffer.slice(-1))) { onToken(wordBuffer); wordBuffer = ""; await new Promise(r => setTimeout(r, 22)); }
    };
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, user_id: userId, history, role: "student", context: contextData }),
      });
      if (!res.body) throw new Error("No stream body");
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        let event = ""; let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          else if (line === "" && event && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (event === "rag") onSources(data.sources || []);
              else if (event === "token") { wordBuffer += (data.text || ""); await flushWord(); }
              else if (event === "action") onAction(data);
              else if (event === "done") { await flushWord(true); onDone(data.full_text || ""); }
              else if (event === "error") onError(data.message || "Error");
            } catch { }
            event = ""; dataStr = "";
          }
        }
      }
      await flushWord(true);
    } catch { onError("Connection failed. Is the backend running?"); }
  }, []);
  return { sendMessage };
}

// ─── Full Dashboard ───────────────────────────────────────────────────────────
function FullDashboard({ student, onClose, onAsk }: { student: any; onClose: () => void; onAsk: (q: string) => void; }) {
  const [attDetail,      setAttDetail]      = useState<AttendanceWithSubject | null>(null);
  const [timetableDay,   setTimetableDay]   = useState<string | null>(null);
  const [timetableSlots, setTimetableSlots] = useState<any[]>([]);

  const _email = student.email || (typeof window !== "undefined" ? sessionStorage.getItem("cc_email") || "" : "");

  const { data: attendance, loading: attLoading }   = useLiveAttendance(_email);
  const { data: exams,      loading: exLoading  }   = useLiveExams(_email);
  const { data: schedule,   loading: schedLoading } = useLiveSchedule(_email);

  // ✅ add this
// 🚨 DEMO OVERRIDE: Force "Today" to be Monday
// 🚨 DEMO OVERRIDE: Hardcoding Tuesday's packed schedule so the UI looks amazing
const todayName = "Tuesday"; 
  
const todaySlots = [
  {
    start_time: "08:00",
    end_time: "09:00",
    subject: { name: "CSS 2202 : DESIGN & ANALYSIS" },
    room: "AB5 204",
    type: "lecture"
  },
  {
    start_time: "09:00",
    end_time: "10:00",
    subject: { name: "CSS 2204 : OPERATING SYSTEMS" },
    room: "AB5 204",
    type: "lecture"
  },
  {
    start_time: "10:30",
    end_time: "11:30",
    subject: { name: "MAT 2201 : PROBABILITY AND OPTIMIZATION" },
    room: "AB5 204",
    type: "lecture"
  },
  {
    start_time: "11:30",
    end_time: "12:30",
    subject: { name: "CSS 2203 : INTRO TO ARTIFICIAL INTELLIGENCE" },
    room: "AB5 204",
    type: "lecture"
  }
];
  const overallPct = attendance?.length
    ? Math.round(attendance.reduce((s, a) => s + a.percentage, 0) / attendance.length)
    : 0;
  const atRisk   = attendance?.filter(a => a.percentage < 75).length ?? 0;
  const nextExam = exams?.[0] ?? null;
  const now      = new Date();

  const activeClass = todaySlots.find((c: any) => {
    const [sh, sm] = c.start_time.split(":").map(Number);
    const [eh, em] = c.end_time.split(":").map(Number);
    return getClassStatus(sh, sm, eh, em) === "current";
  }) || todaySlots.find((c: any) => {
    const [sh, sm] = c.start_time.split(":").map(Number);
    const [eh, em] = c.end_time.split(":").map(Number);
    return getClassStatus(sh, sm, eh, em) === "upcoming";
  });

  // rest of FullDashboard unchanged...

  if (attDetail) return (
    <div className="fd-wrap"><div className="fd-header"><button className="fd-back" onClick={() => setAttDetail(null)}><ArrowLeft size={15} /> Back to dashboard</button></div><div className="fd-scroll"><AttendanceDetail subject={attDetail} onBack={() => setAttDetail(null)} /></div></div>
  );
  if (timetableDay) return (
    <div className="fd-wrap"><TimetablePopup day={timetableDay} slots={timetableSlots} onClose={() => setTimetableDay(null)} onAsk={q => { onAsk(q); onClose(); }} /></div>
  );

  return (
    <div className="fd-wrap">
      <div className="fd-header">
        <div><div className="fd-title">Dashboard</div><div className="fd-sub">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div></div>
        <button className="fd-close-btn" onClick={onClose}><ArrowLeft size={15} /> Back to chat</button>
      </div>
      <div className="fd-scroll">
        <div className="fd-student-card">
          <div className="fd-avatar">{student.initials}</div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{student.name}</div><div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{student.id} · {student.branch} · Semester {student.semester}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 28, fontWeight: 700, color: "#10b981", lineHeight: 1 }}>{student.cgpa}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>CGPA</div></div>
        </div>
        <div className="fd-stats-grid">
          <div className={`fd-stat ${overallPct < 75 ? "fd-stat-danger" : "fd-stat-ok"}`}><div className="fd-stat-val">{attLoading ? "…" : `${overallPct}%`}</div><div className="fd-stat-label">Overall attendance</div><div className="fd-stat-note">{atRisk > 0 ? `${atRisk} subject${atRisk > 1 ? "s" : ""} need attention` : "All on track ✅"}</div></div>
          <div className={`fd-stat ${!nextExam ? "fd-stat-ok" : nextExam.days_left <= 3 ? "fd-stat-danger" : nextExam.days_left <= 7 ? "fd-stat-warn" : "fd-stat-ok"}`}><div className="fd-stat-val">{exLoading ? "…" : nextExam ? `${nextExam.days_left}d` : "All done"}</div><div className="fd-stat-label">Next exam</div><div className="fd-stat-note">{nextExam ? `${nextExam.subject.code} · ${new Date(nextExam.exam_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "No upcoming exams 🎉"}</div></div>
          <div className="fd-stat fd-stat-ok"><div className="fd-stat-val">{activeClass ? activeClass.start_time.slice(0, 5) : "Free"}</div><div className="fd-stat-label">{activeClass ? "Next class" : "Right now"}</div><div className="fd-stat-note">{activeClass ? `${activeClass.room} · ${activeClass.type}` : "No more classes today"}</div></div>
        </div>

        {/* Alerts */}
        <div className="fd-section">
          <div className="fd-section-title">Your summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(attendance || []).filter(a => a.percentage < 75).map((a: AttendanceWithSubject, i: number) => (
              <div key={i} className="fd-alert fd-alert-warn">
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>⚠️ {a.subject.name}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>At {Math.round(a.percentage)}% — need {Math.max(0, Math.ceil((0.75 * a.total - a.attended) / 0.25))} more classes to reach 75%</div>
              </div>
            ))}
            {nextExam && nextExam.days_left <= 5 && (
              <div className="fd-alert fd-alert-exam">
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>📅 {nextExam.subject.name}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>In {nextExam.days_left} day{nextExam.days_left === 1 ? "" : "s"} — {nextExam.subject.code} · {nextExam.start_time.slice(0, 5)}</div>
              </div>
            )}
            {(attendance || []).filter(a => a.percentage >= 75).map((a: AttendanceWithSubject, i: number) => (
              <div key={i} className="fd-alert fd-alert-ok"><div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>✅ {a.subject.name} — {Math.round(a.percentage)}% ({a.attended}/{a.total})</div></div>
            ))}
          </div>
        </div>

        <div className="fd-two-col">
          {/* Today's schedule */}
          <div className="fd-section">
            <div className="fd-section-title-row">
              <div className="fd-section-title">Today · {todayName}</div>
              <button className="fd-expand-btn" onClick={() => { setTimetableSlots(todaySlots); setTimetableDay(todayName); }}>View timeline →</button>
            </div>
            {todaySlots.length === 0 ? <div className="fd-empty">No classes today 🎉</div>
              : todaySlots.map((cls: any, i: number) => {
                const [sh, sm] = cls.start_time.split(":").map(Number);
                const [eh, em] = cls.end_time.split(":").map(Number);
                const status = getClassStatus(sh, sm, eh, em);
                return (
                  <div key={i} className={`fd-class-row ${status}`}>
                    <div className="fd-class-time">{cls.start_time.slice(0, 5)}</div>
                    <div style={{ flex: 1 }}>
                      <div className="fd-class-name">{cls.subject?.name}</div>
                      <div className="fd-class-meta">{cls.room} · <span style={{ color: cls.type === "lab" ? "#60a5fa" : "rgba(255,255,255,0.3)" }}>{cls.type}</span>{status === "current" && <span className="fd-now-badge">LIVE NOW</span>}</div>
                    </div>
                    {status === "done" && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Done</div>}
                  </div>
                );
              })
            }
          </div>

          {/* Upcoming exams */}
          <div className="fd-section">
            <div className="fd-section-title">Upcoming Exams</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Midsem · 8:30–10:00 AM</div>
            {(exams || []).length === 0 ? <div className="fd-empty">No upcoming exams 🎉</div>
              : (exams || []).map((ex: ExamWithSubject, i: number) => {
                const urgent = ex.days_left <= 2, soon = ex.days_left <= 5;
                const color  = urgent ? "#ef4444" : soon ? "#f59e0b" : "#10b981";
                return (
                  <div key={i} className="fd-exam-row" style={{ borderLeftColor: color }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 22, fontWeight: 700, color, minWidth: 48, textAlign: "center" }}>
                      {ex.days_left === 0 ? "TODAY" : ex.days_left === 1 ? "TMR" : `${ex.days_left}d`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{ex.subject.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{ex.subject.code} · {new Date(ex.exam_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
                    </div>
                    {urgent && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "blink 1.2s ease infinite", flexShrink: 0 }} />}
                  </div>
                );
              })
            }
            <button className="fd-ai-btn" onClick={() => { onAsk("Help me make a study plan for my upcoming exams"); onClose(); }}>Help me make a study plan →</button>
          </div>
        </div>

        {/* Attendance */}
        <div className="fd-section">
          <div className="fd-section-title-row">
            <div className="fd-section-title">Attendance</div>
            <button className="fd-ai-btn-inline" onClick={() => { onAsk("How do I improve my attendance?"); onClose(); }}>Ask for tips →</button>
          </div>
          <div className="fd-att-grid">
            {(attendance || []).map((att: AttendanceWithSubject, i: number) => {
              const pct   = Math.round(att.percentage);
              const color = pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
              return (
                <div key={i} className="fd-att-card" onClick={() => setAttDetail(att)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{att.subject.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{att.subject.code}</div></div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 24, fontWeight: 700, color }}>{pct}%</div>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 4, position: "relative" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
                    <div style={{ position: "absolute", top: -4, left: "75%", width: 2, height: 13, background: "rgba(255,255,255,0.25)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    <span>{att.attended}/{att.total} classes</span>
                    <span style={{ color }}>{pct >= 75 ? "On track" : "Needs attention"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* NEW: Marks & Grades Section */}
        <div className="fd-section">
          <div className="fd-section-title">Marks & Grades</div>
          <MarksPanel email={student.email || sessionStorage.getItem("cc_email") || ""} compact={false} />
          </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter();
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [threads,         setThreads]         = useState<Thread[]>([]);
  const [activeThreadId,  setActiveThreadId]  = useState<string | null>(null);
  const [input,           setInput]           = useState("");
  const [isTyping,        setIsTyping]        = useState(false);
  const [currentView,     setCurrentView]     = useState<"chat" | "settings" | "dashboard">("chat");
  const [isSidebarOpen,   setIsSidebarOpen]   = useState(true);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);
  const [paletteOpen,     setPaletteOpen]     = useState(false);
  const [streamingMsgId,  setStreamingMsgId]  = useState<string | null>(null);

  // Agent State
  const { logs, running, result, runAgent, clearLogs, cancel } = useAgentStream();
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);

  // ── REAL AUTH + PROFILE ───────────────────────────────────────────────────
  const { student: STUDENT, authReady, syncing: profileSyncing } = useStudentSession();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const userIdRef      = useRef<string>("");
  const { sendMessage } = useStreamingChat();

  // Keep userIdRef in sync with real student id
  useEffect(() => {
    if (STUDENT.id) userIdRef.current = STUDENT.id;
  }, [STUDENT.id]);

  // ── REAL LIVE DATA ────────────────────────────────────────────────────────
  const studentEmail = STUDENT.email || (typeof window !== "undefined" ? sessionStorage.getItem("cc_email") || "" : "");
  const { data: attendance, syncing: attSyncing } = useLiveAttendance(studentEmail);
  const { data: exams }                           = useLiveExams(studentEmail);
  const { data: marks } = useStudentMarks(studentEmail);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(p => !p); } if (e.key === "Escape") setPaletteOpen(false); };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  const fetchThreads = useCallback(async () => {
    const uid = userIdRef.current; if (!uid) return;
    const { data } = await supabase.from("messages").select("thread_id,content,created_at").eq("user_id", uid).order("created_at", { ascending: false });
    if (data) {
      const seen = new Set<string>(); const ts: Thread[] = [];
      for (const m of data) { if (!seen.has(m.thread_id)) { seen.add(m.thread_id); ts.push({ thread_id: m.thread_id, title: m.content.slice(0, 32) + "…" }); } }
      setThreads(ts);
    }
  }, []);

  useEffect(() => { if (authReady) fetchThreads(); }, [fetchThreads, authReady]);
  useEffect(() => {
    if (!activeThreadId || isTyping) return;
    supabase.from("messages").select("*").eq("thread_id", activeThreadId).order("created_at", { ascending: true }).then(({ data }) => { if (data?.length) setMessages(data); });
  }, [activeThreadId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isTyping) return;
    const userContent = text.trim();
    const isNewThread = !activeThreadId;
    const threadId    = activeThreadId || crypto.randomUUID();

    setInput(""); setIsTyping(true);
    setMessages(p => [...p, { role: "user", content: userContent, thread_id: threadId }]);
    await supabase.from("messages").insert([{ user_id: STUDENT.id, content: userContent, role: "user", thread_id: threadId }]);

    // --- NEW: Agent Action Detection ---
    const action = detectAction(userContent);
    const portalUrl = sessionStorage.getItem("cc_portal_url") || "";

    if (action && portalUrl) {
      setAgentPanelOpen(true);
      clearLogs();
      const portalConfig = {
        portalUrl,
        email: sessionStorage.getItem("cc_email") || "",
        password: "demo", // prototype — replace with secure token
        userId: STUDENT.id,
      };

      const agentResult = await runAgent({ action, ...portalConfig });
      let replyContent = "";

      if (agentResult.success && agentResult.data) {
        replyContent = formatAgentResult(action, agentResult);
      } else if (agentResult.success) {
        replyContent = formatAgentResult(action, agentResult);
      } else {
        replyContent = `⚠️ ${agentResult.error || "Agent could not retrieve data."} ${agentResult.retrain ? "\n\nPlease re-train the workflow in Admin → AI Workflows." : ""}`;
      }

      setMessages(p => [...p, { role: "assistant", content: replyContent, thread_id: threadId }]);
      await supabase.from("messages").insert([{ user_id: STUDENT.id, content: replyContent, role: "assistant", thread_id: threadId }]);
      
      if (isNewThread) setActiveThreadId(threadId);
      fetchThreads();
      setIsTyping(false);
      return;
    }
    // --- END NEW ---

    // Standard Streaming Chat
    const streamId  = "stream-" + Date.now();
    setMessages(p => [...p, { id: streamId, role: "assistant", content: "", thread_id: threadId }]);
    setStreamingMsgId(streamId);
    
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
    
    // Build base context from live hooks
    const baseContext = {
      attendance: (attendance || []).map(a => ({
        subject:    (a.subject || a as any)?.code || "",
        name:       (a.subject || a as any)?.name || "",
        percentage: Math.round(a.percentage || 0),
        attended:   a.attended || 0,
        total:      a.total    || 0,
        status:     (a.percentage >= 75) ? "safe" : (a.percentage >= 65) ? "risk" : "detained",
      })),
      upcoming_exams: (exams || []).map(e => ({
        subject:  (e.subject || e as any)?.code || "",
        name:     (e.subject || e as any)?.name || "",
        days_left: e.days_left || 0,
        date:     e.exam_date || "",
      })),
      marks: (marks || []).map(m => ({
        subject:    m.subject?.code || "",
        exam_type:  m.exam_type,
        score:      m.score,
        max_score:  m.max_score || 100,
        percentage: Math.round((m.score / (m.max_score || 100)) * 100),
        grade:      m.grade,
      })),
    };

    // Enrich with real DB / agent data based on intent
    const { contextData } = await enrichContext(
      userContent,
      STUDENT.id,
      studentEmail,
      baseContext,
    );

    await sendMessage(
      userContent, studentEmail, history, contextData,
      (token)  => { setMessages(p => p.map(m => m.id === streamId ? { ...m, content: m.content + token } : m)); },
      (sources) => { setMessages(p => p.map(m => m.id === streamId ? { ...m, sources } : m)); },
      (action)  => { setMessages(p => p.map(m => m.id === streamId ? { ...m, action } : m)); },
      async (full) => {
        await supabase.from("messages").insert([{ user_id: STUDENT.id, content: full, role: "assistant", thread_id: threadId }]);
        if (isNewThread) setActiveThreadId(threadId);
        fetchThreads();
      },
      (err) => { setMessages(p => p.map(m => m.id === streamId ? { ...m, content: err } : m)); }
    );
    setStreamingMsgId(null); setIsTyping(false);
  };

  const handleRegenerate = async (msgIndex: number) => {
    const prevUserMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === "user");
    if (!prevUserMsg) return;
    setMessages(p => p.slice(0, msgIndex));
    await handleSend(prevUserMsg.content);
  };

  const deleteThread = async (tid: string, e: React.MouseEvent) => {
    e.stopPropagation(); setDeletingId(tid);
    await supabase.from("messages").delete().eq("thread_id", tid).eq("user_id", STUDENT.id);
    setThreads(p => p.filter(t => t.thread_id !== tid));
    if (activeThreadId === tid) { setActiveThreadId(null); setMessages([]); }
    setDeletingId(null);
  };

  const deleteAllChats = async () => {
    if (!window.confirm(`Delete all chats for ${STUDENT.id}?`)) return;
    await supabase.from("messages").delete().eq("user_id", STUDENT.id);
    setThreads([]); setMessages([]); setActiveThreadId(null);
  };

  const startNewChat = () => { setActiveThreadId(null); setMessages([]); inputRef.current?.focus(); };
  const isChatEmpty  = messages.length === 0;

  if (!authReady) return null;

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');
        :root {
          --mono: 'JetBrains Mono', 'DM Mono', monospace;
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#7c3aed;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px;}
        .root{font-family:'Outfit',sans-serif;background:#060608;color:#fff;height:100vh;display:flex;overflow:hidden;position:relative;}
        .sidebar{background:#0a0a0e;border-right:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;z-index:20;transition:width 0.3s cubic-bezier(0.4,0,0.2,1);overflow:hidden;white-space:nowrap;}
        .sidebar.open{width:252px;}.sidebar.closed{width:0;border:none;}
        .sidebar-inner{width:252px;height:100%;display:flex;flex-direction:column;}
        .sb-brand{padding:18px 18px 14px;display:flex;align-items:center;justify-content:space-between;}
        .sb-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:15px;color:#fff;letter-spacing:-0.02em;text-decoration:none;}
        .sb-logo span{color:#7c3aed;}
        .icon-btn{background:transparent;border:none;color:rgba(255,255,255,0.35);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:7px;transition:all 0.2s;}
        .icon-btn:hover{background:rgba(255,255,255,0.07);color:#fff;}
        .sb-new-btn{margin:0 10px 8px;background:rgba(124,58,237,0.12);color:#c4b5fd;border:1px solid rgba(124,58,237,0.2);padding:10px 14px;border-radius:10px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;}
        .sb-new-btn:hover{background:rgba(124,58,237,0.2);color:#fff;}
        .sb-history{flex:1;overflow-y:auto;padding:0 8px;}
        .sb-section-label{font-size:10px;font-weight:600;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.08em;padding:10px 10px 5px;}
        .sb-thread{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;color:rgba(255,255,255,0.5);font-size:13px;cursor:pointer;transition:all 0.2s;margin-bottom:1px;}
        .sb-thread:hover{background:rgba(255,255,255,0.05);color:#fff;}.sb-thread:hover .sb-del{opacity:1;}
        .sb-thread.active{background:rgba(124,58,237,0.1);color:#c4b5fd;}
        .sb-thread-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .sb-del{opacity:0;transition:opacity 0.2s;background:transparent;border:none;color:rgba(255,100,100,0.6);cursor:pointer;display:flex;padding:2px;border-radius:4px;flex-shrink:0;}
        .sb-del:hover{color:#ef4444;}
        .sb-footer{padding:10px;border-top:1px solid rgba(255,255,255,0.05);}
        .sb-user-row{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background 0.2s;}
        .sb-user-row:hover{background:rgba(255,255,255,0.04);}
        .sb-avatar{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;}
        .sb-uname{font-size:13px;font-weight:500;color:#fff;overflow:hidden;text-overflow:ellipsis;}
        .sb-usub{font-size:11px;color:rgba(255,255,255,0.3);}
        .main{flex:1;display:flex;flex-direction:column;background:#060608;min-width:0;position:relative;}
        .topbar{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid rgba(255,255,255,0.04);flex-shrink:0;z-index:10;}
        .topbar-left{display:flex;align-items:center;gap:8px;}.topbar-right{display:flex;align-items:center;gap:6px;}
        .dash-toggle{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:500;transition:all 0.2s;}
        .dash-toggle.on{background:rgba(124,58,237,0.12);color:#c4b5fd;}.dash-toggle.off{background:transparent;color:rgba(255,255,255,0.35);}
        .chat-scroll{flex:1;overflow-y:auto;padding:32px 16px 16px;display:flex;flex-direction:column;align-items:center;}
        .chat-inner{width:100%;max-width:700px;display:flex;flex-direction:column;gap:24px;padding-bottom:40px;}
        .msg-row{display:flex;gap:12px;width:100%;animation:msg-in 0.3s ease;position:relative;}
        @keyframes msg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .msg-row.user{flex-direction:row-reverse;}
        .msg-avatar{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
        .msg-avatar.assistant{background:linear-gradient(135deg,#7c3aed,#3b82f6);}.msg-avatar.user{background:rgba(255,255,255,0.08);}
        .msg-body{display:flex;flex-direction:column;gap:6px;max-width:88%;}
        .bubble{font-size:14px;line-height:1.75;color:rgba(255,255,255,0.85);}
        .bubble p{margin-bottom:10px;}.bubble>*:last-child{margin-bottom:0;}
        .bubble h1,.bubble h2,.bubble h3{margin:18px 0 8px;font-family:'Syne',sans-serif;font-weight:600;}
        .bubble ul,.bubble ol{margin-left:18px;margin-bottom:10px;}.bubble li{margin-bottom:4px;}
        .bubble table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px;}
        .bubble th,.bubble td{border:1px solid rgba(255,255,255,0.1);padding:6px 10px;text-align:left;}
        .bubble th{background:rgba(124,58,237,0.1);color:#a78bfa;}
        .bubble.user{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);padding:10px 14px;border-radius:14px;border-top-right-radius:4px;width:fit-content;align-self:flex-end;}
        .msg-actions{display:flex;gap:4px;opacity:0;transition:opacity 0.2s;}
        .msg-row:hover .msg-actions{opacity:1;}
        .msg-action-btn{display:flex;align-items:center;gap:4px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35);padding:3px 8px;border-radius:6px;font-size:10px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all 0.15s;}
        .msg-action-btn:hover{background:rgba(255,255,255,0.06);color:#fff;}
        .empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;width:100%;max-width:700px;margin:0 auto;}
        .empty-greeting{font-family:'Syne',sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em;margin-bottom:6px;text-align:center;}
        .empty-sub{font-size:14px;color:rgba(255,255,255,0.4);margin-bottom:32px;text-align:center;}
        .prompt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;width:100%;margin-bottom:32px;}
        .prompt-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);padding:11px 13px;border-radius:11px;font-size:12px;color:rgba(255,255,255,0.6);cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px;text-align:left;font-family:'Outfit',sans-serif;}
        .prompt-card:hover{background:rgba(124,58,237,0.08);color:#c4b5fd;border-color:rgba(124,58,237,0.25);transform:translateY(-1px);}
        .input-wrap{width:100%;padding:12px 16px 18px;}
        .input-wrap.bottom{background:linear-gradient(to top,#060608 60%,transparent);}
        .input-wrap.center{padding:0;display:flex;justify-content:center;width:100%;}
        .input-box{width:100%;max-width:700px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px;display:flex;align-items:center;padding:9px 10px 9px 16px;transition:all 0.25s;}
        .input-box:focus-within{border-color:rgba(124,58,237,0.45);background:rgba(255,255,255,0.055);box-shadow:0 0 0 3px rgba(124,58,237,0.07);}
        .chat-input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:14px;font-family:'Outfit',sans-serif;}
        .chat-input::placeholder{color:rgba(255,255,255,0.28);}
        .send-btn{width:32px;height:32px;border-radius:9px;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
        .send-btn:disabled{opacity:0.2;cursor:not-allowed;background:rgba(255,255,255,0.08);}
        .send-btn:not(:disabled):hover{background:#6d28d9;transform:scale(1.06);}
        /* Dashboard panel */
        .dash-panel{width:320px;height:100%;background:#0a0a0e;border-left:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;overflow:hidden;}
        .dash-header{padding:16px 16px 12px;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .dash-greeting{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:#fff;}
        .dash-time{font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px;}
        .student-strip{display:flex;align-items:center;gap:10px;padding:12px 14px;margin:10px 10px 0;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;flex-shrink:0;}
        .student-avatar{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;}
        .student-info{flex:1;min-width:0;}.student-name{font-size:13px;font-weight:600;color:#fff;}
        .student-meta{font-size:10px;color:rgba(255,255,255,0.35);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .student-cgpa{text-align:right;flex-shrink:0;}.cgpa-val{font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:#10b981;}.cgpa-label{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.06em;}
        .insights-strip{margin:10px 10px 0;display:flex;flex-direction:column;gap:5px;}
        .insight-item{font-size:12px;color:rgba(255,255,255,0.65);padding:8px 11px;background:rgba(255,255,255,0.03);border-radius:9px;border-left:3px solid rgba(124,58,237,0.5);line-height:1.45;}
        .stat-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 10px 0;flex-shrink:0;}
        .stat-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 10px 8px;}
        .stat-card.stat-ok{border-color:rgba(16,185,129,0.15);}.stat-card.stat-danger{border-color:rgba(239,68,68,0.2);}.stat-card.stat-warn-card{border-color:rgba(245,158,11,0.2);}.stat-card.stat-info{border-color:rgba(59,130,246,0.15);}
        .stat-icon{color:rgba(255,255,255,0.3);margin-bottom:4px;}.stat-val{font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:#fff;line-height:1;}.stat-label{font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px;}.stat-sub{font-size:9px;color:rgba(255,255,255,0.25);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .dash-tabs{display:flex;gap:4px;padding:10px 10px 0;flex-shrink:0;}
        .dash-tab{flex:1;padding:7px 0;border-radius:8px;border:none;cursor:pointer;font-size:11px;font-weight:500;font-family:'Outfit',sans-serif;transition:all 0.2s;text-transform:capitalize;}
        .dash-tab.active{background:rgba(124,58,237,0.18);color:#a78bfa;}.dash-tab:not(.active){background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.4);}
        .dash-body{flex:1;overflow-y:auto;padding:10px 10px 16px;}
        .sched-wrap{display:flex;flex-direction:column;gap:4px;}.sched-day-header{display:flex;align-items:center;justify-content:space-between;padding:6px 2px 4px;}
        .sched-day-label{font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;}
        .sched-expand-btn{display:flex;align-items:center;gap:4px;font-size:10px;color:#7c3aed;background:rgba(124,58,237,0.1);border:none;padding:3px 8px;border-radius:6px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .sched-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;transition:background 0.2s;border:1px solid transparent;}
        .sched-row.current{background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.2);}.sched-row.done{opacity:0.4;}
        .sched-time-col{width:36px;flex-shrink:0;}.sched-time{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.35);}
        .sched-bar{width:2px;height:32px;border-radius:2px;flex-shrink:0;}.sched-bar.current{background:#7c3aed;}.sched-bar.done{background:rgba(255,255,255,0.1);}.sched-bar.upcoming{background:rgba(255,255,255,0.15);}
        .sched-info{flex:1;min-width:0;}.sched-subj{font-size:12px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sched-meta{font-size:10px;color:rgba(255,255,255,0.35);display:flex;align-items:center;gap:5px;}
        .sched-type.lecture{color:rgba(255,255,255,0.35);}.sched-type.lab{color:#60a5fa;}
        .sched-now{font-size:9px;background:rgba(124,58,237,0.25);color:#c4b5fd;padding:1px 6px;border-radius:4px;font-weight:700;}
        .sched-empty{font-size:12px;color:rgba(255,255,255,0.25);padding:10px 4px;}
        .sched-more-btn{background:transparent;border:1px dashed rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);padding:7px 0;border-radius:8px;font-size:11px;cursor:pointer;width:100%;font-family:'Outfit',sans-serif;}
        .att-wrap{display:flex;flex-direction:column;gap:6px;}.att-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:11px;padding:11px 12px;cursor:pointer;transition:all 0.2s;}.att-card:hover{background:rgba(255,255,255,0.04);}
        .exam-wrap{display:flex;flex-direction:column;gap:5px;}.exam-header-note{font-size:9px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.08em;padding:4px 2px 8px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:4px;}
        .exam-card{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-left:3px solid transparent;border-radius:10px;}
        .exam-left{text-align:center;flex-shrink:0;width:52px;min-width:52px;}.exam-countdown{font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;line-height:1;}.exam-day{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;}
        .exam-mid{flex:1;min-width:0;overflow:hidden;}.exam-subj{font-size:12px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.exam-code{font-size:10px;color:rgba(255,255,255,0.35);font-family:'DM Mono',monospace;margin-top:1px;}.exam-date{font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px;}
        .exam-alert-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:blink 1.2s ease infinite;flex-shrink:0;}
        .dash-ask-btn{width:100%;background:transparent;border:1px dashed rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);padding:8px 0;border-radius:9px;font-size:11px;cursor:pointer;font-family:'Outfit',sans-serif;margin-top:6px;transition:all 0.2s;}
        .dash-ask-btn:hover{border-color:rgba(124,58,237,0.4);color:#a78bfa;}
        .popup-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:100;display:flex;align-items:center;justify-content:center;}
        .popup-box{background:#0f0f14;border:1px solid rgba(255,255,255,0.08);border-radius:20px;width:440px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;}
        .popup-header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .popup-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#fff;}.popup-sub{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;}.popup-empty{padding:32px;text-align:center;color:rgba(255,255,255,0.35);font-size:14px;}
        .popup-timeline{overflow-y:auto;padding:16px 20px;}.ptl-row{display:flex;gap:12px;align-items:flex-start;}.ptl-time{width:48px;flex-shrink:0;padding-top:6px;}.ptl-start{display:block;font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.5);}.ptl-end{display:block;font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,0.25);}
        .ptl-dot-col{display:flex;flex-direction:column;align-items:center;padding-top:8px;}.ptl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}.ptl-dot.current{background:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.2);}.ptl-dot.upcoming{background:rgba(255,255,255,0.2);}.ptl-dot.done{background:rgba(255,255,255,0.1);}
        .ptl-line{width:1px;flex:1;min-height:24px;background:rgba(255,255,255,0.07);margin:3px 0;}
        .ptl-card{flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;margin-bottom:6px;}.ptl-card.current{background:rgba(124,58,237,0.07);border-color:rgba(124,58,237,0.25);}.ptl-card.done{opacity:0.45;}
        .ptl-subject{font-size:13px;font-weight:600;color:#fff;margin-bottom:3px;}.ptl-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,0.4);}.ptl-type.lecture{color:rgba(255,255,255,0.35);}.ptl-type.lab{color:#60a5fa;}.ptl-now{font-size:9px;background:rgba(124,58,237,0.25);color:#c4b5fd;padding:1px 7px;border-radius:5px;font-weight:700;}.ptl-done{font-size:9px;color:rgba(255,255,255,0.2);}
        .popup-footer{padding:14px 20px;border-top:1px solid rgba(255,255,255,0.06);}.popup-ask-btn{width:100%;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);color:#a78bfa;padding:10px 0;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:'Outfit',sans-serif;}
        .detail-page{padding:0;}.detail-back{background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:'Outfit',sans-serif;padding:8px 0;margin-bottom:6px;}
        .detail-hero{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;margin-bottom:14px;}.detail-code{font-size:10px;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;letter-spacing:0.06em;margin-bottom:4px;}.detail-name{font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;color:#fff;margin-bottom:10px;}.detail-pct{font-family:'Outfit',sans-serif;font-size:32px;font-weight:700;letter-spacing:-0.02em;margin-bottom:10px;}
        .detail-bar-wrap{display:flex;align-items:center;gap:6px;margin-bottom:14px;}.detail-bar-bg{flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:4px;position:relative;overflow:visible;}.detail-bar-fill{height:100%;border-radius:4px;}.detail-75-marker{position:absolute;left:75%;top:-4px;width:2px;height:14px;background:rgba(255,255,255,0.3);border-radius:1px;}.detail-75-label{font-size:9px;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;}
        .detail-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}.detail-stat{background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 6px;text-align:center;}.ds-val{display:block;font-family:'Outfit',sans-serif;font-size:17px;font-weight:600;color:#fff;}.ds-label{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;}
        .detail-section-title{font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;}.detail-month-group{margin-bottom:12px;}.detail-month-label{font-size:11px;color:rgba(255,255,255,0.4);font-weight:600;margin-bottom:6px;}
        .detail-missed-row{display:flex;align-items:center;gap:8px;padding:7px 8px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1);border-radius:8px;margin-bottom:4px;}.dmr-dot{width:5px;height:5px;border-radius:50%;background:#ef4444;flex-shrink:0;}.dmr-date{font-size:11px;color:rgba(255,255,255,0.7);font-family:'DM Mono',monospace;}.dmr-reason{font-size:11px;color:rgba(255,255,255,0.35);margin-left:auto;}
        .settings-wrap{flex:1;overflow-y:auto;background:#060608;}.settings-nav{height:52px;display:flex;align-items:center;padding:0 20px;border-bottom:1px solid rgba(255,255,255,0.04);}.back-btn{background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:13px;display:flex;align-items:center;gap:7px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .settings-inner{max-width:520px;margin:32px auto;padding:0 24px;display:flex;flex-direction:column;gap:32px;}.settings-section h2{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:18px;}
        .setting-input{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:11px 13px;border-radius:9px;font-size:13px;outline:none;font-family:'Outfit',sans-serif;}
        .danger-zone{background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.12);border-radius:12px;padding:18px;}
        .danger-btn{background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:9px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;font-family:'Outfit',sans-serif;margin-top:12px;display:flex;align-items:center;gap:7px;}
        .fd-wrap{flex:1;display:flex;flex-direction:column;background:#060608;overflow:hidden;}
        .fd-header{display:flex;align-items:center;justify-content:space-between;padding:20px 32px 16px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .fd-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:#fff;}.fd-sub{font-size:13px;color:rgba(255,255,255,0.35);margin-top:2px;}
        .fd-back{background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:13px;display:flex;align-items:center;gap:7px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-close-btn{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:8px 16px;border-radius:9px;font-size:13px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-scroll{flex:1;overflow-y:auto;padding:24px 32px 40px;display:flex;flex-direction:column;gap:24px;}
        .fd-student-card{display:flex;align-items:center;gap:16px;padding:20px 24px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;}
        .fd-avatar{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#fff;flex-shrink:0;}
        .fd-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        .fd-stat{padding:18px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);}
        .fd-stat-ok{border-color:rgba(16,185,129,0.2);}.fd-stat-danger{border-color:rgba(239,68,68,0.25);background:rgba(239,68,68,0.03);}.fd-stat-warn{border-color:rgba(245,158,11,0.25);background:rgba(245,158,11,0.03);}
        .fd-stat-val{font-family:'Outfit',sans-serif;font-size:32px;font-weight:700;color:#fff;line-height:1;letter-spacing:-0.02em;}
        .fd-stat-label{font-size:13px;color:rgba(255,255,255,0.45);margin-top:6px;}.fd-stat-note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:4px;}
        .fd-section{display:flex;flex-direction:column;gap:10px;}.fd-section-title{font-size:13px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.07em;}
        .fd-section-title-row{display:flex;align-items:center;justify-content:space-between;}.fd-expand-btn{font-size:12px;color:#7c3aed;background:transparent;border:none;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-alert{padding:14px 16px;border-radius:12px;border-left:3px solid;}.fd-alert-warn{background:rgba(245,158,11,0.06);border-left-color:#f59e0b;}.fd-alert-exam{background:rgba(124,58,237,0.07);border-left-color:#7c3aed;}.fd-alert-ok{background:rgba(255,255,255,0.02);border-left-color:rgba(16,185,129,0.4);padding:10px 14px;}
        .fd-two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;}
        .fd-class-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);}
        .fd-class-row.current{background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.2);}.fd-class-row.done{opacity:0.4;}
        .fd-class-time{font-family:'DM Mono',monospace;font-size:12px;color:rgba(255,255,255,0.35);min-width:44px;}
        .fd-class-name{font-size:14px;font-weight:500;color:#fff;}.fd-class-meta{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;display:flex;align-items:center;gap:6px;}
        .fd-now-badge{font-size:9px;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:0.05em;margin-left:4px;}
        .fd-empty{font-size:14px;color:rgba(255,255,255,0.25);padding:20px 0;text-align:center;}
        .fd-exam-row{display:flex;align-items:center;gap:16px;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);border-left:3px solid transparent;background:rgba(255,255,255,0.02);margin-bottom:4px;}
        .fd-ai-btn{width:100%;margin-top:8px;background:transparent;border:1px dashed rgba(124,58,237,0.3);color:#7c3aed;padding:10px 0;border-radius:9px;font-size:13px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-ai-btn-inline{font-size:12px;color:#7c3aed;background:transparent;border:none;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-att-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        .fd-att-card{padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.2s;}
        .fd-att-card:hover{background:rgba(255,255,255,0.04);border-color:rgba(124,58,237,0.2);transform:translateY(-1px);}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes msg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Left sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-inner">
          <div className="sb-brand">
            <Link href="/" className="sb-logo">Campus<span>Copilot</span></Link>
            <button className="icon-btn" onClick={() => setIsSidebarOpen(false)}><PanelLeftClose size={16} /></button>
          </div>
          <button className="sb-new-btn" onClick={startNewChat}><Plus size={14} /> New Chat</button>
          <Link href="/subjects" style={{ margin: "0 10px 8px", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.07)", padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit',sans-serif", textDecoration: "none" }}>
            <BookOpen size={14} /> Subjects & Notes
          </Link>
          <div className="sb-history">
            <div className="sb-section-label">Recent</div>
            {threads.length === 0 ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "4px 10px" }}>No chats yet.</div>
              : threads.map(t => (
                <div key={t.thread_id} className={`sb-thread ${activeThreadId === t.thread_id ? "active" : ""}`} onClick={() => setActiveThreadId(t.thread_id)}>
                  <MessageSquare size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                  <span className="sb-thread-title">{t.title}</span>
                  <button className="sb-del" onClick={e => deleteThread(t.thread_id, e)}><Trash2 size={12} /></button>
                </div>
              ))
            }
          </div>
          <div className="sb-footer">
            <div className="sb-user-row" onClick={() => setCurrentView("settings")}>
              <div className="sb-avatar">{STUDENT?.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="sb-uname">{STUDENT?.name}</div><div className="sb-usub">{STUDENT?.id}</div></div>
              <Settings size={13} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      {currentView === "settings" ? (
        <div className="settings-wrap" style={{ flex: 1 }}>
          <header className="settings-nav"><button className="back-btn" onClick={() => setCurrentView("chat")}>← Back to Chat</button></header>
          <div className="settings-inner">
            <div className="settings-section"><h2>Account</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div><label style={{ fontSize: 13, color: "#fff", fontWeight: 500, display: "block", marginBottom: 6 }}>Name</label><input className="setting-input" value={STUDENT?.name || ""} readOnly style={{ width: "100%" }} /></div>
                <div><label style={{ fontSize: 13, color: "#fff", fontWeight: 500, display: "block", marginBottom: 6 }}>Student ID</label><input className="setting-input" value={STUDENT?.id || ""} readOnly style={{ width: "100%" }} /></div>
              </div>
            </div>
            <div className="settings-section"><h2>Data</h2>
              <div className="danger-zone">
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Delete all chat history for {STUDENT?.id}.</p>
                <button className="danger-btn" onClick={deleteAllChats}><Trash2 size={13} /> Delete All Data</button>
              </div>
            </div>
            <div className="settings-section"><h2>Sign Out</h2>
              <button style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.12)", padding: "10px 18px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontFamily: "'Outfit',sans-serif" }} onClick={() => {
                try { sessionStorage.clear(); } catch {}
                router.replace("/login");
              }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : (
        <main className="main">
          <SyncBanner email={STUDENT.email} />

          {/* Floating Agent Panel */}
          {agentPanelOpen && (
            <AgentActivityFloat
              logs={logs}
              running={running}
              result={result}
              onClear={clearLogs}
              onCancel={cancel}
              onRetrain={() => window.location.href = "/admin?view=workflows"}
              onClose={() => setAgentPanelOpen(false)}
            />
          )}

          <header className="topbar">
            <div className="topbar-left">
              {!isSidebarOpen && <button className="icon-btn" onClick={() => setIsSidebarOpen(true)}><PanelLeftOpen size={18} /></button>}
              {!isSidebarOpen && <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "-0.01em" }}>Campus<span style={{ color: "#7c3aed" }}>Copilot</span></span>}
            </div>
            <div className="topbar-right">
            <SyncIndicator email={STUDENT.email} />

              <button
                onClick={() => setAgentPanelOpen(p => !p)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", marginRight: "10px",
                  background: agentPanelOpen ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${agentPanelOpen ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 7, cursor: "pointer", fontSize: 12,
                  color: agentPanelOpen ? "#a5b4fc" : "rgba(255,255,255,0.5)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                <Zap size={12} /> Agent {running ? "●" : "○"}
              </button>
              {/* Live notification bell */}
              <NotificationBell userId={STUDENT?.id || ""} />
              {(profileSyncing || attSyncing) && (
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"rgba(255,255,255,0.35)", padding:"4px 8px" }}>
                  <div style={{ width:8, height:8, border:"1.5px solid rgba(124,58,237,0.4)", borderTopColor:"#7c3aed", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
                  Syncing…
                </div>
              )}
              <button className={`dash-toggle ${currentView === "dashboard" ? "on" : "off"}`} onClick={() => setCurrentView(v => v === "dashboard" ? "chat" : "dashboard")}>
                <LayoutGrid size={14} /> Dashboard
              </button>
            </div>
          </header>

          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {currentView === "dashboard" ? (
              <FullDashboard student={STUDENT} onClose={() => setCurrentView("chat")} onAsk={handleSend} />
            ) : isChatEmpty ? (
              <div className="empty-state" style={{ flex: 1 }}>
                <div className="empty-greeting">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {STUDENT?.name?.split(" ")[0]} 👋</div>
                <p className="empty-sub">What do you need help with today?</p>
                <div className="prompt-grid">
                  {QUICK_PROMPTS.map((p, i) => (
                    <button key={i} className="prompt-card" onClick={() => handleSend(p.text)}>
                      <p.icon size={13} style={{ flexShrink: 0, opacity: 0.6 }} />{p.label}
                    </button>
                  ))}
                </div>
                <div className="input-wrap center" style={{ width: "100%", maxWidth: 700 }}>
                  <div className="input-box">
                    <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Ask me anything — labs, attendance, exams…" disabled={isTyping} />
                    <button className="send-btn" disabled={!input.trim() || isTyping} onClick={() => handleSend()}><Send size={14} strokeWidth={2.5} /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div className="chat-scroll">
                  <div className="chat-inner">
                    {messages.map((msg, i) => (
                      <div key={i} className={`msg-row ${msg.role}`}>
                        <div className={`msg-avatar ${msg.role}`}>{msg.role === "assistant" ? <Bot size={15} /> : <User size={15} />}</div>
                        <div className="msg-body">
                          <div className={`bubble ${msg.role}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ node, inline, className, children, ...props }: any) { const match = /language-(\w+)/.exec(className || ""); return !inline && match ? (<div style={{ borderRadius: 8, overflow: "hidden", margin: "12px 0" }}><div style={{ background: "#1a1a1a", padding: "5px 14px", fontSize: 10, color: "#555", borderBottom: "1px solid #222" }}>{match[1]}</div><SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: 14, background: "#141414", fontSize: 12 }} {...props}>{String(children).replace(/\n$/, "")}</SyntaxHighlighter></div>) : <code style={{ background: "rgba(255,255,255,0.09)", padding: "2px 6px", borderRadius: 4, fontSize: "0.88em", fontFamily: "DM Mono,monospace" }} {...props}>{children}</code>; } }}>{msg.content}</ReactMarkdown>
                          </div>
                          {msg.role === "assistant" && msg.content && msg.id !== streamingMsgId && <MessageActions content={msg.content} onRegenerate={() => handleRegenerate(i)} />}
                        </div>
                      </div>
                    ))}
                    {isTyping && !messages.find(m => m.id === streamingMsgId) && (
                      <div className="msg-row assistant"><div className="msg-avatar assistant"><Bot size={15} /></div><AISpinner /></div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                <div className="input-wrap bottom">
                  <div className="input-box" style={{ maxWidth: 700, margin: "0 auto" }}>
                    <input ref={inputRef} className="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Ask anything…" disabled={isTyping} />
                    <button className="send-btn" disabled={!input.trim() || isTyping} onClick={() => handleSend()}><Send size={14} strokeWidth={2.5} /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
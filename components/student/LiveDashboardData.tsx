// components/student/LiveDashboardData.tsx
// ─── Real-data replacements for the hardcoded attendance / exam / schedule
//     panels inside the student's FullDashboard and DashboardPanel ─────────────

"use client";
import React from "react";
import {
  useStudentAttendance,
  useStudentExams,
  useStudentSchedule,
  useStudentLabRequests,
} from "@/hooks/useData";
import type { AttendanceWithSubject, ExamWithSubject } from "@/lib/types";

// ── Attendance tab content ─────────────────────────────────────────────────────
export function LiveAttendance({
  studentId,
  onDetail,
  onAsk,
  onClose,
}: {
  studentId: string;
  onDetail: (att: AttendanceWithSubject) => void;
  onAsk: (q: string) => void;
  onClose: () => void;
}) {
  const { data: attendance, loading, error } = useStudentAttendance(studentId);

  if (loading) return (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>
      Syncing attendance…
    </div>
  );
  if (error)  return <div style={{ fontSize: 12, color: "#ef4444" }}>Error: {error}</div>;
  if (!attendance?.length) return (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>No attendance records found.</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {attendance.map((att: AttendanceWithSubject, i: number) => {
        const pct   = Math.round(att.percentage);
        const color = pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
        const label = pct >= 75 ? "On track" : pct >= 65 ? "At risk" : "Danger";
        return (
          <div key={i}
            onClick={() => onDetail(att)}
            style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 11, padding: "11px 12px", cursor: "pointer", transition: "all 0.2s",
            }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            onMouseOut={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {att.subject.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  {att.subject.code} · {att.attended}/{att.total} classes
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>
                  {pct}%
                </div>
                <div style={{ fontSize: 10, color, marginTop: 2 }}>{label}</div>
              </div>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, position: "relative", overflow: "visible" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
              <div style={{ position: "absolute", top: -3, left: "75%", width: 2, height: 10, background: "rgba(255,255,255,0.3)" }} />
            </div>
          </div>
        );
      })}
      <button
        onClick={() => { onAsk("Analyse my full attendance and give me a recovery plan"); onClose(); }}
        style={{
          width: "100%", background: "transparent",
          border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)",
          padding: "8px 0", borderRadius: 9, fontSize: 11, cursor: "pointer",
          fontFamily: "'Outfit',sans-serif", marginTop: 6, transition: "all 0.2s",
        }}
        onMouseOver={e => { (e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"); (e.currentTarget.style.color = "#a78bfa" ) }}
        onMouseOut={e => { (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"); (e.currentTarget.style.color = "rgba(255,255,255,0.35)") }}>
        How do I improve my attendance? →
      </button>
    </div>
  
  );
}

// ── Exams tab content ──────────────────────────────────────────────────────────
export function LiveExams({
  studentId,
  onAsk,
  onClose,
}: {
  studentId: string;
  onAsk: (q: string) => void;
  onClose: () => void;
}) {
  const { data: exams, loading, error } = useStudentExams(studentId);

  if (loading) return (
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>
      Fetching exam schedule…
    </div>
  );
  if (error)  return <div style={{ fontSize: 12, color: "#ef4444" }}>Error: {error}</div>;
  if (!exams?.length) return (
    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", padding: "10px 0" }}>
      🎉 No upcoming exams!
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 2px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }}>
        Midsem · 8:30–10:00 AM
      </div>
      {exams.map((ex: ExamWithSubject, i: number) => {
        const urgent = ex.days_left <= 2, soon = ex.days_left <= 5;
        const color  = urgent ? "#ef4444" : soon ? "#f59e0b" : "#10b981";
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderLeft: `3px solid ${color}`,
            borderRadius: 10, transition: "all 0.2s",
          }}>
            <div style={{ textAlign: "center", flexShrink: 0, minWidth: 52 }}>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, color, lineHeight: 1 }}>
                {ex.days_left === 0 ? "TODAY" : ex.days_left === 1 ? "TMR" : `${ex.days_left}d`}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>
                {new Date(ex.exam_date).toLocaleDateString("en-IN", { weekday: "short" })}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ex.subject.name}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
                {ex.subject.code} · {new Date(ex.exam_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </div>
            </div>
            {urgent && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "blink 1.2s ease infinite", flexShrink: 0 }} />}
          </div>
        );
      })}
      <button
        onClick={() => { onAsk("Create a study schedule for my upcoming midsem exams"); onClose(); }}
        style={{
          width: "100%", background: "transparent",
          border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)",
          padding: "8px 0", borderRadius: 9, fontSize: 11, cursor: "pointer",
          fontFamily: "'Outfit',sans-serif", marginTop: 6, transition: "all 0.2s",
        }}
        onMouseOver={e => { (e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"); (e.currentTarget.style.color = "#a78bfa") }}
        onMouseOut={e => { (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"); (e.currentTarget.style.color = "rgba(255,255,255,0.35)") }}>
        Help me make a study plan →
      </button>
    </div>
  );
}

// ── Schedule tab ───────────────────────────────────────────────────────────────
export function LiveScheduleTab({
  studentId,
  onExpandDay,
}: {
  studentId: string;
  onExpandDay: (day: string, slots: any[]) => void;
}) {
  const { data: slots, loading, error } = useStudentSchedule(studentId);

  function getTodayName(offset = 0) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString("en-IN", { weekday: "long" });
  }

  function getClassStatus(startH: number, startM: number, endH: number, endM: number) {
    const n = new Date();
    const nm = n.getHours() * 60 + n.getMinutes();
    const s = startH * 60 + startM, e = endH * 60 + endM;
    return nm > e ? "done" : nm >= s ? "current" : "upcoming";
  }

  const today    = getTodayName(0);
  const tomorrow = getTodayName(1);

  const byDay: Record<string, any[]> = {};
  (slots || []).forEach((s: any) => {
    if (!byDay[s.day]) byDay[s.day] = [];
    byDay[s.day].push(s);
  });

  const renderDayClasses = (day: string, isToday: boolean) =>
    (byDay[day] || []).map((cls: any, i: number) => {
      const [sh, sm] = cls.start_time.split(":").map(Number);
      const [eh, em] = cls.end_time.split(":").map(Number);
      const status = isToday ? getClassStatus(sh, sm, eh, em) : "upcoming";
      return (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 8px",
          borderRadius: 9, transition: "background 0.2s",
          background: status === "current" ? "rgba(124,58,237,0.08)" : "transparent",
          border: status === "current" ? "1px solid rgba(124,58,237,0.2)" : "1px solid transparent",
          opacity: status === "done" ? 0.4 : 1,
        }}>
          <div style={{ width: 36, flexShrink: 0 }}>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              {cls.start_time.slice(0, 5)}
            </span>
          </div>
          <div style={{ width: 2, height: 32, borderRadius: 2, flexShrink: 0, background: status === "current" ? "#7c3aed" : status === "done" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.15)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cls.subject?.name || "—"}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
              {cls.room}
              <span style={{ color: cls.type === "lab" ? "#60a5fa" : "rgba(255,255,255,0.3)" }}>· {cls.type}</span>
              {status === "current" && <span style={{ fontSize: 9, background: "rgba(124,58,237,0.25)", color: "#c4b5fd", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>NOW</span>}
            </div>
          </div>
        </div>
      );
    });

  if (loading) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Syncing schedule…</div>;
  if (error)   return <div style={{ fontSize: 12, color: "#ef4444" }}>Error: {error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px 4px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Today · {today}
        </span>
        <button onClick={() => onExpandDay(today, byDay[today] || [])} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#7c3aed", background: "rgba(124,58,237,0.1)", border: "none", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>
          Expand
        </button>
      </div>
      {(byDay[today] || []).length === 0
        ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "10px 4px" }}>No classes today 🎉</div>
        : renderDayClasses(today, true)
      }
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 2px 4px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Tomorrow · {tomorrow}
        </span>
        <button onClick={() => onExpandDay(tomorrow, byDay[tomorrow] || [])} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#7c3aed", background: "rgba(124,58,237,0.1)", border: "none", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>
          Expand
        </button>
      </div>
      {(byDay[tomorrow] || []).length === 0
        ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "10px 4px" }}>No classes tomorrow 🎉</div>
        : renderDayClasses(tomorrow, false).slice(0, 3)
      }
    </div>
  );
}

// ── Stat cards helper: attendance overview ─────────────────────────────────────
export function useAttendanceStats(studentId: string) {
  const { data: attendance } = useStudentAttendance(studentId);
  if (!attendance) return { overallPct: 0, atRisk: 0 };
  const overallPct = attendance.length
    ? Math.round(attendance.reduce((s, a) => s + a.percentage, 0) / attendance.length)
    : 0;
  const atRisk = attendance.filter(a => a.percentage < 75).length;
  return { overallPct, atRisk, attendance };
}

export function useNextExam(studentId: string) {
  const { data: exams } = useStudentExams(studentId);
  if (!exams?.length) return { nextExam: null };
  return { nextExam: exams[0] };
}
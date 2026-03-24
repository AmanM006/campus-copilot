// components/faculty/CalendarView.tsx
// ─── Replaces hardcoded CalendarView — pulls schedule from Supabase ───────────

"use client";
import React, { useState, useMemo } from "react";
import { useFacultySchedule } from "@/hooks/useData";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function getTodayName() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long" });
}

function formatTime(t: string) {
  // t = "09:00:00" or "09:00"
  return t.slice(0, 5);
}

export default function CalendarView({ facultyId }: { facultyId: string }) {
  const { data: slots, loading, error } = useFacultySchedule(facultyId);
  const [sel, setSel] = useState<string | null>(null);
  const today = getTodayName();

  // Group slots by day
  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    DAYS.forEach(d => (map[d] = []));
    (slots || []).forEach((s: any) => {
      if (map[s.day]) map[s.day].push(s);
    });
    return map;
  }, [slots]);

  if (loading) {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading schedule…</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
        Weekly Schedule
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>
        Click a class slot for details.
      </div>

      {error && <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 16 }}>Error: {error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
        {DAYS.map(day => (
          <div key={day} style={{
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${day === today ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{
              padding: "9px 11px",
              background: day === today ? "rgba(14,165,233,0.1)" : "rgba(255,255,255,0.02)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: day === today ? "#38bdf8" : "rgba(255,255,255,0.4)",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>{day.slice(0, 3)}</div>
              {day === today && <div style={{ fontSize: 9, color: "#38bdf8", marginTop: 1 }}>Today</div>}
            </div>

            <div style={{ padding: "8px 7px", minHeight: 90, display: "flex", flexDirection: "column", gap: 5 }}>
              {byDay[day].length === 0
                ? <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: 18 }}>Free</div>
                : byDay[day].map((cls: any, i: number) => {
                  const k = `${day}-${i}`;
                  const subjectColor = cls.subject?.color || "#0ea5e9";
                  return (
                    <button key={i} onClick={() => setSel(sel === k ? null : k)}
                      style={{
                        padding: "7px 9px",
                        background: sel === k ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${sel === k ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.06)"}`,
                        borderRadius: 8, cursor: "pointer", textAlign: "left",
                        fontFamily: "'Outfit',sans-serif", transition: "all 0.15s",
                      }}>
                      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>
                        {formatTime(cls.start_time)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "#fff", lineHeight: 1.3 }}>
                        {cls.subject?.name || "—"}
                      </div>
                      {sel === k && (
                        <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.4)", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 4 }}>
                          {cls.room && `${cls.room} · `}
                          <span style={{ color: subjectColor }}>{cls.type}</span>
                          {cls.section && ` · Sec ${cls.section}`}
                        </div>
                      )}
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
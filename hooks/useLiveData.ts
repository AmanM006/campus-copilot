"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ─── Attendance ───────────────────────────────────────────────────────────────
// ─── Attendance ───────────────────────────────────────────────────────────────
export function useLiveAttendance(email: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!email || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      // Fetch full names from the marks table to fix Salesforce's lazy attendance names
      const { data: marksData } = await supabase
        .from("marks")
        .select("subject_code, subject_name")
        .eq("student_email", email);

      const nameDictionary: Record<string, string> = {};
      if (marksData) {
        marksData.forEach((m: any) => {
          if (m.subject_name && m.subject_name.length > m.subject_code?.length) {
            nameDictionary[m.subject_code] = m.subject_name;
          }
        });
      }

      // 1. attendance_cache — fastest, written by Playwright scraper
      const { data: rows } = await supabase
        .from("attendance_cache")
        .select("*")
        .eq("user_email", email);

      if (rows && rows.length > 0) {
        setData(_normalizeAttCache(rows, nameDictionary));
        setLoading(false);
        _maybeRefresh(email, rows[0]?.fetched_at);
        return;
      }

      // 2. cached_data fallback
      const { data: cached } = await supabase
        .from("cached_data")
        .select("data, updated_at")
        .eq("user_email", email)
        .eq("type", "attendance")
        .maybeSingle();

      if (cached?.data) {
        const parsed = typeof cached.data === "string"
          ? JSON.parse(cached.data) : cached.data;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setData(_normalizeAttCache(parsed, nameDictionary));
          setLoading(false);
          _maybeRefresh(email, cached.updated_at);
          return;
        }
      }

      // 3. Nothing — trigger sync
      setLoading(false);
      setSyncing(true);
      _triggerSync(email).finally(() => setSyncing(false));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  return { data, loading, syncing };
}

// ─── Updated Helper Function ──────────────────────────────────────────────────

// ─── Exams ────────────────────────────────────────────────────────────────────
export function useLiveExams(email: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!email || ranRef.current) return;
    ranRef.current = true;
    const today = new Date().toISOString().split("T")[0];

    (async () => {
      // Try cached_data first
      const { data: cached } = await supabase
        .from("cached_data")
        .select("data")
        .eq("user_email", email)
        .eq("type", "exams")
        .maybeSingle();

      if (cached?.data) {
        const parsed = typeof cached.data === "string"
          ? JSON.parse(cached.data) : cached.data;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setData(parsed);
          setLoading(false);
          return;
        }
      }

      // Fall back to exam_schedule joined via user email
      const { data: exams } = await supabase
        .from("exam_schedule")
        .select("exam_date, start_time, end_time, exam_type, venue, subjects(name,code)")
        .gte("exam_date", today)
        .order("exam_date", { ascending: true })
        .limit(10);

      setData((exams || []).map((e: any) => ({
        ...e,
        subject:   e.subjects,
        days_left: Math.max(0, Math.round(
          (new Date(e.exam_date).getTime() - new Date().setHours(0,0,0,0)) / 86_400_000
        )),
      })));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  return { data, loading };
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
// IST-aware day name — forces timezone to Asia/Kolkata
export function getISTDayName(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  
  // Force the formatter to use IST, regardless of the server/browser timezone
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long"
  });
  
  return formatter.format(date); // Returns "Monday", "Tuesday", etc.
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
export function useLiveSchedule(email: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!email || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      // 1. Try cached_data written by Python scraper
      const { data: cached } = await supabase
        .from("cached_data")
        .select("data")
        .eq("user_email", email)
        .eq("type", "schedule")
        .maybeSingle();

      if (cached?.data) {
        const parsed = typeof cached.data === "string"
          ? JSON.parse(cached.data) : cached.data;

        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = _normalizeScheduleEvents(parsed);
          
          // Debugging log to see exactly what days are stored
          console.log("[Schedule Debug] Normalized events:", normalized.map(e => e.day));
          
          setData(normalized);
          setLoading(false);
          return;
        }
      }

      // 2. Fall back to structured schedule table
      const { data: slots } = await supabase
        .from("schedule")
        .select("day, start_time, end_time, room, type, subjects(id,name,code,color)")
        .order("day")
        .order("start_time");

      setData((slots || []).map((s: any) => ({
        ...s,
        // Ensure the day string is cleanly trimmed and capitalized for matching
        day: s.day ? s.day.trim().charAt(0).toUpperCase() + s.day.trim().slice(1).toLowerCase() : "Unknown",
        subject:    s.subjects,
        subject_id: s.subjects?.id,
      })));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  return { data, loading };
}
// Convert "9:00 AM" → "09:00", "14:30" → "14:30"
function _to24h(timeStr: string): string {
  const clean = timeStr.trim().toUpperCase();
  const match  = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/);
  if (!match) return "00:00";
  let h        = parseInt(match[1]);
  const m      = match[2];
  const period = match[3];
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function _normalizeScheduleEvents(events: any[]): any[] {
  const results: any[] = [];
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  console.log("[_normalizeScheduleEvents] input count:", events.length);
  console.log("[_normalizeScheduleEvents] first item keys:", events[0] ? Object.keys(events[0]) : "empty");

  events.forEach((e: any, idx: number) => {

    // ── Format A: already structured {day, start_time, subject_name, room} ──
    if (e.day && DAY_NAMES.includes(e.day) && e.start_time) {
      console.log(`[sched] Format A (structured) at index ${idx}:`, e.day, e.start_time);
      results.push({
        day:        e.day,
        start_time: _to24h(e.start_time),
        end_time:   e.end_time ? _to24h(e.end_time) : "00:00",
        room:       e.room || e.venue || "—",
        type:       (e.type || "lecture").toLowerCase(),
        subject: {
          id:    "",
          name:  e.subject_name || e.subject || e.course || e.raw_label || "Unknown",
          code:  e.subject_code || "",
          color: "#7c3aed",
        },
      });
      return;
    }

    // ── Format B: table row cells array ["Monday", "09:00", "CSS 2201", "LH-3"] ──
    if (e.row_cells && Array.isArray(e.row_cells)) {
      const cells = e.row_cells as string[];
      console.log(`[sched] Format B (row_cells) at index ${idx}:`, cells);

      const day = cells.find(c => DAY_NAMES.includes(c)) || "";
      const timeMatch = cells.find(c => /\d{1,2}:\d{2}/.test(c)) || "";
      const timeRange = timeMatch.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i);

      const subjectCell = cells.find(c =>
        !DAY_NAMES.includes(c) &&
        !/\d{1,2}:\d{2}/.test(c) &&
        !/^(lh|eh|cc|lab|room)/i.test(c) &&
        c.length > 3
      ) || "";

      const roomCell = cells.find(c => /^(lh|eh|cc|lab|room|hall)/i.test(c)) || "—";

      if (day || timeRange) {
        results.push({
          day:        day || "Unknown",
          start_time: timeRange ? _to24h(timeRange[1]) : "00:00",
          end_time:   timeRange?.[2] ? _to24h(timeRange[2]) : "00:00",
          room:       roomCell,
          type:       cells.some(c => /lab/i.test(c)) ? "lab" : "lecture",
          subject: {
            id: "", name: subjectCell || "Unknown", code: "", color: "#7c3aed",
          },
        });
      }
      return;
    }

    // ── Format C: raw_text blob ─────────────────────────────────────────────
    const raw = e.raw_text || "";
    if (raw) {
      const NOISE = ["welcome","social media","contact us","manipal academy",
                     "twitter","facebook","follow us","address:","student portal"];
      if (NOISE.some(n => raw.toLowerCase().includes(n))) {
        console.log(`[sched] Skipping noise at index ${idx}`);
        return;
      }

      console.log(`[sched] Format C (raw_text) at index ${idx}:`, raw.slice(0, 100));
      const parts = raw.split(" | ").map((s: string) => s.trim());

      let day = "";
      for (const p of parts) {
        const found = DAY_NAMES.find(d => p.toLowerCase().includes(d.toLowerCase()));
        if (found) { day = found; break; }
      }

      const timeMatch = raw.match(
        /(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–to]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
      );
      const start_time = timeMatch ? _to24h(timeMatch[1]) : "00:00";
      const end_time   = timeMatch ? _to24h(timeMatch[2]) : "00:00";

      const subjectPart = parts.find((p: string) =>
        !DAY_NAMES.some(d => p.toLowerCase().includes(d.toLowerCase())) &&
        !/\d{1,2}:\d{2}/.test(p) &&
        !/^(room|hall|lab|lh|eh|cc|contact|address|follow|twitter|facebook)/i.test(p) &&
        p.length > 4
      ) || "";

      const roomPart = parts.find((p: string) => /^(room|hall|lab|lh-|eh-|cc-)/i.test(p)) || "—";

      if (day && (start_time !== "00:00" || subjectPart)) {
        results.push({
          day, start_time, end_time,
          room: roomPart,
          type: /lab/i.test(raw) ? "lab" : "lecture",
          subject: { id: "", name: subjectPart, code: "", color: "#7c3aed" },
        });
      } else {
        console.warn(`[sched] Could not parse raw_text at index ${idx}:`, raw.slice(0, 120));
      }
      return;
    }

    // ── Format D: raw_page_text dump (Strategy 3 fallback) ─────────────────
    if (e.raw_page_text) {
      console.warn("[sched] Got raw_page_text dump — schedule scraping needs fixing in Python");
      console.log("[sched] raw_page_text preview:", e.raw_page_text.slice(0, 500));
    }
  });

  console.log("[_normalizeScheduleEvents] output count:", results.length);
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _normalizeAttCache(rows: any[], nameDictionary: Record<string, string>): any[] {
  return rows.map((r, i) => {
    const code = r.subject_code || r.code || "";
    // If the dictionary has the full name, use it. Otherwise, fall back to what Salesforce gave us.
    const realName = nameDictionary[code] || r.subject_name || r.subject || r.name || "Unknown";

    return {
      attended:       r.attended   ?? 0,
      total:          r.total      ?? 0,
      percentage:     r.percentage ?? r.percent ?? 0,
      updated_at:     r.fetched_at ?? r.updated_at ?? new Date().toISOString(),
      subject: {
        id:    r.subject_id   || `c${i}`,
        name:  realName,
        code:  code,
        color: r.color        || "#7c3aed",
      },
      missed_classes: [],
    };
  });
}

function _maybeRefresh(email: string, updatedAt?: string) {
  if (!updatedAt) return;
  const ageHours = (Date.now() - new Date(updatedAt).getTime()) / 3_600_000;
  if (ageHours > 6) _triggerSync(email);
}

async function _triggerSync(email: string) {
  try {
    await fetch("/api/auto-sync", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email }),
    });
  } catch { /* fire-and-forget */ }
}
// hooks/useLiveData.ts
// ─── Cache-first hooks ────────────────────────────────────────────────────────
// Load order: attendance_cache → cached_data → attendance table → trigger sync
// Background sync is fully decoupled — never blocks the initial paint.

"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ─── Attendance ───────────────────────────────────────────────────────────────
export function useLiveAttendance(studentId: string, email: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if ((!studentId && !email) || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      // ── 1. attendance_cache — fastest path, written by Playwright scraper ──
      if (email) {
        const { data: rows } = await supabase
          .from("attendance_cache")
          .select("*")
          .eq("user_email", email);

        if (rows && rows.length > 0) {
          setData(_normalizeAttCache(rows));
          setLoading(false);
          _maybeRefresh("attendance", email, rows[0]?.fetched_at);
          return;
        }
      }

      // ── 2. cached_data (background worker) ───────────────────────────────
      if (email) {
        const { data: cached } = await supabase
          .from("cached_data")
          .select("data, updated_at")
          .eq("user_email", email)
          .eq("type", "attendance")
          .maybeSingle();

        if (cached?.data) {
          const rows = typeof cached.data === "string"
            ? JSON.parse(cached.data) : cached.data;
          if (Array.isArray(rows) && rows.length > 0) {
            setData(_normalizeAttCache(rows));
            setLoading(false);
            _maybeRefresh("attendance", email, cached.updated_at);
            return;
          }
        }
      }

      // ── 3. normalized attendance table ────────────────────────────────────
      if (studentId) {
        const { data: rows } = await supabase
          .from("attendance")
          .select("attended, total, percentage, updated_at, subjects(id,name,code,color)")
          .eq("student_id", studentId)
          .order("percentage", { ascending: true });

        if (rows && rows.length > 0) {
          setData(rows.map((r: any) => ({
            ...r,
            subject:        r.subjects,
            missed_classes: [],
          })));
          setLoading(false);
          return;
        }
      }

      // ── 4. Nothing yet — trigger a background sync ────────────────────────
      setLoading(false);
      if (email) {
        setSyncing(true);
        _triggerSync(email).finally(() => setSyncing(false));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, email]);

  return { data, loading, syncing };
}

// ─── Exams ────────────────────────────────────────────────────────────────────
export function useLiveExams(studentId: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!studentId || ranRef.current) return;
    ranRef.current = true;
    const today = new Date().toISOString().split("T")[0];

    (async () => {
      const { data: enrolled } = await supabase
        .from("subject_enrollments")
        .select("subject_id")
        .eq("student_id", studentId);

      const ids = (enrolled || []).map((e: any) => e.subject_id);
      if (!ids.length) { setLoading(false); return; }

      const { data: exams } = await supabase
        .from("exam_schedule")
        .select("exam_date, start_time, end_time, exam_type, venue, subjects(name,code)")
        .in("subject_id", ids)
        .gte("exam_date", today)
        .order("exam_date", { ascending: true })
        .limit(10);

      setData((exams || []).map((e: any) => ({
        ...e,
        subject:   e.subjects,
        days_left: Math.max(0, Math.round(
          (new Date(e.exam_date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000
        )),
      })));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  return { data, loading };
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
export function useLiveSchedule(studentId: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!studentId || ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const { data: enrolled } = await supabase
        .from("subject_enrollments")
        .select("subject_id")
        .eq("student_id", studentId);

      const ids = (enrolled || []).map((e: any) => e.subject_id);
      if (!ids.length) { setLoading(false); return; }

      const { data: slots } = await supabase
        .from("schedule")
        .select("day, start_time, end_time, room, type, subjects(id,name,code,color)")
        .in("subject_id", ids)
        .order("day")
        .order("start_time");

      setData((slots || []).map((s: any) => ({
        ...s,
        subject:    s.subjects,
        subject_id: s.subjects?.id,
      })));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  return { data, loading };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _normalizeAttCache(rows: any[]): any[] {
  return rows.map((r, i) => ({
    attended:       r.attended   ?? 0,
    total:          r.total      ?? 0,
    percentage:     r.percentage ?? r.percent ?? 0,
    updated_at:     r.fetched_at ?? r.updated_at ?? new Date().toISOString(),
    subject: {
      id:    r.subject_id   || `c${i}`,
      name:  r.subject_name || r.subject || r.name  || "Unknown",
      code:  r.subject_code || r.code    || "",
      color: r.color        || "#7c3aed",
    },
    missed_classes: [],
  }));
}

function _maybeRefresh(type: string, email: string, updatedAt?: string) {
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
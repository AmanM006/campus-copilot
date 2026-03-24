// hooks/useStudentData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Replaces ALL hardcoded data in the chat/dashboard pages.
// Source priority:
//   1. Supabase DB (attendance, subjects, profile tables)
//   2. cached_data table (agent results)
//   3. Agent server (triggers Playwright if cache stale)
//
// Exports:
//   useAttendance(studentId)    — replaces useStudentAttendance
//   useSubjects(studentId)      — replaces useFacultySubjects / useStudentSubjects
//   useProfile(studentId)       — replaces STUDENT_FALLBACK
//   useExams(studentId)         — replaces useStudentExams
//   useTimetable(studentId)     — replaces useStudentSchedule
//   useStudentDataSync(email)   — triggers background sync if data is stale

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const AGENT = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001")
  : "";

// ── Generic DB + agent fallback hook ─────────────────────────────────────────
function useDbOrAgent<T>(
  dbFetch: () => Promise<T | null>,
  agentAction: string,
  email: string,
  deps: any[]
) {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [source,  setSource]  = useState<"db"|"cache"|"agent"|"empty">("db");
  const [error,   setError]   = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true); setError(null);

    // 1. Try DB
    const dbData = await dbFetch().catch(() => null);
    if (dbData !== null && (!Array.isArray(dbData) || (dbData as unknown[]).length > 0)) {
      setData(dbData); setSource("db"); setLoading(false); return;
    }

    // 2. Try cached_data table
    const { data: cached } = await supabase
      .from("cached_data")
      .select("data, updated_at")
      .eq("user_email", email)
      .eq("data_type", agentAction)
      .maybeSingle();

    if (cached?.data && (!Array.isArray(cached.data) || cached.data.length > 0)) {
      setData(cached.data as T); setSource("cache"); setLoading(false);
      // Check staleness and trigger background refresh
      const age = (Date.now() - new Date(cached.updated_at).getTime()) / 3600000;
      if (age > 6) triggerAgentSync(agentAction, email);
      return;
    }

    // 3. Hit agent server (Playwright)
    setLoading(false); setSyncing(true);
    await triggerAgentFetch(agentAction, email, (result) => {
      if (result?.data) { setData(result.data as T); setSource("agent"); }
      else { setError(result?.error || "No data available"); setSource("empty"); }
      setSyncing(false);
    });
  }, [email, agentAction, ...deps]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, syncing, source, refresh: load };
}

// ── Call agent server (SSE) and return final result ───────────────────────────
async function triggerAgentFetch(action: string, email: string, onResult: (r: any) => void) {
  if (!AGENT || !email) { onResult({ success:false, error:"No agent URL or email" }); return; }

  try {
    const resp = await fetch(`${AGENT}/api/agent/run`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, email }),
    });

    if (!resp.ok || !resp.body) { onResult({ success:false, error:"Agent server offline" }); return; }

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = "";
    let   result: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const p = JSON.parse(line.slice(6));
          if ("success" in p && !("msg" in p)) result = p;
        } catch { /* skip */ }
      }
    }
    onResult(result || { success:false, error:"No result" });
  } catch (err: any) {
    onResult({ success:false, error:err.message });
  }
}

// ── Fire-and-forget background sync ──────────────────────────────────────────
async function triggerAgentSync(action: string, email: string) {
  if (!AGENT) return;
  fetch(`${AGENT}/api/agent/run`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ action, email }),
  }).catch(() => { /* background — ignore errors */ });
}

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC HOOKS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * useAttendance — fetches real attendance from DB, falls back to agent.
 * Replaces: useStudentAttendance(studentId)
 */
export function useAttendance(studentId: string, email: string) {
  return useDbOrAgent(
    async () => {
      const { data } = await supabase
        .from("attendance")
        .select("attended, total, percentage, updated_at, subjects(name, code, color)")
        .eq("student_id", studentId)
        .order("percentage", { ascending: true });
      return data && data.length > 0 ? data : null;
    },
    "attendance",
    email,
    [studentId]
  );
}

/**
 * useSubjects — enrolled subjects from DB.
 * Replaces: useStudentSubjects(studentId)
 */
export function useSubjects(studentId: string, email: string) {
  return useDbOrAgent(
    async () => {
      // Try enrollments → subjects join first
      const { data: enrolled } = await supabase
        .from("enrollments")
        .select("subjects(id, name, code, color, teacher)")
        .eq("student_id", studentId);

      if (enrolled && enrolled.length > 0) {
        return enrolled.map((e: any) => e.subjects).filter(Boolean);
      }

      // Fallback: subjects with student_id (from agent extraction)
      const { data: direct } = await supabase
        .from("subjects")
        .select("id, name, code, color, teacher")
        .eq("student_id", studentId);

      return direct && direct.length > 0 ? direct : null;
    },
    "subjects",
    email,
    [studentId]
  );
}

/**
 * useExams — upcoming exams from exam_schedule.
 * Replaces: useStudentExams(studentId)
 */
export function useExams(studentId: string) {
  const [data, setData]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    const today = new Date().toISOString().split("T")[0];

    // Get enrolled subjects
    supabase.from("enrollments").select("subject_id").eq("student_id", studentId)
      .then(async ({ data: enrolled }) => {
        const ids = (enrolled || []).map((e: any) => e.subject_id);
        if (!ids.length) {
          // Try subjects table
          const { data: subs } = await supabase.from("subjects").select("id").eq("student_id", studentId);
          ids.push(...(subs || []).map((s: any) => s.id));
        }
        if (!ids.length) { setLoading(false); return; }

        const { data: exams } = await supabase
          .from("exam_schedule")
          .select("exam_date, start_time, end_time, exam_type, venue, subjects(name, code)")
          .in("subject_id", ids)
          .gte("exam_date", today)
          .order("exam_date", { ascending: true })
          .limit(10);

        setData((exams || []).map((e: any) => ({
          ...e,
          days_left: Math.round((new Date(e.exam_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000),
        })));
        setLoading(false);
      });
  }, [studentId]);

  return { data, loading };
}

/**
 * useTimetable — weekly schedule.
 * Replaces: useStudentSchedule(studentId)
 */
export function useTimetable(studentId: string, email: string) {
  return useDbOrAgent(
    async () => {
      const { data: enrolled } = await supabase.from("enrollments").select("subject_id").eq("student_id", studentId);
      const ids = (enrolled || []).map((e: any) => e.subject_id);
      if (!ids.length) return null;

      const { data } = await supabase
        .from("schedule")
        .select("day, start_time, end_time, room, subjects(name, code, color)")
        .in("subject_id", ids)
        .order("day").order("start_time");

      return data && data.length > 0 ? data : null;
    },
    "timetable",
    email,
    [studentId]
  );
}

/**
 * useProfile — student profile from student_profiles table.
 * Replaces: STUDENT_FALLBACK constant
 */
export function useProfile(email: string) {
  const [profile, setProfile]  = useState<any>(null);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    if (!email) { setLoading(false); return; }

    // 1. student_profiles table
    supabase.from("student_profiles").select("*").eq("user_email", email).maybeSingle()
      .then(async ({ data: sp }) => {
        if (sp) { setProfile(sp); setLoading(false); return; }

        // 2. public.users table
        const { data: user } = await supabase.from("users").select("id,name,email,role,department,semester,branch,cgpa").ilike("email", email).maybeSingle();
        if (user) { setProfile(user); setLoading(false); return; }

        // 3. sessionStorage fallback
        try {
          setProfile({
            id:    sessionStorage.getItem("cc_id")    || email.split("@")[0],
            name:  sessionStorage.getItem("cc_name")  || email.split("@")[0],
            email,
            role:  sessionStorage.getItem("cc_role")  || "student",
          });
        } catch { setProfile({ id: email.split("@")[0], name: email.split("@")[0], email, role: "student" }); }
        setLoading(false);
      });
  }, [email]);

  return { profile, loading };
}

/**
 * useStudentDataSync — checks if data is stale and triggers background sync.
 * Call this on mount in the chat page.
 */
export function useStudentDataSync(email: string) {
  const [syncing,   setSyncing]   = useState(false);
  const [lastSync,  setLastSync]  = useState<string | null>(null);
  const [hasPortal, setHasPortal] = useState(false);

  useEffect(() => {
    if (!email) return;

    supabase.from("portal_sessions").select("last_synced, session_valid").eq("user_email", email).maybeSingle()
      .then(({ data }) => {
        if (!data?.last_synced) {
          setHasPortal(!!data);
          return;
        }
        setHasPortal(true);
        setLastSync(data.last_synced);

        const ageHours = (Date.now() - new Date(data.last_synced).getTime()) / 3600000;
        if (ageHours > 6 && data.session_valid) {
          setSyncing(true);
          fetch(`${AGENT}/api/sync-data`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email }),
          }).then(() => setSyncing(false)).catch(() => setSyncing(false));
        }
      });
  }, [email]);

  return { syncing, lastSync, hasPortal };
}

/**
 * useCalendarEvents — real calendar from calendar_events table.
 */
export function useCalendarEvents(studentId: string) {
  const [events,  setEvents]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    const from = new Date();
    from.setDate(1);
    const to = new Date(); to.setMonth(to.getMonth() + 4);

    supabase.from("calendar_events")
      .select("*")
      .eq("student_id", studentId)
      .gte("event_date", from.toISOString().split("T")[0])
      .lte("event_date", to.toISOString().split("T")[0])
      .order("event_date")
      .then(({ data }) => { setEvents(data || []); setLoading(false); });
  }, [studentId]);

  return { events, loading };
}
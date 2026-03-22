// hooks/useData.ts  (v2 — with 30-min cache + RLS-safe upload)
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { cache, CK } from "@/lib/cache";
import type {
  DBSubject, DBDocument, AttendanceWithSubject,
  DBLabRequest, DBNotification, ExamWithSubject,
} from "@/lib/types";

// ── helpers ───────────────────────────────────────────────────────────────────
function attendanceStatus(pct: number): "safe" | "risk" | "detained" {
  return pct >= 75 ? "safe" : pct >= 65 ? "risk" : "detained";
}
function daysUntil(ds: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const g = new Date(ds); g.setHours(0, 0, 0, 0);
  return Math.round((g.getTime() - t.getTime()) / 86400000);
}

// ── Generic cached async hook ─────────────────────────────────────────────────
function useCachedAsync<T>(
  cacheKey: string,
  fn: () => Promise<T>,
  deps: any[] = [],
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data,    setData]    = useState<T | null>(() => cache.get<T>(cacheKey));
  const [loading, setLoading] = useState(!cache.get<T>(cacheKey));
  const [error,   setError]   = useState<string | null>(null);

  const fetch = useCallback(async (force = false) => {
    // Serve from cache unless forced
    if (!force) {
      const cached = cache.get<T>(cacheKey);
      if (cached) { setData(cached); setLoading(false); return; }
    }
    setLoading(true); setError(null);
    try {
      const result = await fn();
      cache.set(cacheKey, result);
      setData(result);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...deps]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: () => fetch(true) };
}

// ── FACULTY: subjects ─────────────────────────────────────────────────────────
export function useFacultySubjects(professorId: string) {
  return useCachedAsync(
    CK.facultySubjects(professorId),
    async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*, documents(count), enrollments(count)")
        .eq("professor_id", professorId)
        .order("code");
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        document_count: s.documents?.[0]?.count ?? 0,
        student_count:  s.enrollments?.[0]?.count ?? 0,
      }));
    },
    [professorId],
  );
}

// ── FACULTY: documents for one subject (with realtime) ────────────────────────
export function useDocuments(subjectId: string | null) {
  const [docs,    setDocs]    = useState<DBDocument[]>(() => subjectId ? cache.get<DBDocument[]>(CK.documents(subjectId)) || [] : []);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const fetchDocs = useCallback(async (force = false) => {
    if (!subjectId) { setDocs([]); setLoading(false); return; }
    if (!force) {
      const cached = cache.get<DBDocument[]>(CK.documents(subjectId));
      if (cached) { setDocs(cached); setLoading(false); return; }
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const result = data || [];
      cache.set(CK.documents(subjectId), result);
      setDocs(result);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [subjectId]);

  useEffect(() => {
    fetchDocs();
    if (!subjectId) return;

    // Realtime subscription invalidates cache on change
    channelRef.current = supabase
      .channel(`docs:${subjectId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `subject_id=eq.${subjectId}` },
        (payload) => {
          cache.invalidate(CK.documents(subjectId));
          if (payload.eventType === "INSERT") {
            setDocs(prev => [payload.new as DBDocument, ...prev]);
          } else if (payload.eventType === "DELETE") {
            setDocs(prev => prev.filter(d => d.id !== (payload.old as any).id));
          }
        })
      .subscribe();

    return () => { channelRef.current?.unsubscribe(); };
  }, [subjectId, fetchDocs]);

  // ── RLS-safe upload via API route ─────────────────────────────────────────
  const upload = useCallback(async (file: File, uploadedBy: string) => {
    if (!subjectId) throw new Error("No subject selected");

    const form = new FormData();
    form.append("file",        file);
    form.append("subject_id",  subjectId);
    form.append("uploaded_by", uploadedBy);

    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(err.error || "Upload failed");
    }
    const { doc } = await res.json();
    // Optimistically update state (realtime will also fire)
    cache.invalidate(CK.documents(subjectId));
    setDocs(prev => [doc, ...prev]);
    return doc as DBDocument;
  }, [subjectId]);

  const remove = useCallback(async (doc: Pick<DBDocument, "id" | "file_path">) => {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: doc.file_path }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Delete failed" }));
      throw new Error(err.error || "Delete failed");
    }
    if (subjectId) cache.invalidate(CK.documents(subjectId));
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  }, [subjectId]);

  return { docs, loading, error, upload, remove, refetch: () => fetchDocs(true) };
}

// ── FACULTY: lab requests ─────────────────────────────────────────────────────
export function useFacultyLabRequests(professorId: string) {
  const [requests, setRequests] = useState<any[]>(() => cache.get<any[]>(CK.facultyLabRequests(professorId)) || []);
  const [loading,  setLoading]  = useState(!cache.get(CK.facultyLabRequests(professorId)));
  const channelRef = useRef<any>(null);

  // FIXED: Renamed local "fetch" to "fetchReqs" to avoid shadowing the global fetch API
  const fetchReqs = useCallback(async (force = false) => {
    if (!force) {
      const cached = cache.get<any[]>(CK.facultyLabRequests(professorId));
      if (cached) { setRequests(cached); setLoading(false); return; }
    }
    setLoading(true);
    try {
      // Get subjects for this faculty
      const { data: subjects } = await supabase
        .from("subjects").select("id").eq("professor_id", professorId);
      const subjectIds = (subjects || []).map((s: any) => s.id);
      if (!subjectIds.length) { setRequests([]); return; }

      // Get enrolled students
      const { data: enrollments } = await supabase
        .from("enrollments").select("student_id").in("subject_id", subjectIds);
      const studentIds = [...new Set((enrollments || []).map((e: any) => e.student_id))];
      if (!studentIds.length) { setRequests([]); return; }

      const { data, error } = await supabase
        .from("lab_requests")
        .select("*, student:users(id,name,branch)")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const result = data || [];
      cache.set(CK.facultyLabRequests(professorId), result, 5 * 60 * 1000); // 5 min TTL (more dynamic)
      setRequests(result);
    } catch { } finally { setLoading(false); }
  }, [professorId]);

  useEffect(() => {
    fetchReqs();
    // Realtime for lab requests
    channelRef.current = supabase
      .channel("lab_requests_faculty")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_requests" }, () => {
        cache.invalidate(CK.facultyLabRequests(professorId));
        fetchReqs(true); // re-fetch on any change
      })
      .subscribe();
    return () => { channelRef.current?.unsubscribe(); };
  }, [fetchReqs, professorId]);

  const updateStatus = useCallback(async (id: string, status: "approved" | "rejected") => {
    // This now correctly uses the global fetch API
    const res = await fetch(`/api/lab/update` as any, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, approved_by: professorId }),
    });
    if (!res.ok) throw new Error("Update failed");
    cache.invalidate(CK.facultyLabRequests(professorId));
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }, [professorId]);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return { requests, loading, pendingCount, updateStatus, refetch: () => fetchReqs(true) };
}

// ── FACULTY: attendance stats ─────────────────────────────────────────────────
export function useFacultyAttendance(professorId: string) {
  return useCachedAsync(
    CK.facultyAttendance(professorId),
    async () => {
      const { data: subjects } = await supabase
        .from("subjects").select("id,code").eq("professor_id", professorId);
      if (!subjects?.length) return {};
      const stats: Record<string, any[]> = {};
      for (const subj of subjects) {
        const { data } = await supabase
          .from("attendance")
          .select("*, student:users(id,name)")
          .eq("subject_id", subj.id)
          .order("percentage");
        stats[subj.code] = (data || []).map((r: any) => ({
          ...r, status: attendanceStatus(r.percentage),
        }));
      }
      return stats;
    },
    [professorId],
  );
}

// ── FACULTY: schedule ─────────────────────────────────────────────────────────
export function useFacultySchedule(professorId: string) {
  return useCachedAsync(
    CK.facultySchedule(professorId),
    async () => {
      const { data: subjects } = await supabase
        .from("subjects").select("id").eq("professor_id", professorId);
      const ids = (subjects || []).map((s: any) => s.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("schedule")
        .select("*, subject:subjects(id,code,name,color)")
        .in("subject_id", ids)
        .order("day").order("start_time");
      if (error) throw error;
      return data || [];
    },
    [professorId],
  );
}

// ── STUDENT: subjects ─────────────────────────────────────────────────────────
export function useStudentSubjects(studentId: string) {
  return useCachedAsync(
    CK.studentSubjects(studentId),
    async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("subject:subjects(*)")
        .eq("student_id", studentId);
      if (error) throw error;
      return (data || []).map((e: any) => e.subject as DBSubject);
    },
    [studentId],
  );
}

// ── STUDENT: attendance ───────────────────────────────────────────────────────
export function useStudentAttendance(studentId: string) {
  return useCachedAsync<AttendanceWithSubject[]>(
    CK.studentAttendance(studentId),
    async () => {
      const { data: attRows, error } = await supabase
        .from("attendance")
        .select("*, subject:subjects(*)")
        .eq("student_id", studentId);
      if (error) throw error;
      const result: AttendanceWithSubject[] = [];
      for (const row of attRows || []) {
        const { data: missed } = await supabase
          .from("missed_classes")
          .select("*")
          .eq("student_id", studentId)
          .eq("subject_id", row.subject_id)
          .order("date");
        result.push({ ...row, missed_classes: missed || [], status: attendanceStatus(row.percentage) });
      }
      return result;
    },
    [studentId],
  );
}

// ── STUDENT: exams ────────────────────────────────────────────────────────────
export function useStudentExams(studentId: string) {
  return useCachedAsync<ExamWithSubject[]>(
    CK.studentExams(studentId),
    async () => {
      const { data: enrollments } = await supabase
        .from("enrollments").select("subject_id").eq("student_id", studentId);
      const ids = (enrollments || []).map((e: any) => e.subject_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("exam_schedule")
        .select("*, subject:subjects(id,code,name,color)")
        .in("subject_id", ids)
        .gte("exam_date", new Date().toISOString().slice(0, 10))
        .order("exam_date");
      if (error) throw error;
      return (data || []).map((e: any) => ({ ...e, days_left: daysUntil(e.exam_date) }));
    },
    [studentId],
  );
}

// ── STUDENT: schedule ─────────────────────────────────────────────────────────
export function useStudentSchedule(studentId: string) {
  return useCachedAsync(
    CK.studentSchedule(studentId),
    async () => {
      const { data: enrollments } = await supabase
        .from("enrollments").select("subject_id").eq("student_id", studentId);
      const ids = (enrollments || []).map((e: any) => e.subject_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("schedule")
        .select("*, subject:subjects(id,code,name,color)")
        .in("subject_id", ids)
        .order("day").order("start_time");
      if (error) throw error;
      return data || [];
    },
    [studentId],
  );
}

// ── STUDENT: lab requests ─────────────────────────────────────────────────────
export function useStudentLabRequests(studentId: string) {
  const [requests, setRequests] = useState<DBLabRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const channelRef = useRef<any>(null);

  const fetchReqs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("lab_requests").select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (!error) setRequests(data || []);
    } catch { } finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => {
    fetchReqs();
    channelRef.current = supabase
      .channel(`lab_student:${studentId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "lab_requests", filter: `student_id=eq.${studentId}` },
        (payload) => {
          const updated = payload.new as DBLabRequest;
          setRequests(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
        })
      .subscribe();
    return () => { channelRef.current?.unsubscribe(); };
  }, [studentId, fetchReqs]);

  const submit = useCallback(async (req: {
    lab_name: string; date: string;
    slot: "Morning" | "Afternoon" | "Evening"; reason?: string;
  }) => {
    const res = await fetch("/api/lab/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, ...req }),
    });
    if (!res.ok) throw new Error("Request failed");
    const { request } = await res.json();
    setRequests(prev => [request, ...prev]);
    return request;
  }, [studentId]);

  return { requests, loading, submit };
}

// ── SHARED: notifications ─────────────────────────────────────────────────────
export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    supabase.from("notifications").select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => { setNotifications(data || []); setLoading(false); });

    channelRef.current = supabase
      .channel(`notif:${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setNotifications(prev => [payload.new as DBNotification, ...prev]))
      .subscribe();

    return () => { channelRef.current?.unsubscribe(); };
  }, [userId]);

  const markRead = useCallback(async () => {
    await supabase.from("notifications").update({ read: true })
      .eq("user_id", userId).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.read).length;
  return { notifications, loading, unreadCount, markRead };
}
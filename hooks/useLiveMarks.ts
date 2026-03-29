// hooks/useMarks.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hooks for the marks table. Used by:
//   - Student chat/dashboard: useStudentMarks(studentId)
//   - Teacher analytics:      useSubjectMarks(subjectId)

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── useStudentMarks ───────────────────────────────────────────────────────────
// Returns all marks for a student across all subjects.
// Shape: [{ subject: {name,code}, exam_type, score, max_score, grade, entered_at }]
export function useStudentMarks(studentId: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("marks")
      .select("*, subject:subjects(name, code, color)")
      .eq("student_id", studentId)
      .order("entered_at", { ascending: false });
    if (!error) setData(rows || []);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
    // Realtime: teacher adds marks → student sees immediately
    const channel = supabase
      .channel(`marks-student-${studentId}`)
      .on("postgres_changes", {
        event:  "INSERT",
        schema: "public",
        table:  "marks",
        filter: `student_id=eq.${studentId}`,
      }, (payload) => {
        // Fetch the full row with subject join
        supabase.from("marks")
          .select("*, subject:subjects(name,code,color)")
          .eq("id", payload.new.id)
          .single()
          .then(({ data: row }) => {
            if (row) setData(prev => [row, ...prev.filter(r => r.id !== row.id)]);
          });
      })
      .on("postgres_changes", {
        event:  "UPDATE",
        schema: "public",
        table:  "marks",
        filter: `student_id=eq.${studentId}`,
      }, () => load())
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [studentId, load]);

  // Compute derived stats
  const bySubject = data.reduce((acc: any, m: any) => {
    const code = m.subject?.code || m.subject_id;
    if (!acc[code]) acc[code] = { subject: m.subject, exams: [] };
    acc[code].exams.push(m);
    return acc;
  }, {});

  const cgpaEstimate = data.length > 0
    ? Math.round(
        data.reduce((s: number, m: any) => s + ((m.score / (m.max_score || 100)) * 10), 0) / data.length * 100
      ) / 100
    : null;

  return { data, loading, bySubject, cgpaEstimate, refresh: load };
}

// ── useSubjectMarks ───────────────────────────────────────────────────────────
// All students' marks for one subject. Used by teacher analytics.
export function useSubjectMarks(subjectId: string | null) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!subjectId) { setLoading(false); return; }
    setLoading(true);
    const { data: rows } = await supabase
      .from("marks")
      .select("*, student:users(id,name,email)")
      .eq("subject_id", subjectId)
      .order("score", { ascending: false });
    setData(rows || []);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    load();
    if (!subjectId) return;
    const ch = supabase
      .channel(`marks-subject-${subjectId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"marks", filter:`subject_id=eq.${subjectId}` }, load)
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [subjectId, load]);

  const avg = data.length
    ? Math.round(data.reduce((s: number, m: any) => s + ((m.score / (m.max_score || 100)) * 100), 0) / data.length)
    : 0;

  const below50 = data.filter((m: any) => (m.score / (m.max_score || 100)) * 100 < 50);

  return { data, loading, avg, below50, refresh: load };
}
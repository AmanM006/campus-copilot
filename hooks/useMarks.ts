"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// Grade point map for CGPA estimation
const GRADE_POINTS: Record<string, number> = {
  "O": 10, "A+": 9, "A": 8, "B+": 7,
  "B": 6,  "C": 5,  "P": 4, "F": 0,
};

// Sort semesters so "Semester IV" > "Semester III" etc.
const ROMAN: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5,
  VI: 6, VII: 7, VIII: 8,
};

function semesterRank(sem: string): number {
  const match = sem.match(/([IVXLC]+)$/i);
  if (!match) return 0;
  return ROMAN[match[1].toUpperCase()] ?? 0;
}

export function useStudentMarks(email: string) {
  const [data,    setData]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cgpaEstimate, setCgpa] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("marks")
      .select("*")
      .eq("student_email", email)
      .order("updated_at", { ascending: false });

    if (!error && rows && rows.length > 0) {
      const normalized = rows.map((r: any) => ({
        ...r,
        subject: {
          name:  r.subject_name || r.subject_code || "Unknown",
          code:  r.subject_code || "",
          color: "#7c3aed",
        },
        // Score is valid only if > 0 or ca/mta exist
        score:     r.score     ?? 0,
        max_score: r.max_score ?? (r.exam_type === "internal" ? 50 : 100),
      }));
      setData(normalized);

      // CGPA: prefer grade column, fallback to score %
      const graded = rows.filter((r: any) => r.grade && r.grade.trim() !== "");
      if (graded.length > 0) {
        const pts = graded.map((r: any) => GRADE_POINTS[r.grade?.trim()] ?? 0);
        const avg = pts.reduce((a: number, b: number) => a + b, 0) / pts.length;
        setCgpa(avg.toFixed(2));
      } else {
        const validScores = rows.filter((r: any) => r.score > 0);
        if (validScores.length > 0) {
          const pcts = validScores.map((r: any) =>
            (r.score / (r.max_score || 50)) * 10
          );
          const avg = pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length;
          setCgpa(avg.toFixed(2));
        }
      }
    }
    setLoading(false);
  }, [email]);

  useEffect(() => { load(); }, [load]);

  // Group by semester → subject code → exams
  const bySemester: Record<string, Record<string, { subject: any; exams: any[] }>> = {};

  data.forEach((m: any) => {
    const sem  = m.semester || "Unknown";
    const code = m.subject_code || m.subject?.code || "?";
    if (!bySemester[sem]) bySemester[sem] = {};
    if (!bySemester[sem][code]) bySemester[sem][code] = { subject: m.subject, exams: [] };
    bySemester[sem][code].exams.push(m);
  });

  // Sorted semester list, latest first
  const semesters = Object.keys(bySemester).sort(
    (a, b) => semesterRank(b) - semesterRank(a)
  );

  return { data, loading, bySemester, semesters, cgpaEstimate, refresh: load };
}

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

  useEffect(() => { load(); }, [load]);

  const avg = data.length
    ? Math.round(data.reduce((s, m) => s + ((m.score / (m.max_score || 100)) * 100), 0) / data.length)
    : 0;
  const below50 = data.filter((m: any) => (m.score / (m.max_score || 100)) * 100 < 50);

  return { data, loading, avg, below50, refresh: load };
}
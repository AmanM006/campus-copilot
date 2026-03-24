// lib/db_extended.ts
// ─────────────────────────────────────────────────────────────────────────────
// EXTENDS the existing lib/db.ts — import from here, not instead.
// Adds: marks, student_documents, subject assignment, teacher-specific queries.

import { supabase } from "./supabase";

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECT MANAGEMENT (Admin)
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a subject and assign a teacher */
export async function createSubjectWithTeacher(params: {
  name: string; code: string; semester: number;
  teacherId: string; color?: string;
}) {
  const { data, error } = await supabase
    .from("subjects")
    .insert({
      name:         params.name,
      code:         params.code,
      semester:     params.semester,
      professor_id: params.teacherId,
      color:        params.color || "#7c3aed",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Assign teacher to existing subject */
export async function assignTeacherToSubject(subjectId: string, teacherId: string) {
  const { error } = await supabase
    .from("subjects")
    .update({ professor_id: teacherId })
    .eq("id", subjectId);
  if (error) throw error;
}

/** Enroll students in a subject */
export async function enrollStudents(subjectId: string, studentIds: string[]) {
  if (!studentIds.length) return 0;
  const rows = studentIds.map(id => ({ student_id: id, subject_id: subjectId }));
  const { error, count } = await supabase
    .from("enrollments")
    .upsert(rows, { onConflict: "student_id,subject_id" })
    .select("*", { count: "exact" });
  if (error) throw error;
  return count || 0;
}

/** Remove a student from a subject */
export async function unenrollStudent(subjectId: string, studentId: string) {
  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("subject_id", subjectId)
    .eq("student_id", studentId);
  if (error) throw error;
}

/** Get all subjects with teacher + student count — Admin view */
export async function getAllSubjectsAdmin() {
  const { data, error } = await supabase
    .from("subjects")
    .select(`
      *, professor:users!professor_id(id, name, email),
      enrollments(count), documents(count)
    `)
    .order("code");
  if (error) throw error;
  return (data || []).map((s: any) => ({
    ...s,
    teacher_name:   s.professor?.name  || "—",
    teacher_email:  s.professor?.email || "",
    student_count:  s.enrollments?.[0]?.count || 0,
    document_count: s.documents?.[0]?.count   || 0,
  }));
}

/** Get students enrolled in a subject (for teacher view) */
export async function getStudentsInSubject(subjectId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select(`
      student:users!student_id(id, name, email, branch, semester, cgpa)
    `)
    .eq("subject_id", subjectId)
    .order("student(name)");
  if (error) throw error;
  return (data || []).map((e: any) => e.student).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKS
// ═══════════════════════════════════════════════════════════════════════════════

export async function upsertMarks(rows: {
  student_id: string; subject_id: string;
  exam_type: string; score: number; max_score?: number;
  entered_by?: string; source?: string;
}[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("marks")
    .upsert(rows, { onConflict: "student_id,subject_id,exam_type" });
  if (error) throw error;
}

export async function getMarksBySubject(subjectId: string, examType?: string) {
  let q = supabase
    .from("marks")
    .select("*, student:users(id,name,email)")
    .eq("subject_id", subjectId)
    .order("student(name)");
  if (examType) q = q.eq("exam_type", examType) as typeof q;
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getMarksByStudent(studentId: string) {
  const { data, error } = await supabase
    .from("marks")
    .select("*, subject:subjects(name,code)")
    .eq("student_id", studentId)
    .order("entered_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE — teacher import (uses safe upsert that honours teacher override)
// ═══════════════════════════════════════════════════════════════════════════════

export async function importAttendanceFromCSV(rows: {
  student_id: string; subject_id: string;
  attended: number; total: number;
}[], source: "teacher" | "agent" | "csv" = "teacher") {
  for (const row of rows) {
    const { error } = await supabase.rpc("upsert_attendance_safe", {
      p_student_id: row.student_id,
      p_subject_id: row.subject_id,
      p_attended:   row.attended,
      p_total:      row.total,
      p_source:     source,
    });
    if (error) throw error;
  }
}

/** Get all students' attendance for a subject + at-risk flag */
export async function getSubjectAttendanceWithRisk(subjectId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*, student:users(id,name,email,branch)")
    .eq("subject_id", subjectId)
    .order("percentage", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    at_risk:   r.percentage < 75,
    detained:  r.percentage < 65,
    student:   r.student,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function uploadStudentDocument(
  studentId: string, subjectId: string, file: File
) {
  const ext  = file.name.split(".").pop() || "pdf";
  const path = `${studentId}/${subjectId}/${Date.now()}_${file.name}`;

  const { error: storageErr } = await supabase.storage
    .from("student-uploads")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (storageErr) throw storageErr;

  const { data: urlData } = supabase.storage
    .from("student-uploads")
    .getPublicUrl(path);

  const { data, error } = await supabase
    .from("student_documents")
    .insert({
      student_id: studentId,
      subject_id: subjectId,
      name:       file.name,
      file_url:   urlData.publicUrl,
      file_path:  path,
      size_bytes: file.size,
      doc_type:   ext === "pdf" ? "pdf" : ext === "pptx" ? "slides" : "other",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getStudentDocumentsBySubject(subjectId: string, studentId: string) {
  const { data, error } = await supabase
    .from("student_documents")
    .select("*")
    .eq("subject_id", subjectId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** All docs for a subject: teacher docs + student doc (for one student) */
export async function getAllDocsForSubject(subjectId: string, studentId?: string) {
  const [teacherDocs, studentDocs] = await Promise.all([
    supabase.from("documents").select("*, uploader:users(name)").eq("subject_id", subjectId).order("created_at", { ascending: false }),
    studentId
      ? supabase.from("student_documents").select("*").eq("subject_id", subjectId).eq("student_id", studentId).order("created_at", { ascending: false })
      : { data: [] },
  ]);

  return {
    teacherDocs: (teacherDocs.data || []).map((d: any) => ({ ...d, _source: "teacher" as const })),
    studentDocs: (studentDocs.data || []).map((d: any) => ({ ...d, _source: "student" as const })),
    all: [
      ...(teacherDocs.data || []).map((d: any) => ({ ...d, _source: "teacher" as const })),
      ...(studentDocs.data || []).map((d: any) => ({ ...d, _source: "student" as const })),
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEACHER — full analytics for one subject
// ═══════════════════════════════════════════════════════════════════════════════

export async function getSubjectAnalytics(subjectId: string) {
  const [students, attendance, marks, docs] = await Promise.all([
    getStudentsInSubject(subjectId),
    getSubjectAttendanceWithRisk(subjectId),
    getMarksBySubject(subjectId),
    supabase.from("documents").select("id").eq("subject_id", subjectId),
  ]);

  const attMap = new Map(attendance.map((a: any) => [a.student_id, a]));
  const marksMap = new Map(marks.map((m: any) => [m.student_id, m]));

  return {
    students: students.map((s: any) => ({
      ...s,
      attendance: attMap.get(s.id) || null,
      marks:      marksMap.get(s.id) || null,
      at_risk:    (attMap.get(s.id)?.percentage || 0) < 75,
    })),
    doc_count:  docs.data?.length || 0,
    at_risk_count: attendance.filter((a: any) => a.at_risk).length,
    avg_attendance: attendance.length
      ? Math.round(attendance.reduce((s: number, a: any) => s + (a.percentage || 0), 0) / attendance.length)
      : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV PARSERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Parse attendance CSV: student_id,subject_id,attended,total */
export function parseAttendanceCSV(text: string): { student_id:string; subject_id:string; attended:number; total:number }[] {
  const lines   = text.trim().split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const siIdx   = headers.indexOf("student_id");
  const suIdx   = headers.indexOf("subject_id");
  const aIdx    = headers.indexOf("attended");
  const tIdx    = headers.indexOf("total");

  if (siIdx === -1 || aIdx === -1) throw new Error("CSV must have student_id, attended columns");

  return lines.slice(1)
    .map(line => {
      const cols = line.split(",").map(c => c.trim());
      return {
        student_id: cols[siIdx] || "",
        subject_id: suIdx >= 0 ? cols[suIdx] : "",
        attended:   parseInt(cols[aIdx]) || 0,
        total:      tIdx >= 0 ? parseInt(cols[tIdx]) || 0 : 0,
      };
    })
    .filter(r => r.student_id);
}

/** Parse marks CSV: student_id,subject_id,score,max_score,exam_type */
export function parseMarksCSV(text: string): { student_id:string; subject_id:string; score:number; max_score:number; exam_type:string }[] {
  const lines   = text.trim().split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

  const col = (name: string) => headers.indexOf(name);

  return lines.slice(1)
    .map(line => {
      const c = line.split(",").map(x => x.trim());
      return {
        student_id: c[col("student_id")] || "",
        subject_id: c[col("subject_id")] || "",
        score:      parseFloat(c[col("score")]) || 0,
        max_score:  parseFloat(c[col("max_score")]) || 100,
        exam_type:  c[col("exam_type")] || "midsem",
      };
    })
    .filter(r => r.student_id);
}
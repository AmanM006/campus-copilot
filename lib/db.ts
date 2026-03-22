// lib/db.ts
// ─── Centralised data-access layer ───────────────────────────────────────────
// All Supabase calls live here so components stay thin.

import { supabase } from "./supabase";
import type {
  DBSubject, DBDocument, DBAttendance, DBMissedClass,
  DBLabRequest, DBNotification, DBUser, DBScheduleSlot,
  DBExamSchedule, AttendanceWithSubject, ExamWithSubject,
} from "./types";

// ── helpers ───────────────────────────────────────────────────────────────────
function attendanceStatus(pct: number): "safe" | "risk" | "detained" {
  if (pct >= 75) return "safe";
  if (pct >= 65) return "risk";
  return "detained";
}

function daysUntil(ds: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const g = new Date(ds); g.setHours(0, 0, 0, 0);
  return Math.round((g.getTime() - t.getTime()) / 86400000);
}

// ── USER ──────────────────────────────────────────────────────────────────────

export async function upsertUser(user: Partial<DBUser> & { id: string; email: string; name: string; role: "student" | "faculty" }) {
  const { data, error } = await supabase
    .from("users")
    .upsert(user, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data as DBUser;
}

export async function getUser(id: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as DBUser;
}

// ── SUBJECTS ──────────────────────────────────────────────────────────────────

/** Subjects taught by a faculty member */
export async function getSubjectsByFaculty(professorId: string) {
  const { data, error } = await supabase
    .from("subjects")
    .select(`
      *,
      documents(count),
      enrollments(count)
    `)
    .eq("professor_id", professorId)
    .order("code");
  if (error) throw error;

  return (data || []).map((s: any) => ({
    ...s,
    document_count: s.documents?.[0]?.count ?? 0,
    student_count:  s.enrollments?.[0]?.count ?? 0,
  }));
}

/** Subjects a student is enrolled in */
export async function getSubjectsByStudent(studentId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("subject:subjects(*)")
    .eq("student_id", studentId);
  if (error) throw error;
  return (data || []).map((e: any) => e.subject as DBSubject);
}

// ── DOCUMENTS ─────────────────────────────────────────────────────────────────

export async function getDocumentsBySubject(subjectId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*, uploader:users(name)")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DBDocument[];
}

export async function uploadDocument(
  subjectId: string,
  file: File,
  uploadedBy: string,
): Promise<DBDocument> {
  // 1. Upload file to Storage
  const ext  = file.name.split(".").pop() || "pdf";
  const path = `${subjectId}/${Date.now()}_${file.name}`;

  const { error: storageErr } = await supabase.storage
    .from("documents")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (storageErr) throw storageErr;

  // 2. Get public URL
  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(path);

  // 3. Detect type
  const type: DBDocument["type"] =
    ext === "pdf" ? "pdf" :
    ["ppt", "pptx"].includes(ext) ? "slides" : "notes";

  // 4. Save metadata in DB
  const { data, error: dbErr } = await supabase
    .from("documents")
    .insert({
      subject_id:  subjectId,
      name:        file.name,
      file_url:    urlData.publicUrl,
      file_path:   path,
      type,
      size_bytes:  file.size,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();
  if (dbErr) throw dbErr;

  // 5. Notify all enrolled students
  await notifyStudentsOfNewDocument(subjectId, file.name, data.id);

  return data as DBDocument;
}

export async function deleteDocument(doc: Pick<DBDocument, "id" | "file_path">) {
  await supabase.storage.from("documents").remove([doc.file_path]);
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

async function notifyStudentsOfNewDocument(subjectId: string, fileName: string, _docId: string) {
  // Get enrolled students
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("subject_id", subjectId);
  if (!enrollments) return;

  const notifications = enrollments.map((e: any) => ({
    user_id: e.student_id,
    title:   "New material uploaded",
    body:    `"${fileName}" is now available in your subject materials.`,
    type:    "info" as const,
  }));

  await supabase.from("notifications").insert(notifications);
}

export async function getNotifications(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as DBNotification[];
}

export async function markNotificationsRead(userId: string) {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}

// ── ATTENDANCE ────────────────────────────────────────────────────────────────

export async function getStudentAttendance(studentId: string): Promise<AttendanceWithSubject[]> {
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

    result.push({
      ...row,
      missed_classes: missed || [],
      status: attendanceStatus(row.percentage),
    });
  }
  return result;
}

/** All students' attendance for a given subject (faculty analytics) */
export async function getSubjectAttendance(subjectId: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*, student:users(id,name)")
    .eq("subject_id", subjectId)
    .order("percentage");
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    status: attendanceStatus(r.percentage),
  }));
}

/** Faculty analytics: attendance stats across all their subjects */
export async function getFacultyAttendanceStats(professorId: string) {
  const subjects = await getSubjectsByFaculty(professorId);
  const stats: Record<string, any[]> = {};

  for (const subj of subjects) {
    stats[subj.code] = await getSubjectAttendance(subj.id);
  }
  return stats;
}

// ── LAB REQUESTS ──────────────────────────────────────────────────────────────

export async function getLabRequestsByFaculty(professorId: string) {
  // Fetch requests for students enrolled in this faculty's subjects
  const subjects = await getSubjectsByFaculty(professorId);
  const subjectIds = subjects.map((s: any) => s.id);

  // Get all enrolled student IDs across these subjects
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student_id")
    .in("subject_id", subjectIds);

  const studentIds = [...new Set((enrollments || []).map((e: any) => e.student_id))];
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
    .from("lab_requests")
    .select("*, student:users(id,name,branch)")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as (DBLabRequest & { student: DBUser })[];
}

export async function getLabRequestsByStudent(studentId: string) {
  const { data, error } = await supabase
    .from("lab_requests")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DBLabRequest[];
}

export async function createLabRequest(req: {
  student_id: string;
  lab_name: string;
  date: string;
  slot: "Morning" | "Afternoon" | "Evening";
  reason?: string;
}) {
  const { data, error } = await supabase
    .from("lab_requests")
    .insert(req)
    .select()
    .single();
  if (error) throw error;
  return data as DBLabRequest;
}

export async function updateLabRequestStatus(
  id: string,
  status: "approved" | "rejected",
  approvedBy: string,
) {
  const { data, error } = await supabase
    .from("lab_requests")
    .update({ status, approved_by: approvedBy, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, student:users(id)")
    .single();
  if (error) throw error;

  // Notify the student
  const req = data as any;
  await supabase.from("notifications").insert({
    user_id: req.student.id,
    title:   status === "approved" ? "Lab request approved ✅" : "Lab request rejected",
    body:    `Your request for ${req.lab_name} on ${req.date} (${req.slot}) has been ${status}.`,
    type:    status === "approved" ? "success" : "warning",
  });

  return req as DBLabRequest;
}

// ── SCHEDULE ──────────────────────────────────────────────────────────────────

export async function getScheduleByStudent(studentId: string) {
  // Get enrolled subject IDs
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("subject_id")
    .eq("student_id", studentId);
  if (!enrollments) return [];

  const subjectIds = enrollments.map((e: any) => e.subject_id);

  const { data, error } = await supabase
    .from("schedule")
    .select("*, subject:subjects(id,code,name,color)")
    .in("subject_id", subjectIds)
    .order("day")
    .order("start_time");
  if (error) throw error;
  return (data || []) as (DBScheduleSlot & { subject: DBSubject })[];
}

export async function getScheduleByFaculty(professorId: string) {
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id")
    .eq("professor_id", professorId);
  if (!subjects) return [];

  const subjectIds = subjects.map((s: any) => s.id);
  const { data, error } = await supabase
    .from("schedule")
    .select("*, subject:subjects(id,code,name,color)")
    .in("subject_id", subjectIds)
    .order("day")
    .order("start_time");
  if (error) throw error;
  return (data || []) as (DBScheduleSlot & { subject: DBSubject })[];
}

// ── EXAM SCHEDULE ─────────────────────────────────────────────────────────────

export async function getExamsByStudent(studentId: string): Promise<ExamWithSubject[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("subject_id")
    .eq("student_id", studentId);
  if (!enrollments) return [];

  const subjectIds = enrollments.map((e: any) => e.subject_id);

  const { data, error } = await supabase
    .from("exam_schedule")
    .select("*, subject:subjects(id,code,name,color)")
    .in("subject_id", subjectIds)
    .gte("exam_date", new Date().toISOString().slice(0, 10))
    .order("exam_date");
  if (error) throw error;

  return (data || []).map((e: any) => ({
    ...e,
    days_left: daysUntil(e.exam_date),
  }));
}

// ── REALTIME SUBSCRIPTIONS ────────────────────────────────────────────────────

export function subscribeToDocuments(
  subjectId: string,
  callback: (doc: DBDocument, event: "INSERT" | "DELETE") => void,
) {
  return supabase
    .channel(`documents:${subjectId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "documents", filter: `subject_id=eq.${subjectId}` },
      (payload) => {
        const event = payload.eventType as "INSERT" | "DELETE";
        callback(payload.new as DBDocument || payload.old as DBDocument, event);
      },
    )
    .subscribe();
}

export function subscribeToLabRequests(
  studentIds: string[],
  callback: (req: DBLabRequest) => void,
) {
  return supabase
    .channel("lab_requests_faculty")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "lab_requests" },
      (payload) => {
        const req = (payload.new || payload.old) as DBLabRequest;
        if (studentIds.includes(req.student_id)) callback(req);
      },
    )
    .subscribe();
}

export function subscribeToNotifications(
  userId: string,
  callback: (n: DBNotification) => void,
) {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => callback(payload.new as DBNotification),
    )
    .subscribe();
}
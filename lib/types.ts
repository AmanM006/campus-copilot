// lib/types.ts
// ─── Shared TypeScript types that mirror the Supabase schema ──────────────────

export interface DBUser {
    id: string;
    email: string;
    name: string;
    role: "student" | "faculty";
    semester?: number;
    branch?: string;
    cgpa?: number;
    department?: string;
    designation?: string;
    created_at: string;
  }
  
  export interface DBSubject {
    id: string;
    code: string;
    name: string;
    semester: number;
    professor_id: string;
    color: string;
    created_at: string;
    // joined
    professor?: DBUser;
    documents?: DBDocument[];
    enrollment_count?: number;
  }
  
  export interface DBDocument {
    id: string;
    subject_id: string;
    name: string;
    file_url: string;
    file_path: string;
    type: "pdf" | "notes" | "slides";
    size_bytes: number;
    pages?: number;
    uploaded_by: string;
    created_at: string;
    // joined
    subject?: DBSubject;
    uploader?: DBUser;
  }
  
  export interface DBAttendance {
    id: string;
    student_id: string;
    subject_id: string;
    attended: number;
    total: number;
    percentage: number;    // computed column
    updated_at: string;
    // joined
    subject?: DBSubject;
  }
  
  export interface DBMissedClass {
    id: string;
    student_id: string;
    subject_id: string;
    date: string;
    reason: string;
    created_at: string;
  }
  
  export interface DBLabRequest {
    id: string;
    student_id: string;
    lab_name: string;
    date: string;
    slot: "Morning" | "Afternoon" | "Evening";
    reason?: string;
    status: "pending" | "approved" | "rejected";
    approved_by?: string;
    reviewed_at?: string;
    created_at: string;
    // joined
    student?: DBUser;
  }
  
  export interface DBNotification {
    id: string;
    user_id: string;
    title: string;
    body?: string;
    type: "info" | "success" | "warning" | "error";
    read: boolean;
    created_at: string;
  }
  
  export interface DBScheduleSlot {
    id: string;
    subject_id: string;
    day: string;
    start_time: string;
    end_time: string;
    room?: string;
    section?: string;
    type: "lecture" | "lab" | "tutorial";
    // joined
    subject?: DBSubject;
  }
  
  export interface DBExamSchedule {
    id: string;
    subject_id: string;
    exam_date: string;
    start_time: string;
    end_time: string;
    exam_type: string;
    venue?: string;
    // joined
    subject?: DBSubject;
  }
  
  // ── Derived / UI types ────────────────────────────────────────────────────────
  
  export interface AttendanceWithSubject extends DBAttendance {
    subject: DBSubject;
    missed_classes: DBMissedClass[];
    status: "safe" | "risk" | "detained";
  }
  
  export interface ExamWithSubject extends DBExamSchedule {
    subject: DBSubject;
    days_left: number;
  }
  
  export interface ScheduleWithSubject extends DBScheduleSlot {
    subject: DBSubject;
    class_status?: "current" | "upcoming" | "done";
  }
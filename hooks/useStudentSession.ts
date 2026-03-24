// hooks/useStudentSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// Replaces:
//   const STUDENT_FALLBACK = { id:"213CS1001", name:"Aman Mehta", … }
//   const [STUDENT, setStudent] = useState(STUDENT_FALLBACK)
//   const [authReady, setAuthReady] = useState(false)
//   useEffect that reads sessionStorage and calls setStudent
//
// Usage in chat/page.tsx:
//   const { student: STUDENT, authReady, syncing } = useStudentSession();
//
// Sources (priority order):
//   1. Supabase public.users  (from OTP login → real DB row)
//   2. sessionStorage          (demo/admin legacy login fallback)
//   3. Hard fallback shape     (prevents crashes before auth resolves)

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export interface StudentProfile {
  id:          string;
  email:       string;
  name:        string;
  role:        "student" | "faculty" | "admin";
  initials:    string;
  program?:    string;
  semester?:   number;
  branch?:     string;
  cgpa?:       number;
  year?:       string;
  college_id?: string;
}

// Shape-compatible replacement for STUDENT_FALLBACK
const BLANK: StudentProfile = {
  id: "", email: "", name: "Loading…", role: "student",
  initials: "…", program: "", semester: 0, branch: "", cgpa: 0,
};

function makeInitials(name: string): string {
  return name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function yearFromSemester(sem?: number): string {
  if (!sem) return "";
  const yr = Math.ceil(sem / 2);
  const suffix = ["st","nd","rd"][yr - 1] || "th";
  return `${yr}${suffix} Year`;
}

export function useStudentSession() {
  const router   = useRouter();
  const [student,   setStudent]   = useState<StudentProfile>(BLANK);
  const [authReady, setAuthReady] = useState(false);
  const [syncing,   setSyncing]   = useState(false);

  const resolve = useCallback(async () => {
    // ── 1. Read sessionStorage (set by OTP login or legacy admin login) ──────
    let email: string | null = null;
    let role:  string | null = null;
    let name:  string | null = null;
    let id:    string | null = null;

    try {
      email = sessionStorage.getItem("cc_email");
      role  = sessionStorage.getItem("cc_role");
      name  = sessionStorage.getItem("cc_name") || "";
      id    = sessionStorage.getItem("cc_id") || "";
    } catch { /* SSR */ }

    if (!email || !role) {
      router.replace("/login");
      return;
    }

    if (role === "faculty" || role === "admin") {
      router.replace(role === "admin" ? "/admin" : "/teacher");
      return;
    }

    // Build minimal profile immediately so UI isn't blank
    const derivedId = id || email.split("@")[0].replace(/[^a-z0-9_-]/gi, "_");
    setStudent({
      id:       derivedId,
      email,
      name:     name || derivedId,
      role:     "student",
      initials: makeInitials(name || derivedId),
    });
    setAuthReady(true);

    // ── 2. Fetch full profile from Supabase in the background ─────────────
    setSyncing(true);
    try {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, email, name, role, semester, branch, cgpa, department, college_id")
        .ilike("email", email)
        .maybeSingle();

      if (userRow) {
        setStudent({
          id:        userRow.id,
          email:     userRow.email,
          name:      userRow.name || name || derivedId,
          role:      userRow.role as "student",
          initials:  makeInitials(userRow.name || name || derivedId),
          semester:  userRow.semester,
          branch:    userRow.branch || userRow.department,
          cgpa:      userRow.cgpa,
          program:   userRow.branch ? "B.Tech" : undefined,
          year:      yearFromSemester(userRow.semester),
          college_id: userRow.college_id,
        });
        // Also try student_profiles for richer data
        const { data: sp } = await supabase
          .from("student_profiles")
          .select("*")
          .eq("user_email", email)
          .maybeSingle();
        if (sp) {
          setStudent(prev => ({
            ...prev,
            name:     sp.name     || prev.name,
            semester: sp.semester || prev.semester,
            branch:   sp.branch   || prev.branch,
            cgpa:     sp.cgpa     || prev.cgpa,
            year:     yearFromSemester(sp.semester || prev.semester),
          }));
        }
      }
    } catch { /* non-fatal — use basic profile */ }
    finally { setSyncing(false); }
  }, [router]);

  useEffect(() => { resolve(); }, [resolve]);

  return { student, authReady, syncing };
}
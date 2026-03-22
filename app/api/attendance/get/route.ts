// app/api/attendance/get/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId  = searchParams.get("student_id");
  const subjectId  = searchParams.get("subject_id");
  const facultyId  = searchParams.get("faculty_id");

  // ── Student: own attendance ────────────────────────────────────────────────
  if (studentId && !subjectId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("*, subject:subjects(id,code,name,color)")
      .eq("student_id", studentId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attendance: data });
  }

  // ── Faculty: all students for a subject ──────────────────────────────────
  if (subjectId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("*, student:users(id,name)")
      .eq("subject_id", subjectId)
      .order("percentage");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ attendance: data });
  }

  return NextResponse.json({ error: "Provide student_id or subject_id" }, { status: 400 });
}
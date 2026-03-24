// app/api/documents/get/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subjectId  = searchParams.get("subject_id");
  const studentId  = searchParams.get("student_id");

  if (!subjectId) {
    return NextResponse.json({ error: "subject_id required" }, { status: 400 });
  }

  // If student_id provided, verify enrollment
  if (studentId) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*, uploader:users(name)")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}
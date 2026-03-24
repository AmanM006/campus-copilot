// app/api/lab/request/route.ts  (POST = create)
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { student_id, lab_name, date, slot, reason } = body;

    if (!student_id || !lab_name || !date || !slot) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check for existing pending request on same date/slot
    const { data: existing } = await supabase
      .from("lab_requests")
      .select("id")
      .eq("lab_name", lab_name)
      .eq("date", date)
      .eq("slot", slot)
      .eq("status", "approved")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "conflict", message: `${slot} slot on ${date} is already booked for ${lab_name}.` },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("lab_requests")
      .insert({ student_id, lab_name, date, slot, reason })
      .select()
      .single();

    if (error) throw error;

    // Notify all faculty who teach the student (simplified: notify all faculty)
    const { data: faculty } = await supabase
      .from("users")
      .select("id")
      .eq("role", "faculty");

    if (faculty?.length) {
      const { data: studentUser } = await supabase
        .from("users").select("name").eq("id", student_id).single();
      await supabase.from("notifications").insert(
        faculty.map((f: any) => ({
          user_id: f.id,
          title:   "New lab access request",
          body:    `${studentUser?.name || student_id} requested ${lab_name} (${slot} · ${date})`,
          type:    "info",
        })),
      );
    }

    return NextResponse.json({ request: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
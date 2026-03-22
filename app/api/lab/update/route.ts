// app/api/lab/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, approved_by } = await req.json();

    if (!id || !status || !approved_by) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("lab_requests")
      .update({ status, approved_by, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, student:users(id,name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify student
    const req2 = data as any;
    await supabaseAdmin.from("notifications").insert({
      user_id: req2.student.id,
      title:   status === "approved" ? "Lab request approved ✅" : "Lab request rejected",
      body:    `Your request for ${req2.lab_name} on ${req2.date} (${req2.slot}) was ${status}.`,
      type:    status === "approved" ? "success" : "warning",
    });

    return NextResponse.json({ request: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
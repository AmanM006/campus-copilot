// app/api/session-status/route.ts
// ─── Check sync status for a given email ─────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data: session } = await supabase
    .from("portal_sessions")
    .select("status, last_validated, last_synced")
    .eq("user_email", email)
    .single();

  const { data: cached } = await supabase
    .from("cached_data")
    .select("type, updated_at")
    .eq("user_email", email);

  return NextResponse.json({
    session_status: session?.status || "none",
    last_validated: session?.last_validated,
    last_synced:    session?.last_synced,
    cached_types:   (cached || []).map((c: any) => c.type),
    has_data:       (cached || []).length > 0,
  });
}
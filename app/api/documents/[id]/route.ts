// app/api/documents/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { file_path } = await req.json();
    const docId = params.id;

    if (!docId) return NextResponse.json({ error: "Document ID required" }, { status: 400 });

    // Remove from storage
    if (file_path) {
      const { error: storageErr } = await supabaseAdmin.storage
        .from("documents").remove([file_path]);
      if (storageErr) console.warn("Storage delete warning:", storageErr.message);
    }

    // Remove from DB
    const { error } = await supabaseAdmin.from("documents").delete().eq("id", docId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
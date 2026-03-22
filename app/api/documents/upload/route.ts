// app/api/documents/upload/route.ts
// Uses service-role key on the server so RLS never blocks faculty uploads.
// The anon key in the browser has RLS — this server route bypasses it safely.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Server-side Supabase client (service role — bypasses RLS) ─────────────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // ← add this to .env.local
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const form       = await req.formData();
    const file       = form.get("file")       as File   | null;
    const subjectId  = form.get("subject_id") as string | null;
    const uploadedBy = form.get("uploaded_by")as string | null;

    if (!file || !subjectId || !uploadedBy) {
      return NextResponse.json({ error: "Missing fields: file, subject_id, uploaded_by" }, { status: 400 });
    }

    // Verify caller is the professor for this subject
    const { data: subject, error: subjErr } = await supabaseAdmin
      .from("subjects")
      .select("professor_id")
      .eq("id", subjectId)
      .single();

    if (subjErr || !subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
    if (subject.professor_id !== uploadedBy) {
      return NextResponse.json({ error: "Only the professor of this subject can upload materials" }, { status: 403 });
    }

    // Upload to Storage
    const ext  = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${subjectId}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: storageErr } = await supabaseAdmin.storage
      .from("documents")
      .upload(path, buffer, { upsert: false, contentType: file.type || "application/pdf" });

    if (storageErr) {
      console.error("Storage error:", storageErr);
      return NextResponse.json({ error: `Storage upload failed: ${storageErr.message}` }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage.from("documents").getPublicUrl(path);

    const type: "pdf" | "notes" | "slides" =
      ext === "pdf" ? "pdf" :
      ["ppt", "pptx"].includes(ext) ? "slides" : "notes";

    const { data: doc, error: dbErr } = await supabaseAdmin
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

    if (dbErr) {
      console.error("DB insert error:", dbErr);
      // Clean up storage upload
      await supabaseAdmin.storage.from("documents").remove([path]);
      return NextResponse.json({ error: `Database error: ${dbErr.message}` }, { status: 500 });
    }

    // Notify all enrolled students
    const { data: enrollments } = await supabaseAdmin
      .from("enrollments").select("student_id").eq("subject_id", subjectId);

    if (enrollments?.length) {
      await supabaseAdmin.from("notifications").insert(
        enrollments.map((e: any) => ({
          user_id: e.student_id,
          title:   "New study material uploaded",
          body:    `"${file.name}" is now available in your subject materials.`,
          type:    "info",
        })),
      );
    }

    return NextResponse.json({ doc }, { status: 201 });
  } catch (e: any) {
    console.error("Upload route error:", e);
    return NextResponse.json({ error: e.message || "Unexpected error" }, { status: 500 });
  }
}
// app/api/bulk-users/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bulk-users
// Body: { users: [{email, name?, role?}][], collegeName }
// Used by Admin → User Registry → Bulk Import
// Returns: { imported, skipped, errors }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

function emailToId(email: string) {
  return email.toLowerCase().trim().split("@")[0].replace(/[^a-z0-9_-]/gi, "_");
}

function guessRole(email: string): "student" | "faculty" {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (domain.includes("learner") || domain.includes("student")) return "student";
  return "faculty";
}

export async function POST(req: NextRequest) {
  const { users, collegeName } = await req.json();

  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ success: false, error: "users array required" }, { status: 400 });
  }

  const rows = users
    .filter(u => u.email && u.email.includes("@"))
    .map(u => {
      const email = u.email.toLowerCase().trim();
      const role  = u.role || guessRole(email);
      return {
        id:          emailToId(email),
        email,
        name:        u.name || email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        role,
        department:  collegeName || u.department || email.split("@")[1],
        designation: role === "student" ? "Student" : "Faculty",
      };
    });

  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: "No valid email addresses found" }, { status: 400 });
  }

  // Batch upsert in chunks of 50
  const CHUNK = 50;
  let imported = 0, errors = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("users")
      .upsert(chunk, { onConflict: "id" });
    if (error) errors += chunk.length;
    else       imported += chunk.length;
  }

  return NextResponse.json({
    success:  true,
    imported,
    errors,
    skipped:  users.length - rows.length,
    total:    users.length,
  });
}
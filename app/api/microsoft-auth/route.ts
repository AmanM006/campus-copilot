// app/api/microsoft-auth/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Handles Microsoft SSO login (called after OAuth redirect in production,
// or after the prototype prompt() in development).
//
// Logic:
//  1. Check if user exists in Supabase users table
//  2. If not — check if their email domain matches a registered college
//  3. If domain matches — auto-create the account with the right role
//  4. If domain unknown — return error (college not onboarded)
//
// In production: verify the Azure AD id_token JWT here before trusting the email.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL    || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY   || ""
);

function emailToId(email: string) {
  return email.toLowerCase().trim().split("@")[0].replace(/[^a-z0-9_-]/gi, "_");
}

function guessRole(email: string): "student" | "faculty" | "admin" {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (domain.includes("learner") || domain.includes("student")) return "student";
  return "faculty";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, name } = body;

  if (!email) return NextResponse.json({ success: false, error: "Email required" }, { status: 400 });

  const cleanEmail = email.toLowerCase().trim();
  const domain     = cleanEmail.split("@")[1] || "";

  // ── 1. Check if user already exists ──────────────────────────────────────
  const { data: existing } = await supabase
    .from("users")
    .select("id, email, name, role, department")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, user: existing });
  }

  // ── 2. Check if domain is registered ─────────────────────────────────────
  // Match against portal URLs in integration_sources
  const domainBase = domain.split(".").slice(-3).join("."); // e.g. "manipal.edu"
  const { data: integration } = await supabase
    .from("integration_sources")
    .select("college_name, portal_url")
    .or(`portal_url.ilike.%${domain}%,portal_url.ilike.%${domainBase}%`)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({
      success: false,
      error:   `Your institution (${domain}) is not yet registered on CampusCopilot.\n\nAsk your IT admin to complete onboarding at /onboarding.`,
    }, { status: 403 });
  }

  // ── 3. Auto-create account ────────────────────────────────────────────────
  const role = guessRole(cleanEmail);
  const id   = emailToId(cleanEmail);
  const displayName = name || cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  const { error: insertErr } = await supabase.from("users").upsert({
    id,
    email:       cleanEmail,
    name:        displayName,
    role,
    department:  integration.college_name,
    designation: role === "student" ? "Student" : "Faculty",
  }, { onConflict: "id" });

  if (insertErr) {
    return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
  }

  const user = { id, email: cleanEmail, name: displayName, role, department: integration.college_name };
  return NextResponse.json({ success: true, user, autoCreated: true });
}
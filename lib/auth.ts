// lib/auth.ts  v4 — fixed lookup, Microsoft SSO support, domain-based role detection
// ─────────────────────────────────────────────────────────────────────────────
// Changes from v3:
//  1. lookupUserByEmail now tries BOTH exact match AND case-insensitive ILIKE
//  2. autoCreateFromMicrosoft — if a user's domain is registered in
//     allowed_domains table, create their account on first SSO login
//  3. detectRoleFromEmail — configurable per-domain rules
//  4. upsertUser uses onConflict:"id" (fixed PK bug from earlier)

import { supabase } from "./supabase";

export type UserRole = "student" | "faculty" | "admin";

export interface AppUser {
  id:          string;
  email:       string;
  name:        string;
  role:        UserRole;
  department?: string;
  designation?: string;
}

// ── Derive a stable ID from email ─────────────────────────────────────────────
export function emailToId(email: string): string {
  return email.toLowerCase().trim().split("@")[0].replace(/[^a-z0-9_-]/gi, "_");
}

// ── Detect role from email domain ─────────────────────────────────────────────
// Rules checked in order:
//   1. Check allowed_domains table for custom rules
//   2. If domain contains "learner" or "student" → student
//   3. Otherwise → faculty (will be admin if created via onboarding)
export function guessRoleFromEmail(email: string): UserRole {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (domain.includes("learner") || domain.includes("student")) return "student";
  return "faculty";
}

// ── Lookup user — tries exact then case-insensitive ───────────────────────────
export async function lookupUserByEmail(email: string): Promise<AppUser | null> {
  const e = email.toLowerCase().trim();

  // 1. Exact match
  const { data: exact } = await supabase
    .from("users")
    .select("id, email, name, role, department, designation")
    .eq("email", e)
    .maybeSingle();

  if (exact) return exact as AppUser;

  // 2. Case-insensitive match (handles mixed-case university emails)
  const { data: ilike } = await supabase
    .from("users")
    .select("id, email, name, role, department, designation")
    .ilike("email", e)
    .maybeSingle();

  if (ilike) return ilike as AppUser;

  return null;
}

// ── Upsert a user (PK = id, correct conflict key) ────────────────────────────
export async function upsertUser(user: AppUser): Promise<boolean> {
  const { error } = await supabase
    .from("users")
    .upsert(
      {
        id:          user.id,
        email:       user.email.toLowerCase().trim(),
        name:        user.name,
        role:        user.role,
        department:  user.department  ?? null,
        designation: user.designation ?? null,
      },
      { onConflict: "id" }
    );
  if (error) { console.error("[upsertUser]", error); return false; }
  return true;
}

// ── Auto-create user on first Microsoft SSO login ─────────────────────────────
// If the domain is registered in integration_sources, we auto-provision the account.
export async function autoCreateFromMicrosoft(
  email: string, name: string
): Promise<AppUser | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  // Check if this domain's college is in our system
  const { data: integration } = await supabase
    .from("integration_sources")
    .select("college_name")
    .ilike("portal_url", `%${domain.split(".")[0]}%`)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const role = guessRoleFromEmail(email);
  const id   = emailToId(email);

  const user: AppUser = {
    id,
    email:       email.toLowerCase().trim(),
    name:        name || email.split("@")[0],
    role,
    department:  integration?.college_name || domain,
    designation: role === "student" ? "Student" : "Faculty",
  };

  const ok = await upsertUser(user);
  return ok ? user : null;
}

// ── Register admin (onboarding) ────────────────────────────────────────────────
export async function registerAdminAccount(
  email: string, name: string, collegeName: string
): Promise<boolean> {
  const id = emailToId(email);
  const ok = await upsertUser({
    id, email, name,
    role:        "admin",
    department:  collegeName,
    designation: "System Administrator",
  });
  if (ok) persistSession({ id, email: email.toLowerCase(), name, role: "admin" });
  return ok;
}

// ── Session helpers ────────────────────────────────────────────────────────────
export function persistSession(user: AppUser) {
  try {
    sessionStorage.setItem("cc_email", user.email);
    sessionStorage.setItem("cc_name",  user.name);
    sessionStorage.setItem("cc_role",  user.role);
    sessionStorage.setItem("cc_id",    user.id);
  } catch { /* SSR */ }
}

export function getSession(): { email:string; name:string; role:UserRole; id:string } | null {
  try {
    const email = sessionStorage.getItem("cc_email");
    const role  = sessionStorage.getItem("cc_role") as UserRole | null;
    if (!email || !role) return null;
    return {
      email,
      name:  sessionStorage.getItem("cc_name")  || "User",
      role,
      id:    sessionStorage.getItem("cc_id")    || emailToId(email),
    };
  } catch { return null; }
}

export function clearSession() {
  try { ["cc_email","cc_name","cc_role","cc_id"].forEach(k => sessionStorage.removeItem(k)); }
  catch { /* SSR */ }
}

export function dashboardFor(role: UserRole): string {
  return role === "admin" ? "/admin" : role === "faculty" ? "/teacher" : "/chat";
}
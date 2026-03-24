// app/api/auto-sync/route.ts
// ─── Auto-sync endpoint: called on login to ensure session + data exist ────────
// Flow: check session → create if missing → fetch data → store in DB

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    // ── 1. Check if portal session already exists ──────────────────────────
    const { data: session } = await supabase
      .from("portal_sessions")
      .select("*")
      .eq("user_email", email)
      .single();

    if (session && session.status === "active") {
      // Session exists — just trigger a data refresh in background
      triggerBackgroundSync(email).catch(console.error);
      return NextResponse.json({ status: "syncing", message: "Session active, refreshing data" });
    }

    // ── 2. No session → initiate Playwright login flow ────────────────────
    // Insert a pending session record so the frontend knows what's happening
    await supabase.from("portal_sessions").upsert({
      user_email:     email,
      status:         "pending",
      storage_path:   `sessions/${email.replace("@", "_").replace(".", "_")}.json`,
      last_validated: new Date().toISOString(),
    }, { onConflict: "user_email" });

    // Trigger headless browser (non-blocking)
    initiatePlaywrightSession(email).catch(console.error);

    return NextResponse.json({
      status:  "pending",
      message: "Opening browser for first-time login. Please complete login.",
    });

  } catch (err: any) {
    console.error("[auto-sync]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Non-blocking: call Python agent to start Playwright session ───────────────
async function initiatePlaywrightSession(email: string) {
  try {
    const res = await fetch("http://localhost:8000/api/agent/init-session", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    console.log("[auto-sync] session init response:", data);
  } catch (err) {
    console.error("[auto-sync] initiatePlaywrightSession failed:", err);
  }
}

// ── Non-blocking: refresh data for a user who already has a session ───────────
async function triggerBackgroundSync(email: string) {
  try {
    const res = await fetch("http://localhost:8000/api/agent/sync-user", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await res.text());
    console.log("[auto-sync] background sync triggered for", email);
  } catch (err) {
    console.error("[auto-sync] triggerBackgroundSync failed:", err);
  }
}
// app/api/auto-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    // ── 1. Check existing session ──────────────────────────────────────────
    const { data: session } = await supabase
      .from("portal_sessions")
      .select("*")
      .eq("user_email", email)
      .maybeSingle();

    // ── 2. If it's already working, ignore the refresh! ────────────────────
    if (session && session.status === "pending") {
      return NextResponse.json({ status: "pending", message: "Sync already in progress. Ignoring." });
    }

    // ── 3. If active, respect the Background Worker's job ──────────────────
    if (session && session.status === "active") {
      const lastSynced = session.last_synced ? new Date(session.last_synced).getTime() : 0;
      const ageHours = (Date.now() - lastSynced) / (1000 * 60 * 60);

      // If data is less than 5 hours old, DO NOTHING.
      if (ageHours < 5) {
        return NextResponse.json({ 
          status: "active", 
          message: "Data is fresh. Background worker will handle future syncs." 
        });
      }

      // Only if it's super stale, trigger a background refresh
      triggerBackgroundSync(email).catch(console.error);
      return NextResponse.json({ status: "syncing", message: "Session active, refreshing stale data" });
    }

    // ── 4. No session or expired → initiate login flow ────────────────────
    await supabase.from("portal_sessions").upsert({
      user_email:     email,
      status:         "pending",
      storage_path:   `sessions/${email.replace("@", "_").replace(".", "_")}.json`,
    }, { onConflict: "user_email" });

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
  } catch (err) {
    console.error("[auto-sync] triggerBackgroundSync failed:", err);
  }
}
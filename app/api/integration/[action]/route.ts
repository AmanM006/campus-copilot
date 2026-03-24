// app/api/integration/[action]/route.ts
import { NextRequest, NextResponse } from "next/server";

// CRITICAL: Prevent Next.js from caching or buffering the SSE stream
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SERVER = process.env.AGENT_SERVER_URL || "http://localhost:3001";

// SSE routes — stream body straight through
const SSE = new Set(["start-session","record-step","test-connection","verify-endpoint","agent-run"]);

// Map frontend action name → server route
const ROUTE: Record<string, string> = {
  "start-session":    "/api/start-session",
  "check-login":      "/api/check-login",
  "get-dom":          "/api/get-dom",
  "record-step":      "/api/record-step",
  "close-session":    "/api/close-session",
  "test-connection":  "/api/test-connection",
  "verify-endpoint":  "/api/verify-endpoint",
  "agent-run":        "/api/agent/run",
};

export async function POST(
  req: NextRequest, 
  props: { params: Promise<{ action: string }> } // <-- 1. Wrap params in a Promise type
) {
  const params = await props.params; // <-- 2. Await the params before accessing
  const action   = params.action;
  const upstream = ROUTE[action];

  if (!upstream) return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 });

  const body = await req.text();

  try {
    const up = await fetch(`${SERVER}${upstream}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (SSE.has(action)) {
      return new Response(up.body, {
        headers: {
          "Content-Type":      "text/event-stream",
          "Cache-Control":     "no-cache",
          "Connection":        "keep-alive", // <-- 3. Keep the stream open
          "X-Accel-Buffering": "no",
        },
      });
    }

    const json = await up.json();
    return NextResponse.json(json);

  } catch {
    const offline = "Session server offline. Run: npm run dev:agent";
    if (SSE.has(action)) {
      return new Response(
        `event: done\ndata: ${JSON.stringify({ success: false, error: offline })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }
    return NextResponse.json({ success: false, error: offline }, { status: 503 });
  }
}
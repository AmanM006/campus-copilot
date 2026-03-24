// app/api/session/[action]/route.ts
// ─── Unified proxy for all session server calls ───────────────────────────────
// Proxies:
//   POST /api/session/start      → POST http://localhost:3001/api/start-session
//   POST /api/session/check      → POST http://localhost:3001/api/check-login
//   POST /api/session/dom        → POST http://localhost:3001/api/get-dom
//   POST /api/session/record     → POST http://localhost:3001/api/record-step
//   POST /api/session/close      → POST http://localhost:3001/api/close-session
//
// SSE routes (start, record) pass the stream through.
// JSON routes (check, dom, close) return JSON.

import { NextRequest, NextResponse } from "next/server";

// CRITICAL: Prevent Next.js from caching or buffering the SSE stream
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow long-running connections (up to 5 mins)

const AGENT = process.env.AGENT_SERVER_URL || "http://localhost:3001";

const ROUTE_MAP: Record<string, string> = {
  start:  "/api/start-session",
  check:  "/api/check-login",
  dom:    "/api/get-dom",
  record: "/api/record-step",
  close:  "/api/close-session",
};

// SSE routes — stream body through
const SSE_ROUTES = new Set(["start", "record"]);

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ action: string }> } // <-- Note the Promise wrapper here
) {
  const params = await props.params; // <-- Await the params before destructuring
  const { action } = params;
  const upstream = ROUTE_MAP[action];

  if (!upstream) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 });
  }

  const body = await req.text();

  try {
    const upstreamRes = await fetch(`${AGENT}${upstream}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (SSE_ROUTES.has(action)) {
      // Pass SSE stream straight through
      return new Response(upstreamRes.body, {
        headers: {
          "Content-Type":      "text/event-stream",
          "Cache-Control":     "no-cache",
          "Connection":        "keep-alive", // <-- Keeps the stream open
          "X-Accel-Buffering": "no",
        },
      });
    }

    // JSON response
    const json = await upstreamRes.json();
    return NextResponse.json(json);

  } catch {
    const errMsg = "Session server offline. Run: npm run dev:agent";
    if (SSE_ROUTES.has(action)) {
      return new Response(
        `event: done\ndata: ${JSON.stringify({ success: false, error: errMsg })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }
    return NextResponse.json({ success: false, error: errMsg }, { status: 503 });
  }
}
// app/api/agent/run/route.ts
import { NextRequest } from "next/server";

const AGENT = process.env.AGENT_SERVER_URL || "http://localhost:3001";

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const upstream = await fetch(`${AGENT}/api/agent/run`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    // Pass the SSE stream straight through to the browser
    return new Response(upstream.body, {
      status:  200,
      headers: {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    const errPayload = JSON.stringify({
      success: false,
      error:   "Agent server not reachable. Run: cd server && npm install && node index.js",
    });
    return new Response(`event: done\ndata: ${errPayload}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}
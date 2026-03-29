// lib/queryRouter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Called inside handleSend BEFORE sending to the AI stream.
// Detects intent → fetches real data from DB → returns enriched contextData.
// Falls back to agent server if DB is empty.
// No rewrites needed in the API routes — this runs client-side.

import { supabase } from "./supabase";

const AGENT = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001")
  : "";

// ── Intent detection ──────────────────────────────────────────────────────────
const INTENTS: { action: string; patterns: RegExp[] }[] = [
  { action: "attendance",  patterns: [/attendance/i, /present/i, /absent/i, /\bbunk\b/i, /how many classes/i] },
  { action: "timetable",   patterns: [/timetable/i, /time.?table/i, /schedule/i, /class today/i, /today.*class/i, /class.*today/i, /when.*class/i] },
  { action: "exams",       patterns: [/\bexam\b/i, /\btest\b/i, /midsem/i, /endsem/i, /\bquiz\b/i, /upcoming.*exam/i] },
  { action: "grades",      patterns: [/\bgrades?\b/i, /\bmarks?\b/i, /\bcgpa\b/i, /\bgpa\b/i, /\bresult\b/i] },
  { action: "fees",        patterns: [/\bfees?\b/i, /payment/i, /\bdue\b/i] },
  { action: "documents",   patterns: [/\bnotes?\b/i, /document/i, /\bpdf\b/i, /material/i, /slides/i] },
  { action: "subjects",    patterns: [/\bsubject/i, /\bcourse/i, /enrolled/i] },
  { action: "lab",         patterns: [/\blab\b/i, /book.*slot/i, /slot.*book/i] },
];

export function detectIntent(query: string): string | null {
  for (const { action, patterns } of INTENTS) {
    if (patterns.some(p => p.test(query))) return action;
  }
  return null;
}

// ── Fetch attendance from DB ──────────────────────────────────────────────────
async function fetchAttendanceFromDB(studentId: string) {
  const { data } = await supabase
    .from("attendance")
    .select("attended, total, percentage, subjects(name, code)")
    .eq("student_id", studentId)
    .order("percentage", { ascending: true });

  return (data || []).map((r: any) => ({
    subject:    r.subjects?.code || "",
    name:       r.subjects?.name || "",
    percentage: Math.round(r.percentage || 0),
    attended:   r.attended || 0,
    total:      r.total    || 0,
    status:     (r.percentage >= 75) ? "safe" : (r.percentage >= 65) ? "risk" : "detained",
  }));
}

// ── Fetch from cached_data (raw agent output) ─────────────────────────────────
async function fetchFromCache(email: string, action: string) {
  const { data } = await supabase
    .from("cached_data")
    .select("data, updated_at")
    .eq("user_email", email)
    .eq("type", action)
    .maybeSingle();

  if (!data?.data) return null;
  const age = Date.now() - new Date(data.updated_at).getTime();
  return age < 6 * 3600000 ? data.data : null;  // only use if < 6h old
}

// ── Trigger agent for fresh data (async, non-blocking) ───────────────────────
async function fetchFromAgent(action: string, email: string): Promise<any[] | null> {
  if (!AGENT || !email) return null;
  try {
    const resp = await fetch(`${AGENT}/api/agent/run`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, email }),
      signal:  AbortSignal.timeout(30000),
    });
    if (!resp.ok || !resp.body) return null;

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = "", result: any = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { const p = JSON.parse(line.slice(6)); if ("success" in p && !("msg" in p)) result = p; } catch { /* skip */ }
      }
    }
    return result?.success ? result.data : null;
  } catch { return null; }
}

// ── Main: enrich contextData before AI call ───────────────────────────────────
/**
 * enrichContext — detects intent in the user query and injects real data.
 * @param query   user's message
 * @param studentId  e.g. "aman8_mitmpl2024"
 * @param email   e.g. "aman8.mitmpl2024@learner.manipal.edu"
 * @param baseContext  existing context from live hooks (already has attendance/exams)
 * @returns enriched contextData to pass to sendMessage
 */
export async function enrichContext(
  query:       string,
  studentId:   string,
  email:       string,
  baseContext: Record<string, any>
): Promise<{ contextData: Record<string, any>; action: string | null; source: string }> {
  const action = detectIntent(query);

  if (!action) {
    return { contextData: baseContext, action: null, source: "none" };
  }

  // If baseContext already has fresh data for this action, use it
  if (action === "attendance" && baseContext.attendance?.length > 0) {
    return { contextData: { ...baseContext, action_detected: action }, action, source: "hook" };
  }
  if (action === "exams" && baseContext.upcoming_exams?.length > 0) {
    return { contextData: { ...baseContext, action_detected: action }, action, source: "hook" };
  }

  // 1. Try DB
  let data: any = null;
  let source = "none";

  if (action === "attendance") {
    const rows = await fetchAttendanceFromDB(studentId);
    if (rows.length > 0) { data = rows; source = "db"; }
  }

  // 2. Try cached_data
  if (!data) {
    const cached = await fetchFromCache(email, action);
    if (cached) { data = cached; source = "cache"; }
  }

  // 3. Try agent (if DB and cache both empty)
  if (!data && AGENT && email) {
    data = await fetchFromAgent(action, email);
    if (data) source = "agent";
  }

  if (!data) {
    return {
      contextData: {
        ...baseContext,
        action_detected: action,
        data_unavailable: `${action} data not available — portal may need to be synced`,
      },
      action,
      source: "none",
    };
  }

  return {
    contextData: {
      ...baseContext,
      [action]: data,
      action_detected: action,
      data_source:     source,
    },
    action,
    source,
  };
}
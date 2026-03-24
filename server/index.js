// server/index.js — CampusCopilot Final Server
// Routes:
//   POST /api/otp/send            — send OTP via Supabase
//   POST /api/otp/verify          — verify OTP
//   POST /api/get-or-create-session — ensure session exists
//   POST /api/fetch-student-data  — run agent pipeline (SSE)
//   POST /api/agent/run           — run single action (SSE)
//   POST /api/sync-data           — background sync trigger
//   GET  /health
require('dotenv').config({ path: '../.env.local' });
// Add near the top of server/index.js
const SESSION_MAP = global.__cc_sessions || (global.__cc_sessions = new Map());
const express  = require("express");
const cors     = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { runAgentTask, fetchStudentData, getCached } = require("./agent/Orchestrator");
const agentRoutes = require("./routes/agentRoutes");
const app  = express();
const PORT = process.env.AGENT_PORT || 3001;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);
// Add this right before app.use("/api", ...)
app.use((req, res, next) => {
  console.log(`--> Incoming Request: ${req.method} ${req.url}`);
  next();
});
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "4mb" }));
app.use("/api", require("./routes/agentRoutes"));
app.get("/",       (_, res) => res.json({ status: "ok", service: "CampusCopilot Agent v4" }));
app.get("/health", (_, res) => res.json({ ok: true }));

// ── SSE setup ──────────────────────────────────────────────────────────────────
function sseSetup(res) {
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  
  // FIX: Handle both emit({type, msg}) AND emit(type, msg, group)
  const emit = (a, b, c) => {
    const entry = typeof a === "object" ? a : { type: a || "info", msg: b || a, group: c };
    res.write(`event: log\ndata: ${JSON.stringify({ ...entry, ts: entry.ts || new Date().toISOString() })}\n\n`);
  };
  const done = (p) => { res.write(`event: done\ndata: ${JSON.stringify(p)}\n\n`); res.end(); };
  return { emit, done };
}

// ══════════════════════════════════════════════════════════════════════════════
// OTP AUTH — Supabase handles email delivery
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/otp/send
// Body: { email }
// Checks users table first — only admin-imported users can request OTP
app.post("/api/otp/send", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  // ── Verify user is in the system ─────────────────────────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("id, email, role")
    .ilike("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!user) {
    return res.status(403).json({
      error:  "Access denied",
      reason: "Your email is not registered. Ask your college admin to add you in Admin → User Registry.",
    });
  }

  // ── Send OTP via Supabase Auth ────────────────────────────────────────────
  const { error } = await supabase.auth.signInWithOtp({
    email: email.toLowerCase().trim(),
    options: {
      shouldCreateUser: false,   // DO NOT auto-create — only pre-registered users
      emailRedirectTo: `${process.env.FRONTEND_URL || "http://localhost:3000"}/api/auth/callback`,
    },
  });

  if (error) {
    // If Supabase rejects because user doesn't exist in auth.users yet, create them
    if (error.message.includes("User not found") || error.status === 422) {
      // Admin-imported users may not be in auth.users yet — sign up then OTP
      await supabase.auth.admin.createUser({
        email:         email.toLowerCase().trim(),
        email_confirm: true,
      });
      const { error: retryErr } = await supabase.auth.signInWithOtp({
        email:   email.toLowerCase().trim(),
        options: { shouldCreateUser: false },
      });
      if (retryErr) return res.status(500).json({ error: retryErr.message });
    } else {
      return res.status(500).json({ error: error.message });
    }
  }

  res.json({ success: true, message: `OTP sent to ${email}` });
});

// POST /api/otp/verify
// Body: { email, token }
app.post("/api/otp/verify", async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) return res.status(400).json({ error: "email and token required" });

  const { data, error } = await supabase.auth.verifyOtp({
    email: email.toLowerCase().trim(),
    token,
    type:  "email",
  });

  if (error) return res.status(401).json({ error: "Invalid or expired OTP. Please try again." });

  // Fetch user profile from public.users
  const { data: user } = await supabase
    .from("users")
    .select("id, email, name, role, department, college_id")
    .ilike("email", email.toLowerCase().trim())
    .maybeSingle();

  res.json({ success: true, session: data.session, user });
});

// ══════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/get-or-create-session
// Body: { email, portalUrl? }
// SSE: streams setup logs
// POST /api/get-or-create-session
// Body: { email, portalUrl? }
// SSE: streams setup logs
app.post("/api/get-or-create-session", async (req, res) => {
  let { email, portalUrl, forceNew } = req.body;
  if (!email) email = "admin_setup@campuscopilot.local";
  const { emit, done } = sseSetup(res);

  let url = portalUrl;
  if (!url) {
    const { data: sess } = await supabase.from("portal_sessions").select("portal_url").eq("user_email", email).maybeSingle();
    url = sess?.portal_url;
  }
  if (!url) return done({ success: false, error: "No portal URL configured." });

  try {
    let loginAgent;
    try { loginAgent = require("./agents/loginAgent"); } 
    catch { loginAgent = require("./agent/loginAgent"); }

    // 1. If forcing a new login or session invalid, run the visible login window
    if (forceNew) {
        emit({ type: "info", msg: "Launching secure browser window for login…" });
        const waitRes = await loginAgent.waitForLogin(email, url, emit, 3000, 300000);
        if (!waitRes.success) return done({ success: false, error: waitRes.error });
    } else {
        const valid = await loginAgent.isSessionValid(email, url, emit);
        if (!valid) {
           emit({ type: "info", msg: "Session expired, launching login window…" });
           const waitRes = await loginAgent.waitForLogin(email, url, emit, 3000, 300000);
           if (!waitRes.success) return done({ success: false, error: waitRes.error });
        }
    }

    // 2. NOW that we have valid cookies, launch a page and KEEP IT OPEN
    emit({ type: "info", msg: "Connecting live session to UI..." });
    const { browser, ctx } = await loginAgent.restoreSession(email, emit);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "commit", timeout: 20000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});

    // 3. Save this live page to memory so agentRoutes.js can click things!
    const sessionId = "live_session";
    SESSION_MAP.set(sessionId, { browser, ctx, page, email });

    done({ 
        success: true, 
        sessionValid: true, 
        portalUrl: page.url(), 
        sessionId: sessionId,
        title: await page.title().catch(() => "Portal"),
        message: "Login detected!" 
    });

  } catch (err) {
    emit({ type: "error", msg: err.message });
    done({ success: false, error: err.message });
  }
});
// ══════════════════════════════════════════════════════════════════════════════
// DATA FETCH
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/fetch-student-data
// Body: { email, portalUrl?, forceRefresh? }
// SSE: streams agent logs + done({ results })
app.post("/api/fetch-student-data", async (req, res) => {
  const { email, portalUrl, forceRefresh = false } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  const { emit, done } = sseSetup(res);

  try {
    const results = await fetchStudentData({ email, portalUrl, forceRefresh, emit });
    done({ success: true, results });
  } catch (err) {
    emit({ type:"error", msg:err.message });
    done({ success:false, error:err.message });
  }
});

// POST /api/agent/run
// Body: { email, action, portalUrl?, forceRefresh? }
// SSE: streams agent logs + done({ data })
app.post("/api/agent/run", async (req, res) => {
  const { email, action, portalUrl, forceRefresh = false, studentId } = req.body;

  // Allow studentId as alias for email lookup
  let resolvedEmail = email;
  if (!resolvedEmail && studentId) {
    const { data: user } = await supabase.from("users").select("email").eq("id", studentId).maybeSingle();
    resolvedEmail = user?.email;
  }

  if (!resolvedEmail || !action) return res.status(400).json({ error: "email and action required" });

  const { emit, done } = sseSetup(res);

  try {
    const result = await runAgentTask({ action, email: resolvedEmail, portalUrl, forceRefresh, emit });
    done(result);
  } catch (err) {
    emit({ type:"error", msg:err.message });
    done({ success:false, error:err.message });
  }
});

// POST /api/sync-data
// Body: { email, actions? }
// Background sync — returns immediately, runs in background
app.post("/api/sync-data", async (req, res) => {
  const { email, actions = ["profile","attendance","timetable"] } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  // Acknowledge immediately
  res.json({ success: true, message: `Background sync started for ${email}`, actions });

  // Run in background (non-blocking)
  (async () => {
    for (const action of actions) {
      try {
        await runAgentTask({ action, email, forceRefresh: true, emit: () => {} });
      } catch (err) {
        console.error(`[sync] ${action} failed for ${email}:`, err.message);
      }
    }
    console.log(`[sync] Complete for ${email}`);
  })();
});

// POST /api/query-router (also handled by Next.js, this is a fallback)
app.post("/api/query-router", async (req, res) => {
  const { query, studentId, email } = req.body;
  const resolvedEmail = email || (studentId ? `${studentId}@placeholder.edu` : null);
  if (!query) return res.json({ action: null, data: null, source: "none" });

  const INTENTS = [
    { action:"attendance", patterns:[/attendance/i,/present/i,/absent/i,/bunk/i] },
    { action:"timetable",  patterns:[/timetable/i,/schedule/i,/class today/i] },
    { action:"subjects",   patterns:[/subject/i,/course/i,/enrolled/i] },
    { action:"grades",     patterns:[/grade/i,/marks/i,/cgpa/i,/result/i] },
  ];

  const action = INTENTS.find(i => i.patterns.some(p => p.test(query)))?.action || null;
  if (!action || !resolvedEmail) return res.json({ action, data: null, source: "none" });

  // Check DB cache first
  const cached = await getCached(resolvedEmail, action);
  if (cached) return res.json({ action, data: cached, source: "db" });

  // Try agent
  const result = await runAgentTask({ action, email: resolvedEmail, emit: () => {} });
  res.json({ action, data: result.data, source: result.fromCache ? "db" : "agent" });
});

app.listen(PORT, () => {
  console.log(`\n🚀  CampusCopilot Server v4  →  http://localhost:${PORT}`);
  console.log(`    POST /api/otp/send`);
  console.log(`    POST /api/otp/verify`);
  console.log(`    POST /api/get-or-create-session  (SSE)`);
  console.log(`    POST /api/fetch-student-data      (SSE)`);
  console.log(`    POST /api/agent/run               (SSE)`);
  console.log(`    POST /api/sync-data               (background)\n`);
});
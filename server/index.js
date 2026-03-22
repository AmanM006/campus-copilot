// server/index.js — CampusCopilot Dual-Integration Server v3
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const express  = require("express");
const cors     = require("cors");
const sm       = require("./SessionManager");
const ai       = require("./apiIntegration");
const { executeAction } = require("./executeAction");

const app  = express();
const PORT = process.env.AGENT_PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "4mb" }));

// ── SSE helper ─────────────────────────────────────────────────────────────────
function sseSetup(res) {
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const emit = (type, msg, extra = {}) =>
    res.write(`event: log\ndata: ${JSON.stringify({ type, msg, ts: new Date().toISOString(), ...extra })}\n\n`);
  const done = (payload) => {
    res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
    res.end();
  };
  return { emit, done };
}

app.get("/",       (_, res) => res.json({ status: "ok", service: "CampusCopilot Server v3" }));
app.get("/health", (_, res) => res.json({ ok: true }));

// ══════════════════════════════════════════════════════════════════════════════
// BROWSER AGENT ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/start-session
app.post("/api/start-session", async (req, res) => {
  const { portalUrl } = req.body;
  if (!portalUrl) return res.status(400).json({ error: "portalUrl required" });
  if (!/^https?:\/\//.test(portalUrl)) return res.status(400).json({ error: "Invalid URL" });

  const { emit, done } = sseSetup(res);
  try {
    const result = await sm.createSession({ portalUrl, emit });
    done({ success: true, ...result });
  } catch (err) {
    emit("error", err.message);
    done({ success: false, error: err.message });
  }
});

// POST /api/check-login
app.post("/api/check-login", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  try {
    const status = await sm.checkLoginStatus(sessionId);
    res.json({ success: true, ...status });
  } catch (err) {
    // Session expired or not found — safe failure
    res.json({ success: false, error: err.message, loggedIn: false });
  }
});

// POST /api/get-dom
app.post("/api/get-dom", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  try {
    const info = await sm.getDomInfo(sessionId);
    res.json({ success: true, ...info });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /api/record-step
app.post("/api/record-step", async (req, res) => {
  const { sessionId, label, selector } = req.body;
  if (!sessionId || !label) return res.status(400).json({ error: "sessionId and label required" });

  const { emit, done } = sseSetup(res);
  emit("info", `Clicking: "${label}"…`);
  try {
    const result = await sm.recordStep(sessionId, { label, selector });
    if (result.success) {
      emit("success", `Recorded: "${result.step.title}"`);
      done({ success: true, step: result.step });
    } else {
      emit("error", result.error);
      done({ success: false, error: result.error });
    }
  } catch (err) {
    emit("error", err.message);
    done({ success: false, error: err.message });
  }
});

// POST /api/close-session
app.post("/api/close-session", async (req, res) => {
  const { sessionId, actionName } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  try {
    let storagePath = null;
    try { storagePath = await sm.persistSession(sessionId); } catch { }
    const workflow = actionName ? sm.getWorkflow(sessionId, actionName) : null;
    await sm.destroySession(sessionId);
    res.json({ success: true, storagePath, workflow });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/sessions", (_, res) => res.json({ sessions: sm.listSessions() }));

// ══════════════════════════════════════════════════════════════════════════════
// API INTEGRATION ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/test-connection  — test a college's REST API
// Body: { baseUrl, apiKey, authType }
app.post("/api/test-connection", async (req, res) => {
  const { baseUrl, apiKey, authType } = req.body;
  if (!baseUrl) return res.status(400).json({ error: "baseUrl required" });

  const { emit, done } = sseSetup(res);
  try {
    const result = await ai.testConnection({ baseUrl, apiKey, authType, emit });
    done({ success: result.success, ...result });
  } catch (err) {
    emit("error", err.message);
    done({ success: false, error: err.message });
  }
});

// POST /api/verify-endpoint  — verify a specific endpoint
// Body: { baseUrl, endpoint, apiKey, authType }
app.post("/api/verify-endpoint", async (req, res) => {
  const { baseUrl, endpoint, apiKey, authType } = req.body;
  if (!baseUrl || !endpoint) return res.status(400).json({ error: "baseUrl and endpoint required" });

  const { emit, done } = sseSetup(res);
  try {
    const result = await ai.verifyEndpoint({ baseUrl, endpoint, apiKey, authType, emit });
    done({ success: result.success, ...result });
  } catch (err) {
    emit("error", err.message);
    done({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED ACTION EXECUTOR (hybrid API + agent)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/agent/run  — called by student chat
// Body: { action, studentId, collegeName, portalUrl?, email?, password? }
app.post("/api/agent/run", async (req, res) => {
  const { action, studentId, collegeName, portalUrl, email, password } = req.body;
  if (!action || !studentId) return res.status(400).json({ error: "action and studentId required" });

  const { emit, done } = sseSetup(res);

  try {
    const result = await executeAction({
      action, studentId, collegeName, portalUrl, email, password,
      emit: ({ type, msg, group, ts }) =>
        emit(type, msg, { group: group || "executor", ts }),
    });
    done(result);
  } catch (err) {
    emit("error", `Fatal: ${err.message}`);
    done({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀  CampusCopilot Server v3  →  http://localhost:${PORT}`);
  console.log(`    ── Browser Agent ──`);
  console.log(`    POST /api/start-session`);
  console.log(`    POST /api/check-login`);
  console.log(`    POST /api/get-dom`);
  console.log(`    POST /api/record-step`);
  console.log(`    POST /api/close-session`);
  console.log(`    ── API Integration ──`);
  console.log(`    POST /api/test-connection`);
  console.log(`    POST /api/verify-endpoint`);
  console.log(`    ── Unified ──`);
  console.log(`    POST /api/agent/run\n`);
});
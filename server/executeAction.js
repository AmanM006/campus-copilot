// server/executeAction.js
// ─── Unified action executor ──────────────────────────────────────────────────
// Strategy:
//   1. If integrationConfig exists AND type is "api"  → call API directly
//   2. If integrationConfig exists AND type is "agent" → run Playwright workflow
//   3. If type is "hybrid" → try API first, fallback to Playwright
// Called at runtime from /api/agent/run with a student query context.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const { executeApiAction }                        = require("./apiIntegration");
const { runAgentTask }                            = require("./agent/core");
const { createClient }                            = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// ── loadIntegrationConfig ─────────────────────────────────────────────────────
// Fetches the integration config for a college from Supabase.
async function loadIntegrationConfig(collegeName) {
  const { data } = await supabase
    .from("integration_sources")
    .select("*")
    .eq("college_name", collegeName)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ── loadWorkflow ──────────────────────────────────────────────────────────────
async function loadWorkflow(action) {
  const { data } = await supabase
    .from("agent_workflows")
    .select("*")
    .eq("action_name", action)
    .limit(1)
    .maybeSingle();
  return data;
}

// ── executeAction ─────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string}   opts.action        e.g. "attendance"
 * @param {string}   opts.studentId
 * @param {string}   opts.collegeName
 * @param {string}   opts.portalUrl     (for agent mode)
 * @param {string}   opts.email         (for agent mode)
 * @param {string}   opts.password      (for agent mode)
 * @param {Function} opts.emit          (type, msg) => void
 */
async function executeAction({ action, studentId, collegeName, portalUrl, email, password, emit }) {
  const log = (type, msg) => emit?.({ type, msg, group: "executor", ts: new Date().toISOString() });

  // ── Load integration config ────────────────────────────────────────────────
  log("info", `Loading integration config for ${collegeName}…`);
  const config = await loadIntegrationConfig(collegeName);

  if (!config) {
    log("warn", "No integration found — attempting generic agent run");
    return runWithAgent({ action, studentId, portalUrl, email, password, emit, workflow: null });
  }

  const intType = config.integration_type || config.portal_type || "agent";
  log("info", `Integration mode: ${intType.toUpperCase()}`);

  // ── API mode ───────────────────────────────────────────────────────────────
  if (intType === "api") {
    return executeApiAction({
      action,
      config: config.api_config || config,
      studentId,
      emit: (type, msg) => emit?.({ type, msg, group: "api", ts: new Date().toISOString() }),
    });
  }

  // ── Agent mode ─────────────────────────────────────────────────────────────
  if (intType === "agent") {
    const workflow = await loadWorkflow(action);
    return runWithAgent({ action, studentId, portalUrl: config.portal_url || portalUrl, email, password, emit, workflow });
  }

  // ── Hybrid mode ───────────────────────────────────────────────────────────
  if (intType === "hybrid") {
    log("info", "Hybrid mode: trying API first…");

    if (config.api_config?.baseUrl) {
      const apiResult = await executeApiAction({
        action,
        config: config.api_config,
        studentId,
        emit: (type, msg) => emit?.({ type, msg, group: "api", ts: new Date().toISOString() }),
      });
      if (apiResult.success) return apiResult;
      log("warn", "API failed — falling back to browser agent");
    }

    const workflow = await loadWorkflow(action);
    return runWithAgent({ action, studentId, portalUrl: config.portal_url || portalUrl, email, password, emit, workflow });
  }

  log("error", `Unknown integration type: ${intType}`);
  return { success: false, error: `Unknown integration type: ${intType}` };
}

// ── runWithAgent ──────────────────────────────────────────────────────────────
async function runWithAgent({ action, studentId, portalUrl, email, password, emit, workflow }) {
  if (!portalUrl || !email) {
    return { success: false, error: "Portal URL and email required for agent mode" };
  }

  const { runAgentTask } = require("./agent/core");
  return runAgentTask({
    action,
    portalUrl,
    email,
    password,
    userId: studentId,
    workflow,
    emit,
  });
}

module.exports = { executeAction, loadIntegrationConfig };
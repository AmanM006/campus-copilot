// server/agents/navigationAgent.js
// ─── Navigation Agent ─────────────────────────────────────────────────────────
// Responsibility: execute DB-stored workflows using safeClick + retry logic.
// All navigation is DATA-DRIVEN — no hardcoded selectors.
// Workflows are read from the agent_workflows Supabase table.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// ══════════════════════════════════════════════════════════════════════════════
// SAFE INTERACTION PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * safeClick — tries role → text → aria → css for every label.
 * Returns true on first success, false if all fail.
 */
async function safeClick(page, labels, opts = {}) {
  const { timeout = 5000, emit = () => {} } = opts;

  for (const label of labels) {
    const strategies = [
      { name: "role-link",    fn: () => page.getByRole("link",     { name: new RegExp(label, "i") }).first().click({ timeout }) },
      { name: "role-button",  fn: () => page.getByRole("button",   { name: new RegExp(label, "i") }).first().click({ timeout }) },
      { name: "role-menu",    fn: () => page.getByRole("menuitem", { name: new RegExp(label, "i") }).first().click({ timeout }) },
      { name: "getByText",    fn: () => page.getByText(new RegExp(label, "i")).first().click({ timeout }) },
      { name: "aria-label",   fn: () => page.locator(`[aria-label*="${label}" i]`).first().click({ timeout: 3000 }) },
      { name: "a-text",       fn: () => page.locator(`a:has-text("${label}")`).first().click({ timeout: 3000 }) },
      { name: "button-text",  fn: () => page.locator(`button:has-text("${label}")`).first().click({ timeout: 3000 }) },
      { name: "title-attr",   fn: () => page.locator(`[title*="${label}" i]`).first().click({ timeout: 3000 }) },
      { name: "li-a",         fn: () => page.locator(`li:has-text("${label}") a`).first().click({ timeout: 3000 }) },
    ];

    for (const s of strategies) {
      try {
        await s.fn();
        emit({ type: "success", msg: `Clicked "${label}" [${s.name}]`, group: "navigation" });
        return true;
      } catch { /* try next strategy */ }
    }
  }

  emit({ type: "error", msg: `safeClick failed for labels: [${labels.join(", ")}]`, group: "navigation" });
  return false;
}

/**
 * safeType — fills a field by label/placeholder/name/type with fallback chain.
 */
async function safeType(page, labelHints, value, opts = {}) {
  const { timeout = 4000, emit = () => {} } = opts;
  const strategies = [];

  for (const hint of labelHints) {
    strategies.push(
      () => page.getByLabel(new RegExp(hint, "i")).first().fill(value, { timeout }),
      () => page.getByPlaceholder(new RegExp(hint, "i")).first().fill(value, { timeout }),
      () => page.locator(`[name="${hint}"]`).first().fill(value, { timeout }),
      () => page.locator(`input[type="${hint}"]`).first().fill(value, { timeout }),
    );
  }
  strategies.push(() => page.locator("input").first().fill(value, { timeout }));

  for (const s of strategies) {
    try { await s(); emit({ type: "success", msg: `Typed value into field`, group: "navigation" }); return true; }
    catch { /* next */ }
  }
  emit({ type: "error", msg: "safeType failed — no matching input found", group: "navigation" });
  return false;
}

/**
 * safeWait — waits for text or selector with timeout.
 */
async function safeWait(page, text, opts = {}) {
  const { timeout = 10000, emit = () => {} } = opts;
  try {
    await page.waitForSelector(`text=${text}`, { timeout });
    emit({ type: "success", msg: `Waited for: "${text}"`, group: "navigation" });
    return true;
  } catch {
    // Try CSS fallback
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
      emit({ type: "warn", msg: `"${text}" not found but page settled`, group: "navigation" });
      return true;
    } catch {
      emit({ type: "error", msg: `safeWait timeout for: "${text}"`, group: "navigation" });
      return false;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WORKFLOW ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getWorkflow — load workflow from Supabase agent_workflows table.
 */
async function getWorkflow(actionName) {
  const { data, error } = await supabase
    .from("agent_workflows")
    .select("*")
    .eq("action_name", actionName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error("[getWorkflow]", error);
  return data;
}

/**
 * runWorkflowRobust — execute each step with up to 3 retries.
 * Steps are loaded from the agent_workflows table (JSON steps array).
 * 
 * Step schema:
 *   { type: "click", labels: ["Academics", "My Academics"] }
 *   { type: "wait",  text: "Attendance Summary" }
 *   { type: "type",  labels: ["search", "email"], value: "..." }
 *   { type: "navigate", url: "/dashboard/attendance" }
 */
async function runWorkflowRobust(page, workflow, emit = () => {}) {
  if (!workflow?.steps?.length) {
    throw new Error(`Workflow "${workflow?.action_name || "unknown"}" has no steps`);
  }

  emit({ type: "info", msg: `Running workflow: "${workflow.action_name}" (${workflow.steps.length} steps)`, group: "navigation" });

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    emit({ type: "info", msg: `Step ${i + 1}/${workflow.steps.length}: ${step.type} ${step.labels?.join("/") || step.text || step.url || ""}`, group: "navigation" });

    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (step.type === "click") {
          success = await safeClick(page, step.labels || [], { emit });
          if (!success) throw new Error("safeClick returned false");
        }
        else if (step.type === "wait") {
          success = await safeWait(page, step.text, { emit });
        }
        else if (step.type === "type") {
          success = await safeType(page, step.labels || [], step.value || "", { emit });
        }
        else if (step.type === "navigate") {
          await page.goto(step.url, { waitUntil: "commit", timeout: 15000 });
          await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
          success = true;
          emit({ type: "success", msg: `Navigated to ${step.url}`, group: "navigation" });
        }
        else if (step.type === "wait_nav") {
          try { await page.waitForLoadState("networkidle", { timeout: step.timeout || 8000 }); }
          catch { await page.waitForTimeout(step.timeout || 1000); }
          success = true;
        }

        if (success) break;
      } catch (err) {
        if (attempt < 3) {
          emit({ type: "warn", msg: `Step ${i + 1} attempt ${attempt} failed: ${err.message} — retrying…`, group: "navigation" });
          await page.waitForTimeout(1000 * attempt);
        } else {
          emit({ type: "error", msg: `Step ${i + 1} failed after 3 attempts: ${err.message}`, group: "navigation" });
          throw new Error(`Workflow step ${i + 1} failed: ${JSON.stringify(step)}`);
        }
      }
    }

    // Brief pause between steps to let page settle
    await page.waitForTimeout(400);
  }

  emit({ type: "success", msg: `Workflow "${workflow.action_name}" complete`, group: "navigation" });
}

// ─────────────────────────────────────────────────────────────────────────────
// navigationAgent — main entry
// ─────────────────────────────────────────────────────────────────────────────
async function navigationAgent(page, action, emit = () => {}) {
  const workflow = await getWorkflow(action);

  if (!workflow) {
    const msg = `No workflow found for "${action}". Admin must train this in Admin → AI Workflows.`;
    emit({ type: "error", msg, group: "navigation" });
    throw new Error(msg);
  }

  await runWorkflowRobust(page, workflow, emit);
  return workflow;
}

module.exports = { navigationAgent, safeClick, safeType, safeWait, getWorkflow, runWorkflowRobust };
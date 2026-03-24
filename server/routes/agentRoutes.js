// server/routes/agentRoutes.js
// ─── Agent session routes ─────────────────────────────────────────────────────
// These are the Express routes called by useIntegration.ts.
// /api/record-step   — real safeClick via Playwright on existing session
// /api/navigate-to   — navigate the session browser to a URL (for step deletion)
// /api/save-workflow — persist workflow to Supabase agent_workflows table
// /api/get-dom       — return clickables from current page state
//
// Existing routes (get-or-create-session, check-login) unchanged.

const express    = require("express");
const router     = express.Router();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// In-memory session store (keyed by sessionId)
// In production use Redis or Supabase
const SESSION_MAP = global.__cc_sessions || (global.__cc_sessions = new Map());

// ── /api/record-step ──────────────────────────────────────────────────────────
// Calls safeClick on the live Playwright page for the session.
// Returns: { success, strategy, urlAfter, selector }
router.post("/record-step", async (req, res) => {
  const { sessionId, label, selector } = req.body;

  if (!label?.trim()) {
    return res.json({ success: false, error: "Label is required" });
  }

  const sess = SESSION_MAP.get(sessionId);
  if (!sess?.page) {
    return res.json({ success: false, error: "Session not found — please reconnect" });
  }

  const { page } = sess;
  const trimmed = label.trim();

  // safeClick — 9 strategies, no whitelist
  const strategies = [
    { name: "role-link",   fn: () => page.getByRole("link",     { name: new RegExp(trimmed, "i") }).first().click({ timeout: 5000 }) },
    { name: "role-button", fn: () => page.getByRole("button",   { name: new RegExp(trimmed, "i") }).first().click({ timeout: 5000 }) },
    { name: "role-menu",   fn: () => page.getByRole("menuitem", { name: new RegExp(trimmed, "i") }).first().click({ timeout: 5000 }) },
    { name: "getByText",   fn: () => page.getByText(new RegExp(trimmed, "i")).first().click({ timeout: 5000 }) },
    { name: "aria-label",  fn: () => page.locator(`[aria-label*="${trimmed}" i]`).first().click({ timeout: 3000 }) },
    { name: "a-text",      fn: () => page.locator(`a:has-text("${trimmed}")`).first().click({ timeout: 3000 }) },
    { name: "button-text", fn: () => page.locator(`button:has-text("${trimmed}")`).first().click({ timeout: 3000 }) },
    { name: "title-attr",  fn: () => page.locator(`[title*="${trimmed}" i]`).first().click({ timeout: 3000 }) },
    { name: "li-a",        fn: () => page.locator(`li:has-text("${trimmed}") a`).first().click({ timeout: 3000 }) },
  ];

  // Also try exact selector if provided
  if (selector) {
    strategies.unshift({ name: "explicit-selector", fn: () => page.locator(selector).first().click({ timeout: 3000 }) });
  }

  let usedStrategy = null;
  for (const s of strategies) {
    try {
      await s.fn();
      usedStrategy = s.name;
      break;
    } catch { /* try next */ }
  }

  if (!usedStrategy) {
    return res.json({
      success: false,
      error: `Could not find "${trimmed}" on the page. Check the exact visible text — it's case-insensitive.`,
    });
  }

  // Wait for page to settle after click
  try { await page.waitForLoadState("networkidle", { timeout: 6000 }); }
  catch { await page.waitForTimeout(800); }

  const urlAfter = page.url();

  return res.json({ success: true, strategy: usedStrategy, urlAfter });
});

// ── /api/navigate-to ─────────────────────────────────────────────────────────
// Navigate the browser to a specific URL (used when deleting a step).
router.post("/navigate-to", async (req, res) => {
  const { sessionId, url } = req.body;

  const sess = SESSION_MAP.get(sessionId);
  if (!sess?.page) return res.json({ success: false, error: "Session not found" });

  try {
    await sess.page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    return res.json({ success: true, url: sess.page.url() });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ── /api/get-dom ─────────────────────────────────────────────────────────────
// Returns the current page URL and clickable elements.
router.post("/get-dom", async (req, res) => {
  const { sessionId } = req.body;

  const sess = SESSION_MAP.get(sessionId);
  if (!sess?.page) return res.json({ success: false, error: "Session not found" });

  try {
    const url   = sess.page.url();
    const title = await sess.page.title();

    const clickables = await sess.page.evaluate(() => {
      const els = [
        ...document.querySelectorAll("a[href], button, [role='menuitem'], [role='tab'], nav li, .nav-item, .sidebar a"),
      ];
      return els
        .map(el => ({
          tag:  el.tagName,
          text: el.innerText?.trim().slice(0, 40) || el.getAttribute("aria-label") || "",
          href: el.getAttribute("href") || "",
        }))
        .filter(e => e.text.length > 0)
        .slice(0, 40);
    });

    return res.json({ success: true, url, title, screenshot: "", clickables });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ── /api/save-workflow ────────────────────────────────────────────────────────
// Saves recorded steps to Supabase agent_workflows table.
router.post("/save-workflow", async (req, res) => {
  const { sessionId, actionName, steps, portalUrl } = req.body;

  if (!steps?.length) return res.json({ success: false, error: "No steps to save" });

  try {
    const { error } = await supabase.from("agent_workflows").upsert({
      action_name:  actionName || "workflow",
      steps:        steps,
      portal_url:   portalUrl || "",
      created_at:  new Date().toISOString(),
    }, { onConflict: "action_name" });

    if (error) throw error;

    return res.json({ success: true, saved: steps.length });
  } catch (err) {
    console.error("[save-workflow]", err);
    return res.json({ success: false, error: err.message });
  }
});

module.exports = router;
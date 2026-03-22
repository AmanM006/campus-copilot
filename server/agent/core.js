// server/agent/core.js
// ─── Adaptive AI Browser Agent — CampusCopilot ───────────────────────────────
// Architecture: 3 specialised agents (Login, Navigation, Extraction)
//   orchestrated by runAgentTask().
// Session persistence: saves cookies/localStorage to session.json per user.
// Adaptive selectors: role → text → aria → css fallback chains.
// Error recovery: retry + alternate selector + screenshot → vision fallback.
// All major steps emit real-time logs via the `emit` callback (SSE-friendly).

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");

// ── Session storage dir ────────────────────────────────────────────────────────
const SESSION_DIR = path.join(__dirname, "..", "sessions");
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const sessionPath = (userId) =>
  path.join(SESSION_DIR, `session_${userId.replace(/[^a-z0-9]/gi, "_")}.json`);

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE SELECTOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * safeClick — tries multiple label variants using role → text → aria → css.
 * @param {import('playwright').Page} page
 * @param {string[]} labels   e.g. ["Attendance", "View Attendance", "My Attendance"]
 * @param {object}   opts     { timeout, emit }
 */
async function safeClick(page, labels, opts = {}) {
  const { timeout = 5000, emit = () => {} } = opts;

  for (const label of labels) {
    const strategies = [
      () => page.getByRole("link",   { name: new RegExp(label, "i") }).first().click({ timeout }),
      () => page.getByRole("button", { name: new RegExp(label, "i") }).first().click({ timeout }),
      () => page.getByRole("menuitem", { name: new RegExp(label, "i") }).first().click({ timeout }),
      () => page.getByText(new RegExp(label, "i")).first().click({ timeout }),
      () => page.locator(`[aria-label*="${label}" i]`).first().click({ timeout }),
      () => page.locator(`a:has-text("${label}")`).first().click({ timeout }),
      () => page.locator(`button:has-text("${label}")`).first().click({ timeout }),
      () => page.locator(`[title*="${label}" i]`).first().click({ timeout }),
      () => page.locator(`li:has-text("${label}") a`).first().click({ timeout }),
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        await strategies[i]();
        emit({ type: "success", msg: `Clicked "${label}" (strategy ${i + 1})`, detail: label });
        return true;
      } catch { /* try next */ }
    }
  }

  emit({ type: "error", msg: `All selectors failed for: [${labels.join(", ")}]`, detail: "failover" });
  return false;
}

/**
 * safeFill — fills a field by label/placeholder/name/type priority chain.
 */
async function safeFill(page, value, hints = {}, opts = {}) {
  const { timeout = 4000, emit = () => {} } = opts;
  const { type, name, placeholder, label } = hints;

  const strategies = [
    label       && (() => page.getByLabel(new RegExp(label, "i")).first().fill(value, { timeout })),
    placeholder && (() => page.getByPlaceholder(new RegExp(placeholder, "i")).first().fill(value, { timeout })),
    name        && (() => page.locator(`[name="${name}"]`).first().fill(value, { timeout })),
    type        && (() => page.locator(`input[type="${type}"]`).first().fill(value, { timeout })),
    (() => page.locator("input").first().fill(value, { timeout })),
  ].filter(Boolean);

  for (const s of strategies) {
    try { await s(); return true; } catch { /* next */ }
  }

  emit({ type: "error", msg: "Could not fill field", detail: JSON.stringify(hints) });
  return false;
}

/**
 * robustAction — retry wrapper with exponential back-off.
 */
async function robustAction(fn, { retries = 3, baseDelay = 800, emit = () => {} } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      emit({ type: "warn", msg: `Retry ${attempt}/${retries - 1}…`, detail: err.message });
      await new Promise(r => setTimeout(r, baseDelay * attempt));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function isSessionValid(browser, storagePath, portalUrl, emit) {
  if (!fs.existsSync(storagePath)) return false;

  emit({ type: "info", msg: "Found saved session — validating…", group: "login" });
  try {
    const ctx  = await browser.newContext({ storageState: storagePath });
    const page = await ctx.newPage();
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    const url = page.url().toLowerCase();
    await ctx.close();

    const isLoggedOut = url.includes("login") || url.includes("signin") || url.includes("auth");
    if (!isLoggedOut) {
      emit({ type: "success", msg: "Session still valid — skipping login", group: "login" });
      return true;
    }
    emit({ type: "warn", msg: "Session expired — will re-authenticate", group: "login" });
    return false;
  } catch {
    return false;
  }
}

async function saveSession(context, userId, emit) {
  const sp = sessionPath(userId);
  try {
    await context.storageState({ path: sp });
    emit({ type: "success", msg: "Session saved for future requests", group: "login" });
  } catch (e) {
    emit({ type: "warn", msg: "Could not persist session", detail: e.message, group: "login" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT 1 — LOGIN AGENT
// ═══════════════════════════════════════════════════════════════════════════════

async function loginAgent({ page, email, password, emit }) {
  emit({ type: "info",  msg: "Locating login form…",        group: "login" });

  // Fill email / username
  const emailOk = await safeFill(page, email, { type: "email", name: "email", label: "email", placeholder: "email" }, { emit });
  if (!emailOk) {
    // Try username fields
    await safeFill(page, email, { type: "text", name: "username", label: "username", placeholder: "username" }, { emit });
  }

  emit({ type: "info",  msg: "Filling credentials…",        group: "login" });
  await safeFill(page, password, { type: "password", name: "password", label: "password" }, { emit });

  // Submit
  emit({ type: "info",  msg: "Submitting login form…",      group: "login" });
  const submitted = await safeClick(page, ["Login", "Sign In", "Log In", "Submit", "Enter"], { emit });
  if (!submitted) {
    // Last resort: press Enter
    await page.keyboard.press("Enter");
  }

  // Wait for navigation
  try { await page.waitForLoadState("networkidle", { timeout: 12000 }); }
  catch { /* portal may never reach networkidle */ }

  const postUrl = page.url().toLowerCase();
  if (postUrl.includes("login") || postUrl.includes("signin")) {
    emit({ type: "error", msg: "Login appears to have failed — check credentials", group: "login" });
    return false;
  }

  emit({ type: "success", msg: "Authenticated successfully", group: "login" });
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT 2 — NAVIGATION AGENT
// ═══════════════════════════════════════════════════════════════════════════════

async function navigationAgent({ page, workflow, emit }) {
  emit({ type: "info", msg: `Running workflow: ${workflow.action_name}`, group: "navigation" });

  for (const step of workflow.steps) {
    emit({ type: "info", msg: `Navigating: ${step.path}`, group: "navigation" });

    // Steps can have a "labels" array (from teach mode) or be inferred from path
    const labels = step.labels || step.path.split(/[→>\/]/).map(s => s.trim()).filter(Boolean);

    const ok = await safeClick(page, labels, { emit });
    if (!ok) {
      // Try direct URL navigation if available
      if (step.url) {
        emit({ type: "warn", msg: `Click failed — trying direct URL: ${step.url}`, group: "navigation" });
        await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 12000 });
      } else {
        emit({ type: "error", msg: `Could not navigate to "${step.path}". Re-train workflow?`, group: "navigation" });
        return false;
      }
    }

    // Wait for page to settle
    try { await page.waitForLoadState("networkidle", { timeout: 6000 }); }
    catch { await page.waitForTimeout(1000); }

    emit({ type: "success", msg: `Reached: ${step.path}`, group: "navigation" });
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT 3 — EXTRACTION AGENT
// ═══════════════════════════════════════════════════════════════════════════════

async function extractionAgent({ page, action, workflow, emit }) {
  emit({ type: "info", msg: `Extracting data for: ${action}`, group: "extraction" });

  const hint = workflow?.steps?.[workflow.steps.length - 1]?.fieldHint || "";
  emit({ type: "info", msg: `Using hint: "${hint || "auto-detect"}"`, group: "extraction" });

  const result = {};

  if (action === "attendance") {
    result.data = await extractAttendanceTable(page, emit);
  } else if (action === "grades") {
    result.data = await extractGradesTable(page, emit);
  } else if (action === "timetable") {
    result.data = await extractTimetable(page, emit);
  } else if (action === "fees") {
    result.data = await extractFees(page, emit);
  } else {
    // Generic: extract all visible text + tables
    result.data = await extractGeneric(page, emit);
  }

  if (!result.data || (Array.isArray(result.data) && result.data.length === 0)) {
    emit({ type: "warn", msg: "No structured data found — returning page text", group: "extraction" });
    result.raw = (await page.evaluate(() => document.body.innerText)).slice(0, 3000);
  }

  emit({ type: "success", msg: `Extracted ${Array.isArray(result.data) ? result.data.length + " records" : "data"}`, group: "extraction" });
  return result;
}

// Attendance table parser
async function extractAttendanceTable(page, emit) {
  emit({ type: "info", msg: "Scanning for attendance table…", group: "extraction" });
  try {
    return await page.evaluate(() => {
      const rows = [];
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const trs = table.querySelectorAll("tr");
        for (const tr of trs) {
          const cells = [...tr.querySelectorAll("td,th")].map(c => c.innerText.trim());
          if (cells.length >= 3) {
            const text = cells.join(" ").toLowerCase();
            if (text.match(/\d+\s*%/) || text.includes("attendance") || text.match(/\d+\/\d+/)) {
              rows.push(cells);
            }
          }
        }
      }
      return rows;
    });
  } catch (e) {
    emit({ type: "error", msg: "Table extraction failed", detail: e.message, group: "extraction" });
    return [];
  }
}

// Grades parser
async function extractGradesTable(page, emit) {
  emit({ type: "info", msg: "Scanning for grades table…", group: "extraction" });
  try {
    return await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll("table tr").forEach(tr => {
        const cells = [...tr.querySelectorAll("td,th")].map(c => c.innerText.trim());
        if (cells.some(c => /[A-F][+\-]?|[0-9]{1,3}/.test(c)) && cells.length >= 2) {
          rows.push(cells);
        }
      });
      return rows;
    });
  } catch { return []; }
}

// Timetable parser
async function extractTimetable(page, emit) {
  emit({ type: "info", msg: "Scanning for timetable…", group: "extraction" });
  try {
    return await page.evaluate(() => {
      const text = document.body.innerText;
      const timeSlots = text.match(/\d{1,2}:\d{2}\s*(AM|PM)?[\s\S]{0,100}(?:Mon|Tue|Wed|Thu|Fri|Sat)/gi) || [];
      return timeSlots.slice(0, 30);
    });
  } catch { return []; }
}

// Fees parser
async function extractFees(page, emit) {
  emit({ type: "info", msg: "Scanning for fee information…", group: "extraction" });
  try {
    return await page.evaluate(() => {
      const text = document.body.innerText;
      const matches = text.match(/(?:total|due|paid|fee|amount)[\s:₹$]*[\d,]+(?:\.\d{2})?/gi) || [];
      return matches.slice(0, 10);
    });
  } catch { return []; }
}

// Generic extractor
async function extractGeneric(page, emit) {
  return page.evaluate(() =>
    [...document.querySelectorAll("table tr")]
      .slice(0, 50)
      .map(tr => [...tr.querySelectorAll("td,th")].map(c => c.innerText.trim()))
      .filter(row => row.length > 1 && row.some(c => c.length > 0))
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL AI FALLBACK (screenshot → detect element via Claude)
// ═══════════════════════════════════════════════════════════════════════════════

async function visualFallback({ page, targetLabel, emit }) {
  emit({ type: "warn", msg: `Visual AI fallback activated — searching for "${targetLabel}"`, group: "vision" });

  try {
    const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
    const b64 = screenshot.toString("base64");

    // Call Claude vision to locate the element
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text",  text: `I need to find and click "${targetLabel}" on this webpage. What is the exact visible text of the button or link I should click? Respond with ONLY the text label, nothing else.` },
          ],
        }],
      }),
    });

    const data = await response.json();
    const detectedText = data?.content?.[0]?.text?.trim();

    if (detectedText) {
      emit({ type: "info", msg: `Vision detected: "${detectedText}" — attempting click`, group: "vision" });
      const ok = await safeClick(page, [detectedText], { emit });
      if (ok) {
        emit({ type: "success", msg: `Visual AI found and clicked "${detectedText}"`, group: "vision" });
        return true;
      }
    }
  } catch (e) {
    emit({ type: "error", msg: `Visual AI failed: ${e.message}`, group: "vision" });
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFLOW RECORDER — stores what gets clicked for auto-generation
// ═══════════════════════════════════════════════════════════════════════════════

function createRecorder(page) {
  const recorded = [];

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      recorded.push({ type: "navigation", url: frame.url(), timestamp: Date.now() });
    }
  });

  // Inject click tracker into page
  page.addInitScript(() => {
    window.__cc_clicks = [];
    document.addEventListener("click", (e) => {
      const el = e.target;
      window.__cc_clicks.push({
        tag:         el.tagName,
        text:        el.innerText?.trim().slice(0, 80),
        id:          el.id,
        name:        el.getAttribute("name"),
        ariaLabel:   el.getAttribute("aria-label"),
        href:        el.href,
        timestamp:   Date.now(),
      });
    }, true);
  });

  const getRecording = async () => {
    const clicks = await page.evaluate(() => window.__cc_clicks || []);
    return { clicks, navigations: recorded };
  };

  return { getRecording };
}

/**
 * Generate workflow JSON from a recording.
 */
function recordingToWorkflow(recording, actionName) {
  const steps = recording.navigations
    .filter(n => !n.url.includes("login") && !n.url.includes("signin"))
    .map((nav, i) => {
      const matchingClick = recording.clicks.find(
        c => c.href && nav.url.includes(c.href?.split("?")[0])
      );
      return {
        path:    matchingClick?.text || nav.url,
        url:     nav.url,
        labels:  matchingClick ? [matchingClick.text, matchingClick.ariaLabel].filter(Boolean) : [],
      };
    });

  return {
    action_name: actionName,
    steps,
    recorded_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — runAgentTask
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point.
 * @param {object} opts
 * @param {string}   opts.action       e.g. "attendance"
 * @param {string}   opts.portalUrl    portal login URL
 * @param {string}   opts.email
 * @param {string}   opts.password
 * @param {string}   opts.userId       used for session file naming
 * @param {object}   opts.workflow     from agent_workflows table (steps[])
 * @param {Function} opts.emit         (logEntry) => void  — real-time log callback
 */
async function runAgentTask({ action, portalUrl, email, password, userId, workflow, emit }) {
  const log = (type, msg, detail = "", group = "system") => {
    emit({ type, msg, detail, group, ts: new Date().toISOString() });
  };

  const sp = sessionPath(userId);
  let browser;

  try {
    // ── 1. LAUNCH ──────────────────────────────────────────────────────────────
    log("info", "Launching browser…", "", "system");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    // ── 2. SESSION CHECK ───────────────────────────────────────────────────────
    const valid  = await isSessionValid(browser, sp, portalUrl, (e) => log(e.type, e.msg, e.detail || "", "login"));
    const ctxOpts = valid && fs.existsSync(sp) ? { storageState: sp } : {};
    const context = await browser.newContext({
      ...ctxOpts,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    if (valid) {
      log("success", "Session restored — no login needed", "", "login");
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    } else {
      // ── 3. LOGIN ─────────────────────────────────────────────────────────────
      log("info", `Opening portal: ${portalUrl}`, "", "login");
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      log("success", `Portal loaded: ${await page.title()}`, "", "login");

      const loggedIn = await loginAgent({ page, email, password, emit: (e) => log(e.type, e.msg, e.detail || "", "login") });
      if (!loggedIn) {
        return { success: false, error: "Login failed — check credentials or 2FA", logs: [] };
      }

      await saveSession(context, userId, (e) => log(e.type, e.msg, e.detail || "", "login"));
    }

    // ── 4. NAVIGATION ──────────────────────────────────────────────────────────
    if (workflow?.steps?.length) {
      log("info", "Starting navigation…", "", "navigation");
      const navOk = await robustAction(
        () => navigationAgent({ page, workflow, emit: (e) => log(e.type, e.msg, e.detail || "", "navigation") }),
        { retries: 2, emit: (e) => log(e.type, e.msg, e.detail || "", "navigation") }
      );

      if (!navOk) {
        // Vision fallback: try to find the relevant section via screenshot
        const firstLabel = workflow.steps[0]?.labels?.[0] || action;
        const visOk = await visualFallback({
          page, targetLabel: firstLabel,
          emit: (e) => log(e.type, e.msg, e.detail || "", "vision"),
        });
        if (!visOk) {
          return {
            success: false,
            error: `Navigation failed for "${action}". Re-train workflow in Admin → AI Workflows.`,
            retrain: true,
          };
        }
      }
    } else {
      // No trained workflow — try generic navigation
      log("warn", `No workflow found for "${action}" — attempting generic navigation`, "", "navigation");
      const actionLabels = {
        attendance: ["Attendance", "My Attendance", "View Attendance", "Academics", "Academic"],
        grades:     ["Grades", "Results", "Grade Sheet", "Marks", "Report Card"],
        timetable:  ["Timetable", "Time Table", "Schedule", "Class Schedule"],
        fees:       ["Fees", "Fee Details", "Payment", "Finance"],
        notices:    ["Notices", "Announcements", "Notifications", "News"],
      };
      const labels = actionLabels[action] || [action];
      await safeClick(page, labels, { emit: (e) => log(e.type, e.msg, e.detail || "", "navigation") });
    }

    // ── 5. EXTRACTION ──────────────────────────────────────────────────────────
    log("info", "Running extraction agent…", "", "extraction");
    const extracted = await extractionAgent({
      page, action, workflow,
      emit: (e) => log(e.type, e.msg, e.detail || "", "extraction"),
    });

    log("success", `Task complete — ${action} data ready`, "", "system");

    return { success: true, action, ...extracted };

  } catch (err) {
    log("error", `Agent error: ${err.message}`, err.stack?.split("\n")[1] || "", "system");
    return { success: false, error: err.message };
  } finally {
    if (browser) await browser.close();
    log("info", "Browser closed", "", "system");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECORD MODE — run portal + record clicks for workflow auto-generation
// ═══════════════════════════════════════════════════════════════════════════════

async function runRecordMode({ portalUrl, email, password, userId, actionName, emit }) {
  const log = (type, msg) => emit({ type, msg, group: "record", ts: new Date().toISOString() });

  let browser;
  try {
    log("info", "Launching browser in record mode…");
    browser = await chromium.launch({ headless: false }); // visible for recording
    const context = await browser.newContext();
    const page    = await context.newPage();
    const recorder = createRecorder(page);

    log("info", `Opening: ${portalUrl}`);
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    log("info", "Logging in…");
    await loginAgent({ page, email, password, emit: (e) => log(e.type, e.msg) });

    log("success", "Logged in — now navigate to the target page. Recording clicks…");

    // Wait for 45 seconds of user interaction (in headful mode)
    await page.waitForTimeout(45000);

    const recording = await recorder.getRecording();
    const workflow  = recordingToWorkflow(recording, actionName);

    log("success", `Recorded ${workflow.steps.length} steps for "${actionName}"`);

    return { success: true, workflow };

  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { runAgentTask, runRecordMode, safeClick, safeFill, robustAction };
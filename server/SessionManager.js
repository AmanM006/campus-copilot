// server/SessionManager.js
// ─── Live Playwright Session Manager ─────────────────────────────────────────

const { chromium } = require("playwright");
const { v4: uuid } = require("uuid");
const path  = require("path");
const fs    = require("fs");

const SESSIONS_DIR = path.join(__dirname, "sessions");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const store = new Map();

// ── Ultra-safe wrappers (Immune to execution context destruction) ────────────
async function safeTitle(page) {
  try { return await page.evaluate(() => document.title); } 
  catch { return "Portal"; }
}
async function safeUrl(page) {
  try { return page.url(); } 
  catch { return ""; }
}
async function safeScreenshot(page) {
  try { return (await page.screenshot({ type: "jpeg", quality: 50 })).toString("base64"); } 
  catch { return null; }
}

// ── Session Controls ──────────────────────────────────────────────────────────
async function createSession({ portalUrl, emit }) {
  const sessionId = uuid();

  emit("info", "Launching secure browser…");
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  
  emit("info", "Browser ready");
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport:  { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  emit("info", `Opening portal: ${portalUrl}`);

  try {
    // commit is safer for fast redirects than domcontentloaded
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 20000 });
  } catch (err) {
    await browser.close();
    throw new Error(`Could not reach portal: ${err.message}`);
  }

  emit("success", `Portal connected`);

  const meta = {
    sessionId, portalUrl, title: "Portal",
    loginDetected: false, dashboardUrl: null, recordedSteps: [],
    loginScreenshot: null, createdAt: Date.now(), lastActivity: Date.now(),
  };

  const timer = setTimeout(() => destroySession(sessionId), SESSION_TTL);
  store.set(sessionId, { browser, context, page, meta, timer });

  return { sessionId, title: "Portal" };
}

function getSession(sessionId) {
  const sess = store.get(sessionId);
  if (!sess) throw new Error(`Session ${sessionId} not found`);
  clearTimeout(sess.timer);
  sess.timer = setTimeout(() => destroySession(sessionId), SESSION_TTL);
  sess.meta.lastActivity = Date.now();
  return sess;
}

async function destroySession(sessionId) {
  const sess = store.get(sessionId);
  if (!sess) return;
  clearTimeout(sess.timer);
  try { await sess.browser.close(); } catch {}
  store.delete(sessionId);
}

async function persistSession(sessionId) {
  const sess = getSession(sessionId);
  const savePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try { await sess.context.storageState({ path: savePath }); sess.meta.storagePath = savePath; } catch {}
  return savePath;
}

// ── Polling & Info ────────────────────────────────────────────────────────────
async function checkLoginStatus(sessionId) {
  const sess = getSession(sessionId);
  const { page, meta } = sess;

  let currentUrl = await safeUrl(page);
  if (!currentUrl) return { loggedIn: false, url: meta.portalUrl, title: "Navigating…", screenshot: null };

  if (meta.loginDetected) return { loggedIn: true, url: currentUrl, title: "Portal" };

  const loginKeywords = ["login","signin","sign-in","auth","authenticate","logon","sso","adfs","microsoftonline"];
  const isOnLoginPage = loginKeywords.some(k => currentUrl.toLowerCase().includes(k));

  const dashboardSignals = [
    "text=Dashboard","text=Welcome","text=Home","text=Logout","text=Sign Out",
    "text=Profile","text=My Account","[href*='logout']","[href*='dashboard']",
    "#dashboard",".dashboard-container","text=Student Dashboard",
  ];

  let dashboardFound = false;
  for (const sel of dashboardSignals) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 200 })) { dashboardFound = true; break; }
    } catch { /* ignore */ }
  }

  const loggedIn = !isOnLoginPage && (dashboardFound || (currentUrl !== meta.portalUrl.toLowerCase() && currentUrl !== ""));

  if (loggedIn) {
    meta.loginDetected = true;
    meta.dashboardUrl = currentUrl;
    meta.loginScreenshot = await safeScreenshot(page);
  }

  return { loggedIn, url: currentUrl, title: "Portal", screenshot: loggedIn ? meta.loginScreenshot : null };
}

async function getDomInfo(sessionId) {
  const sess = getSession(sessionId);
  const { page } = sess;

  const url = await safeUrl(page);
  const screenshot = await safeScreenshot(page);
  let clickables = [];

  try {
    clickables = await page.evaluate(() => {
      return [...document.querySelectorAll("a,button,[role='menuitem'],[role='link'],[role='button']")]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null; })
        .map(el => ({
          tag:  el.tagName.toLowerCase(),
          text: (el.innerText?.trim() || el.getAttribute("aria-label") || "").slice(0, 60),
          href: el.getAttribute("href") || "",
          id:   el.id || "",
        }))
        .filter(el => el.text.length > 1).slice(0, 50);
    });
  } catch {}

  return { url, title: "Portal", screenshot: screenshot || "", clickables };
}

// ── Agent Action Execution ────────────────────────────────────────────────────
async function recordStep(sessionId, { label, selector }) {
  const sess = getSession(sessionId);
  const { page, meta } = sess;
  const urlBefore = await safeUrl(page);

  const strategies = [
    { name:"role-link",   fn: () => page.getByRole("link",    { name: new RegExp(label,"i") }).first().click({ timeout:4000 }) },
    { name:"role-btn",    fn: () => page.getByRole("button",  { name: new RegExp(label,"i") }).first().click({ timeout:4000 }) },
    { name:"role-menu",   fn: () => page.getByRole("menuitem",{ name: new RegExp(label,"i") }).first().click({ timeout:4000 }) },
    { name:"getByText",   fn: () => page.getByText(new RegExp(label,"i")).first().click({ timeout:4000 }) },
    { name:"aria-label",  fn: () => page.locator(`[aria-label*="${label}" i]`).first().click({ timeout:3000 }) },
    { name:"a-text",      fn: () => page.locator(`a:has-text("${label}")`).first().click({ timeout:3000 }) },
    { name:"btn-text",    fn: () => page.locator(`button:has-text("${label}")`).first().click({ timeout:3000 }) },
    { name:"custom",      fn: () => selector ? page.locator(selector).first().click({ timeout:3000 }) : Promise.reject("no selector") },
  ];

  let usedStrategy = null;
  const tried = [];
  for (const s of strategies) {
    try { await s.fn(); usedStrategy = s.name; break; } catch { tried.push(s.name); }
  }

  if (!usedStrategy) return { success: false, error: `Could not click "${label}". Tried: ${tried.join(", ")}` };

  try { await page.waitForLoadState("networkidle", { timeout: 4000 }); } catch {}
  try { await page.waitForTimeout(800); } catch {}

  const step = {
    index:      meta.recordedSteps.length + 1,
    label,
    selector:   usedStrategy === "custom" ? selector : null,
    strategy:   usedStrategy,
    urlBefore,
    urlAfter:   await safeUrl(page),
    title:      await safeTitle(page),
    screenshot: await safeScreenshot(page),
    ts:         Date.now(),
  };

  meta.recordedSteps.push(step);
  return { success: true, step };
}

function getWorkflow(sessionId, actionName) {
  const sess = getSession(sessionId);
  return {
    action_name:  actionName,
    steps:        sess.meta.recordedSteps.map(s => ({ path: s.label, labels: [s.label], url: s.urlAfter, strategy: s.strategy })),
    portal_url:   sess.meta.portalUrl,
    recorded_at:  new Date().toISOString(),
  };
}

function listSessions() {
  return [...store.entries()].map(([id, s]) => ({
    id, portalUrl: s.meta.portalUrl, loginDetected: s.meta.loginDetected,
    steps: s.meta.recordedSteps.length, age: Math.round((Date.now() - s.meta.createdAt) / 1000) + "s",
  }));
}

module.exports = { createSession, getSession, destroySession, persistSession, checkLoginStatus, getDomInfo, recordStep, getWorkflow, listSessions };
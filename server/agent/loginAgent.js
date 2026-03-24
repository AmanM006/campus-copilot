// server/agents/loginAgent.js
// ─── Login Agent ──────────────────────────────────────────────────────────────
// Responsibility: launch browser, open portal, wait for user login,
//   detect dashboard, save storageState.
// Sessions are stored as sessions/{email_safe}.json on disk AND
// tracked in portal_sessions Supabase table.

const { chromium }      = require("playwright");
const path              = require("path");
const fs                = require("fs");
const { createClient }  = require("@supabase/supabase-js");

const SESSIONS_DIR = path.join(__dirname, "..", "sessions");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// ── Derive safe filename from email ────────────────────────────────────────────
function sessionFile(email) {
  return path.join(SESSIONS_DIR, `${email.replace(/[^a-z0-9]/gi, "_")}.json`);
}

// ── Safe read helpers (no throws on mid-navigation) ────────────────────────────
async function safeTitle(page) { try { return await page.title(); } catch { return ""; } }
async function safeUrl(page)   { try { return page.url();          } catch { return ""; } }

// ─────────────────────────────────────────────────────────────────────────────
// isSessionValid — open saved cookies, navigate to portal, check if logged in
// ─────────────────────────────────────────────────────────────────────────────
async function isSessionValid(email, portalUrl, emit) {
  const file = sessionFile(email);
  if (!fs.existsSync(file)) return false;

  emit("info", "Found saved session — validating…", "login");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
    const ctx  = await browser.newContext({ storageState: file });
    const page = await ctx.newPage();
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});

    const url   = await safeUrl(page);
    const title = await safeTitle(page);

    const loginKeywords = ["login","signin","sign-in","auth","sso","adfs","microsoftonline"];
    const isOnLogin = loginKeywords.some(k => url.toLowerCase().includes(k));

    // Look for dashboard signals
    const signals = ["Dashboard","Logout","Log Out","My Account","Profile","Academics","Welcome"];
    let dashFound = false;
    for (const s of signals) {
      try { if (await page.getByText(new RegExp(s,"i")).first().isVisible({ timeout: 600 })) { dashFound = true; break; } }
      catch { /* not found */ }
    }

    const valid = !isOnLogin && (dashFound || (!isOnLogin && title.length > 3));
    emit(valid ? "success" : "warn", valid ? "Session still valid" : "Session expired — re-login needed", "login");
    return valid;
  } catch (err) {
    emit("warn", `Session validation error: ${err.message}`, "login");
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// waitForLogin — headless browser that waits for user to authenticate
//   (user is expected to authenticate via OTP/SSO in a SEPARATE browser tab;
//    this browser detects when the portal session becomes authenticated)
// For portals with SSO we poll until the dashboard appears.
// ─────────────────────────────────────────────────────────────────────────────
async function waitForLogin(email, portalUrl, emit, pollIntervalMs = 3000, timeoutMs = 300000) {
  emit("info", "Launching browser to open portal…", "login");
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
  });

  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(portalUrl, { waitUntil: "commit", timeout: 20000 });
  emit("success", `Portal opened: ${await safeTitle(page) || portalUrl}`, "login");
  emit("info", "Waiting for authentication (check your other browser tab)…", "login");

  const dashSignals = [
    "Dashboard","Welcome","Logout","Log Out","My Account",
    "Academics","Attendance","Student Dashboard","Faculty Dashboard",
  ];

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollIntervalMs));

    let found = false;
    const url = await safeUrl(page);
    const loginKeywords = ["login","signin","sign-in","auth","sso","adfs","microsoftonline"];
    const isOnLogin = loginKeywords.some(k => url.toLowerCase().includes(k));

    if (!isOnLogin) {
      for (const s of dashSignals) {
        try { if (await page.getByText(new RegExp(s,"i")).first().isVisible({ timeout: 500 })) { found = true; break; } }
        catch { /* not yet */ }
      }
    }

    if (found) {
      emit("success", "Login detected — saving session…", "login");
      const file = sessionFile(email);
      await ctx.storageState({ path: file });
      await browser.close();

      // Persist to Supabase
      await supabase.from("portal_sessions").upsert({
        user_email:    email,
        storage_path:  file,
        portal_url:    portalUrl,
        last_synced:   new Date().toISOString(),
        session_valid: true,
      }, { onConflict: "user_email" });

      emit("success", "Session saved and persisted to DB", "login");
      return { success: true, path: file };
    }

    emit("info", "Still waiting for login…", "login");
  }

  await browser.close();
  return { success: false, error: "Login timeout — user did not authenticate within 5 minutes" };
}

// ─────────────────────────────────────────────────────────────────────────────
// restoreSession — create a new browser context using saved cookies
// ─────────────────────────────────────────────────────────────────────────────
async function restoreSession(email, emit) {
  const file = sessionFile(email);
  if (!fs.existsSync(file)) throw new Error(`No session file for ${email}`);

  emit("info", "Restoring saved session…", "login");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"],
  });
  const ctx = await browser.newContext({ storageState: file });
  emit("success", "Session restored", "login");
  return { browser, ctx };
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrCreateSession — main entry point
//   Returns { browser, ctx, page, isNew }
// ─────────────────────────────────────────────────────────────────────────────
async function getOrCreateSession(email, portalUrl, emit) {
  const valid = await isSessionValid(email, portalUrl, emit);

  if (valid) {
    const { browser, ctx } = await restoreSession(email, emit);
    const page = await ctx.newPage();
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 20000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    return { browser, ctx, page, isNew: false };
  }

  // No valid session — wait for user to log in
  const result = await waitForLogin(email, portalUrl, emit);
  if (!result.success) throw new Error(result.error);

  const { browser, ctx } = await restoreSession(email, emit);
  const page = await ctx.newPage();
  await page.goto(portalUrl, { waitUntil: "commit", timeout: 20000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
  return { browser, ctx, page, isNew: true };
}

module.exports = { getOrCreateSession, isSessionValid, restoreSession, waitForLogin, sessionFile };
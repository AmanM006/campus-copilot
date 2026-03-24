// server/agent/playwrightAgent.js
// Real Playwright browser agent — no fake steps, no hardcoded selectors.

const { chromium } = require("playwright");

const EMAIL_SELECTORS = [
  'input[type="email"]','input[name="email"]','input[name="username"]',
  'input[name="user"]','input[name="loginId"]','input[name="login"]',
  '#email','#username','#user','#login','#loginId',
  'input[type="text"]:first-of-type',
];
const PASSWORD_SELECTORS = [
  'input[type="password"]','input[name="password"]',
  'input[name="pass"]','#password','#pass',
];
const SUBMIT_SELECTORS = [
  'button[type="submit"]','input[type="submit"]',
  'button:has-text("Login")','button:has-text("Sign In")',
  'button:has-text("Log In")','button:has-text("Submit")',
  '[value="Login"]','[value="Sign In"]','.login-btn','#loginBtn',
];

async function trySelector(page, selectors, timeout = 3000) {
  for (const sel of selectors) {
    try { await page.waitForSelector(sel, { timeout }); return sel; }
    catch { /* try next */ }
  }
  return null;
}

async function runAgent({ url, email, password, onStep }) {
  const emit = (label, status = "running", detail = "") =>
    onStep?.({ label, status, detail });

  let browser;
  try {
    // 1. Launch
    emit("Launching browser");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"],
    });
    const ctx  = await browser.newContext({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
    const page = await ctx.newPage();
    emit("Launching browser", "done", "Chromium ready");

    // 2. Navigate
    emit("Opening portal");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    emit("Opening portal", "done", await page.title());

    // 3. Find form
    emit("Locating login form");
    const emailSel = await trySelector(page, EMAIL_SELECTORS);
    if (!emailSel) {
      emit("Locating login form", "error", "No email/username field found");
      return { success: false, error: "Login form not found — portal may use SSO or JavaScript login." };
    }
    emit("Locating login form", "done", emailSel);

    // 4. Fill credentials (NOT stored — only used in memory here)
    emit("Entering credentials");
    await page.fill(emailSel, email);
    const pwSel = await trySelector(page, PASSWORD_SELECTORS);
    if (pwSel) await page.fill(pwSel, password);
    emit("Entering credentials", "done");

    // 5. Submit
    emit("Submitting login");
    const submitSel = await trySelector(page, SUBMIT_SELECTORS, 2000);
    if (submitSel) await page.click(submitSel);
    else           await page.keyboard.press("Enter");

    // 6. Wait
    emit("Waiting for dashboard");
    try { await page.waitForLoadState("networkidle", { timeout: 12000 }); }
    catch { /* some portals never reach networkidle */ }
    const finalUrl   = page.url();
    const finalTitle = await page.title();
    emit("Waiting for dashboard", "done", finalTitle || finalUrl);

    // 7. Detect failure
    const failed = [finalUrl, finalTitle].some(s =>
      /login|signin|invalid|error|incorrect/i.test(s)
    );
    if (failed) {
      emit("Login check", "error", "Still on login page — check credentials or 2FA");
      return { success: false, error: `Login may have failed — still on ${finalUrl}` };
    }

    // 8. Extract
    emit("Extracting page data");
    const html    = await page.content();
    const text    = await page.evaluate(() => document.body.innerText);
    const metrics = extractMetrics(text);
    emit("Extracting page data", "done", `${Math.round(html.length / 1024)} KB`);

    return { success: true, url: finalUrl, title: finalTitle, html: html.slice(0, 60000), text: text.slice(0, 5000), metrics };

  } catch (err) {
    return { success: false, error: `Agent error: ${err.message}` };
  } finally {
    if (browser) await browser.close();
  }
}

async function pingPortal({ url }) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const title      = await page.title();
    const screenshot = await page.screenshot({ type: "jpeg", quality: 55 });
    return { success: true, title, screenshot: screenshot.toString("base64") };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

function extractMetrics(text) {
  const pct    = text.match(/\d{1,3}(?:\.\d{1,2})?\s*%/g) || [];
  const grades = text.match(/\b([SABOCD][+\-]?)\b/g) || [];
  return { attendanceValues: pct.slice(0, 10), grades: [...new Set(grades)].slice(0, 20) };
}

module.exports = { runAgent, pingPortal };
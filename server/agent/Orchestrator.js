// server/agents/orchestrator.js
// ─── Orchestrator ─────────────────────────────────────────────────────────────
// runAgentTask — the single entry point for ALL agent operations.
// Flow: check cache → login agent → navigation agent → extraction agent → store
// Supports parallel tasks and background sync.

const { createClient }     = require("@supabase/supabase-js");
const { getOrCreateSession } = require("./loginAgent");
const { navigationAgent }   = require("./navigationAgent");
const { extractionAgent }   = require("./extractionAgent");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const CACHE_TTL_HOURS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getCached(email, dataType) {
  const { data } = await supabase
    .from("cached_data")
    .select("data, updated_at")
    .eq("user_email", email)
    .eq("data_type",  dataType)
    .maybeSingle();

  if (!data) return null;

  const age = (Date.now() - new Date(data.updated_at).getTime()) / 3600000;
  if (age > CACHE_TTL_HOURS) return null;   // stale

  return data.data;
}

async function setCache(email, dataType, data) {
  await supabase
    .from("cached_data")
    .upsert(
      { user_email: email, data_type: dataType, data, updated_at: new Date().toISOString() },
      { onConflict: "user_email,data_type" }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persist extracted data into the proper Supabase tables
// ─────────────────────────────────────────────────────────────────────────────
async function persistAttendance(email, attendanceRows) {
  if (!Array.isArray(attendanceRows) || attendanceRows.length === 0) return;

  // Get student profile to find their internal id
  const { data: profile } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("user_email", email)
    .maybeSingle();

  const studentId = profile?.id || email.split("@")[0];

  for (const row of attendanceRows) {
    if (!row.subject) continue;

    // Upsert subject
    const { data: subj } = await supabase
      .from("subjects")
      .upsert(
        {
          code:       row.code || row.subject.slice(0, 10),
          name:       row.subject,
          semester:   4,   // will be updated from profile
          student_id: studentId,
          teacher:    row.teacher || null,
        },
        { onConflict: "code,student_id" }
      )
      .select("id")
      .single();

    if (!subj) continue;

    // Upsert attendance
    await supabase
      .from("attendance")
      .upsert(
        {
          student_id:  studentId,
          subject_id:  subj.id,
          attended:    row.attended   || 0,
          total:       row.total      || 0,
          source:      "agent",
          portal_data: row,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: "student_id,subject_id" }
      );
  }
}

async function persistProfile(email, profile) {
  if (!profile || Object.keys(profile).length === 0) return;

  const id = profile.registrationNo ||
             profile.id              ||
             email.split("@")[0].replace(/[^a-z0-9_-]/gi, "_");

  await supabase
    .from("student_profiles")
    .upsert(
      {
        id,
        user_email: email,
        name:       profile.name,
        semester:   profile.semester,
        cgpa:       profile.cgpa,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email" }
    );
}

async function logRun(email, action, status, stepsLog, error, startedAt) {
  await supabase.from("agent_run_logs").insert({
    user_email:   email,
    action,
    status,
    steps_log:    stepsLog,
    error:        error || null,
    duration_ms:  Date.now() - startedAt,
    started_at:   new Date(startedAt).toISOString(),
    finished_at:  new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// runAgentTask — main orchestration entry point
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string}   opts.action      e.g. "attendance" | "subjects" | "timetable" | "profile"
 * @param {string}   opts.email       student email
 * @param {string}   opts.portalUrl   portal URL (from portal_sessions or integration_sources)
 * @param {boolean}  opts.forceRefresh skip cache
 * @param {Function} opts.emit        (logEntry) => void  for SSE streaming
 */
async function runAgentTask({ action, email, portalUrl, forceRefresh = false, emit = () => {} }) {
  const startedAt = Date.now();
  const log       = (type, msg, group = "orchestrator") =>
    emit({ type, msg, group, ts: new Date().toISOString() });

  const steps = [];
  const addStep = (s) => { steps.push(s); log(s.type, s.msg, s.group); };

  let browser = null;

  try {
    // ── 1. Cache check ───────────────────────────────────────────────────────
    if (!forceRefresh) {
      addStep({ type: "info", msg: `Checking cache for ${action}…`, group: "cache" });
      const cached = await getCached(email, action);
      if (cached) {
        addStep({ type: "success", msg: `Cache hit — returning ${JSON.stringify(cached).length} bytes`, group: "cache" });
        await logRun(email, action, "success", steps, null, startedAt);
        return { success: true, data: cached, fromCache: true };
      }
      addStep({ type: "info", msg: "Cache miss or stale — running agent", group: "cache" });
    }

    // ── 2. Get portal URL if not provided ────────────────────────────────────
    if (!portalUrl) {
      const { data: sess } = await supabase
        .from("portal_sessions")
        .select("portal_url")
        .eq("user_email", email)
        .maybeSingle();
      portalUrl = sess?.portal_url;

      if (!portalUrl) {
        const { data: integ } = await supabase
          .from("integration_sources")
          .select("portal_url")
          .eq("active", true)
          .limit(1)
          .maybeSingle();
        portalUrl = integ?.portal_url;
      }
    }

    if (!portalUrl) {
      const err = `No portal URL found for ${email}. Admin must configure integration.`;
      addStep({ type: "error", msg: err, group: "orchestrator" });
      return { success: false, error: err };
    }

    addStep({ type: "info", msg: `Portal: ${portalUrl}`, group: "orchestrator" });

    // ── 3. LOGIN AGENT ───────────────────────────────────────────────────────
    addStep({ type: "info", msg: "Starting login agent…", group: "login" });
    const { browser: br, ctx, page } = await getOrCreateSession(email, portalUrl, (e) => {
      addStep({ type: e.type || "info", msg: e.msg || e, group: "login" });
    }).catch(err => { throw new Error(`Login agent failed: ${err.message}`); });
    browser = br;

    addStep({ type: "success", msg: "Login agent complete — session active", group: "login" });

    // ── 4. NAVIGATION AGENT ──────────────────────────────────────────────────
    addStep({ type: "info", msg: `Navigation agent: ${action}`, group: "navigation" });
    await navigationAgent(page, action, (e) => {
      addStep({ type: e.type || "info", msg: e.msg || e, group: "navigation" });
    }).catch(err => { throw new Error(`Navigation agent failed: ${err.message}`); });

    addStep({ type: "success", msg: "Navigation complete", group: "navigation" });

    // Brief settle
    await page.waitForTimeout(1200);

    // ── 5. EXTRACTION AGENT ──────────────────────────────────────────────────
    addStep({ type: "info", msg: `Extraction agent: ${action}`, group: "extraction" });
    const data = await extractionAgent(page, action, (e) => {
      addStep({ type: e.type || "info", msg: e.msg || e, group: "extraction" });
    });

    if (!data || (Array.isArray(data) && data.length === 0)) {
      addStep({ type: "warn", msg: "Extraction returned no data — page may not have loaded correctly", group: "extraction" });
    } else {
      addStep({ type: "success", msg: `Extracted ${Array.isArray(data) ? data.length + " records" : "data"}`, group: "extraction" });
    }

    // ── 6. PERSIST TO DB ─────────────────────────────────────────────────────
    addStep({ type: "info", msg: "Persisting to database…", group: "cache" });

    // Always cache the raw extraction
    await setCache(email, action, data);

    // Also write to normalized tables
    if (action === "attendance" && Array.isArray(data)) {
      await persistAttendance(email, data);
      addStep({ type: "success", msg: `Wrote ${data.length} rows to attendance table`, group: "cache" });
    }
    if (action === "profile") {
      await persistProfile(email, data);
    }

    // Update last_synced
    await supabase
      .from("portal_sessions")
      .upsert(
        { user_email: email, last_synced: new Date().toISOString(), session_valid: true },
        { onConflict: "user_email" }
      );

    addStep({ type: "success", msg: "All data persisted", group: "cache" });

    await logRun(email, action, "success", steps, null, startedAt);
    return { success: true, data, fromCache: false };

  } catch (err) {
    const msg = err.message;
    steps.push({ type: "error", msg, group: "orchestrator", ts: new Date().toISOString() });
    await logRun(email, action, "failed", steps, msg, startedAt);
    return { success: false, error: msg };

  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchStudentData — convenience: runs attendance + profile + timetable in seq
// ─────────────────────────────────────────────────────────────────────────────
async function fetchStudentData({ email, portalUrl, forceRefresh = false, emit = () => {} }) {
  const actions = ["profile", "attendance", "timetable"];
  const results = {};

  for (const action of actions) {
    emit({ type: "info", msg: `Fetching ${action}…`, group: "orchestrator", ts: new Date().toISOString() });
    const result = await runAgentTask({ action, email, portalUrl, forceRefresh, emit });
    results[action] = result;
    if (!result.success && action !== "timetable") break; // stop on critical failure
  }

  return results;
}

module.exports = { runAgentTask, fetchStudentData, getCached, setCache };
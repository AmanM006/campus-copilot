// server/apiIntegration.js
// ─── API Integration Engine ───────────────────────────────────────────────────
// Handles everything for "API Mode" onboarding:
//   testConnection → verifyEndpoint → saveConfig → executeAction
// No browser involved — direct HTTP calls to the college's REST/GraphQL API.

const https = require("https");
const http  = require("http");

// ── makeRequest ────────────────────────────────────────────────────────────────
// A simple fetch-like wrapper that works in Node without node-fetch.
function makeRequest({ url, method = "GET", headers = {}, body = null, timeout = 10000 }) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const isHttps  = parsed.protocol === "https:";
    const lib      = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
      });
    });

    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", reject);

    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ── buildHeaders ──────────────────────────────────────────────────────────────
function buildHeaders(apiKey, authType, customHeaders = {}) {
  const h = { ...customHeaders };
  if (apiKey) {
    if (authType === "bearer") h["Authorization"] = `Bearer ${apiKey}`;
    else if (authType === "apikey") h["X-API-Key"] = apiKey;
    else if (authType === "basic") h["Authorization"] = `Basic ${Buffer.from(apiKey).toString("base64")}`;
    else h["Authorization"] = `Bearer ${apiKey}`;     // default: bearer
  }
  return h;
}

// ── testConnection ────────────────────────────────────────────────────────────
// Pings the base URL and verifies a 2xx response (or a known auth error).
async function testConnection({ baseUrl, apiKey, authType, emit }) {
  emit("info", `Testing connection to ${baseUrl}…`);

  let url = baseUrl.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  const headers = buildHeaders(apiKey, authType);

  try {
    const res = await makeRequest({ url, headers });

    if (res.status >= 200 && res.status < 300) {
      emit("success", `API reachable — HTTP ${res.status}`);
      return { success: true, status: res.status, sample: res.data };
    }

    if (res.status === 401 || res.status === 403) {
      // Reachable but auth failed — we know the base URL is correct
      emit("warn", `API reachable but auth failed (${res.status}) — check API key`);
      return { success: false, status: res.status, error: `Auth failed: HTTP ${res.status}` };
    }

    emit("error", `Unexpected HTTP ${res.status}`);
    return { success: false, status: res.status, error: `HTTP ${res.status}` };

  } catch (err) {
    emit("error", `Could not reach API: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── verifyEndpoint ─────────────────────────────────────────────────────────────
// Tests a specific endpoint and returns a sample of the response.
async function verifyEndpoint({ baseUrl, endpoint, apiKey, authType, emit }) {
  const url     = baseUrl.replace(/\/$/, "") + "/" + endpoint.replace(/^\//, "");
  const headers = buildHeaders(apiKey, authType);

  emit("info", `Verifying endpoint: ${url}`);

  try {
    const res = await makeRequest({ url, headers, timeout: 8000 });

    if (res.status >= 200 && res.status < 300) {
      const preview = typeof res.data === "object"
        ? JSON.stringify(res.data).slice(0, 200)
        : String(res.data).slice(0, 200);
      emit("success", `Endpoint OK — sample: ${preview}`);
      return { success: true, status: res.status, sample: res.data };
    }

    emit("warn", `Endpoint returned ${res.status}`);
    return { success: false, status: res.status, error: `HTTP ${res.status}` };

  } catch (err) {
    emit("error", `Endpoint error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── executeApiAction ──────────────────────────────────────────────────────────
// Called at runtime when a student asks for data.
// Reads the saved integration config and calls the right endpoint.
async function executeApiAction({ action, config, studentId, emit }) {
  const { baseUrl, apiKey, authType, endpoints } = config;

  const endpointPath = endpoints[action];
  if (!endpointPath) {
    emit("warn", `No endpoint mapped for action "${action}"`);
    return { success: false, error: `Endpoint for "${action}" not configured` };
  }

  // Substitute student ID placeholder if present
  const resolvedPath = endpointPath
    .replace("{student_id}", studentId)
    .replace("{studentId}",  studentId)
    .replace("{id}",         studentId);

  const url     = baseUrl.replace(/\/$/, "") + "/" + resolvedPath.replace(/^\//, "");
  const headers = buildHeaders(apiKey, authType);

  emit("info", `[API] ${action.toUpperCase()} → ${url}`);

  try {
    const res = await makeRequest({ url, headers });
    if (res.status >= 200 && res.status < 300) {
      emit("success", `[API] Data received — ${JSON.stringify(res.data).length} bytes`);
      return { success: true, fromApi: true, data: res.data };
    }
    emit("error", `[API] ${res.status} — ${JSON.stringify(res.data).slice(0, 100)}`);
    return { success: false, error: `API returned ${res.status}` };
  } catch (err) {
    emit("error", `[API] Request failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { testConnection, verifyEndpoint, executeApiAction, buildHeaders, makeRequest };
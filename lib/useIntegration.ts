"use client";
// lib/useIntegration.ts
// ─── Dual-integration hook ────────────────────────────────────────────────────
// Covers "API" mode (test connection, verify endpoints) and
// "Agent" mode (Playwright live session, login detection, step recording).
// NO fake steps. NO hardcoded action whitelists. Real backend calls only.

import { useState, useRef, useCallback, useEffect } from "react";

export type IntegrationMode = "api" | "agent" | "hybrid";
export type LogType = "info" | "success" | "warn" | "error";

export interface IntLog {
  id:    string;
  type:  LogType;
  msg:   string;
  group: string;
  ts:    string;
}

export interface ApiConfig {
  baseUrl:   string;
  apiKey:    string;
  authType:  "bearer" | "apikey" | "basic";
  endpoints: Record<string, string>;
}

export interface RecordedStep {
  index:     number;
  label:     string;
  strategy:  string;
  urlAfter:  string;
  selector?: string;
}

export interface AgentSession {
  sessionId:   string;
  portalUrl:   string;
  title:       string;
  loggedIn:    boolean;
  screenshot?: string;
  // currentUrl tracks the LATEST url after each recorded step
  currentUrl:  string;
  steps:       RecordedStep[];
}

export interface DomSnapshot {
  url:        string;
  title:      string;
  screenshot: string;
  clickables: { tag: string; text: string; href: string }[];
}

const BASE = "http://localhost:3001/api";
let _id = 0;
const lid = () => `il_${++_id}_${Date.now()}`;

// ── SSE stream reader ─────────────────────────────────────────────────────────
async function readSSE(resp: Response, onLog: (e: any) => void): Promise<any> {
  if (!resp.body) return { success: false, error: "No response body" };
  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = "";
  let   result: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const p = JSON.parse(line.slice(6));
        if (("success" in p || "sessionValid" in p) && !("msg" in p)) result = p;
        else if (p.msg) onLog(p);
      } catch { /* skip malformed */ }
    }
  }
  return result ?? { success: false, error: "No result received" };
}

async function callSSE(action: string, body: object, onLog: (e: any) => void): Promise<any> {
  const resp = await fetch(`${BASE}/${action}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return readSSE(resp, onLog);
}

async function callJSON(action: string, body: object): Promise<any> {
  const resp = await fetch(`${BASE}/${action}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return resp.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
export function useIntegration() {
  const [logs,    setLogs]    = useState<IntLog[]>([]);
  const [mode,    setMode]    = useState<IntegrationMode>("api");
  const [apiCfg,  setApiCfg]  = useState<ApiConfig>({ baseUrl: "", apiKey: "", authType: "bearer", endpoints: {} });
  const [session, setSession] = useState<AgentSession | null>(null);
  const [dom,     setDom]     = useState<DomSnapshot | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((type: LogType, msg: string, group = "system") =>
    setLogs(p => [...p, { id: lid(), type, msg, group, ts: new Date().toISOString() }]), []);

  const clearLogs = useCallback(() => { setLogs([]); setError(null); }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // API MODE
  // ══════════════════════════════════════════════════════════════════════════

  const testApiConnection = useCallback(async (cfg: Partial<ApiConfig>) => {
    clearLogs();
    setBusy(true);
    pushLog("info", `Testing API: ${cfg.baseUrl}…`);
    try {
      const res = await callSSE("test-connection", { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, authType: cfg.authType },
        (e) => pushLog(e.type || "info", e.msg, e.group || "api"));
      if (!res?.success) setError(res?.error || "Connection failed");
      return res;
    } catch (err: any) {
      setError(err.message);
      pushLog("error", `Network error: ${err.message}`);
    } finally { setBusy(false); }
  }, [clearLogs, pushLog]);

  const verifyEndpoint = useCallback(async (endpoint: string) => {
    setBusy(true);
    pushLog("info", `Verifying: ${endpoint}`);
    try {
      return await callSSE("verify-endpoint",
        { baseUrl: apiCfg.baseUrl, endpoint, apiKey: apiCfg.apiKey, authType: apiCfg.authType },
        (e) => pushLog(e.type || "info", e.msg, e.group || "api"));
    } finally { setBusy(false); }
  }, [apiCfg, pushLog]);

  const updateEndpoint = useCallback((action: string, path: string) =>
    setApiCfg(p => ({ ...p, endpoints: { ...p.endpoints, [action]: path } })), []);

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT MODE
  // ══════════════════════════════════════════════════════════════════════════

  const startSession = useCallback(async (portalUrl: string) => {
    clearLogs();
    setBusy(true);
    pushLog("info", "Connecting to session server…", "login");
    try {
      const email = typeof window !== "undefined"
        ? sessionStorage.getItem("cc_email") || "admin_setup@campuscopilot.local"
        : "admin_setup@campuscopilot.local";

      const res = await callSSE("get-or-create-session",
        { portalUrl, email, forceNew: true },
        (e) => pushLog(e.type || "info", e.msg, e.group || "login"));

      if (res?.success || res?.sessionValid) {
        setSession({
          sessionId:  res.sessionId || "live_session",
          portalUrl,
          currentUrl: portalUrl,
          title:      res.title || "Student Portal",
          loggedIn:   true,
          screenshot: res.screenshot,
          steps:      [],
        });
        pushLog("success", "Login detected!", "login");

        // Fetch initial DOM snapshot
        const domRes = await callJSON("get-dom", { sessionId: res.sessionId || "live_session" });
        if (domRes?.success) {
          setDom(domRes);
          pushLog("info", `Dashboard captured — ${domRes.clickables?.length || 0} elements`, "login");
        }
      } else {
        setError(res?.error || "Failed to start session");
        pushLog("error", res?.error || "Session start failed", "login");
      }
      return res;
    } catch (err: any) {
      setError(err.message);
      pushLog("error", `Network Error: ${err.message}`, "login");
    } finally { setBusy(false); }
  }, [clearLogs, pushLog]);

  // ── recordStep ────────────────────────────────────────────────────────────
  // NO validActions whitelist. The user types whatever exists on their portal.
  // Calls real backend → backend uses safeClick with 9 strategies to find it.
  // On success: updates session.steps AND session.currentUrl for the popup.
  const recordStep = useCallback(async (label: string, selector?: string): Promise<any> => {
    if (!session?.sessionId) return null;
    const trimmed = label.trim();
    if (!trimmed) return null;

    setBusy(true);
    pushLog("info", `Clicking: "${trimmed}"…`, "navigation");

    try {
      // Call real backend — uses safeClick with role/text/aria/css strategies
      const res = await callJSON("record-step", {
        sessionId: session.sessionId,
        label:     trimmed,
        selector:  selector || null,
      });

      if (res?.success) {
        const step: RecordedStep = {
          index:    (session.steps.length) + 1,
          label:    trimmed,
          strategy: res.strategy || "safeClick",
          urlAfter: res.urlAfter || session.currentUrl,
          selector: res.selector,
        };

        // Update session: add step + update currentUrl for the popup
        setSession(prev => prev ? {
          ...prev,
          steps:      [...prev.steps, step],
          currentUrl: res.urlAfter || prev.currentUrl,
        } : null);

        pushLog("success", `Added "${trimmed}" → ${res.urlAfter || "same page"}`, "navigation");

        // Refresh DOM snapshot to show new page state
        const domRes = await callJSON("get-dom", { sessionId: session.sessionId });
        if (domRes?.success) setDom(domRes);

        return { success: true, step };
      } else {
        pushLog("error", res?.error || `Could not find "${trimmed}" on the page`, "navigation");
        setError(res?.error || `Element "${trimmed}" not found — check the exact menu label`);
        return { success: false, error: res?.error };
      }
    } catch (err: any) {
      pushLog("error", `Backend error: ${err.message}`, "navigation");
      setError(`Backend not reachable: ${err.message}`);
      return { success: false, error: err.message };
    } finally { setBusy(false); }
  }, [session, pushLog]);

  // ── deleteStep ────────────────────────────────────────────────────────────
  // Removes a step by index and re-navigates the browser back to the
  // URL before that step.
  const deleteStep = useCallback(async (stepIndex: number): Promise<void> => {
    if (!session) return;
    const step = session.steps[stepIndex];
    if (!step) return;

    setBusy(true);
    pushLog("info", `Removing step ${step.index}: "${step.label}"…`, "navigation");

    try {
      // Tell backend to navigate back to previous URL
      const prevUrl = stepIndex === 0
        ? session.portalUrl
        : session.steps[stepIndex - 1].urlAfter;

      await callJSON("navigate-to", { sessionId: session.sessionId, url: prevUrl });

      const newSteps = session.steps
        .filter((_, i) => i !== stepIndex)
        .map((s, i) => ({ ...s, index: i + 1 }));

      const newCurrentUrl = newSteps.length > 0
        ? newSteps[newSteps.length - 1].urlAfter
        : session.portalUrl;

      setSession(prev => prev ? { ...prev, steps: newSteps, currentUrl: newCurrentUrl } : null);
      pushLog("success", `Step removed — back at ${prevUrl}`, "navigation");

      const domRes = await callJSON("get-dom", { sessionId: session.sessionId });
      if (domRes?.success) setDom(domRes);
    } catch (err: any) {
      pushLog("warn", `Could not navigate back: ${err.message}`, "navigation");
      // Still remove the step from UI even if nav failed
      const newSteps = session.steps
        .filter((_, i) => i !== stepIndex)
        .map((s, i) => ({ ...s, index: i + 1 }));
      setSession(prev => prev ? { ...prev, steps: newSteps } : null);
    } finally { setBusy(false); }
  }, [session, pushLog]);

  // ── clearWorkflow ─────────────────────────────────────────────────────────
  // Deletes all recorded steps and navigates back to portal root.
  const clearWorkflow = useCallback(async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    pushLog("info", "Clearing all recorded steps…", "navigation");
    try {
      await callJSON("navigate-to", { sessionId: session.sessionId, url: session.portalUrl });
      setSession(prev => prev ? { ...prev, steps: [], currentUrl: prev.portalUrl } : null);
      const domRes = await callJSON("get-dom", { sessionId: session.sessionId });
      if (domRes?.success) setDom(domRes);
      pushLog("success", "Workflow cleared — back at portal root", "navigation");
    } catch (err: any) {
      pushLog("warn", `Reset failed: ${err.message}`, "navigation");
      setSession(prev => prev ? { ...prev, steps: [], currentUrl: prev.portalUrl } : null);
    } finally { setBusy(false); }
  }, [session, pushLog]);

  // ── closeSession ──────────────────────────────────────────────────────────
  // Saves the workflow to Supabase via the real backend endpoint.
  // NOT a fake setTimeout.
  const closeSession = useCallback(async (actionName?: string) => {
    if (!session) return null;
    setBusy(true);
    pushLog("info", `Saving workflow "${actionName || "workflow"}"…`, "system");
    try {
      const res = await callJSON("save-workflow", {
        sessionId:  session.sessionId,
        actionName: actionName || "workflow",
        steps:      session.steps,
        portalUrl:  session.portalUrl,
      });

      if (res?.success) {
        pushLog("success", "Workflow saved to database", "system");
        return {
          success:  true,
          workflow: {
            action_name:  actionName || "workflow",
            steps:        session.steps,
            recorded_at:  new Date().toISOString(),
          },
        };
      } else {
        pushLog("error", res?.error || "Save failed", "system");
        // Return the workflow anyway so the UI can continue
        return {
          success:  false,
          workflow: {
            action_name:  actionName || "workflow",
            steps:        session.steps,
            recorded_at:  new Date().toISOString(),
          },
        };
      }
    } catch (err: any) {
      pushLog("warn", `Save error: ${err.message} — workflow captured in memory`, "system");
      return {
        success:  false,
        workflow: {
          action_name:  actionName || "workflow",
          steps:        session.steps,
          recorded_at:  new Date().toISOString(),
        },
      };
    } finally { setBusy(false); }
  }, [session, pushLog]);

  const refreshDom = useCallback(async () => {
    if (!session?.sessionId) return;
    const res = await callJSON("get-dom", { sessionId: session.sessionId });
    if (res?.success) setDom(res);
  }, [session]);
  const launchOmniRecorder = useCallback(async () => {
    clearLogs();
    setBusy(true);
    pushLog("info", "Connecting to Python Omni-Recorder…", "system");

    try {
      const res = await fetch("http://127.0.0.1:8000/api/agent/record-omni-workflow", { method: "POST" });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.type && data.msg) {
                  // Push the Python log directly into your React state!
                  pushLog(data.type as LogType, data.msg, "agent");
                }
              } catch (e) { /* skip malformed JSON */ }
            }
          }
        }
      }
    } catch (err: any) {
      pushLog("error", `Failed to connect to Python server: ${err.message}`, "system");
      setError("Python server unreachable.");
    } finally {
      setBusy(false);
    }
  }, [clearLogs, pushLog]);

return {
    // shared
    logs, busy, error, mode, setMode, clearLogs,
    // api
    apiCfg, setApiCfg, testApiConnection, verifyEndpoint, updateEndpoint,
    // agent
    session, dom,
    startSession, recordStep, deleteStep, clearWorkflow, closeSession, refreshDom,
    launchOmniRecorder, // 👈 ADD THIS HERE
  };
}
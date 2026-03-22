// lib/useIntegration.ts
// ─── Dual-integration hook ────────────────────────────────────────────────────
// Covers both "API" mode (test connection, verify endpoints) and
// "Agent" mode (Playwright live session, login detection, step recording).

import { useState, useRef, useCallback, useEffect } from "react";

export type IntegrationMode = "api" | "agent" | "hybrid";
export type LogType  = "info" | "success" | "warn" | "error";

export interface IntLog {
  id:    string;
  type:  LogType;
  msg:   string;
  group: string;
  ts:    string;
}

export interface ApiConfig {
  baseUrl:    string;
  apiKey:     string;
  authType:   "bearer" | "apikey" | "basic";
  endpoints:  Record<string, string>;   // { attendance: "/api/v1/attendance/{student_id}", ... }
}

export interface AgentSession {
  sessionId:   string;
  portalUrl:   string;
  title:       string;
  loggedIn:    boolean;
  screenshot?: string;
  steps:       any[];
}

export interface DomSnapshot {
  url:        string;
  title:      string;
  screenshot: string;
  clickables: { tag: string; text: string; href: string }[];
}

const BASE = "/api/integration";
let _id = 0;
const lid = () => `il_${++_id}_${Date.now()}`;

// ── Read SSE stream helper ─────────────────────────────────────────────────────
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
        if ("success" in p && !("msg" in p)) result = p;
        else if (p.msg) onLog(p);
      } catch { /* skip */ }
    }
  }
  return result ?? { success: false, error: "No result received" };
}

// ═══════════════════════════════════════════════════════════════════════════════
export function useIntegration() {
  const [logs,    setLogs]    = useState<IntLog[]>([]);
  const [mode,    setMode]    = useState<IntegrationMode>("api");
  const [apiCfg,  setApiCfg]  = useState<ApiConfig>({ baseUrl:"", apiKey:"", authType:"bearer", endpoints:{} });
  const [session, setSession] = useState<AgentSession | null>(null);
  const [dom,     setDom]     = useState<DomSnapshot | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((type: LogType, msg: string, group = "system") =>
    setLogs(p => [...p, { id: lid(), type, msg, group, ts: new Date().toISOString() }]), []);

  const clearLogs = useCallback(() => { setLogs([]); setError(null); }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── post — generic SSE or JSON call ─────────────────────────────────────────
  async function callSSE(action: string, body: object): Promise<any> {
    const resp = await fetch(`${BASE}/${action}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    return readSSE(resp, (e) => pushLog(e.type || "info", e.msg, e.group || action));
  }

  async function callJSON(action: string, body: object): Promise<any> {
    const resp = await fetch(`${BASE}/${action}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    return resp.json();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API MODE
  // ════════════════════════════════════════════════════════════════════════════

  const testApiConnection = useCallback(async (cfg: Partial<ApiConfig>) => {
    clearLogs();
    setBusy(true);
    pushLog("info", `Testing API: ${cfg.baseUrl}…`);
    try {
      const res = await callSSE("test-connection", { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, authType: cfg.authType });
      if (!res?.success) setError(res?.error || "Connection failed");
      return res;
    } finally { setBusy(false); }
  }, [clearLogs, pushLog]);

  const verifyEndpoint = useCallback(async (endpoint: string) => {
    setBusy(true);
    pushLog("info", `Verifying: ${endpoint}`);
    try {
      const res = await callSSE("verify-endpoint", { baseUrl: apiCfg.baseUrl, endpoint, apiKey: apiCfg.apiKey, authType: apiCfg.authType });
      return res;
    } finally { setBusy(false); }
  }, [apiCfg, pushLog]);

  const updateEndpoint = useCallback((action: string, path: string) =>
    setApiCfg(p => ({ ...p, endpoints: { ...p.endpoints, [action]: path } })), []);

  // ════════════════════════════════════════════════════════════════════════════
  // AGENT MODE
  // ════════════════════════════════════════════════════════════════════════════

  const startSession = useCallback(async (portalUrl: string) => {
    clearLogs();
    setBusy(true);
    pushLog("info", "Connecting to session server…");
    try {
      const res = await callSSE("start-session", { portalUrl });
      if (res?.success) {
        setSession({ sessionId: res.sessionId, portalUrl, title: res.title, loggedIn: false, steps: [] });
        // Begin polling
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => pollLogin(res.sessionId), 2000);
      } else {
        setError(res?.error || "Failed to start session");
        pushLog("error", res?.error || "Session start failed");
      }
      return res;
    } finally { setBusy(false); }
  }, [clearLogs, pushLog]);

  const pollLogin = useCallback(async (sessionId: string) => {
    try {
      const res = await callJSON("check-login", { sessionId });
      if (!res?.success && res?.error?.includes("not found")) {
        if (pollRef.current) clearInterval(pollRef.current);
        pushLog("error", "Session expired");
        return;
      }
      if (res?.loggedIn) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        pushLog("success", `Login detected: ${res.title}`);
        setSession(prev => prev ? { ...prev, loggedIn: true, screenshot: res.screenshot } : null);
        // Fetch DOM snapshot
        const domRes = await callJSON("get-dom", { sessionId });
        if (domRes?.success) {
          setDom(domRes);
          pushLog("info", `Dashboard captured — ${domRes.clickables?.length || 0} elements`);
        }
      }
    } catch { /* network blip — retry */ }
  }, [pushLog]);

  const recordStep = useCallback(async (label: string, selector?: string): Promise<any> => {
    if (!session?.sessionId) return null;
    setBusy(true);
    pushLog("info", `Clicking: "${label}"…`);
    try {
      const res = await callSSE("record-step", { sessionId: session.sessionId, label, selector });
      if (res?.success) {
        setSession(prev => prev ? { ...prev, steps: [...prev.steps, res.step] } : null);
        // Refresh DOM
        const domRes = await callJSON("get-dom", { sessionId: session.sessionId });
        if (domRes?.success) setDom(domRes);
      }
      return res;
    } finally { setBusy(false); }
  }, [session, pushLog]);

  const closeSession = useCallback(async (actionName?: string) => {
    if (!session?.sessionId) return null;
    setBusy(true);
    pushLog("info", "Saving session…");
    try {
      const res = await callJSON("close-session", { sessionId: session.sessionId, actionName });
      if (res?.success) pushLog("success", "Session saved — cookies persisted");
      return res;
    } finally { setBusy(false); }
  }, [session, pushLog]);

  const refreshDom = useCallback(async () => {
    if (!session?.sessionId) return;
    const res = await callJSON("get-dom", { sessionId: session.sessionId });
    if (res?.success) setDom(res);
  }, [session]);

  return {
    // shared
    logs, busy, error, mode, setMode, clearLogs,
    // api
    apiCfg, setApiCfg, testApiConnection, verifyEndpoint, updateEndpoint,
    // agent
    session, dom, startSession, recordStep, closeSession, refreshDom,
  };
}
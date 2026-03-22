// lib/useLiveSession.ts
// ─── Live browser session hook for onboarding ─────────────────────────────────
// Manages the full lifecycle of a Playwright-backed session:
//   startSession → poll login → teach (recordStep) → closeSession
// All logs are streamed in real time via SSE.

import { useState, useRef, useCallback, useEffect } from "react";

export type SessionStatus =
  | "idle"
  | "launching"  // browser starting
  | "waiting"    // waiting for user to log in
  | "logged_in"  // login confirmed
  | "teaching"   // recording workflow steps
  | "saving"     // persisting cookies + workflow
  | "complete"   // done
  | "error";

export type LogType = "info" | "success" | "warn" | "error";

export interface SessionLog {
  id:   string;
  type: LogType;
  msg:  string;
  ts:   string;
}

export interface DomInfo {
  url:        string;
  title:      string;
  screenshot: string;       // base64 JPEG
  clickables: { tag: string; text: string; href: string }[];
}

export interface RecordedStep {
  index:      number;
  label:      string;
  strategy:   string;
  urlAfter:   string;
  title:      string;
  screenshot: string;       // base64 JPEG
}

export interface LiveSession {
  sessionId:  string;
  portalUrl:  string;
  title:      string;
  loggedIn:   boolean;
  dashboardScreenshot?: string;
  steps:      RecordedStep[];
}

let _lid = 0;
const lid = () => `sl_${++_lid}_${Date.now()}`;

const BASE = "/api/session";

export function useLiveSession() {
  const [status,   setStatus]   = useState<SessionStatus>("idle");
  const [logs,     setLogs]     = useState<SessionLog[]>([]);
  const [session,  setSession]  = useState<LiveSession | null>(null);
  const [domInfo,  setDomInfo]  = useState<DomInfo | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pushLog = useCallback((type: LogType, msg: string) => {
    setLogs(p => [...p, { id: lid(), type, msg, ts: new Date().toISOString() }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── Stop polling ─────────────────────────────────────────────────────────────
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopPoll(); abortRef.current?.abort(); }, [stopPoll]);

  // ── Read SSE stream and push logs ─────────────────────────────────────────────
  async function readSSE(
    resp: Response,
    onDone: (payload: any) => void
  ) {
    if (!resp.body) { onDone({ success: false, error: "No response body" }); return; }
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = "";
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
          if ("success" in p && !("msg" in p)) {
            onDone(p);
          } else if (p.msg) {
            pushLog(p.type || "info", p.msg);
          }
        } catch { /* malformed */ }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // startSession — POST /api/session/start
  // ═══════════════════════════════════════════════════════════════════════════
  const startSession = useCallback(async (portalUrl: string) => {
    setError(null);
    setStatus("launching");
    setSession(null);
    setDomInfo(null);
    clearLogs();
    pushLog("info", "Connecting to session server…");

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(`${BASE}/start`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ portalUrl }),
        signal:  abortRef.current.signal,
      });

      await readSSE(resp, (payload) => {
        if (!payload.success) {
          setError(payload.error || "Failed to start session");
          setStatus("error");
          pushLog("error", payload.error || "Session start failed");
          return;
        }

        setSession({
          sessionId: payload.sessionId,
          portalUrl,
          title:     payload.title,
          loggedIn:  false,
          steps:     [],
        });

        setStatus("waiting");
        pushLog("success", `Browser opened → "${payload.title}"`);
        pushLog("info", "Waiting for you to log in…");

        // Begin polling for login
        startLoginPoll(payload.sessionId);
      });

    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message);
        setStatus("error");
        pushLog("error", `Connection failed: ${err.message}`);
      }
    }
  }, [clearLogs, pushLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Poll login status every 2 seconds
  // ═══════════════════════════════════════════════════════════════════════════
  const startLoginPoll = useCallback((sessionId: string) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${BASE}/check`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ sessionId }),
        });
        const data = await resp.json();

        if (!data.success) {
          // Session may have expired
          if (data.error?.includes("not found")) {
            stopPoll();
            pushLog("error", "Session expired. Please start again.");
            setStatus("error");
          }
          return;
        }

        if (data.loggedIn) {
          stopPoll();
          pushLog("success", `Login detected on: ${data.title}`);

          setSession(prev => prev ? {
            ...prev,
            loggedIn:            true,
            dashboardScreenshot: data.screenshot,
          } : null);

          setStatus("logged_in");

          // Fetch DOM snapshot of logged-in dashboard
          fetchDomInfo(sessionId);
        }
      } catch { /* network glitch — retry next tick */ }
    }, 2000);
  }, [pushLog, stopPoll]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Fetch DOM info (screenshot + clickables)
  // ═══════════════════════════════════════════════════════════════════════════
  const fetchDomInfo = useCallback(async (sessionId: string) => {
    try {
      const resp = await fetch(`${BASE}/dom`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId }),
      });
      const data = await resp.json();
      if (data.success) {
        setDomInfo(data);
        pushLog("info", `Dashboard captured — ${data.clickables?.length || 0} elements detected`);
      }
    } catch { /* non-fatal */ }
  }, [pushLog]);

  // ═══════════════════════════════════════════════════════════════════════════
  // recordStep — click a label inside the live browser + record it
  // ═══════════════════════════════════════════════════════════════════════════
  const recordStep = useCallback(async (label: string, selector?: string): Promise<RecordedStep | null> => {
    if (!session?.sessionId) return null;

    setStatus("teaching");
    pushLog("info", `Clicking: "${label}"…`);

    try {
      const resp = await fetch(`${BASE}/record`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId: session.sessionId, label, selector }),
      });

      let step: RecordedStep | null = null;
      await readSSE(resp, (payload) => {
        if (payload.success) {
          step = payload.step;
          setSession(prev => prev ? { ...prev, steps: [...prev.steps, payload.step] } : null);
          pushLog("success", `Recorded: "${label}" → ${payload.step.title}`);
          // Refresh DOM info after navigation
          fetchDomInfo(session.sessionId);
        } else {
          pushLog("error", payload.error || `Could not click "${label}"`);
        }
      });

      return step;
    } catch (err: any) {
      pushLog("error", `recordStep failed: ${err.message}`);
      return null;
    }
  }, [session, pushLog, fetchDomInfo]);

  // ═══════════════════════════════════════════════════════════════════════════
  // closeSession — save cookies + generate workflow
  // ═══════════════════════════════════════════════════════════════════════════
  const closeSession = useCallback(async (actionName?: string): Promise<{ workflow: any } | null> => {
    if (!session?.sessionId) return null;

    setStatus("saving");
    pushLog("info", "Saving session cookies…");

    try {
      const resp = await fetch(`${BASE}/close`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId: session.sessionId, actionName }),
      });
      const data = await resp.json();

      if (data.success) {
        pushLog("success", "Session saved — cookies persisted");
        if (data.workflow) {
          pushLog("success", `Workflow generated: ${data.workflow.steps?.length || 0} steps`);
        }
        setStatus("complete");
        return { workflow: data.workflow };
      } else {
        pushLog("error", data.error || "Failed to close session");
        setStatus("error");
        return null;
      }
    } catch (err: any) {
      pushLog("error", `closeSession: ${err.message}`);
      setStatus("error");
      return null;
    }
  }, [session, pushLog]);

  // ── Refresh DOM snapshot ──────────────────────────────────────────────────
  const refreshDom = useCallback(() => {
    if (session?.sessionId) fetchDomInfo(session.sessionId);
  }, [session, fetchDomInfo]);

  return {
    // State
    status, logs, session, domInfo, error,
    // Actions
    startSession, recordStep, closeSession, clearLogs, refreshDom,
  };
}
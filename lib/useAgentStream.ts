// lib/useAgentStream.ts  — real-time agent log streaming
import { useState, useRef, useCallback } from "react";

export type LogType  = "info" | "success" | "warn" | "error";
export type LogGroup = "system" | "login" | "navigation" | "extraction" | "api" | "vision" | "record";

export interface AgentLog {
  id:     string;
  type:   LogType;
  msg:    string;
  detail: string;
  group:  LogGroup;
  ts:     string;
}

export interface AgentResult {
  success:    boolean;
  action?:    string;
  data?:      any[];
  raw?:       string;
  fromCache?: boolean;
  error?:     string;
  retrain?:   boolean;
  logs:       AgentLog[];
}

export interface AgentRunParams {
  action:    string;
  portalUrl: string;
  email:     string;
  password:  string;
  userId:    string;
}

export const LOG_ICON: Record<LogType, string> = {
  info: "○", success: "●", warn: "◎", error: "✕",
};

export const GROUP_LABEL: Record<LogGroup, string> = {
  system: "SYS", login: "AUTH", navigation: "NAV",
  extraction: "DATA", api: "API", vision: "VISION", record: "REC",
};

let _id = 0;
const uid = () => `L${++_id}_${Date.now()}`;

export function useAgentStream() {
  const [logs,    setLogs]    = useState<AgentLog[]>([]);
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<AgentResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const pushLog = useCallback((raw: Omit<AgentLog, "id">) =>
    setLogs(p => [...p, { ...raw, id: uid() }]), []);

  const clearLogs = useCallback(() => { setLogs([]); setResult(null); }, []);

  const runAgent = useCallback(async (params: AgentRunParams): Promise<AgentResult> => {
    clearLogs();
    setRunning(true);
    abort.current = new AbortController();
    pushLog({ type: "info", msg: "Connecting to agent…", detail: "", group: "system", ts: new Date().toISOString() });

    try {
      const resp = await fetch("/api/agent/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(params),
        signal:  abort.current.signal,
      });

      if (!resp.ok || !resp.body) {
        const e = "Agent server offline. Run: cd server && npm install && node index.js";
        pushLog({ type: "error", msg: e, detail: "", group: "system", ts: new Date().toISOString() });
        const out: AgentResult = { success: false, error: e, logs: [] };
        setResult(out); setRunning(false);
        return out;
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";
      let   final: AgentResult | null = null;

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
            if ("success" in p && !("msg" in p)) { final = p; setResult(p); }
            else pushLog({ type: p.type || "info", msg: p.msg || "", detail: p.detail || "", group: p.group || "system", ts: p.ts || new Date().toISOString() });
          } catch { /* skip malformed */ }
        }
      }

      const out = final ?? { success: false, error: "No result", logs: [] };
      setResult(out); setRunning(false);
      return out;

    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Cancelled" : `Error: ${err.message}`;
      pushLog({ type: "warn", msg, detail: "", group: "system", ts: new Date().toISOString() });
      const out: AgentResult = { success: false, error: msg, logs: [] };
      setResult(out); setRunning(false);
      return out;
    }
  }, [clearLogs, pushLog]);

  return { logs, running, result, runAgent, clearLogs, cancel: () => abort.current?.abort() };
}
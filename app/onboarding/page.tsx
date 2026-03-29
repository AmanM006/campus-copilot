"use client";
// app/onboarding/page.tsx — Dual Integration Onboarding
// ─────────────────────────────────────────────────────────────────────────────
// Mode A: ⚡ API Integration  — enter base URL + API key + map endpoints
// Mode B: 🤖 Browser Agent   — Playwright live session, login detection, teach
// Mode C: 🔀 Hybrid          — API first, agent fallback

import React, { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap, Bot, Shuffle, ChevronRight, Globe, Shield, Check, CheckCircle,
  AlertTriangle, Terminal, MousePointer, Save, ArrowRight,
  ExternalLink, Key, TestTube, Map, Database,
  BarChart3, BookOpen, FlaskConical, Trash2, RefreshCw, X,
} from "lucide-react";
import NextLink from "next/link";
import { useIntegration, type IntegrationMode } from "@/lib/useIntegration";
import { supabase } from "@/lib/supabase";

// ── Wizard steps ──────────────────────────────────────────────────────────────
type WizardStep =
  | "college"
  | "mode"
  | "api_test"
  | "api_map"
  | "agent_open"
  | "agent_teach"
  | "account"
  | "done";

// ── Actions to map ────────────────────────────────────────────────────────────
const ACTIONS = [
  { id: "attendance",  label: "Attendance",  icon: BarChart3,    color: "#3b82f6", placeholder: "/api/v1/attendance/{student_id}" },
  { id: "grades",      label: "Grades",      icon: BookOpen,     color: "#10b981", placeholder: "/api/v1/results/{student_id}" },
  { id: "lab_booking", label: "Lab Booking", icon: FlaskConical, color: "#8b5cf6", placeholder: "/api/v1/labs/slots" },
  { id: "timetable",   label: "Timetable",   icon: Zap,          color: "#f59e0b", placeholder: "/api/v1/timetable/{student_id}" },
  { id: "fees",        label: "Fees",        icon: Database,     color: "#ef4444", placeholder: "/api/v1/fees/{student_id}" },
];

const MODE_INFO: Record<IntegrationMode, { label: string; sub: string; icon: React.ElementType; color: string }> = {
  api:    { label: "API Integration",    sub: "Your portal has a REST/GraphQL API", icon: Zap,     color: "#3b82f6" },
  agent:  { label: "Browser Automation", sub: "No API? We automate the browser",    icon: Bot,     color: "#8b5cf6" },
  hybrid: { label: "Hybrid",             sub: "API first, browser as fallback",     icon: Shuffle, color: "#10b981" },
};

// ── Shared fonts ──────────────────────────────────────────────────────────────
const F = `'Geist',system-ui,sans-serif`;
const M = `'JetBrains Mono',monospace`;

// ── Button ────────────────────────────────────────────────────────────────────
function Btn({ ch, onClick, disabled, loading, variant = "primary", icon: Icon, full, danger }: {
  ch: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean;
  variant?: string; icon?: React.ElementType; full?: boolean; danger?: boolean;
}) {
  const V: Record<string, React.CSSProperties> = {
    primary:   { background: "#3b82f6",               border: "1px solid #3b82f6",               color: "#fff" },
    secondary: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" },
    ghost:     { background: "transparent",            border: "1px solid transparent",           color: "rgba(255,255,255,0.4)" },
    green:     { background: "#10b981",                border: "1px solid #10b981",               color: "#fff" },
    purple:    { background: "#8b5cf6",                border: "1px solid #8b5cf6",               color: "#fff" },
    red:       { background: "rgba(239,68,68,0.1)",    border: "1px solid rgba(239,68,68,0.25)",  color: "#f87171" },
  };
  const style = danger ? V.red : (V[variant] || V.primary);
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      ...style, display: "inline-flex", alignItems: "center", gap: 7,
      padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
      cursor: disabled || loading ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      fontFamily: F, transition: "all .15s",
      width: full ? "100%" : undefined, justifyContent: full ? "center" : undefined,
    }}>
      {loading
        ? <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .75s linear infinite" }} />
        : Icon && <Icon size={13} />
      }
      {ch}
    </button>
  );
}

// ── Input field ───────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text", hint, mono, readOnly }: {
  label?: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; mono?: boolean; readOnly?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 13px", color: "#e2e8f0", fontSize: 13, fontFamily: mono ? M : F, outline: "none", width: "100%", transition: "border-color .2s" }}
        onFocus={e => (e.target.style.borderColor = "rgba(59,130,246,0.5)")}
        onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")} />
      {hint && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
}

// ── Log terminal ──────────────────────────────────────────────────────────────
function LogTerminal({ logs }: { logs: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  const C: Record<string, string> = { info: "rgba(255,255,255,0.5)", success: "#4ade80", warn: "#fbbf24", error: "#f87171" };
  const I: Record<string, string> = { info: "○", success: "●", warn: "◎", error: "✕" };
  return (
    <div ref={ref} style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", height: 160, overflowY: "auto", fontFamily: M, fontSize: 11 }}>
      {logs.length === 0 && <div style={{ color: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: 6 }}><Terminal size={12} /> waiting…</div>}
      {logs.map(l => (
        <div key={l.id} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <span style={{ color: C[l.type] || C.info, flexShrink: 0 }}>{I[l.type] || "·"}</span>
          <span style={{ color: C[l.type] || "rgba(255,255,255,0.5)", flex: 1, wordBreak: "break-all" }}>{l.msg}</span>
          <span style={{ color: "rgba(255,255,255,0.15)", flexShrink: 0 }}>{new Date(l.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>
      ))}
    </div>
  );
}

// app/onboarding/page.tsx

// Track if the user has opened the window so we don't aggressively pop it up
let isPopupOpen = false;

function BrowserFrame({ url, loading, onOpen }: { url?: string; loading?: boolean; onOpen?: () => void }) {
  
  // ✨ NEW: Watch the URL. If it changes and the popup is open, send the popup to the new URL.
  React.useEffect(() => {
    if (url && isPopupOpen) {
      window.open(url, "PortalWindow");
    }
  }, [url]);

  const handleOpenPopup = () => {
    if (onOpen) return onOpen();
    isPopupOpen = true; // Mark as open
    window.open(url || "", "PortalWindow", "width=1000,height=700");
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
      {/* Chrome-style bar */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "7px 12px", display: "flex", alignItems: "center", gap: 7 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}
        <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, padding: "2px 9px", fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: M, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {url || "about:blank"}
        </div>
        {loading && <div style={{ width: 11, height: 11, border: "1.5px solid rgba(59,130,246,0.3)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin .75s linear infinite" }} />}
      </div>
      {/* Body */}
      <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "rgba(255,255,255,0.2)" }}>
        <Globe size={24} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Live visual preview disabled.</span>
        <button
          onClick={handleOpenPopup}
          style={{ padding: "7px 14px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 7, color: "#60a5fa", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
          onMouseOver={e => (e.currentTarget.style.background = "rgba(59,130,246,0.22)")}
          onMouseOut={e => (e.currentTarget.style.background = "rgba(59,130,246,0.12)")}
        >
          <ExternalLink size={12} /> Open Portal in Native Window
        </button>
      </div>
    </div>
  );
}

// ── Progress stepper — driven by EXTERNAL step prop from PageShell ────────────
const STEPS_API   = ["college", "mode", "api_test", "api_map",    "account", "done"];
const STEPS_AGENT = ["college", "mode", "agent_open", "agent_teach", "account", "done"];
const STEP_LABELS: Record<string, string> = {
  college: "College", mode: "Mode", api_test: "Test API", api_map: "Map Endpoints",
  agent_open: "Login", agent_teach: "Map Endpoints", account: "Account", done: "Done",
};

function Stepper({ step, mode }: { step: WizardStep; mode: IntegrationMode }) {
  const list = mode === "agent" ? STEPS_AGENT : STEPS_API;
  const idx  = list.indexOf(step);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
      {list.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <React.Fragment key={s}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .3s",
                background: done ? "#10b981" : active ? "#3b82f6" : "rgba(255,255,255,0.07)",
                boxShadow: active ? "0 0 10px rgba(59,130,246,0.35)" : "none",
              }}>
                {done ? <Check size={10} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 700, color: active ? "#fff" : "rgba(255,255,255,0.25)" }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 8, fontWeight: active ? 700 : 400, color: active ? "#60a5fa" : done ? "#4ade80" : "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < list.length - 1 && <div style={{ height: 1, width: 24, background: i < idx ? "#10b981" : "rgba(255,255,255,0.07)", transition: "background .3s", margin: "0 3px", marginBottom: 16 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Status banner ─────────────────────────────────────────────────────────────
function StatusBanner({ mode, loggedIn, apiConnected }: { mode: IntegrationMode; loggedIn: boolean; apiConnected: boolean }) {
  const { label, icon: Icon, color } = MODE_INFO[mode];
  const active = mode === "agent" ? loggedIn : apiConnected;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 8, background: active ? `${color}10` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? `${color}25` : "rgba(255,255,255,0.07)"}` }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? color : "rgba(255,255,255,0.2)", animation: active ? "pulse 2s ease-in-out infinite" : undefined }} />
      <Icon size={13} color={active ? color : "rgba(255,255,255,0.3)"} />
      <span style={{ fontSize: 11, fontWeight: 600, color: active ? color : "rgba(255,255,255,0.35)", fontFamily: M, letterSpacing: ".05em" }}>
        {active ? `${label} — Connected` : `${label} — Waiting`}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ONBOARDING — receives step/setStep from PageShell so stepper stays in sync
// ═══════════════════════════════════════════════════════════════════════════════
function OnboardingMain({ step, setStep }: { step: WizardStep; setStep: (s: WizardStep) => void }) {
  const [collegeName,  setCollegeName]  = useState("");
  const [portalUrl,    setPortalUrl]    = useState("");
  const [apiConnected, setApiConnected] = useState(false);
  const [localLogs, setLocalLogs] = useState<{id: number, type: string, msg: string, ts: number}[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [verifiedEps,  setVerifiedEps]  = useState<Record<string, boolean>>({});
  const [selectedAct,  setSelectedAct]  = useState("attendance");
  const [teachLabel,   setTeachLabel]   = useState("");
  const [teachBusy,    setTeachBusy]    = useState(false);
  const [stepError,    setStepError]    = useState<string | null>(null);
  const [adminName,    setAdminName]    = useState("");
  const [adminEmail,   setAdminEmail]   = useState("");
  const [saving,       setSaving]       = useState(false);
  const teachInputRef = useRef<HTMLInputElement>(null);

  const {
    logs, busy, error, mode, setMode,
    apiCfg, setApiCfg, testApiConnection, verifyEndpoint, updateEndpoint,
    session, dom, startSession, recordStep, deleteStep, clearWorkflow, closeSession,
    clearLogs, launchOmniRecorder, // 👈 GRAB IT HERE
  } = useIntegration();

  const urlValid   = /^https?:\/\/.+/.test(portalUrl.trim());
  const emailValid = adminEmail.includes("@") && adminEmail.includes(".");

  // ── Handle recording a step ────────────────────────────────────────────────
  const handleRecord = useCallback(async (label: string) => {
    if (!label.trim() || teachBusy || busy) return;
    setStepError(null);
    setTeachBusy(true);
    const res = await recordStep(label.trim());
    if (!res?.success) {
      setStepError(res?.error || `"${label}" not found — try the exact visible text`);
    }
    setTeachBusy(false);
    setTeachLabel("");
    setTimeout(() => teachInputRef.current?.focus(), 100);
  }, [teachBusy, busy, recordStep]);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: College
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "college") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} className="fade-up">
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#e2e8f0", marginBottom: 8 }}>Connect your college</div>
        <p style={{ fontSize: 14, color: "rgba(226,232,240,0.4)", lineHeight: 1.7 }}>
          Enter your college details. In the next step you'll choose how to connect — API or browser automation.
        </p>
      </div>
      <Field label="College / University Name" value={collegeName} onChange={setCollegeName} placeholder="IIT Bombay, MIT Manipal, Anna University…" />
      <Field label="Student Portal URL" value={portalUrl} onChange={v => { setPortalUrl(v); }} placeholder="https://maheslcmtech.manipal.edu/s/" mono hint="The URL where students/faculty log in" />
      <Btn ch="Choose Integration Method →" icon={ChevronRight} disabled={!collegeName.trim() || !urlValid}
        onClick={() => setStep("mode")} />
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: Mode
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "mode") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} className="fade-up">
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>Choose integration method</div>
        <p style={{ fontSize: 13, color: "rgba(226,232,240,0.4)", lineHeight: 1.7 }}>
          How does <strong style={{ color: "rgba(255,255,255,0.65)" }}>{collegeName}</strong> expose its data?
        </p>
      </div>
      {(["api", "agent", "hybrid"] as IntegrationMode[]).map(m => {
        const info = MODE_INFO[m];
        const Icon = info.icon;
        return (
          <button key={m} onClick={() => setMode(m)} style={{
            display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px", width: "100%", textAlign: "left",
            background: mode === m ? `${info.color}10` : "rgba(255,255,255,0.02)",
            border: `1px solid ${mode === m ? `${info.color}30` : "rgba(255,255,255,0.07)"}`,
            borderRadius: 12, cursor: "pointer", fontFamily: F, transition: "all .15s",
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: `${info.color}12`, border: `1px solid ${info.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={17} color={info.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>{info.label}</div>
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.4)" }}>{info.sub}</div>
            </div>
            {mode === m && <Check size={16} color={info.color} style={{ flexShrink: 0, marginTop: 2 }} />}
          </button>
        );
      })}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn ch="← Back" variant="secondary" onClick={() => setStep("college")} />
        <Btn ch={`Continue →`} icon={ChevronRight}
          onClick={() => { clearLogs(); setStep(mode === "agent" ? "agent_open" : "api_test"); }} />
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: API — Test connection
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "api_test") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="fade-up">
      <StatusBanner mode={mode} loggedIn={false} apiConnected={apiConnected} />
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>API credentials</div>
        <p style={{ fontSize: 13, color: "rgba(226,232,240,0.4)", lineHeight: 1.7 }}>Enter your college's REST API base URL and auth key.</p>
      </div>
      <Field label="Base API URL" value={apiCfg.baseUrl} onChange={v => setApiCfg(p => ({ ...p, baseUrl: v }))} placeholder="https://api.yourcollege.edu" mono />
      <Field label="API Key / Bearer Token" value={apiCfg.apiKey} onChange={v => setApiCfg(p => ({ ...p, apiKey: v }))} type="password" />
      <div style={{ display: "flex", gap: 6 }}>
        {["bearer", "apikey", "basic"].map(t => (
          <button key={t} onClick={() => setApiCfg(p => ({ ...p, authType: t as any }))} style={{
            padding: "7px 12px", borderRadius: 7, border: `1px solid ${apiCfg.authType === t ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)"}`,
            background: apiCfg.authType === t ? "rgba(59,130,246,0.1)" : "transparent",
            color: apiCfg.authType === t ? "#60a5fa" : "rgba(255,255,255,0.45)",
            fontSize: 12, cursor: "pointer", fontFamily: F,
          }}>{t}</button>
        ))}
      </div>
      <LogTerminal logs={logs} />
      {(error || stepError) && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, fontSize: 12, color: "#fca5a5", display: "flex", gap: 8, alignItems: "center" }}><AlertTriangle size={13} /> {error || stepError}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn ch="← Back" variant="secondary" onClick={() => setStep("mode")} />
        <Btn ch="Test Connection" icon={TestTube} loading={busy} disabled={!apiCfg.baseUrl.trim()}
          onClick={async () => {
            const res = await testApiConnection(apiCfg);
            if (res?.success) { setApiConnected(true); setStep("api_map"); }
          }} />
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: API — Map endpoints
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "api_map") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="fade-up">
      <StatusBanner mode={mode} loggedIn={false} apiConnected={apiConnected} />
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>Map data endpoints</div>
        <p style={{ fontSize: 13, color: "rgba(226,232,240,0.4)", lineHeight: 1.7 }}>
          Enter the path for each data type. Use <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3, fontFamily: M, fontSize: 11 }}>{"{student_id}"}</code> as a placeholder.
        </p>
      </div>
      {ACTIONS.map(a => {
        const Icon = a.icon;
        const val  = apiCfg.endpoints[a.id] || "";
        const ok   = verifiedEps[a.id];
        return (
          <div key={a.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${ok ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: `${a.color}12`, border: `1px solid ${a.color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={13} color={a.color} /></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{a.label}</span>
              {ok && <CheckCircle size={13} color="#10b981" style={{ marginLeft: "auto" }} />}
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <input value={val} onChange={e => updateEndpoint(a.id, e.target.value)} placeholder={a.placeholder}
                style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: M, outline: "none" }} />
              <button disabled={!val.trim() || busy} onClick={async () => {
                const res = await verifyEndpoint(val);
                if (res?.success) setVerifiedEps(p => ({ ...p, [a.id]: true }));
              }} style={{ padding: "7px 10px", background: ok ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${ok ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: ok ? "#4ade80" : "rgba(255,255,255,0.5)", fontFamily: F, opacity: !val.trim() || busy ? 0.4 : 1 }}>
                {ok ? "✓ OK" : "Test"}
              </button>
            </div>
          </div>
        );
      })}
      <LogTerminal logs={logs} />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn ch="← Back" variant="secondary" onClick={() => setStep("api_test")} />
        <Btn ch="Save & Continue →" icon={ChevronRight} disabled={Object.keys(apiCfg.endpoints).length === 0} onClick={() => setStep("account")} />
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: Agent — Open browser + wait for login
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "agent_open") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="fade-up">
      <StatusBanner mode={mode} loggedIn={!!session?.loggedIn} apiConnected={false} />
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
          {!session ? "Opening portal…" : session.loggedIn ? "Portal connected ✓" : "Waiting for login…"}
        </div>
        <p style={{ fontSize: 13, color: "rgba(226,232,240,0.4)", lineHeight: 1.7 }}>
          {!session
            ? "We'll launch a real browser and open your portal. Log in inside the popup window."
            : session.loggedIn
            ? "Login detected. Now teach the AI how to navigate your portal."
            : "The browser is open at your portal. Log in — we'll detect it automatically."}
        </p>
      </div>

      {/* Login progress steps */}
      {[
        { label: "Browser launched",    done: !!session },
        { label: "Portal loaded",       done: !!session },
        { label: "You log in",          done: !!session?.loggedIn, active: !!session && !session?.loggedIn },
        { label: "Login detected",      done: !!session?.loggedIn },
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: s.done ? "#10b981" : s.active ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.07)" }}>
            {s.done ? <Check size={10} color="#fff" /> : s.active ? <div style={{ width: 8, height: 8, border: "1.5px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .75s linear infinite" }} /> : <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{i + 1}</span>}
          </div>
          <span style={{ fontSize: 13, color: s.done ? "#4ade80" : s.active ? "#e2e8f0" : "rgba(226,232,240,0.35)" }}>{s.label}</span>
        </div>
      ))}

      <LogTerminal logs={logs} />

      {!session && !busy && (
        <Btn ch="Launch Secure Browser" icon={Bot} variant="purple" loading={busy}
          onClick={() => startSession(portalUrl)} />
      )}

      {session?.loggedIn && (
        // Pass currentUrl so the popup opens at the right page
        <BrowserFrame url={session.currentUrl} loading={!dom} />
      )}

      {session?.loggedIn && (
        <Btn ch="Teach AI Navigation →" icon={MousePointer} variant="green" onClick={() => setStep("agent_teach")} />
      )}

      {(error) && <div style={{ padding: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#fca5a5" }}>{error}</div>}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: Agent — Omni-Recorder (Live Streaming Microservice UI)
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "agent_teach") {
    // Local state to stream the Python logs instantly

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="fade-up">
        <StatusBanner mode={mode} loggedIn={true} apiConnected={false} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 5 }}>AI Omni-Recorder</div>
          <p style={{ fontSize: 13, color: "rgba(226,232,240,0.4)" }}>
            Click the button below to launch the recorder. Log in, and click through every tab you want to automate. 
            When you close the browser, our AI will sort your clicks and save them to the database.
          </p>
        </div>

        {/* The Black Terminal Box for Live Logs */}
        <LogTerminal logs={localLogs} />

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Btn ch="← Back" variant="secondary" onClick={() => setStep("agent_open")} disabled={isRecording} />
          
          <Btn ch="Launch Omni-Recorder 🚀" variant="purple" loading={isRecording} 
            onClick={async () => {
              setIsRecording(true);
              setStepError(null);
              setLocalLogs([{ id: Date.now(), type: "info", msg: "Connecting to Python Microservice on Port 8001...", ts: Date.now() }]);
              
              try {
                // 👇 HERE IS THE FETCH TO THE MICROSERVICE! 👇
                const res = await fetch("http://127.0.0.1:8001/api/record-omni-workflow", { method: "POST" });
                
                if (!res.ok) throw new Error("Server not responding. Is recorder_server.py running on port 8001?");
                
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
                            setLocalLogs(prev => [...prev, { 
                              id: Date.now() + Math.random(), 
                              type: data.type, 
                              msg: data.msg, 
                              ts: Date.now() 
                            }]);
                          }
                          
                          if (data.success) {
                             setIsRecording(false);
                          }
                        } catch (e) { /* Ignore partial JSON chunks */ }
                      }
                    }
                  }
                }
              } catch (err: any) {
                setLocalLogs(prev => [...prev, { id: Date.now(), type: "error", msg: err.message, ts: Date.now() }]);
                setStepError("Failed to connect to Python server. Make sure recorder_server.py is running on port 8001.");
              }
              setIsRecording(false);
            }} 
          />
          
          <Btn ch="Continue to Account →" icon={ChevronRight} disabled={isRecording || localLogs.length < 2} 
            onClick={() => setStep("account")} 
          />
        </div>

        {stepError && (
          <div style={{ padding: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "#fca5a5" }}>
            {stepError}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: Account
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "account") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} className="fade-up">
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>Create admin account</div>
        <p style={{ fontSize: 13, color: "rgba(226,232,240,0.4)", lineHeight: 1.7 }}>
          This creates your login for <strong style={{ color: "rgba(255,255,255,0.65)" }}>{collegeName}</strong>'s admin dashboard.
        </p>
      </div>
      <Field label="Full Name" value={adminName} onChange={setAdminName} placeholder="Dr. Priya Sharma" />
      <Field label="Institutional Email" value={adminEmail} onChange={setAdminEmail} type="email" placeholder="admin@yourcollege.edu" hint="This becomes your login" />

      {/* Summary */}
      <div style={{ padding: "13px 15px", background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>What gets saved</div>
        {[
          `Integration: ${MODE_INFO[mode].label}`,
          mode === "api" ? `${Object.keys(apiCfg.endpoints).length} API endpoints mapped` : `${session?.steps?.length || 0} navigation steps recorded`,
          `College: ${collegeName}`,
          mode !== "api" ? "Session cookies persisted — future logins skip auth" : "API key stored securely",
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 7, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6", flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 12, color: "rgba(226,232,240,0.5)" }}>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Btn ch="← Back" variant="secondary" onClick={() => setStep(mode === "agent" ? "agent_teach" : "api_map")} />
        <Btn ch={saving ? "Saving…" : "Save & Complete Setup"} icon={Save} loading={saving}
          disabled={!adminName.trim() || !emailValid || saving}
          onClick={async () => {
            setSaving(true);
            try {
              // 1. Save workflow if agent mode
              let workflow = null;
              if (mode !== "api" && session?.sessionId) {
                const res = await closeSession(selectedAct);
                workflow = res?.workflow;
              }

              // 2. Save integration source
              const intPayload: any = {
                college_name:     collegeName,
                portal_url:       portalUrl,
                portal_type:      mode,
                system_name:      mode,
                active:           true,
                integration_type: mode,
                actions:          ACTIONS.map(a => a.id),
              };
              if (mode === "api" || mode === "hybrid") {
                intPayload.api_config = { baseUrl: apiCfg.baseUrl, authType: apiCfg.authType, endpoints: apiCfg.endpoints };
              }
              const { data: src } = await supabase.from("integration_sources").insert(intPayload).select("id").single();

              // 3. Save workflows for each action that has steps
              if (mode !== "api" && src && session?.steps?.length) {
                // Group steps by selectedAct (simplified: save all as one workflow)
                await supabase.from("agent_workflows").insert({
                  college_id:   src.id,
                  action_name:  selectedAct,
                  steps:        session.steps,
                  portal_url:   portalUrl,
                  created_ad:  new Date().toISOString(),
                });
              }

              setStep("done");
            } finally { setSaving(false); }
          }} />
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // STEP: Done
  // ══════════════════════════════════════════════════════════════════════════
  if (step === "done") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} className="fade-up">
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: "linear-gradient(135deg,#10b981,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: "0 0 24px rgba(16,185,129,0.3)" }}>
          <CheckCircle size={25} color="#fff" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", marginBottom: 5 }}>Setup complete</div>
        <div style={{ fontSize: 13, color: "rgba(226,232,240,0.4)" }}>{collegeName} — {MODE_INFO[mode].label}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href="/admin"  style={{ textDecoration: "none", flex: "1 1 140px" }}><Btn ch="Admin Dashboard" full icon={ArrowRight} /></a>
        <a href="/chat"   style={{ textDecoration: "none", flex: "1 1 140px" }}><Btn ch="Student Chat"    full variant="secondary" icon={ArrowRight} /></a>
        <a href="/login"  style={{ textDecoration: "none" }}><Btn ch="Log in" variant="ghost" /></a>
      </div>
    </div>
  );

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE SHELL — owns step state so Stepper always reflects current position
// ══════════════════════════════════════════════════════════════════════════════
function PageShell() {
  const params = useSearchParams();
  const { mode, setMode } = useIntegration();

  // ── step lives HERE so both Stepper and OnboardingMain read the same value ──
  const [step, setStep] = useState<WizardStep>("college");

  useEffect(() => {
    const m = params.get("mode") as IntegrationMode;
    if (m && ["api", "agent", "hybrid"].includes(m)) setMode(m);
  }, [params, setMode]);

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#e2e8f0", fontFamily: F }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#3b82f6;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:10px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .fade-up{animation:fadeUp .25s ease;}
        .spin{animation:spin .75s linear infinite}
      `}</style>

      {/* Topbar */}
      <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)", position: "sticky", top: 0, zIndex: 50 }}>
        <NextLink href="/" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>← Home</NextLink>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.01em" }}>
          Campus<span style={{ color: "#3b82f6" }}>Copilot</span>
          <span style={{ fontSize: 9, marginLeft: 8, background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)", padding: "2px 7px", borderRadius: 3, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" }}>Setup</span>
        </span>
        <a href="/login" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>Already set up? →</a>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <div style={{ width: 240, borderRight: "1px solid rgba(255,255,255,0.05)", padding: "24px 18px", display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", height: "calc(100vh - 52px)", position: "sticky", top: 52 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>Integration modes</div>
            {(["api", "agent", "hybrid"] as IntegrationMode[]).map(m => {
              const info = MODE_INFO[m]; const Icon = info.icon;
              return (
                <div key={m} style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${info.color}10`, border: `1px solid ${info.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={13} color={info.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(226,232,240,0.6)", marginBottom: 1 }}>{info.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(226,232,240,0.25)", lineHeight: 1.4 }}>{info.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "12px 13px", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.12)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", marginBottom: 8 }}>Security</div>
            {["No passwords stored", "Only cookies persisted", "API keys encrypted", "Sessions expire in 30 min"].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                <Shield size={10} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 11, color: "rgba(226,232,240,0.4)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", height: "calc(100vh - 52px)" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "36px 28px" }}>
            {/* Stepper reads step from PageShell state — always in sync */}
            <div style={{ marginBottom: 32 }}>
              <Stepper step={step} mode={mode} />
            </div>
            <OnboardingMain step={step} setStep={setStep} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div style={{ height: "100vh", background: "#09090f" }} />}>
      <PageShell />
    </Suspense>
  );
}
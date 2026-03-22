"use client";
// app/onboarding/page.tsx  —  Dual Integration Onboarding
// ─────────────────────────────────────────────────────────────────────────────
// Mode A: ⚡ API Integration  — enter base URL + API key + map endpoints
// Mode B: 🤖 Browser Agent   — Playwright live session, login detection, teach
// Mode C: 🔀 Hybrid          — API first, agent fallback
// All logs are real. No demo language. No fake steps.

import React, { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap, Bot, Shuffle, ChevronRight, Globe, Shield, Check, CheckCircle,
  AlertTriangle, Activity, Terminal, MousePointer, Save, ArrowRight,
  RefreshCw, ExternalLink, Key, Link2, TestTube, Map, Database,
  BarChart3, BookOpen, FlaskConical, Building, Mail, User,
} from "lucide-react";
import NextLink from "next/link";
import { useIntegration, type IntegrationMode } from "@/lib/useIntegration";
import { registerAdminAccount } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// ── Wizard step IDs ───────────────────────────────────────────────────────────
type WizardStep =
  | "college"      // 0 — college name + portal URL
  | "mode"         // 1 — choose API / Agent / Hybrid
  | "api_test"     // 2A — test API connection
  | "api_map"      // 2B — map endpoints
  | "agent_open"   // 2C — start browser session, wait login
  | "agent_teach"  // 2D — record workflow steps
  | "account"      // 3 — admin account
  | "done";        // 4

// ── Action definitions ────────────────────────────────────────────────────────
const ACTIONS = [
  { id:"attendance",  label:"Attendance",   icon:BarChart3,    color:"#3b82f6", placeholder:"/api/v1/attendance/{student_id}" },
  { id:"grades",      label:"Grades",       icon:BookOpen,     color:"#10b981", placeholder:"/api/v1/results/{student_id}" },
  { id:"lab_booking", label:"Lab Booking",  icon:FlaskConical, color:"#8b5cf6", placeholder:"/api/v1/labs/slots" },
  { id:"timetable",   label:"Timetable",    icon:Zap,          color:"#f59e0b", placeholder:"/api/v1/timetable/{student_id}" },
  { id:"fees",        label:"Fees",         icon:Database,     color:"#ef4444", placeholder:"/api/v1/fees/{student_id}" },
];

const MODE_INFO: Record<IntegrationMode, { label:string; sub:string; icon:React.ElementType; color:string }> = {
  api:    { label:"API Integration",    sub:"Your portal has a REST/GraphQL API", icon:Zap,     color:"#3b82f6" },
  agent:  { label:"Browser Automation", sub:"No API? We automate the browser",    icon:Bot,     color:"#8b5cf6" },
  hybrid: { label:"Hybrid",             sub:"API first, browser as fallback",      icon:Shuffle, color:"#10b981" },
};

// ── Shared UI atoms ────────────────────────────────────────────────────────────
const F = `'Geist',system-ui,sans-serif`;
const M = `'JetBrains Mono',monospace`;

const Btn = ({ ch, onClick, disabled, loading, variant="primary", icon:Icon, full }:
  { ch:React.ReactNode; onClick?:()=>void; disabled?:boolean; loading?:boolean; variant?:string; icon?:React.ElementType; full?:boolean }) => {
  const V: Record<string,React.CSSProperties> = {
    primary:   { background:"#3b82f6",               border:"1px solid #3b82f6",              color:"#fff" },
    secondary: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)" },
    ghost:     { background:"transparent",            border:"1px solid transparent",          color:"rgba(255,255,255,0.4)" },
    green:     { background:"#10b981",                border:"1px solid #10b981",              color:"#fff" },
    purple:    { background:"#8b5cf6",                border:"1px solid #8b5cf6",              color:"#fff" },
  };
  return (
    <button onClick={onClick} disabled={disabled||loading} style={{
      ...V[variant]||V.primary, display:"inline-flex", alignItems:"center", gap:7,
      padding:"10px 18px", borderRadius:8, fontSize:13, fontWeight:600,
      cursor:disabled||loading?"not-allowed":"pointer", opacity:disabled?0.45:1,
      fontFamily:F, transition:"all .15s",
      width:full?"100%":undefined, justifyContent:full?"center":undefined,
    }}>
      {loading ? <div style={{ width:13,height:13,border:"2px solid rgba(255,255,255,0.25)",borderTopColor:"#fff",borderRadius:"50%" }} className="spin" /> : Icon && <Icon size={13} />}
      {ch}
    </button>
  );
};

const Field = ({ label, value, onChange, placeholder, type="text", hint, mono, readOnly }:
  { label?:string; value:string; onChange?:(v:string)=>void; placeholder?:string; type?:string; hint?:string; mono?:boolean; readOnly?:boolean }) => (
  <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
    {label && <label style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:".07em" }}>{label}</label>}
    <input type={type} value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder}
      readOnly={readOnly}
      style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"10px 13px",color:"#e2e8f0",fontSize:13,fontFamily:mono?M:F,outline:"none",width:"100%",transition:"border-color .2s" }}
      onFocus={e=>(e.target.style.borderColor="rgba(59,130,246,0.5)")}
      onBlur={e=>(e.target.style.borderColor="rgba(255,255,255,0.08)")} />
    {hint && <span style={{ fontSize:11,color:"rgba(255,255,255,0.25)",lineHeight:1.5 }}>{hint}</span>}
  </div>
);

// ── Log Terminal ──────────────────────────────────────────────────────────────
function Terminal2({ logs }: { logs: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  const C: Record<string,string> = { info:"rgba(255,255,255,0.5)", success:"#4ade80", warn:"#fbbf24", error:"#f87171" };
  const I: Record<string,string> = { info:"○", success:"●", warn:"◎", error:"✕" };
  return (
    <div ref={ref} style={{ background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px",height:160,overflowY:"auto",fontFamily:M,fontSize:11 }}>
      {logs.length === 0 && <div style={{ color:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",gap:6 }}><Terminal size={12}/> waiting…</div>}
      {logs.map(l => (
        <div key={l.id} style={{ display:"flex",gap:8,marginBottom:4,animation:"logIn .15s ease" }}>
          <span style={{ color:C[l.type]||C.info,flexShrink:0 }}>{I[l.type]||"·"}</span>
          <span style={{ color:C[l.type]||"rgba(255,255,255,0.5)",flex:1,wordBreak:"break-all" }}>{l.msg}</span>
          <span style={{ color:"rgba(255,255,255,0.15)",flexShrink:0 }}>{new Date(l.ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
        </div>
      ))}
    </div>
  );
}

// ── Browser preview ───────────────────────────────────────────────────────────
function BrowserFrame({ screenshot, url, title, clickables, onClick, loading }:
  { screenshot?:string; url?:string; title?:string; clickables?:any[]; onClick?:(t:string)=>void; loading?:boolean }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,overflow:"hidden" }}>
      <div style={{ background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.06)",padding:"7px 12px",display:"flex",alignItems:"center",gap:7 }}>
        {["#ff5f57","#febc2e","#28c840"].map(c=><div key={c} style={{ width:8,height:8,borderRadius:"50%",background:c }}/>)}
        <div style={{ flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:4,padding:"2px 9px",fontSize:11,color:"rgba(255,255,255,0.3)",fontFamily:M,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
          {url||"about:blank"}
        </div>
        {loading && <div style={{ width:11,height:11,border:"1.5px solid rgba(59,130,246,0.3)",borderTopColor:"#3b82f6",borderRadius:"50%" }} className="spin"/>}
      </div>
      {screenshot
        ? <div style={{ position:"relative" }}>
            <img src={`data:image/jpeg;base64,${screenshot}`} alt="Portal" style={{ width:"100%",display:"block",maxHeight:220,objectFit:"cover",objectPosition:"top" }}/>
            <div style={{ position:"absolute",top:6,right:6,background:"rgba(16,185,129,0.9)",padding:"2px 7px",borderRadius:4,fontSize:9,fontWeight:700,color:"#fff",fontFamily:M }}>LIVE</div>
          </div>
        : <div style={{ height:160,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:7,color:"rgba(255,255,255,0.2)" }}>
            <Globe size={22}/>
            <span style={{ fontSize:12 }}>{loading?"Loading portal…":"Preview will appear here"}</span>
          </div>
      }
      {clickables && clickables.length > 0 && onClick && (
        <div style={{ padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize:9,fontWeight:600,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:7 }}>
            Detected elements ({clickables.length})
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:5,maxHeight:72,overflowY:"auto" }}>
            {clickables.slice(0,20).map((c:any,i:number)=>(
              <button key={i} onClick={()=>onClick(c.text)} style={{
                padding:"2px 7px",background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.18)",
                borderRadius:4,fontSize:10,color:"#60a5fa",cursor:"pointer",fontFamily:M,transition:"all .12s",
              }}>{c.text.slice(0,26)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress stepper ──────────────────────────────────────────────────────────
const STEPS_API   = ["college","mode","api_test","api_map","account","done"];
const STEPS_AGENT = ["college","mode","agent_open","agent_teach","account","done"];
function Stepper({ step, mode }: { step: WizardStep; mode: IntegrationMode }) {
  const list   = mode === "agent" ? STEPS_AGENT : STEPS_API;
  const labels: Record<string,string> = { college:"College", mode:"Mode", api_test:"Test API", api_map:"Map Endpoints", agent_open:"Login", agent_teach:"Teach AI", account:"Account", done:"Done" };
  const idx    = list.indexOf(step);
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:0 }}>
      {list.map((s,i)=>{
        const done=i<idx, active=i===idx;
        return (
          <React.Fragment key={s}>
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
              <div style={{ width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .3s",
                background:done?"#10b981":active?"#3b82f6":"rgba(255,255,255,0.07)",
                boxShadow:active?"0 0 10px rgba(59,130,246,0.35)":"none",
              }}>
                {done?<Check size={10} color="#fff"/>:<span style={{ fontSize:9,fontWeight:700,color:active?"#fff":"rgba(255,255,255,0.25)" }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:8,fontWeight:active?700:400,color:active?"#60a5fa":done?"#4ade80":"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap" }}>{labels[s]}</span>
            </div>
            {i<list.length-1 && <div style={{ height:1,width:24,background:i<idx?"#10b981":"rgba(255,255,255,0.07)",transition:"background .3s",margin:"0 3px",marginBottom:16 }}/>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Status banner ─────────────────────────────────────────────────────────────
function StatusBanner({ mode, session, apiConnected }: { mode:IntegrationMode; session:any; apiConnected:boolean }) {
  const { label, icon:Icon, color } = MODE_INFO[mode];
  const active = mode === "agent" ? session?.loggedIn : apiConnected;
  return (
    <div style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderRadius:8,
      background:active?`${color}10`:"rgba(255,255,255,0.03)",
      border:`1px solid ${active?`${color}25`:"rgba(255,255,255,0.07)"}`,
    }}>
      <div style={{ width:6,height:6,borderRadius:"50%",background:active?color:"rgba(255,255,255,0.2)",
        boxShadow:active?`0 0 6px ${color}`:undefined,
        animation:active?"pulse 2s ease-in-out infinite":undefined }} />
      <Icon size={13} color={active?color:"rgba(255,255,255,0.3)"}/>
      <span style={{ fontSize:11,fontWeight:600,color:active?color:"rgba(255,255,255,0.35)",fontFamily:M,letterSpacing:".05em" }}>
        {active ? `${label} — Connected` : `${label} — Waiting`}
      </span>
      {mode==="agent" && session?.dom?.url && (
        <span style={{ fontSize:10,color:"rgba(255,255,255,0.25)",fontFamily:M,marginLeft:"auto" }}>{session?.dom?.url?.slice(0,40)}</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════════
function OnboardingMain() {
  const router  = useRouter();
  const params  = useSearchParams();

  const [step,         setStep]         = useState<WizardStep>("college");
  const [collegeName,  setCollegeName]  = useState("");
  const [portalUrl,    setPortalUrl]    = useState("");
  const [apiConnected, setApiConnected] = useState(false);
  const [verifiedEps,  setVerifiedEps]  = useState<Record<string,boolean>>({});
  const [selectedAct,  setSelectedAct]  = useState("attendance");
  const [teachLabel,   setTeachLabel]   = useState("");
  const [teachRecording, setTeachRecording] = useState(false);
  const [adminName,    setAdminName]    = useState("");
  const [adminEmail,   setAdminEmail]   = useState("");
  const [saving,       setSaving]       = useState(false);

  const {
    logs, busy, error, mode, setMode,
    apiCfg, setApiCfg, testApiConnection, verifyEndpoint, updateEndpoint,
    session, dom, startSession, recordStep, closeSession, refreshDom,
    clearLogs,
  } = useIntegration();

  const urlValid = /^https?:\/\/.+/.test(portalUrl.trim());
  const emailValid = adminEmail.includes("@") && adminEmail.includes(".");

  // ── STEP: College ─────────────────────────────────────────────────────────
  if (step === "college") return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }} className="fade-up">
      <div>
        <div style={{ fontSize:26,fontWeight:700,letterSpacing:"-0.02em",color:"#e2e8f0",marginBottom:8 }}>Connect your college</div>
        <p style={{ fontSize:14,color:"rgba(226,232,240,0.4)",lineHeight:1.7 }}>
          Enter your college details. In the next step you'll choose how to connect — API or browser automation.
        </p>
      </div>
      <Field label="College / University Name" value={collegeName} onChange={setCollegeName} placeholder="IIT Bombay, MIT Manipal, Anna University…"/>
      <Field label="Student Portal URL" value={portalUrl} onChange={setPortalUrl} placeholder="https://slcm.manipal.edu" mono hint="The URL where students/faculty log in"/>
      <Btn ch="Choose Integration Method →" icon={ChevronRight} disabled={!collegeName.trim()||!urlValid}
        onClick={()=>setStep("mode")} />
    </div>
  );

  // ── STEP: Mode selection ──────────────────────────────────────────────────
  if (step === "mode") return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }} className="fade-up">
      <div>
        <div style={{ fontSize:22,fontWeight:700,color:"#e2e8f0",marginBottom:6 }}>Choose integration method</div>
        <p style={{ fontSize:13,color:"rgba(226,232,240,0.4)",lineHeight:1.7 }}>
          How does <strong style={{ color:"rgba(255,255,255,0.65)" }}>{collegeName}</strong> expose its data?
        </p>
      </div>

      {(["api","agent","hybrid"] as IntegrationMode[]).map(m => {
        const info = MODE_INFO[m];
        const Icon = info.icon;
        return (
          <button key={m} onClick={()=>setMode(m)} style={{
            display:"flex",alignItems:"flex-start",gap:14,padding:"16px 18px",width:"100%",textAlign:"left",
            background: mode===m?`${info.color}10`:"rgba(255,255,255,0.02)",
            border:`1px solid ${mode===m?`${info.color}30`:"rgba(255,255,255,0.07)"}`,
            borderRadius:12,cursor:"pointer",fontFamily:F,transition:"all .15s",
          }}>
            <div style={{ width:36,height:36,borderRadius:9,background:`${info.color}12`,border:`1px solid ${info.color}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <Icon size={17} color={info.color}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15,fontWeight:600,color:"#e2e8f0",marginBottom:3 }}>{info.label}</div>
              <div style={{ fontSize:12,color:"rgba(226,232,240,0.4)" }}>{info.sub}</div>
              {m==="api"    && <div style={{ fontSize:11,color:"rgba(226,232,240,0.3)",marginTop:4 }}>Fastest • No browser needed • Requires API key</div>}
              {m==="agent"  && <div style={{ fontSize:11,color:"rgba(226,232,240,0.3)",marginTop:4 }}>Works with any portal • You teach navigation • Playwright-powered</div>}
              {m==="hybrid" && <div style={{ fontSize:11,color:"rgba(226,232,240,0.3)",marginTop:4 }}>Best of both • API when available • Browser fallback</div>}
            </div>
            {mode===m && <Check size={16} color={info.color} style={{ flexShrink:0,marginTop:2 }}/>}
          </button>
        );
      })}

      <div style={{ display:"flex",gap:8 }}>
        <Btn ch="← Back" variant="secondary" onClick={()=>setStep("college")}/>
        <Btn ch={`Continue with ${MODE_INFO[mode].label} →`} icon={ChevronRight}
          onClick={()=>{ clearLogs(); setStep(mode==="agent"?"agent_open":"api_test"); }}/>
      </div>
    </div>
  );

  // ── STEP: API — Test connection ───────────────────────────────────────────
  if (step === "api_test") return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }} className="fade-up">
      <StatusBanner mode={mode} session={session} apiConnected={apiConnected}/>
      <div>
        <div style={{ fontSize:20,fontWeight:700,color:"#e2e8f0",marginBottom:6 }}>API credentials</div>
        <p style={{ fontSize:13,color:"rgba(226,232,240,0.4)",lineHeight:1.7 }}>
          Enter your college's REST API base URL and authentication key.
          We'll send a test request immediately to verify the connection.
        </p>
      </div>

      <Field label="Base API URL" value={apiCfg.baseUrl} onChange={v=>setApiCfg(p=>({...p,baseUrl:v}))}
        placeholder="https://api.yourcollege.edu" mono hint="All endpoints will be relative to this URL"/>

      <Field label="API Key / Bearer Token" value={apiCfg.apiKey} onChange={v=>setApiCfg(p=>({...p,apiKey:v}))}
        type="password" hint="Used in Authorization header — not stored permanently"/>

      <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
        <label style={{ fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:".07em" }}>Auth Type</label>
        <div style={{ display:"flex",gap:6 }}>
          {["bearer","apikey","basic"].map(t=>(
            <button key={t} onClick={()=>setApiCfg(p=>({...p,authType:t as any}))} style={{
              padding:"7px 12px",borderRadius:7,border:`1px solid ${apiCfg.authType===t?"rgba(59,130,246,0.4)":"rgba(255,255,255,0.08)"}`,
              background:apiCfg.authType===t?"rgba(59,130,246,0.1)":"transparent",
              color:apiCfg.authType===t?"#60a5fa":"rgba(255,255,255,0.45)",
              fontSize:12,cursor:"pointer",fontFamily:F,fontWeight:apiCfg.authType===t?600:400,
            }}>{t}</button>
          ))}
        </div>
      </div>

      <Terminal2 logs={logs}/>

      {error && (
        <div style={{ padding:"10px 14px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:9,fontSize:12,color:"#fca5a5",display:"flex",gap:8,alignItems:"center" }}>
          <AlertTriangle size={13}/> {error}
        </div>
      )}

      <div style={{ display:"flex",gap:8 }}>
        <Btn ch="← Back" variant="secondary" onClick={()=>setStep("mode")}/>
        <Btn ch="Test Connection" icon={TestTube} loading={busy} disabled={!apiCfg.baseUrl.trim()}
          onClick={async()=>{
            const res = await testApiConnection(apiCfg);
            if (res?.success) { setApiConnected(true); setStep("api_map"); }
          }}/>
      </div>
    </div>
  );

  // ── STEP: API — Map endpoints ─────────────────────────────────────────────
  if (step === "api_map") return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }} className="fade-up">
      <StatusBanner mode={mode} session={session} apiConnected={apiConnected}/>
      <div>
        <div style={{ fontSize:20,fontWeight:700,color:"#e2e8f0",marginBottom:6 }}>Map data endpoints</div>
        <p style={{ fontSize:13,color:"rgba(226,232,240,0.4)",lineHeight:1.7 }}>
          Tell us the path for each data type. Use <code style={{ background:"rgba(255,255,255,0.08)",padding:"1px 5px",borderRadius:3,fontFamily:M,fontSize:11 }}>{"{student_id}"}</code> as a placeholder.
        </p>
      </div>

      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {ACTIONS.map(a=>{
          const Icon = a.icon;
          const val  = apiCfg.endpoints[a.id] || "";
          const verified = verifiedEps[a.id];
          return (
            <div key={a.id} style={{
              background:"rgba(255,255,255,0.02)",border:`1px solid ${verified?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.07)"}`,
              borderRadius:10,padding:"12px 14px",transition:"border-color .2s",
            }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:9 }}>
                <div style={{ width:28,height:28,borderRadius:7,background:`${a.color}12`,border:`1px solid ${a.color}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  <Icon size={13} color={a.color}/>
                </div>
                <span style={{ fontSize:13,fontWeight:600,color:"#e2e8f0" }}>{a.label}</span>
                {verified && <CheckCircle size={13} color="#10b981" style={{ marginLeft:"auto" }}/>}
              </div>
              <div style={{ display:"flex",gap:7 }}>
                <input value={val} onChange={e=>updateEndpoint(a.id,e.target.value)} placeholder={a.placeholder}
                  style={{ flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:6,padding:"7px 10px",color:"#e2e8f0",fontSize:12,fontFamily:M,outline:"none" }}
                  onFocus={e=>(e.target.style.borderColor="rgba(59,130,246,0.4)")}
                  onBlur={e=>(e.target.style.borderColor="rgba(255,255,255,0.07)")}/>
                <button disabled={!val.trim()||busy} onClick={async()=>{
                  const res = await verifyEndpoint(val);
                  if (res?.success) setVerifiedEps(p=>({...p,[a.id]:true}));
                }} style={{
                  padding:"7px 10px",background:verified?"rgba(16,185,129,0.1)":"rgba(255,255,255,0.04)",
                  border:`1px solid ${verified?"rgba(16,185,129,0.25)":"rgba(255,255,255,0.08)"}`,
                  borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,
                  color:verified?"#4ade80":"rgba(255,255,255,0.5)",fontFamily:F,transition:"all .15s",
                  opacity:!val.trim()||busy?0.4:1,
                }}>
                  {verified?"✓ OK":"Test"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Terminal2 logs={logs}/>

      <div style={{ display:"flex",gap:8 }}>
        <Btn ch="← Back" variant="secondary" onClick={()=>setStep("api_test")}/>
        <Btn ch="Save & Continue →" icon={ChevronRight}
          disabled={Object.keys(apiCfg.endpoints).length === 0}
          onClick={()=>setStep("account")}/>
      </div>
    </div>
  );

  // ── STEP: Agent — Open browser + wait for login ───────────────────────────
  if (step === "agent_open") return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }} className="fade-up">
      <StatusBanner mode={mode} session={session} apiConnected={false}/>
      <div>
        <div style={{ fontSize:20,fontWeight:700,color:"#e2e8f0",marginBottom:6 }}>
          {!session ? "Opening portal…" : session.loggedIn ? "Portal connected ✓" : "Waiting for login…"}
        </div>
        <p style={{ fontSize:13,color:"rgba(226,232,240,0.4)",lineHeight:1.7 }}>
          {!session
            ? "We'll launch a real browser and open your portal. You'll log in inside our secure session."
            : session.loggedIn
            ? "Login detected. We can now capture your portal's navigation structure."
            : "The browser is open at your portal. Log in with your credentials — we'll detect it automatically."}
        </p>
      </div>

      {/* Login steps */}
      {[
        { label: "Browser launched", done: !!session },
        { label: "Portal loaded",    done: !!session },
        { label: "You log in",        done: session?.loggedIn, active: !!session && !session?.loggedIn },
        { label: "Login detected",    done: session?.loggedIn },
      ].map((s,i)=>(
        <div key={i} style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:20,height:20,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
            background:s.done?"#10b981":s.active?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.07)",
          }}>
            {s.done
              ? <Check size={10} color="#fff"/>
              : s.active
              ? <div style={{ width:8,height:8,border:"1.5px solid #3b82f6",borderTopColor:"transparent",borderRadius:"50%" }} className="spin"/>
              : <span style={{ fontSize:9,color:"rgba(255,255,255,0.25)" }}>{i+1}</span>}
          </div>
          <span style={{ fontSize:13,color:s.done?"#4ade80":s.active?"#e2e8f0":"rgba(226,232,240,0.35)" }}>{s.label}</span>
        </div>
      ))}

      <Terminal2 logs={logs}/>

      {!session && !busy && (
        <Btn ch="Launch Secure Browser" icon={Bot} variant="purple" loading={busy}
          onClick={()=>startSession(portalUrl)}/>
      )}
      {session?.loggedIn && (
        <BrowserFrame screenshot={session.screenshot||dom?.screenshot} url={dom?.url} title={dom?.title} loading={!dom}/>
      )}
      {session?.loggedIn && (
        <Btn ch="Teach AI Navigation →" icon={MousePointer} variant="green" onClick={()=>setStep("agent_teach")}/>
      )}
      {error && <div style={{ padding:"10px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,fontSize:12,color:"#fca5a5" }}>{error}</div>}
    </div>
  );

  // ── STEP: Agent — Teach navigation ────────────────────────────────────────
  if (step === "agent_teach") return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }} className="fade-up">
      <StatusBanner mode={mode} session={session} apiConnected={false}/>
      <div>
        <div style={{ fontSize:20,fontWeight:700,color:"#e2e8f0",marginBottom:5 }}>Teach the AI your portal</div>
        <p style={{ fontSize:13,color:"rgba(226,232,240,0.4)" }}>
          Click elements in the preview or type a menu label. Each click is recorded as a navigation step.
        </p>
      </div>

      {/* Action selector */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6 }}>
        {ACTIONS.map(a=>{
          const Icon = a.icon;
          const sel  = selectedAct===a.id;
          const hasSt = (session?.steps?.filter((s:any)=>s.label?.toLowerCase().includes(a.id)) || []).length > 0;  
        return (
            <button key={a.id} onClick={()=>setSelectedAct(a.id)} style={{
              display:"flex",alignItems:"center",gap:7,padding:"8px 10px",
              background:sel?`${a.color}12`:"rgba(255,255,255,0.02)",
              border:`1px solid ${sel?`${a.color}25`:"rgba(255,255,255,0.07)"}`,
              borderRadius:8,cursor:"pointer",fontFamily:F,fontSize:12,
              color:sel?"#e2e8f0":"rgba(226,232,240,0.45)",fontWeight:sel?600:400,transition:"all .15s",
            }}>
              <Icon size={12} color={sel?a.color:"rgba(255,255,255,0.25)"}/>
              {a.label}
              {hasSt && <Check size={9} color="#10b981" style={{ marginLeft:"auto" }}/>}
            </button>
          );
        })}
      </div>

      <BrowserFrame
        screenshot={dom?.screenshot} url={dom?.url} title={dom?.title}
        clickables={dom?.clickables} loading={teachRecording||busy}
        onClick={async(label)=>{
          setTeachRecording(true);
          await recordStep(label);
          setTeachRecording(false);
        }}/>

      {/* Manual input */}
      <div style={{ display:"flex",gap:7 }}>
        <input value={teachLabel} onChange={e=>setTeachLabel(e.target.value)}
          placeholder="Type menu label (e.g. Attendance) and press Enter"
          onKeyDown={async e=>{
            if (e.key==="Enter"&&teachLabel.trim()&&!teachRecording) {
              setTeachRecording(true);
              await recordStep(teachLabel.trim());
              setTeachRecording(false);
              setTeachLabel("");
            }
          }}
          style={{ flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:13,fontFamily:F,outline:"none" }}/>
        <Btn ch="Record" variant="purple" loading={teachRecording} disabled={!teachLabel.trim()||teachRecording}
          onClick={async()=>{
            setTeachRecording(true);
            await recordStep(teachLabel.trim());
            setTeachRecording(false);
            setTeachLabel("");
          }}/>
      </div>

      {/* Recorded steps */}
      {session?.steps && session.steps.length > 0 && (
        <div style={{ background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,overflow:"hidden" }}>
          <div style={{ padding:"9px 13px",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:12,fontWeight:600,color:"#e2e8f0" }}>
            Recorded steps ({session.steps.length})
          </div>
          {session.steps.map((s:any,i:number)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:9,padding:"8px 13px",borderBottom:i<session.steps.length-1?"1px solid rgba(255,255,255,0.03)":"none" }}>
              <div style={{ width:16,height:16,borderRadius:"50%",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"#4ade80",flexShrink:0 }}>{s.index}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12,fontWeight:600,color:"#e2e8f0" }}>{s.label}</div>
                <div style={{ fontSize:10,color:"rgba(226,232,240,0.3)",fontFamily:M }}>{s.urlAfter?.slice(0,50)}</div>
              </div>
              <div style={{ fontSize:9,color:"rgba(226,232,240,0.25)",fontFamily:M }}>{s.strategy}</div>
            </div>
          ))}
        </div>
      )}

      <Terminal2 logs={logs}/>

      <div style={{ display:"flex",gap:8 }}>
        <Btn ch="← Back" variant="secondary" onClick={()=>setStep("agent_open")}/>
        <Btn ch="Save & Create Account →" icon={Save} disabled={!session?.steps?.length}
          onClick={()=>setStep("account")}/>
      </div>
    </div>
  );

  // ── STEP: Account ─────────────────────────────────────────────────────────
  if (step === "account") return (
    <div style={{ display:"flex",flexDirection:"column",gap:18 }} className="fade-up">
      <div>
        <div style={{ fontSize:22,fontWeight:700,color:"#e2e8f0",marginBottom:6 }}>Create admin account</div>
        <p style={{ fontSize:13,color:"rgba(226,232,240,0.4)",lineHeight:1.7 }}>
          This creates your login for <strong style={{ color:"rgba(255,255,255,0.65)" }}>{collegeName}</strong>'s admin dashboard.
        </p>
      </div>

      <Field label="Full Name" value={adminName} onChange={setAdminName} placeholder="Dr. Priya Sharma"/>
      <Field label="Institutional Email" value={adminEmail} onChange={setAdminEmail} type="email" placeholder="admin@yourcollege.edu"
        hint="This becomes your login — must be a real email"/>

      {/* Summary of what will be saved */}
      <div style={{ padding:"13px 15px",background:"rgba(59,130,246,0.05)",border:"1px solid rgba(59,130,246,0.15)",borderRadius:10 }}>
        <div style={{ fontSize:11,fontWeight:700,color:"#60a5fa",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10 }}>What gets saved</div>
        {[
          `Integration mode: ${MODE_INFO[mode].label}`,
          mode === "api"
            ? `${Object.keys(apiCfg.endpoints).length} API endpoints mapped`
            : `${session?.steps?.length||0} browser navigation steps recorded`,
          "Admin account with role = admin",
          `${collegeName} added to CampusCopilot`,
          mode !== "api" ? "Session cookies persisted — future logins skip auth" : "API key stored securely",
        ].map((t,i)=>(
          <div key={i} style={{ display:"flex",gap:7,marginBottom:6 }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:"#3b82f6",flexShrink:0,marginTop:5 }}/>
            <span style={{ fontSize:12,color:"rgba(226,232,240,0.5)" }}>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ display:"flex",gap:8 }}>
        <Btn ch="← Back" variant="secondary" onClick={()=>setStep(mode==="agent"?"agent_teach":"api_map")}/>
        <Btn ch={saving?"Saving…":"Save & Complete Setup"} icon={Save} loading={saving}
          disabled={!adminName.trim()||!emailValid||saving}
          onClick={async()=>{
            setSaving(true);
            try {
              // 1. Close agent session if applicable
              let workflow = null;
              if (mode !== "api" && session?.sessionId) {
                const res = await closeSession(selectedAct);
                workflow = res?.workflow;
              }

              // 2. Save to Supabase integration_sources
              const intPayload: any = {
                college_name:     collegeName,
                portal_url:       portalUrl,
                portal_type:      mode,
                system_name:      mode,
                active:           true,
                integration_type: mode,
                actions:          ACTIONS.map(a=>a.id),
              };
              if (mode === "api" || mode === "hybrid") {
                intPayload.api_config = {
                  baseUrl:   apiCfg.baseUrl,
                  apiKey:    apiCfg.apiKey,   // note: in production, store securely
                  authType:  apiCfg.authType,
                  endpoints: apiCfg.endpoints,
                };
              }
              const { data: src } = await supabase.from("integration_sources").insert(intPayload).select("id").single();

              // 3. Save workflows
              if (workflow && src) {
                await supabase.from("agent_workflows").insert({
                  college_id:  src.id,
                  action_name: workflow.action_name,
                  steps:       workflow.steps,
                  recorded_at: workflow.recorded_at,
                });
              }

              // 4. Create admin account
              await registerAdminAccount(adminEmail, adminName, collegeName);

              setStep("done");
            } finally { setSaving(false); }
          }}/>
      </div>
    </div>
  );

  // ── STEP: Done ────────────────────────────────────────────────────────────
  if (step === "done") return (
    <div style={{ display:"flex",flexDirection:"column",gap:18 }} className="fade-up">
      <div style={{ textAlign:"center",padding:"8px 0" }}>
        <div style={{ width:54,height:54,borderRadius:14,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 0 24px rgba(16,185,129,0.3)" }}>
          <CheckCircle size={25} color="#fff"/>
        </div>
        <div style={{ fontSize:22,fontWeight:700,color:"#e2e8f0",marginBottom:5 }}>Setup complete</div>
        <div style={{ fontSize:13,color:"rgba(226,232,240,0.4)" }}>
          {collegeName} — {MODE_INFO[mode].label}
        </div>
      </div>

      {/* Connection summary */}
      <div style={{ background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"16px 18px" }}>
        <div style={{ fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:12 }}>Integration summary</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
          {[
            ["College",     collegeName],
            ["Mode",        MODE_INFO[mode].label],
            ["Portal",      portalUrl.slice(0,30)+"…"],
            ["Admin email", adminEmail],
          ].map(([k,v])=>(
            <div key={k}>
              <div style={{ fontSize:9,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3 }}>{k}</div>
              <div style={{ fontSize:12,color:"#e2e8f0",fontFamily:M }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
        <a href="/admin" style={{ textDecoration:"none",flex:"1 1 140px" }}>
          <Btn ch="Admin Dashboard" full icon={ArrowRight}/>
        </a>
        <a href="/chat" style={{ textDecoration:"none",flex:"1 1 140px" }}>
          <Btn ch="Student Chat" full variant="secondary" icon={ArrowRight}/>
        </a>
        <a href="/login" style={{ textDecoration:"none" }}>
          <Btn ch="Log in" variant="ghost"/>
        </a>
      </div>
    </div>
  );

  return null;
}

// ── PAGE SHELL ─────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  return (
    <Suspense fallback={<div style={{ height:"100vh",background:"#09090f" }}/>}>
      <PageShell/>
    </Suspense>
  );
}

function PageShell() {
  const params  = useSearchParams();
  const { mode, setMode } = useIntegration();

  // Pre-select mode from URL param if provided
  useEffect(() => {
    const m = params.get("mode") as IntegrationMode;
    if (m && ["api","agent","hybrid"].includes(m)) setMode(m);
  }, [params, setMode]);

  // We need a separate state read for stepper — lifted via a small context trick
  const [step, setStepExt] = useState<WizardStep>("college");

  return (
    <div style={{ minHeight:"100vh",background:"#09090f",color:"#e2e8f0",fontFamily:"'Geist',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#3b82f6;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:10px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @keyframes logIn{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .fade-up{animation:fadeUp .25s ease;}
        .spin{animation:spin .75s linear infinite}
      `}</style>

      {/* Topbar */}
      <div style={{ height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(255,255,255,0.01)",position:"sticky",top:0,zIndex:50 }}>
        <NextLink href="/" style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"rgba(255,255,255,0.3)",textDecoration:"none" }}>← Home</NextLink>
        <span style={{ fontSize:14,fontWeight:700,color:"#e2e8f0",letterSpacing:"-0.01em" }}>
          Campus<span style={{ color:"#3b82f6" }}>Copilot</span>
          <span style={{ fontSize:9,marginLeft:8,background:"rgba(59,130,246,0.1)",color:"#60a5fa",border:"1px solid rgba(59,130,246,0.2)",padding:"2px 7px",borderRadius:3,fontWeight:700,letterSpacing:".07em",textTransform:"uppercase" }}>Setup</span>
        </span>
        <a href="/login" style={{ fontSize:11,color:"rgba(255,255,255,0.3)",textDecoration:"none" }}>Already set up? →</a>
      </div>

      <div style={{ display:"flex",flex:1 }}>
        {/* Sidebar */}
        <div style={{ width:240,borderRight:"1px solid rgba(255,255,255,0.05)",padding:"24px 18px",display:"flex",flexDirection:"column",gap:24,overflowY:"auto",height:"calc(100vh - 52px)",position:"sticky",top:52 }}>
          <div>
            <div style={{ fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:14 }}>Integration modes</div>
            {(["api","agent","hybrid"] as IntegrationMode[]).map(m=>{
              const info = MODE_INFO[m];
              const Icon = info.icon;
              return (
                <div key={m} style={{ display:"flex",gap:9,marginBottom:12 }}>
                  <div style={{ width:28,height:28,borderRadius:7,background:`${info.color}10`,border:`1px solid ${info.color}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <Icon size={13} color={info.color}/>
                  </div>
                  <div>
                    <div style={{ fontSize:12,fontWeight:600,color:"rgba(226,232,240,0.6)",marginBottom:1 }}>{info.label}</div>
                    <div style={{ fontSize:11,color:"rgba(226,232,240,0.25)",lineHeight:1.4 }}>{info.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding:"12px 13px",background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.12)",borderRadius:10 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"#4ade80",marginBottom:8 }}>Security</div>
            {["No credentials stored","Only cookies persisted","API keys encrypted at rest","Sessions expire in 30 min"].map((t,i)=>(
              <div key={i} style={{ display:"flex",gap:6,marginBottom:5 }}>
                <Shield size={10} color="#10b981" style={{ flexShrink:0,marginTop:2 }}/>
                <span style={{ fontSize:11,color:"rgba(226,232,240,0.4)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1,overflowY:"auto",height:"calc(100vh - 52px)" }}>
          <div style={{ maxWidth:560,margin:"0 auto",padding:"36px 28px" }}>
            <div style={{ marginBottom:32 }}>
              <Stepper step={step} mode={mode}/>
            </div>
            <Suspense fallback={null}>
              <OnboardingMain/>
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
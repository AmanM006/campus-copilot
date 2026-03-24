"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUpRight, Plus, Minus, ArrowDown, Terminal, Cloud, Layers,
  Calendar, FileText, CheckCircle2, Activity, Send, Settings, Sidebar,
  X, Bot, User, Check, Globe, Sparkles, Database, Shield, BookOpen,
  FlaskConical, BarChart3, Zap, ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── Chat demo data ─────────────────────────────────────────────────────────────
const CHAT_DATA: Record<string, { role: string; text: string }[]> = {
  "what is the heading of th...": [
    { role: "user", text: "What is the heading of the ME-102 safety manual?" },
    { role: "assistant", text: "The ME-102 Safety Manual is titled \"Machine Shop Safety & Operating Procedures\". It covers personal protective equipment requirements, machine startup checklists, and emergency shutdown protocols." },
  ],
  "What are the prerequisite...": [
    { role: "user", text: "What are the prerequisites for the robotics elective?" },
    { role: "assistant", text: "The Robotics Elective (EE-401) requires:\n\n• CS-201 — Data Structures\n• EE-301 — Control Systems\n• ME-102 Safety Certification (lab access)\n\nYou meet all three. You're good to register." },
  ],
  "Book the robotics lab for...": [
    { role: "user", text: "Book the robotics lab for tomorrow at 3pm and check CNC prerequisites." },
    { role: "assistant", text: "✅ Robotics lab booked for tomorrow, 3:00 PM.\n\n📋 CNC Prerequisites: You need to complete ME-102 Safety Certification before operating the CNC machine. Register for the next session on Friday at 11 AM." },
  ],
};

const scrollTo = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

// ── Onboarding types ──────────────────────────────────────────────────────────
interface OnboardingMsg { role: "assistant" | "user"; content: string; type?: string; }
interface OnboardingState {
  step:        number;
  plan?:       string;   // "starter" | "campus" | "enterprise"
  collegeName?: string;
  system?:     string;
  portalUrl?:  string;
  actions:     string[];
  contact?:    string;   // email for enterprise
}

const ACTION_OPTIONS = [
  { label: "Fetch attendance",    value: "fetch_attendance",  icon: BarChart3   },
  { label: "Fetch grades & GPA",  value: "fetch_grades",      icon: BookOpen    },
  { label: "Book lab slots",      value: "book_lab",          icon: FlaskConical },
  { label: "Upload notes / docs", value: "upload_notes",      icon: Database    },
  { label: "Fetch timetable",     value: "fetch_timetable",   icon: Zap         },
  { label: "Auto-fill forms",     value: "fill_form",         icon: Shield      },
];

const SYSTEM_OPTIONS = ["SLCM", "ERP System", "Moodle", "Custom Portal"];

const ACTION_LABELS: Record<string, string> = {
  fetch_attendance: "Attendance tracking", fetch_grades: "Grades & GPA",
  book_lab: "Lab booking", upload_notes: "Notes upload",
  fetch_timetable: "Timetable sync", fill_form: "Form auto-fill",
};

const AGENT_STEPS = [
  "Opening portal…", "Authenticating credentials…",
  "Mapping navigation structure…", "Indexing data endpoints…",
  "Learning UI patterns…", "Saving workflows…", "Done ✓",
];

function detectPortalType(url: string) {
  if (url.includes("slcm")) return "SLCM";
  if (url.includes("erp"))  return "ERP System";
  if (url.includes("moodle")) return "Moodle";
  return "Custom Portal";
}

// ── ONBOARDING MODAL ──────────────────────────────────────────────────────────
function OnboardingModal({ plan, onClose }: { plan: "starter" | "campus" | "enterprise"; onClose: () => void }) {
  const [messages,  setMessages]  = useState<OnboardingMsg[]>([]);
  const [input,     setInput]     = useState("");
  const [isTyping,  setIsTyping]  = useState(false);
  const [state,     setState]     = useState<OnboardingState>({ step: 0, plan, actions: [] });
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [agentStep, setAgentStep] = useState<number>(-1);  // -1 = not running
  const [done,      setDone]      = useState(false);
  const endRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, agentStep]);

  // Auto-focus input
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 300); }, []);

  // Helper to add assistant message with typing delay
  const addAssistant = useCallback((text: string, extra?: Partial<OnboardingMsg>) => {
    setIsTyping(true);
    const delay = Math.min(1400, text.length * 14);
    setTimeout(() => {
      setMessages(p => [...p, { role: "assistant", content: text, ...extra }]);
      setIsTyping(false);
    }, delay);
  }, []);

  // Boot message
  useEffect(() => {
    const planLabel = plan === "starter" ? "Starter Pilot" : plan === "campus" ? "Campus Rollout" : "Enterprise";
    const intro = plan === "enterprise"
      ? `Hey! 👋 You've selected the **${planLabel}** plan — great choice for multi-campus deployments.\n\nLet's start. **What's your college or university name?**`
      : `Hey! 👋 You've selected the **${planLabel}** plan.\n\nI'll walk you through connecting your college portal so students can access attendance, grades, lab bookings and more through one AI chat.\n\n**What's your college or university name?**`;
    setTimeout(() => addAssistant(intro), 400);
  }, []); // eslint-disable-line

  const addUser = (text: string) =>
    setMessages(p => [...p, { role: "user", content: text }]);

  // Advance to next step
  const advance = useCallback((userText: string, patch: Partial<OnboardingState>) => {
    addUser(userText);
    const next: OnboardingState = { ...state, ...patch, step: state.step + 1 };
    setState(next);

    setTimeout(() => {
      if (next.step === 1) {
        addAssistant(`Nice! And what **student portal system** does ${next.collegeName} use?`);
      } else if (next.step === 2) {
        addAssistant(`Got it — **${next.system}**.\n\nNow paste your college portal's **login URL**:\n(e.g. https://slcm.manipal.edu)`);
      } else if (next.step === 3) {
        const type = detectPortalType(next.portalUrl || "");
        addAssistant(`✅ Portal detected: **${type}** at \`${next.portalUrl}\`\n\nWhich workflows should I automate? Select all that apply:`);
      }
    }, 200);
  }, [state, addAssistant]);

  // Confirm actions → run agent
  const confirmActions = useCallback(async () => {
    if (selected.size === 0) return;
    const actions = [...selected];
    addUser(`Automate: ${actions.map(a => ACTION_LABELS[a]).join(", ")}`);
    const next = { ...state, actions, step: state.step + 1 };
    setState(next);

    setTimeout(() => {
      addAssistant(`Perfect — ${actions.length} workflow${actions.length > 1 ? "s" : ""} selected.\n\nLet me **learn your portal** now. I'll scan the UI and map out the data endpoints. This takes about 30 seconds.`);
    }, 200);

    // Run agent steps after message appears
    setTimeout(async () => {
      for (let i = 0; i < AGENT_STEPS.length; i++) {
        setAgentStep(i);
        await new Promise(r => setTimeout(r, i === 1 ? 900 : 500 + Math.random() * 300));
      }

      // Save to Supabase (non-blocking)
      try {
        await supabase.from("integration_sources").insert({
          college_name: next.collegeName,
          portal_url:   next.portalUrl,
          portal_type:  detectPortalType(next.portalUrl || ""),
          system_name:  next.system,
          actions,
        });
      } catch { /* non-fatal */ }

      setAgentStep(AGENT_STEPS.length); // done

      setTimeout(() => {
        const planDetails = plan === "starter"
          ? "Your **Starter Pilot** is live. Students can start using CampusCopilot immediately."
          : plan === "campus"
          ? "Your **Campus Rollout** is configured. Head to the faculty dashboard to invite staff."
          : "Our enterprise team will contact you within 24 hours to finalise your custom setup.";

        addAssistant(`🎉 **${next.collegeName} is connected!**\n\nI've learned ${actions.length} workflow${actions.length > 1 ? "s" : ""}:\n${actions.map(a => `• ${ACTION_LABELS[a]}`).join("\n")}\n\n${planDetails}`);
        setDone(true);
      }, 600);
    }, 2200);
  }, [selected, state, plan, addAssistant]);

  // Handle text submission
  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    const text = input.trim();
    setInput("");

    if (state.step === 0) {
      advance(text, { collegeName: text });
    } else if (state.step === 2) {
      if (!text.startsWith("http")) {
        addAssistant("⚠️ Please enter a valid URL starting with `http://` or `https://`");
        return;
      }
      advance(text, { portalUrl: text });
    } else if (plan === "enterprise" && state.step === 4) {
      addUser(text);
      setState(p => ({ ...p, contact: text, step: 5 }));
      addAssistant(`✅ Got it — we'll reach out to **${text}** within 24 hours.\n\nIn the meantime, want to configure which workflows to automate?`);
    }
  };

  // Which steps show text input
  const showInput = [0, 2].includes(state.step) && !done;
  const showSystemSelect = state.step === 1 && !isTyping;
  const showActionSelect = state.step === 3 && !isTyping && agentStep === -1;
  const agentRunning = agentStep >= 0 && agentStep < AGENT_STEPS.length;
  const agentDone    = agentStep >= AGENT_STEPS.length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
      animation: "oFadeIn 0.25s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: "100%", maxWidth: 640, height: "85vh", maxHeight: 780,
        background: "#0a0a10",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        animation: "oSlideUp 0.3s ease",
        boxShadow: "0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,58,237,0.15)",
      }}>

        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg,rgba(124,58,237,0.1),rgba(14,165,233,0.05))",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "linear-gradient(135deg,#7c3aed,#3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles size={15} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans',sans-serif" }}>
                CampusCopilot Setup
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono',monospace" }}>
                {plan === "starter" ? "Starter Pilot" : plan === "campus" ? "Campus Rollout" : "Enterprise"} · AI Onboarding
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.07)", border: "none",
            color: "rgba(255,255,255,0.5)", width: 30, height: 30,
            borderRadius: 8, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Progress dots */}
        <div style={{
          display: "flex", gap: 6, padding: "10px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}>
          {["College", "System", "Portal", "Automate", "Learning", "Done"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.4s",
                background: i < state.step ? "#10b981" : i === state.step ? "#7c3aed" : "rgba(255,255,255,0.07)",
                color: i <= state.step ? "#fff" : "rgba(255,255,255,0.3)",
                border: i === state.step ? "2px solid rgba(124,58,237,0.4)" : "none",
              }}>
                {i < state.step ? <Check size={10} /> : i + 1}
              </div>
              <span style={{ fontSize: 9, color: i === state.step ? "#a78bfa" : "rgba(255,255,255,0.2)", fontWeight: i === state.step ? 700 : 400, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {label}
              </span>
              {i < 5 && <div style={{ width: 16, height: 1, background: i < state.step ? "#10b981" : "rgba(255,255,255,0.07)", transition: "background 0.4s" }} />}
            </div>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex", gap: 10,
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
              animation: "oFadeIn 0.25s ease",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: msg.role === "assistant" ? "linear-gradient(135deg,#7c3aed,#3b82f6)" : "rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {msg.role === "assistant" ? <Bot size={13} color="#fff" /> : <User size={13} color="#fff" />}
              </div>
              <div style={{
                maxWidth: "78%", fontSize: 13, lineHeight: 1.7,
                color: msg.role === "user" ? "#fff" : "rgba(255,255,255,0.85)",
                background: msg.role === "user" ? "#7c3aed" : "rgba(255,255,255,0.04)",
                border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)",
                padding: "10px 14px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
                fontFamily: "'DM Sans',sans-serif",
                whiteSpace: "pre-wrap",
              }}
                dangerouslySetInnerHTML={{
                  __html: msg.content
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                    .replace(/`(.*?)`/g, "<code style='background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.87em'>$1</code>")
                    .replace(/\n/g, "<br/>"),
                }}
              />
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: "flex", gap: 10, animation: "oFadeIn 0.2s ease" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bot size={13} color="#fff" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px 14px 14px 14px" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa", animation: `oDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}

          {/* System select buttons */}
          {showSystemSelect && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, paddingLeft: 38, animation: "oFadeIn 0.2s ease" }}>
              {SYSTEM_OPTIONS.map(opt => (
                <button key={opt} onClick={() => advance(opt, { system: opt })} style={{
                  padding: "8px 14px", background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 100,
                  color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", transition: "all 0.2s",
                }}
                  onMouseOver={e => { (e.currentTarget.style.background = "rgba(124,58,237,0.15)"); (e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"); (e.currentTarget.style.color = "#fff"); }}
                  onMouseOut={e => { (e.currentTarget.style.background = "rgba(255,255,255,0.04)"); (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"); (e.currentTarget.style.color = "rgba(255,255,255,0.7)"); }}>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Action multi-select */}
          {showActionSelect && (
            <div style={{ paddingLeft: 38, display: "flex", flexDirection: "column", gap: 10, animation: "oFadeIn 0.2s ease" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {ACTION_OPTIONS.map(opt => {
                  const sel = selected.has(opt.value);
                  const Icon = opt.icon;
                  return (
                    <button key={opt.value} onClick={() => setSelected(p => { const n = new Set(p); n.has(opt.value) ? n.delete(opt.value) : n.add(opt.value); return n; })} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                      background: sel ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${sel ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                      fontSize: 12, color: sel ? "#c4b5fd" : "rgba(255,255,255,0.65)", transition: "all 0.2s",
                      textAlign: "left",
                    }}>
                      <Icon size={13} style={{ color: sel ? "#a78bfa" : "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                      {opt.label}
                      {sel && <Check size={11} style={{ color: "#a78bfa", marginLeft: "auto", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
              <button
                disabled={selected.size === 0}
                onClick={confirmActions}
                style={{
                  padding: "10px 18px", background: selected.size > 0 ? "#7c3aed" : "rgba(255,255,255,0.04)",
                  border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: selected.size > 0 ? "pointer" : "not-allowed", fontFamily: "'DM Sans',sans-serif",
                  opacity: selected.size > 0 ? 1 : 0.4, width: "fit-content",
                  display: "flex", alignItems: "center", gap: 7, transition: "all 0.2s",
                }}>
                <Sparkles size={13} />
                Confirm {selected.size > 0 ? `${selected.size} workflow${selected.size > 1 ? "s" : ""}` : "selection"}
              </button>
            </div>
          )}

          {/* Agent execution panel */}
          {(agentRunning || agentDone) && (
            <div style={{
              marginLeft: 38,
              background: "#0a0a14",
              border: `1px solid ${agentDone ? "rgba(16,185,129,0.3)" : "rgba(14,165,233,0.25)"}`,
              borderRadius: 14, overflow: "hidden",
              animation: "oFadeIn 0.3s ease",
              transition: "border-color 0.4s",
            }}>
              <div style={{
                padding: "10px 14px",
                background: agentDone ? "rgba(16,185,129,0.08)" : "rgba(14,165,233,0.08)",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                {agentDone
                  ? <CheckCircle2 size={14} color="#10b981" />
                  : <div style={{ width: 14, height: 14, border: "2px solid rgba(14,165,233,0.3)", borderTopColor: "#0ea5e9", borderRadius: "50%", animation: "oSpin 0.7s linear infinite" }} />
                }
                <span style={{ fontSize: 11, fontWeight: 700, color: agentDone ? "#10b981" : "#0ea5e9", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {agentDone ? "Portal connected" : "AI agent running"}
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono',monospace", marginLeft: "auto" }}>
                  {state.portalUrl}
                </span>
              </div>
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                {AGENT_STEPS.map((step, i) => {
                  const isRunning = i === agentStep && !agentDone;
                  const isDone    = agentDone || i < agentStep;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      opacity: i > agentStep && !agentDone ? 0.3 : 1,
                      transition: "opacity 0.3s",
                    }}>
                      {isDone
                        ? <CheckCircle2 size={12} color="#10b981" style={{ flexShrink: 0 }} />
                        : isRunning
                          ? <div style={{ width: 12, height: 12, border: "2px solid rgba(14,165,233,0.3)", borderTopColor: "#0ea5e9", borderRadius: "50%", animation: "oSpin 0.7s linear infinite", flexShrink: 0 }} />
                          : <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.2)", flexShrink: 0, margin: "0 3.5px" }} />
                      }
                      <span style={{
                        fontSize: 12, fontFamily: "'DM Mono',monospace",
                        color: isDone ? "rgba(255,255,255,0.7)" : isRunning ? "#fff" : "rgba(255,255,255,0.3)",
                        fontWeight: isRunning ? 600 : 400,
                      }}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Done CTA buttons */}
          {done && (
            <div style={{
              display: "flex", gap: 8, paddingLeft: 38,
              animation: "oFadeIn 0.3s ease", flexWrap: "wrap",
            }}>
              <a href="/chat" style={{
                padding: "9px 16px", background: "rgba(16,185,129,0.15)",
                border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10,
                color: "#10b981", fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                Student chat <ChevronRight size={11} />
              </a>
              <a href="/teacher" style={{
                padding: "9px 16px", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
                color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                Faculty dashboard <ChevronRight size={11} />
              </a>
              <button onClick={onClose} style={{
                padding: "9px 16px", background: "transparent",
                border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
                color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
              }}>
                Close
              </button>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input bar */}
        {showInput && (
          <div style={{ padding: "12px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: "9px 10px 9px 14px",
            }}>
              {state.step === 2 && <Globe size={13} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />}
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder={
                  state.step === 0 ? "Enter your college name…" :
                  state.step === 2 ? "https://your-portal.edu" :
                  "Type your answer…"
                }
                disabled={isTyping}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#fff", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: input.trim() && !isTyping ? "#7c3aed" : "rgba(255,255,255,0.07)",
                  border: "none", cursor: input.trim() && !isTyping ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: input.trim() && !isTyping ? 1 : 0.3, transition: "all 0.2s",
                }}>
                <Send size={13} color="#fff" />
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: 7, fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "'DM Mono',monospace" }}>
              {state.step === 0 && "Your institution's official name"}
              {state.step === 2 && "Full URL including https://"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN LANDING PAGE ─────────────────────────────────────────────────────────
export default function CampusCopilot() {
  const [openFaq,    setOpenFaq]    = useState<number | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [inputVal,   setInputVal]   = useState("");
  const [extraMessages, setExtraMessages] = useState<{ role: string; text: string }[]>([]);

  // Onboarding modal state
  const [onboardingPlan, setOnboardingPlan] = useState<"starter" | "campus" | "enterprise" | null>(null);

  const recentChats = [
    { label: "what is the heading of th...", key: "what is the heading of th..." },
    { label: "What are the prerequisite...", key: "What are the prerequisite..." },
    { label: "Book the robotics lab for...", key: "Book the robotics lab for..." },
  ];

  const currentMessages = activeChat && activeChat !== "__new__"
    ? [...(CHAT_DATA[activeChat] || []), ...extraMessages]
    : extraMessages;

  const handleNewChat = () => { setActiveChat(null); setExtraMessages([]); setInputVal(""); };
  const handleSelectChat = (key: string) => { setActiveChat(key); setExtraMessages([]); setInputVal(""); };

  const handleSend = () => {
    if (!inputVal.trim()) return;
    const msg = inputVal.trim();
    setInputVal("");
    if (activeChat === null) {
      setActiveChat("__new__");
      setExtraMessages([
        { role: "user", text: msg },
        { role: "assistant", text: "Let me look into that for you across the campus systems..." },
      ]);
    } else {
      setExtraMessages(prev => [...prev, { role: "user", text: msg }]);
      setTimeout(() => {
        setExtraMessages(prev => [...prev, { role: "assistant", text: "Got it! Processing that request now..." }]);
      }, 600);
    }
  };

  const handleQuickAction = (text: string) => {
    setActiveChat("__new__");
    const reply = text.includes("Book")
      ? "✅ Robotics lab booked for tomorrow at 3:00 PM."
      : text.includes("prerequisite")
      ? "📋 You meet all prerequisites for your enrolled courses."
      : "📊 Your attendance is 82% — above the 75% minimum.";
    setExtraMessages([{ role: "user", text }, { role: "assistant", text: reply }]);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0a0a0a", color: "#fff", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }
        a { text-decoration: none; color: inherit; }
        html { scroll-behavior: smooth; }

        @keyframes oFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes oSlideUp { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes oDot { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }
        @keyframes oSpin { to{transform:rotate(360deg)} }

        .nav { position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;justify-content:space-between;padding:22px 40px;background:linear-gradient(to bottom,rgba(0,0,0,0.85) 0%,transparent 100%); }
        .nav-logo { font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#fff;cursor:pointer; }
        .nav-links { display:flex;gap:40px; }
        .nav-links a { font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.7);transition:color .2s;cursor:pointer;background:none;border:none; }
        .nav-links a:hover { color:#fff; }
        .nav-cta { font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#fff;cursor:pointer;display:flex;align-items:center;gap:4px; }

        .s1 { position:relative;height:100vh;width:100vw;display:flex;flex-direction:column;background-color:#000;overflow:hidden; }
        .s1-gradient { position:absolute;inset:0;z-index:0;background-image:linear-gradient(180deg,transparent 60%,rgba(244,244,245,0.95) 82%,#f4f4f5 100%),radial-gradient(ellipse 150% 65% at 50% 72%,#6d28d9 0%,#2e1065 40%,#000 75%);pointer-events:none; }
        .s1-main { position:relative;z-index:2;flex:1;display:flex;justify-content:space-between;align-items:center;padding:0 40px;margin-top:40px; }
        .s1-left { display:flex;flex-direction:column;gap:24px; }
        .s1-headline { font-size:clamp(60px,8.5vw,120px);font-weight:500;line-height:0.95;letter-spacing:-0.03em;color:#fff; }
        .s1-headline-fade { color:rgba(255,255,255,0.75); }
        .s1-right { max-width:280px;text-align:right;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.6);font-weight:400;align-self:flex-start;margin-top:80px; }

        .app-window-section { position:relative;z-index:5;background:#f4f4f5;padding:0 40px;display:flex;justify-content:center;margin-top:-40px; }
        .app-window-wrap { width:100%;max-width:1100px;margin:0 auto;transform:perspective(1800px) rotateX(2deg);transition:transform 0.4s ease; }
        .app-window-wrap:hover { transform:perspective(1800px) rotateX(0deg); }
        .window-chrome { background:#1a1a1a;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,0.08),0 40px 120px rgba(0,0,0,0.5),0 20px 40px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.05); }
        .window-titlebar { background:#111;height:44px;display:flex;align-items:center;padding:0 16px;gap:8px;border-bottom:1px solid rgba(255,255,255,0.06); }
        .traffic-light { width:12px;height:12px;border-radius:50%; }
        .tl-red { background:#ff5f57; } .tl-yellow { background:#febc2e; } .tl-green { background:#28c840; }
        .window-title-center { flex:1;text-align:center;font-size:12px;color:rgba(255,255,255,0.4);font-family:'DM Mono',monospace;letter-spacing:0.02em; }
        .app-layout { display:grid;grid-template-columns:260px 1fr;height:520px; }
        .app-sidebar { background:#111;border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;overflow:hidden; }
        .sidebar-header { padding:16px 16px 8px;display:flex;align-items:center;justify-content:space-between; }
        .sidebar-brand { font-size:14px;font-weight:700;color:#fff;letter-spacing:-0.02em; }
        .sidebar-icon-btn { width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.4);cursor:pointer;transition:all 0.2s; }
        .sidebar-icon-btn:hover { background:rgba(255,255,255,0.08);color:#fff; }
        .new-chat-btn { margin:4px 12px 12px;padding:10px 16px;background:#fff;color:#000;border-radius:10px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;cursor:pointer;transition:all 0.2s;border:none; }
        .new-chat-btn:hover { background:rgba(255,255,255,0.88); }
        .sidebar-section-label { padding:8px 16px 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.3); }
        .chat-item { padding:8px 16px;font-size:12.5px;color:rgba(255,255,255,0.5);cursor:pointer;border-radius:8px;margin:1px 8px;display:flex;align-items:center;gap:10px;transition:all 0.15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .chat-item:hover { background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8); }
        .chat-item.active { background:rgba(124,58,237,0.15);color:#fff; }
        .sidebar-footer { margin-top:auto;padding:12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px; }
        .user-avatar { width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#2563eb);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0; }
        .user-info { overflow:hidden; }
        .user-name { font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .user-plan { font-size:10px;color:rgba(255,255,255,0.4); }
        .app-main { display:flex;flex-direction:column;background:#0d0d0d;overflow:hidden; }
        .chat-messages { flex:1;overflow-y:auto;padding:32px 48px 16px;display:flex;flex-direction:column;gap:20px;scrollbar-width:none; }
        .chat-messages::-webkit-scrollbar { display:none; }
        .msg-welcome { text-align:center;padding:48px 0 20px;margin-top:80px; }
        .msg-welcome h2 { font-size:26px;font-weight:600;color:#fff;letter-spacing:-0.02em;margin-bottom:6px; }
        .msg-welcome p { font-size:13px;color:rgba(255,255,255,0.4); }
        .quick-actions { display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:20px; }
        .quick-btn { padding:8px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:100px;font-size:12px;color:rgba(255,255,255,0.7);cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;white-space:nowrap; }
        .quick-btn:hover { background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.2); }
        .msg-bubble { display:flex;gap:12px; }
        .msg-bubble.user { justify-content:flex-end; }
        .bubble-avatar { width:28px;height:28px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#7c3aed,#2563eb);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;margin-top:2px; }
        .bubble-content { max-width:68%;padding:12px 16px;border-radius:16px;font-size:13px;line-height:1.6;white-space:pre-line; }
        .msg-bubble.assistant .bubble-content { background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.85);border-radius:4px 16px 16px 16px; }
        .msg-bubble.user .bubble-content { background:#7c3aed;color:#fff;border-radius:16px 16px 4px 16px; }
        .chat-input-area { padding:16px 48px 20px;flex-shrink:0;width:690px;margin-left:74px; }
        .chat-input-box { display:flex;margin-bottom:115px;align-items:center;gap:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 16px;transition:border-color 0.2s; }
        .chat-input-box:focus-within { border-color:rgba(124,58,237,0.5); }
        .chat-input { flex:1;background:none;border:none;outline:none;font-size:13px;color:#fff;font-family:'DM Sans',sans-serif; }
        .chat-input::placeholder { color:rgba(255,255,255,0.3); }
        .send-btn { width:32px;height:32px;border-radius:8px;background:#ffffff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#000;transition:all 0.2s; }
        .send-btn:hover { transform:scale(1.05); }
        .input-hint { text-align:center;margin-top:8px;font-size:10px;color:rgba(255,255,255,0.2);font-family:'DM Mono',monospace; }

        .s2 { display:flex;flex-direction:column;height:95vh;align-items:center;background:#f4f4f5;padding:130px 40px 0; }
        .s2-grid { width:100%;max-width:1200px;display:grid;grid-template-columns:7fr 5fr;gap:80px;align-items:start; }
        .s2-headline { font-size:clamp(24px,3.5vw,44px);font-weight:400;line-height:1.25;letter-spacing:-0.02em;color:#111; }
        .s2-pill { display:inline-block;background:#111;color:#f4f4f5;padding:2px 20px 6px;border-radius:100px;font-size:clamp(22px,3.2vw,40px);font-weight:400;margin:0 4px;vertical-align:middle; }
        .s2-body { font-size:15px;color:rgba(0,0,0,0.6);line-height:1.7;margin-bottom:24px; }
        .s2-more { display:flex;align-items:center;gap:6px;padding-top:24px;border-top:1px solid rgba(0,0,0,0.1);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#000;cursor:pointer;transition:opacity .2s; }
        .s2-more:hover { opacity:0.6; }
        .s2-bottom-bar { display:flex;align-items:center;justify-content:space-between;padding:28px 0;border-top:1px solid rgba(0,0,0,0.9);margin-top:175px;width:100%;max-width:1500px; }
        .s2-b-text { font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:6px;color:#000; }
        .s2-b-tech { display:flex;gap:32px; }

        .s-image-section { min-height:100vh;position:relative;display:flex;align-items:center;padding:120px 40px;overflow:hidden; }
        .s-image-bg-right { position:absolute;right:0;top:0;width:55%;height:100%;background:url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=2000') center/cover;opacity:0.35;mask-image:linear-gradient(to left,black,transparent);-webkit-mask-image:linear-gradient(to left,black,transparent); }
        .s-image-bg-left { position:absolute;left:0;top:0;width:55%;height:100%;background:url('https://images.unsplash.com/photo-1542626991-cbc4e32524cc?auto=format&fit=crop&q=80&w=2000') center/cover;opacity:0.3;mask-image:linear-gradient(to right,black,transparent);-webkit-mask-image:linear-gradient(to right,black,transparent); }
        .s-image-overlay { position:absolute;inset:0;background:linear-gradient(to bottom,#0a0a0a 0%,transparent 15%,transparent 85%,#0a0a0a 100%);z-index:1;pointer-events:none; }
        .s-image-content { position:relative;z-index:2;width:100%;max-width:1200px;margin:0 auto;display:flex; }
        .s-image-text { max-width:550px; }
        .s-image-eyebrow { font-family:'DM Mono',monospace;color:#7c3aed;text-transform:uppercase;letter-spacing:0.2em;font-size:12px;margin-bottom:24px;display:block; }
        .s-image-title { font-size:clamp(40px,5vw,64px);font-weight:500;line-height:1.1;color:#fff;margin-bottom:24px; }
        .s-image-desc { font-size:18px;color:rgba(255,255,255,0.6);line-height:1.7; }

        .s5-cap { height:100vh;background:#000;padding:0 40px;display:flex;align-items:center; }
        .s5-grid { width:100%;max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:100px;align-items:center; }
        .cap-item { padding:36px 0;border-top:1px solid rgba(255,255,255,0.1);display:grid;grid-template-columns:64px 1fr;gap:24px;transition:border-color 0.3s; }
        .cap-item:hover { border-top-color:#7c3aed; }
        .cap-icon-box { width:64px;height:64px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:16px;display:flex;align-items:center;justify-content:center; }
        .cap-item-title { font-size:22px;font-weight:500;color:#fff;margin-bottom:10px; }
        .cap-item-desc { font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6; }

        /* ── PRICING — "Get Started" glows on hover ── */
        .pricing-section { height:100vh;padding-top:150px;background:#000;display:flex;align-items:center; }
        .pricing-inner { width:100%;max-width:1200px;margin:0 auto; }
        .pricing-header { display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:end;margin-bottom:48px; }
        .pricing-eyebrow { font-family:'DM Mono',monospace;color:#7c3aed;text-transform:uppercase;letter-spacing:0.2em;font-size:12px;margin-bottom:20px;display:block; }
        .pricing-title { font-size:clamp(34px,4vw,52px);font-weight:500;line-height:1.05;color:#fff;letter-spacing:-0.03em; }
        .pricing-subtitle { font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;max-width:360px; }
        .pricing-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:18px; }
        .pricing-card { background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:22px;padding:32px;display:flex;flex-direction:column;transition:border-color 0.3s,background 0.3s;position:relative;overflow:hidden; }
        .pricing-card:hover { border-color:rgba(124,58,237,0.4);background:rgba(124,58,237,0.04); }
        .pricing-card.featured { border-color:#7c3aed;background:rgba(124,58,237,0.08); }
        .pricing-card.featured::before { content:'MOST POPULAR';position:absolute;top:18px;right:18px;font-size:9px;font-weight:700;letter-spacing:0.12em;color:#7c3aed;background:rgba(124,58,237,0.15);padding:4px 10px;border-radius:100px;border:1px solid rgba(124,58,237,0.3); }
        .plan-name { font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:16px; }
        .plan-price { font-size:46px;font-weight:500;letter-spacing:-0.04em;color:#fff;line-height:1;margin-bottom:4px; }
        .plan-price span { font-size:16px;font-weight:400;color:rgba(255,255,255,0.4);vertical-align:top;margin-top:8px;display:inline-block; }
        .plan-unit { font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:20px; }
        .plan-divider { height:1px;background:rgba(255,255,255,0.08);margin-bottom:20px; }
        .plan-features { display:flex;flex-direction:column;gap:10px;flex:1; }
        .plan-feature { display:flex;align-items:flex-start;gap:8px;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.4; }
        .plan-feature-dot { width:5px;height:5px;border-radius:50%;background:#7c3aed;flex-shrink:0;margin-top:5px; }

        /* ── PLAN CTA — normal ── */
        .plan-cta {
          margin-top:20px;padding:13px 0;
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
          border-radius:10px;font-size:11px;font-weight:700;letter-spacing:0.05em;
          text-transform:uppercase;color:rgba(255,255,255,0.6);
          cursor:pointer;text-align:center;transition:all 0.2s;
          display:flex;align-items:center;justify-content:center;gap:6px;
          font-family:'DM Sans',sans-serif;
        }
        .plan-cta:hover {
          background:rgba(255,255,255,0.12);color:#fff;
          border-color:rgba(255,255,255,0.25);
          transform:translateY(-1px);
          box-shadow:0 4px 20px rgba(0,0,0,0.3);
        }
        /* featured card CTA */
        .pricing-card.featured .plan-cta {
          background:#7c3aed;border-color:#7c3aed;color:#fff;
        }
        .pricing-card.featured .plan-cta:hover {
          background:#6d28d9;border-color:#6d28d9;
          box-shadow:0 4px 24px rgba(124,58,237,0.5);
        }

        .pricing-market { margin-top:32px;padding:22px 32px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:32px; }
        .market-stat-num { font-size:34px;font-weight:500;letter-spacing:-0.03em;color:#fff;margin-bottom:3px; }
        .market-stat-label { font-size:12px;color:rgba(255,255,255,0.35); }

        .faq-section { height:100vh;padding:0 40px;background:#000000;padding-top:350px;display:flex;align-items:center; }
        .faq-inner { width:100%;max-width:1200px;margin:0 auto; }
        .faq-header { margin-bottom:48px; }
        .faq-title { font-size:clamp(36px,4.5vw,56px);font-weight:500;line-height:1.05;color:#fff;letter-spacing:-0.03em; }
        .faq-list { border-top:1px solid rgba(255,255,255,0.1); }
        .faq-row { border-bottom:1px solid rgba(255,255,255,0.08); }
        .faq-btn { display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 0;cursor:pointer;transition:opacity .2s;width:100%;background:none;border:none;text-align:left; }
        .faq-btn:hover { opacity:0.7; }
        .faq-q { font-size:17px;font-weight:400;color:#fff; }
        .faq-ico { width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .25s;color:#fff; }
        .faq-ico.open { background:#7c3aed;border-color:#7c3aed; }
        .faq-ans { overflow:hidden;transition:max-height .4s ease,opacity .4s ease; }
        .faq-ans-inner { padding-bottom:20px;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;max-width:800px; }

        .footer { background:#000;padding:250px 40px 0;border-top:1px solid rgba(255,255,255,0.05); }
        .footer-top { display:flex;justify-content:space-between;align-items:center;padding-bottom:80px;flex-wrap:wrap;gap:24px; }
        .footer-links { display:flex;gap:32px;flex-wrap:wrap; }
        .footer-links a { font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.5);transition:color .2s;font-weight:500; }
        .footer-links a:hover { color:#fff; }
        .footer-word { font-size:clamp(80px,18vw,240px);font-weight:900;letter-spacing:-0.04em;line-height:0.75;text-align:center;color:#fff;user-select:none;overflow:hidden; }
      `}</style>

      {/* ── Onboarding modal ── */}
      {onboardingPlan && (
        <OnboardingModal plan={onboardingPlan} onClose={() => setOnboardingPlan(null)} />
      )}

      {/* ── NAV ── */}
      <nav className="nav">
        <span className="nav-logo" onClick={() => scrollTo("hero")}>CampusCopilot</span>
        <div className="nav-links">
          <a onClick={() => scrollTo("features")}>Features</a>
          <a onClick={() => scrollTo("pricing")}>Pricing</a>
          <a onClick={() => scrollTo("faq")}>FAQ</a>
        </div>
        <a href="/login" className="nav-cta">STUDENT LOGIN <ArrowUpRight size={14} /></a>
      </nav>

      {/* ══ S1: HERO ══ */}
      <section className="s1" id="hero">
        <div className="s1-gradient" />
        <div className="s1-main">
          <div className="s1-left">
            <h1 className="s1-headline">
              Orchestrating<br />campus<br />
              <span className="s1-headline-fade">systems<br />via AI</span>
            </h1>
          </div>
          <div className="s1-right">
            We believe an intelligent campus is key to building frictionless student experiences. Campus Copilot is a hybrid RAG and tool-calling MCP server built on Azure AI Foundry.
          </div>
        </div>
      </section>

      {/* ══ APP WINDOW ══ */}
      <div className="app-window-section">
        <div className="app-window-wrap">
          <div className="window-chrome">
            <div className="window-titlebar">
              <div className="traffic-light tl-red" />
              <div className="traffic-light tl-yellow" />
              <div className="traffic-light tl-green" />
              <div className="window-title-center">CampusCopilot — aman_m_006</div>
            </div>
            <div className="app-layout">
              <div className="app-sidebar">
                <div className="sidebar-header">
                  <span className="sidebar-brand">CampusCopilot</span>
                  <div className="sidebar-icon-btn"><Sidebar size={14} /></div>
                </div>
                <button className="new-chat-btn" onClick={handleNewChat}><Plus size={14} /> New Chat</button>
                <div className="sidebar-section-label">Recent</div>
                {recentChats.map((chat, i) => (
                  <div key={i} className={`chat-item ${activeChat === chat.key ? "active" : ""}`} onClick={() => handleSelectChat(chat.key)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    {chat.label}
                  </div>
                ))}
                <div className="sidebar-footer">
                  <div className="user-avatar">N</div>
                  <div className="user-info"><div className="user-name">aman_m_006</div><div className="user-plan">Free plan</div></div>
                  <div className="sidebar-icon-btn" style={{ marginLeft: "auto" }}><Settings size={13} /></div>
                </div>
              </div>
              <div className="app-main">
                <div className="chat-messages">
                  {activeChat === null ? (
                    <div className="msg-welcome">
                      <h2>Good evening, Aman</h2>
                      <p>What can I help you with today?</p>
                      <div className="quick-actions">
                        <div className="quick-btn" onClick={() => handleQuickAction("Book robotics lab for tomorrow at 3pm")}><Calendar size={12} /> Book robotics lab</div>
                        <div className="quick-btn" onClick={() => handleQuickAction("Check my course prerequisites")}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> Check prerequisites</div>
                        <div className="quick-btn" onClick={() => handleQuickAction("View my attendance")}><Activity size={12} /> View attendance</div>
                      </div>
                    </div>
                  ) : (
                    currentMessages.map((msg, i) => (
                      <div key={i} className={`msg-bubble ${msg.role}`}>
                        {msg.role === "assistant" && <div className="bubble-avatar" style={{ fontSize: 9 }}>CC</div>}
                        <div className="bubble-content">{msg.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-input-area">
                  <div className="chat-input-box">
                    <input className="chat-input" placeholder="Ask anything..." value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} />
                    <button className="send-btn" onClick={handleSend}><Send size={14} /></button>
                  </div>
                  <div className="input-hint">AI can make mistakes. Please verify important actions.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ S2: STATEMENT ══ */}
      <section className="s2">
        <div className="s2-grid">
          <h2 className="s2-headline">
            At Campus Copilot we believe that university tech is not just about isolated portals but also about creating —{" "}
            <span className="s2-pill">intelligent</span>{" "}and unified — campus experiences.
          </h2>
          <div>
            <p className="s2-body">We met during a campus hackathon and realized we were all wasting 45+ minutes a week navigating scattered portals for attendance, fees, and lab bookings.</p>
            <p className="s2-body">Instead of building a generic AI, we built a tool that simultaneously retrieves prerequisites via RAG and actively books your lab slot using MCP tools.</p>
            <div className="s2-more">Read our story <ArrowUpRight size={14} /></div>
          </div>
        </div>
        <div className="s2-bottom-bar">
          <div className="s2-b-text" onClick={() => scrollTo("features")}>SEE HOW IT WORKS</div>
          <div className="s2-b-tech">
            <div className="s2-b-text"><Cloud size={16} strokeWidth={2.5} style={{ color: "#3b82f6" }} /><span>AZURE AI</span></div>
            <div className="s2-b-text"><Terminal size={16} strokeWidth={2.5} style={{ color: "#a855f7" }} /><span>MCP TOOLS</span></div>
            <div className="s2-b-text"><Layers size={16} strokeWidth={2.5} style={{ color: "#000" }} /><span>NEXT.JS</span></div>
          </div>
          <div className="s2-b-text" onClick={() => scrollTo("features")}>SCROLL NOW <ArrowDown size={14} /></div>
        </div>
      </section>

      {/* ══ S3: FEATURE ══ */}
      <section className="s-image-section" id="features" style={{ background: "#070707" }}>
        <div className="s-image-bg-right" /><div className="s-image-overlay" />
        <div className="s-image-content">
          <div className="s-image-text">
            <span className="s-image-eyebrow">Instant Context</span>
            <h3 className="s-image-title">Get fast answers<br/>about academics.</h3>
            <p className="s-image-desc">Give everyone instant access to campus knowledge. Ask the Copilot about course prerequisites, lab safety manuals, or exam schedules, and it retrieves the exact policy in seconds.</p>
          </div>
        </div>
      </section>

      {/* ══ S4: FEATURE ══ */}
      <section className="s-image-section" style={{ background: "#0a0a0a" }}>
        <div className="s-image-bg-left" /><div className="s-image-overlay" />
        <div className="s-image-content" style={{ justifyContent: "flex-end" }}>
          <div className="s-image-text" style={{ textAlign: "right" }}>
            <span className="s-image-eyebrow" style={{ color: "#0ea5e9" }}>Take Action</span>
            <h3 className="s-image-title">Manage your tasks<br/>from one place.</h3>
            <p className="s-image-desc">Don't just ask questions — get things done. Tell the Copilot to book a robotics lab slot, verify your fee status, or log your attendance, and it executes the action directly.</p>
          </div>
        </div>
      </section>

      {/* ══ CAPABILITIES ══ */}
      <section className="s5-cap" id="capabilities">
        <div className="s5-grid">
          <div>
            <span className="s-image-eyebrow">Capabilities</span>
            <h2 className="s-image-title" style={{ fontSize: "clamp(48px,6vw,68px)", margin: "24px 0 36px" }}>What you can<br/>accomplish.</h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "15px", lineHeight: 1.6, maxWidth: "300px" }}>Stop switching between disjointed campus apps. Just ask Copilot.</p>
          </div>
          <div>
            {[
              { icon: <Calendar size={26} color="#7c3aed"/>, title: "Book campus resources", desc: "Reserve lab equipment, study rooms, or faculty meeting slots instantly through chat." },
              { icon: <FileText size={26} color="#0ea5e9"/>, title: "Navigate academic policies", desc: "Instantly find out if you meet course prerequisites without digging through course catalogues." },
              { icon: <CheckCircle2 size={26} color="#10b981"/>, title: "Track student records", desc: "Ask the bot to securely pull your current attendance percentage or outstanding fee balances." },
              { icon: <Activity size={26} color="#f59e0b"/>, title: "Automate routine updates", desc: "Faculty can automate lab conflict resolutions and receive weekly class analytics summaries." },
            ].map((s, i) => (
              <div key={i} className="cap-item">
                <div className="cap-icon-box">{s.icon}</div>
                <div><h4 className="cap-item-title">{s.title}</h4><p className="cap-item-desc">{s.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

{/* ══ PRICING ══ */}
<section className="pricing-section" id="pricing">
        <div className="pricing-inner">
          <div className="pricing-header">
            <div>
              <span className="pricing-eyebrow">Pricing</span>
              <h2 className="pricing-title">Simple,<br/>campus-first<br/>pricing.</h2>
            </div>
            <p className="pricing-subtitle">Targeting a $50M SAM across 43M+ enrolled students in India alone. Built to scale from a single department pilot to a full university rollout.</p>
          </div>
          <div className="pricing-grid">
            {/* Starter */}
            <div className="pricing-card">
              <div className="plan-name">Starter Pilot</div>
              <div className="plan-price"><span>$</span>2</div>
              <div className="plan-unit">per student / year</div>
              <div className="plan-divider" />
              <div className="plan-features">
                {["Up to 5,000 students","5 MCP tools included","Basic RAG pipeline","Web dashboard","Best for pilot programs"].map((f,i)=>(
                  <div key={i} className="plan-feature"><div className="plan-feature-dot"/><span>{f}</span></div>
                ))}
              </div>
              {/* ── updated to <a> tag ── */}
              <a href="/onboarding?plan=starter" className="plan-cta" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,textDecoration:"none"}}>
                Get Started <span style={{ fontSize:12 }}>→</span>
              </a>
            </div>

            {/* Campus Rollout (featured) */}
            <div className="pricing-card featured">
              <div className="plan-name">Campus Rollout</div>
              <div className="plan-price"><span>$</span>4</div>
              <div className="plan-unit">per student / year</div>
              <div className="plan-divider" />
              <div className="plan-features">
                {["Unlimited students","Full MCP tool suite","Custom RAG via Azure AI Search","Analytics dashboards","M365 + GitHub Copilot integration"].map((f,i)=>(
                  <div key={i} className="plan-feature"><div className="plan-feature-dot"/><span>{f}</span></div>
                ))}
              </div>
              {/* ── updated to <a> tag ── */}
              <a href="/onboarding?plan=campus" className="plan-cta" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,textDecoration:"none"}}>
                Get Started <span style={{ fontSize:12 }}>→</span>
              </a>
            </div>

            {/* Enterprise */}
            <div className="pricing-card">
              <div className="plan-name">Enterprise</div>
              <div className="plan-price" style={{ fontSize: 32, paddingTop: 6 }}>Custom</div>
              <div className="plan-unit">contact for pricing</div>
              <div className="plan-divider" />
              <div className="plan-features">
                {["Multi-campus deployments","SSO via Azure AD B2C","Strict SLAs guaranteed","White-label options","Dedicated engineering support"].map((f,i)=>(
                  <div key={i} className="plan-feature"><div className="plan-feature-dot"/><span>{f}</span></div>
                ))}
              </div>
              {/* ── updated to <a> tag ── */}
              <a href="/onboarding?plan=enterprise" className="plan-cta" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,textDecoration:"none"}}>
                Contact Sales <span style={{ fontSize:12 }}>→</span>
              </a>
            </div>
          </div>

          <div className="pricing-market">
            <div><div className="market-stat-num">43M+</div><div className="market-stat-label">enrolled students in India</div></div>
            <div><div className="market-stat-num">$50M</div><div className="market-stat-label">serviceable addressable market</div></div>
            <div><div className="market-stat-num">1,000+</div><div className="market-stat-label">universities in target market</div></div>
          </div>
        </div>
      </section>
      {/* ══ FAQ ══ */}
      <section className="faq-section" id="faq">
        <div className="faq-inner">
          <div className="faq-header">
            <span className="pricing-eyebrow">FAQ</span>
            <h2 className="faq-title">Everything you<br/>need to know.</h2>
          </div>
          <div className="faq-list">
            {[
              { q: "What is the Model Context Protocol (MCP)?", a: "MCP is a standardized interface that connects AI models to external tools and APIs. It allows Campus Copilot to securely execute real actions — like booking a lab slot or checking your fee status — instead of just retrieving text. Think of it as giving the AI real hands to interact with campus systems." },
              { q: "How does the RAG pipeline work?", a: "We index your university's documents — handbooks, lab manuals, syllabi, timetables — into Azure AI Search. When a student asks a question, the system retrieves the most relevant excerpts and feeds them to the model, so every answer is grounded in your actual institutional data, not hallucinations." },
              { q: "Is student data secure?", a: "Yes. Campus Copilot operates entirely within your Azure tenant. Student data never leaves your institution's environment. We support SSO via Azure AD B2C, and all MCP tool calls are authenticated and logged for audit compliance." },
              { q: "How long does a campus deployment take?", a: "A Starter Pilot can be live in under a week — we handle the Azure AI Foundry setup and document ingestion. A full Campus Rollout with custom integrations typically takes 2–4 weeks depending on the complexity of your existing portal APIs." },
              { q: "Can faculty use it too?", a: "Absolutely. Faculty have a separate role with access to analytics, lab booking management, and automated conflict resolution. We're building out lecture prep tools and weekly class summary reports as part of the Campus Rollout tier." },
            ].map((f, i) => (
              <div key={i} className="faq-row">
                <button className="faq-btn" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="faq-q">{f.q}</span>
                  <div className={`faq-ico${openFaq === i ? " open" : ""}`}>{openFaq === i ? <Minus size={15} /> : <Plus size={15} />}</div>
                </button>
                <div className="faq-ans" style={{ maxHeight: openFaq === i ? 160 : 0, opacity: openFaq === i ? 1 : 0 }}>
                  <div className="faq-ans-inner">{f.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-links">
            <a href="https://www.linkedin.com/in/amanm006" target="_blank" rel="noopener noreferrer">Team Fight Club</a>
            <a href="https://manipal.edu/mit.html" target="_blank" rel="noopener noreferrer">MIT Manipal</a>
            <a href="https://azure.microsoft.com/en-us/products/ai-foundry" target="_blank" rel="noopener noreferrer">Azure AI Foundry</a>
            <a href="https://github.com/AmanM006/campus-copilot" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <span style={{ fontSize: 11, letterSpacing: "0.05em", color: "rgba(255,255,255,0.4)" }}>© 2026 CAMPUS COPILOT</span>
        </div>
        <div className="footer-word">COPILOT</div>
      </footer>
    </div>
  );
}
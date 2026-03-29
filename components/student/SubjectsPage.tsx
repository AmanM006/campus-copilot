"use client";
// SubjectsPage.tsx — Complete 3-Panel Educational Workspace
// Fixes: (1) New Chat Snapback, (2) Left Panel Chat History,
//        (3) Supabase Persistence for Studio Modules, (4) Widget Rehydration

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, ExternalLink, BookOpen, FileText, Plus, Loader,
  Search, CheckSquare, Send, Zap, BrainCircuit, ListChecks,
  FileBox, MessageSquare, Trash2, ChevronLeft, ChevronRight,
  X, Check, Sparkles, Cuboid, History, RotateCcw, Copy,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { supabase } from "@/lib/supabase";
import { getAllDocsForSubject, uploadStudentDocument } from "@/lib/db_extended";
import { Simulation3DPanel, type SimulationSpec } from "./Simulation3DPanel";
import { PhysicsSandboxPanel, type PhysicsSandboxSpec, type PhysicsModelType } from "./PhysicsSandboxPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subject {
  id: string; name: string; code: string; color: string; semester: number;
  teacher_name: string; teacher_email: string;
  attendance?: { percentage: number; attended: number; total: number };
  doc_count?: number;
}

interface Doc {
  id: string; name: string; file_url: string; size_bytes?: number;
  created_at: string; doc_type?: string; _source: "teacher" | "student";
}

interface Message {
  id: string; role: "user" | "assistant"; content: string; thread_id: string;
  created_at?: string;
}

interface Thread {
  thread_id: string;
  title: string;
  updated_at?: string;
}

interface QuizItem {
  question: string; options: string[]; answer: string; explanation: string;
}

interface FlashcardItem {
  question: string; answer: string;
}

type StudioActionType = "flashcards" | "summary" | "quiz" | "exam_focus" | "notes" | "simulation_3d" | "physics_sandbox";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(b?: number) {
  if (!b) return "—";
  return b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}

function normalizeSubjectCode(value?: string) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function inferSubjectCodeFromDocName(name?: string) {
  const raw = (name || "").toUpperCase();
  const match = raw.match(/([A-Z]{2,5})[\s\-_]?(\d{3,4})/);
  if (!match) return "";
  return `${match[1]}${match[2]}`;
}

/** Safely extract a thread title from the first message — avoid showing raw JSON */
function extractThreadTitle(content: string): string {
  // Split at code fences to get only the prose part
  const prose = content.split("```")[0].trim();
  const clean = prose.replace(/[#*`]/g, "").trim();
  return clean.length > 0 ? clean.slice(0, 38) + (clean.length > 38 ? "…" : "") : "New conversation";
}

/** Parse JSON object from AI reply that may be wrapped in markdown code fences */
function extractJsonObject(text: string): any {
  const trimmed = (text || "").trim();
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeFenceMatch ? codeFenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace  = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("No valid JSON found");
  }
}

/**
 * Detect if an assistant message contains an interactive module JSON block.
 * Returns the parsed spec and type, or null.
 */
function detectInteractiveSpec(content: string): {
  type: "simulation" | "physics" | "quiz" | "flashcards";
  raw: any;
  prose: string;
} | null {
  // Only process if there's a JSON code block
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fenceMatch) return null;

  try {
    const parsed = JSON.parse(fenceMatch[1].trim());

    // Determine type by key signature
    if (parsed.sceneType || (parsed.nodes && parsed.edges)) {
      return { type: "simulation", raw: parsed, prose: content.split("```")[0].trim() };
    }
    if (parsed.modelType || parsed.params) {
      return { type: "physics", raw: parsed, prose: content.split("```")[0].trim() };
    }
    if (parsed.quiz || parsed.questions) {
      return { type: "quiz", raw: parsed, prose: content.split("```")[0].trim() };
    }
    if (parsed.flashcards) {
      return { type: "flashcards", raw: parsed, prose: content.split("```")[0].trim() };
    }
  } catch {
    // Not valid JSON — render normally
  }
  return null;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SuggestedPrompt({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "14px 18px",
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, color: "#a1a1aa", fontSize: 13, cursor: "pointer",
      transition: "all 0.2s", textAlign: "left", fontFamily: "inherit",
    }}
      onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "#fff"; }}
      onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "#a1a1aa"; }}
    >
      {text}
    </button>
  );
}

function StudioAction({ icon, iconBg, title, subtitle, onClick, disabled }: {
  icon: React.ReactNode; iconBg: string; title: string; subtitle: string;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12, cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.2s", textAlign: "left", width: "100%",
      opacity: disabled ? 0.5 : 1,
    }}
      onMouseOver={e => { if (!disabled) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; } }}
      onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)"; }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ color: "#e4e4e7", fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ color: "#71717a", fontSize: 11, marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  );
}

/** Card shown in chat when a message contains an interactive module */
function InteractiveModuleCard({
  type, label, onOpen,
}: { type: string; label: string; onOpen: () => void }) {
  const iconMap: Record<string, React.ReactNode> = {
    simulation: <Cuboid size={18} color="#22d3ee" />,
    physics:    <BrainCircuit size={18} color="#22c55e" />,
    quiz:       <ListChecks size={18} color="#fbbf24" />,
    flashcards: <FileBox size={18} color="#c084fc" />,
  };
  const colorMap: Record<string, string> = {
    simulation: "#22d3ee", physics: "#22c55e", quiz: "#fbbf24", flashcards: "#c084fc",
  };
  const color = colorMap[type] || "#a78bfa";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 18px", borderRadius: 14,
      background: `${color}0d`, border: `1px solid ${color}30`,
      margin: "8px 0",
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {iconMap[type] || <Sparkles size={18} color={color} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Interactive Module Ready</div>
        <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{label}</div>
      </div>
      <button onClick={onOpen} style={{
        padding: "8px 16px", borderRadius: 9, border: "none",
        background: color, color: "#000", fontSize: 12, fontWeight: 700,
        cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.2s",
        flexShrink: 0,
      }}
        onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
        onMouseOut={e => e.currentTarget.style.opacity = "1"}
      >
        Open Module
      </button>
    </div>
  );
}

// ─── Main SubjectWorkspace ────────────────────────────────────────────────────

export function SubjectWorkspace({
  subject, studentId, onBack,
}: { subject: any; studentId: string; onBack: () => void }) {

  // ── Docs ──────────────────────────────────────────────────────────────────
  const [docs,          setDocs]          = useState<Doc[]>([]);
  const [loadingDocs,   setLoadingDocs]   = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const [selectedDocs,  setSelectedDocs]  = useState<Set<string>>(new Set());
  const [docSearch,     setDocSearch]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Threads / Chat ────────────────────────────────────────────────────────
  const [threads,        setThreads]        = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>(() =>
    `subj_${subject.id}_${crypto.randomUUID()}`  // FIX 1: never null
  );
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState("");
  const [isTyping,       setIsTyping]       = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Studio ────────────────────────────────────────────────────────────────
  const [examMode,            setExamMode]            = useState(false);
  const [studioLoading,       setStudioLoading]       = useState(false);
  const [activeStudioAction,  setActiveStudioAction]  = useState<StudioActionType | null>(null);
  const [studioError,         setStudioError]         = useState<string | null>(null);
  const [simulationPrompt,    setSimulationPrompt]    = useState("");
  const [physicsPrompt,       setPhysicsPrompt]       = useState("");

  // ── Interactive module state ──────────────────────────────────────────────
  const [simulationSpec, setSimulationSpec] = useState<SimulationSpec | null>(null);
  const [physicsSpec,    setPhysicsSpec]    = useState<PhysicsSandboxSpec | null>(null);
  const [quizItems,      setQuizItems]      = useState<QuizItem[] | null>(null);
  const [quizIndex,      setQuizIndex]      = useState(0);
  const [quizChoice,     setQuizChoice]     = useState<string | null>(null);
  const [quizChecked,    setQuizChecked]    = useState(false);
  const [quizScore,      setQuizScore]      = useState(0);
  const [flashcards,     setFlashcards]     = useState<FlashcardItem[] | null>(null);
  const [flashIndex,     setFlashIndex]     = useState(0);
  const [flashReveal,    setFlashReveal]    = useState(false);

  // ─── Scroll ───────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ─── Load docs ────────────────────────────────────────────────────────────

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const { all } = await getAllDocsForSubject(subject.id, studentId, subject.code);
      const list = all || [];
      setDocs(list);
      setSelectedDocs(new Set(list.map((d: Doc) => d.id)));
    } catch {}
    setLoadingDocs(false);
  }, [subject.id, studentId, subject.code]);

  // ─── Load threads ─────────────────────────────────────────────────────────

  const loadThreads = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("thread_id, content, role, created_at")
      .eq("user_id", studentId)
      .like("thread_id", `subj_${subject.id}_%`)
      .order("created_at", { ascending: false });

    if (!data) return;

    const seen = new Set<string>();
    const ts: Thread[] = [];
    for (const m of data) {
      if (!seen.has(m.thread_id) && m.role === "user") {
        seen.add(m.thread_id);
        ts.push({
          thread_id:  m.thread_id,
          title:      extractThreadTitle(m.content),
          updated_at: m.created_at,
        });
      }
    }
    setThreads(ts);
  }, [studentId, subject.id]);

  useEffect(() => {
    loadDocs();
    loadThreads();
  }, [loadDocs, loadThreads]);

  // ─── Load messages for active thread ──────────────────────────────────────

  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .eq("thread_id", activeThreadId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages((data as Message[]) || []);
        // Clear any active module when switching threads
        clearInteractiveMode();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    setUploading(true); setUploadError(null);
    try {
      const doc = await uploadStudentDocument(studentId, subject.id, file, subject.code, subject.name);
      setDocs(prev => [{ ...(doc as Doc), _source: "student" }, ...prev]);
      setSelectedDocs(prev => new Set(prev).add((doc as Doc).id));
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed.");
    }
    setUploading(false);
  };

  const toggleDoc = (id: string) => {
    setSelectedDocs(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const clearInteractiveMode = () => {
    setStudioError(null);
    setSimulationSpec(null);
    setPhysicsSpec(null);
    setQuizItems(null);
    setQuizIndex(0); setQuizChoice(null); setQuizChecked(false); setQuizScore(0);
    setFlashcards(null); setFlashIndex(0); setFlashReveal(false);
  };

  // FIX 1: startNewThread always assigns a real UUID — never null
  const startNewThread = () => {
    const newId = `subj_${subject.id}_${crypto.randomUUID()}`;
    setActiveThreadId(newId);
    setMessages([]);
    clearInteractiveMode();
    setInput("");
  };

  const deleteThread = async (tid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("messages").delete().eq("thread_id", tid).eq("user_id", studentId);
    setThreads(p => p.filter(t => t.thread_id !== tid));
    if (activeThreadId === tid) startNewThread();
  };

  const canChat = selectedDocs.size > 0;
  const filteredDocs = docs.filter(d => d.name.toLowerCase().includes(docSearch.toLowerCase()));
  const activeDocNames = docs.filter(d => selectedDocs.has(d.id)).map(d => d.name);

  // ─── Persist a message pair to Supabase ───────────────────────────────────

  const persistMessage = async (role: "user" | "assistant", content: string) => {
    await supabase.from("messages").insert([{
      user_id: studentId, content, role, thread_id: activeThreadId,
    }]);
  };

  // ─── Send Chat ────────────────────────────────────────────────────────────

  const sendChatMessage = async (overridePrompt?: string) => {
    const text = (overridePrompt || input).trim();
    if (!text || isTyping || !canChat) return;

    setInput(""); setIsTyping(true);

    const userMsg: Message = {
      id: Date.now().toString(), role: "user",
      content: text, thread_id: activeThreadId,
    };
    setMessages(prev => [...prev, userMsg]);
    await persistMessage("user", text);

    // Optimistically add streaming placeholder
    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", content: "", thread_id: activeThreadId }]);

    try {
      const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
      const res = await fetch(`${backend}/api/chat/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text, user_id: studentId,
          subject_context: {
            subject_name: subject.name, subject_code: subject.code,
            selected_docs: activeDocNames, exam_mode: examMode,
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = ""; let sseBuffer = ""; let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n"); sseBuffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) { currentEvent = ""; continue; }
          if (line.startsWith("event:")) { currentEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith("data:")) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            if (currentEvent === "token" && payload.text) {
              aiContent += payload.text;
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: aiContent } : m));
            }
            if (currentEvent === "done" && payload.full_text && !aiContent) {
              aiContent = payload.full_text;
            }
          } catch {}
        }
      }

      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: aiContent } : m));
      await persistMessage("assistant", aiContent);
      await loadThreads();
    } catch (err) {
      const errMsg = "Connection failed. Check your backend server.";
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: errMsg } : m));
      await persistMessage("assistant", errMsg);
    }
    setIsTyping(false);
  };

  // ─── Studio: Generate 3D Simulation ──────────────────────────────────────

  const generate3DSimulation = async () => {
    const prompt = simulationPrompt.trim();
    if (!prompt) { setStudioError("Enter a concept to visualise."); return; }

    setStudioLoading(true); setActiveStudioAction("simulation_3d"); setStudioError(null);
    clearInteractiveMode();

    // FIX 3: persist user prompt to Supabase
    const userPromptContent = `Generate a 3D flow diagram for: **${prompt}**`;
    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: "user",
      content: userPromptContent, thread_id: activeThreadId,
    }]);
    await persistMessage("user", userPromptContent);

    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", content: "", thread_id: activeThreadId }]);

    try {
      const res = await fetch(`${backend}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Create a 3D architecture diagram for: "${prompt}". Context: ${subject.code} - ${subject.name}. Return STRICT JSON with: {"title":"...","description":"...","sceneType":"node_graph","nodes":[{"id":"n1","label":"...","type":"concept","color":"#38bdf8"}],"edges":[{"from":"n1","to":"n2","label":"..."}],"steps":["..."]}. Return JSON only.`,
          user_id: studentId,
          subject_context: { subject_name: subject.name, subject_code: subject.code, selected_docs: activeDocNames, studio_action: "simulation_3d" },
        }),
      });
      const body = await res.json();
      const rawReply = String(body?.reply || "");
      const parsed = extractJsonObject(rawReply);

      // Normalise spec
      const spec: SimulationSpec = {
        title: String(parsed?.title || `3D: ${prompt}`),
        description: parsed?.description,
        sceneType: parsed?.sceneType || "node_graph",
        nodes: Array.isArray(parsed?.nodes) ? parsed.nodes.map((n: any, i: number) => ({
          id: String(n?.id || `n${i}`), label: String(n?.label || `Node ${i}`),
          type: n?.type, color: n?.color,
        })) : [{ id: "n1", label: "No data returned", type: "concept" }],
        edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
        steps: Array.isArray(parsed?.steps) ? parsed.steps : [],
      };
      setSimulationSpec(spec);

      // FIX 3: persist the AI response (JSON wrapped in fence) to Supabase
      const assistantContent = `Here's your **3D flow diagram** for "${prompt}":\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: assistantContent } : m));
      await persistMessage("assistant", assistantContent);
      await loadThreads();
    } catch (e: any) {
      const errMsg = "Failed to generate 3D simulation. Try again.";
      setStudioError(errMsg);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: errMsg } : m));
      await persistMessage("assistant", errMsg);
    }
    setStudioLoading(false); setActiveStudioAction(null);
    setSimulationPrompt("");
  };

  // ─── Studio: Generate Physics Sandbox ────────────────────────────────────

  const generatePhysicsSandbox = async () => {
    const prompt = physicsPrompt.trim();
    if (!prompt) { setStudioError("Enter a concept for the sandbox."); return; }

    setStudioLoading(true); setActiveStudioAction("physics_sandbox"); setStudioError(null);
    clearInteractiveMode();

    const userPromptContent = `Launch concept sandbox for: **${prompt}**`;
    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: "user",
      content: userPromptContent, thread_id: activeThreadId,
    }]);
    await persistMessage("user", userPromptContent);

    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", content: "", thread_id: activeThreadId }]);

    try {
      const res = await fetch(`${backend}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Create a concept sandbox spec for: "${prompt}". Return STRICT JSON: {"title":"...","concept":"...","modelType":"projectile|pendulum|spring|deadlock|tree|cpu_scheduling|network_topology","notes":["..."],"equations":["..."],"intuition":"...","params":[{"key":"...","label":"...","value":1,"min":0,"max":10,"step":0.1}],"caveats":["..."]}. JSON only.`,
          user_id: studentId,
          subject_context: { subject_name: subject.name, subject_code: subject.code, selected_docs: activeDocNames, studio_action: "physics_sandbox" },
        }),
      });
      const body = await res.json();
      const rawReply = String(body?.reply || "");
      const parsed = extractJsonObject(rawReply);

      const spec: PhysicsSandboxSpec = {
        title:     String(parsed?.title || `Sandbox: ${prompt}`),
        concept:   String(parsed?.concept || prompt),
        modelType: (parsed?.modelType as PhysicsModelType) || "projectile",
        notes:     Array.isArray(parsed?.notes) ? parsed.notes : ["No notes returned."],
        equations: Array.isArray(parsed?.equations) ? parsed.equations : [],
        intuition: String(parsed?.intuition || ""),
        params:    Array.isArray(parsed?.params) ? parsed.params : [],
        caveats:   parsed?.caveats || [],
      };
      setPhysicsSpec(spec);

      const assistantContent = `Here's your **concept sandbox** for "${prompt}":\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: assistantContent } : m));
      await persistMessage("assistant", assistantContent);
      await loadThreads();
    } catch (e: any) {
      const errMsg = "Failed to generate sandbox. Try again.";
      setStudioError(errMsg);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: errMsg } : m));
      await persistMessage("assistant", errMsg);
    }
    setStudioLoading(false); setActiveStudioAction(null);
    setPhysicsPrompt("");
  };

  // ─── Studio: Quiz / Flashcards ────────────────────────────────────────────

  const generateDocTool = async (action: "quiz" | "flashcards" | "summary" | "exam_focus" | "notes") => {
    if (activeDocNames.length === 0) { setStudioError("Select at least one document first."); return; }
    setStudioLoading(true); setActiveStudioAction(action); setStudioError(null);
    clearInteractiveMode();

    const actionLabel: Record<string, string> = {
      quiz: "Practice Quiz", flashcards: "Smart Flashcards", summary: "Deep Summary",
      exam_focus: "Exam Focus", notes: "Formatted Notes",
    };
    const docsLabel = activeDocNames.join(", ");
    const subjectLabel = `${subject.code} - ${subject.name}`;

    const promptMap: Record<string, string> = {
      quiz:       `Create a 6-question MCQ quiz for ${subjectLabel} from: ${docsLabel}. Return STRICT JSON: {"quiz":[{"question":"...","options":["A","B","C","D"],"answer":"exact option text","explanation":"..."}]}. JSON only.`,
      flashcards: `Create 10 flashcards for ${subjectLabel} from: ${docsLabel}. Return STRICT JSON: {"flashcards":[{"question":"...","answer":"..."}]}. JSON only.`,
      summary:    `Give a high-yield summary for ${subjectLabel} from: ${docsLabel}. Organize by major topics.`,
      exam_focus: `Identify most exam-likely topics for ${subjectLabel} from: ${docsLabel}. Give ranked priority list.`,
      notes:      `Generate structured revision notes for ${subjectLabel} from: ${docsLabel}. Include headings, formulas, and recap bullets.`,
    };

    const userPromptContent = `Generate ${actionLabel[action]} from selected documents.`;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userPromptContent, thread_id: activeThreadId }]);
    await persistMessage("user", userPromptContent);

    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", content: "", thread_id: activeThreadId }]);

    try {
      const res = await fetch(`${backend}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: promptMap[action], user_id: studentId, subject_context: { subject_name: subject.name, subject_code: subject.code, selected_docs: activeDocNames, exam_mode: examMode, studio_action: action } }),
      });
      const body = await res.json();
      const rawReply = String(body?.reply || "");

      if (action === "quiz" || action === "flashcards") {
        try {
          const parsed = extractJsonObject(rawReply);
          if (action === "quiz") {
            const items: QuizItem[] = (parsed?.quiz || []).filter((q: any) => q.question && q.options?.length >= 2 && q.answer);
            if (items.length === 0) throw new Error("No valid quiz items");
            setQuizItems(items);
          } else {
            const cards: FlashcardItem[] = (parsed?.flashcards || []).filter((c: any) => c.question && c.answer);
            if (cards.length === 0) throw new Error("No valid flashcards");
            setFlashcards(cards);
          }
        } catch {
          setStudioError("AI returned invalid data. Try again.");
        }
        // FIX 3: persist JSON response
        const assistantContent = `\`\`\`json\n${rawReply}\n\`\`\``;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: assistantContent } : m));
        await persistMessage("assistant", assistantContent);
      } else {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: rawReply } : m));
        await persistMessage("assistant", rawReply);
      }
      await loadThreads();
    } catch (e: any) {
      const errMsg = "Generation failed. Check your backend.";
      setStudioError(errMsg);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: errMsg } : m));
      await persistMessage("assistant", errMsg);
    }
    setStudioLoading(false); setActiveStudioAction(null);
  };

  // ─── FIX 4: Handle "Open Module" from rehydrated card ────────────────────

  const openModuleFromSpec = (type: string, raw: any) => {
    clearInteractiveMode();
    if (type === "simulation") {
      const spec: SimulationSpec = {
        title: raw?.title || "3D Diagram",
        description: raw?.description,
        sceneType: raw?.sceneType || "node_graph",
        nodes: raw?.nodes || [],
        edges: raw?.edges || [],
        steps: raw?.steps || [],
      };
      setSimulationSpec(spec);
    } else if (type === "physics") {
      setPhysicsSpec(raw as PhysicsSandboxSpec);
    } else if (type === "quiz") {
      const items: QuizItem[] = (raw?.quiz || raw?.questions || []);
      if (items.length > 0) setQuizItems(items);
    } else if (type === "flashcards") {
      const cards: FlashcardItem[] = (raw?.flashcards || []);
      if (cards.length > 0) setFlashcards(cards);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const isInteractiveActive = !!(simulationSpec || physicsSpec || (quizItems && quizItems.length > 0) || (flashcards && flashcards.length > 0));

  return (
    <div style={{
      display: "flex", width: "100%", height: "100vh", overflow: "hidden",
      background: "#0a0a0f", color: "#e4e4e7", fontFamily: "'Inter', 'system-ui', sans-serif",
    }}>
      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 300, background: "#08080d", borderRight: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column", height: "100%", flexShrink: 0,
      }}>
        {/* Back + Subject Header */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <button onClick={onBack} style={{
            display: "flex", alignItems: "center", gap: 6, background: "transparent",
            border: "none", color: "#71717a", cursor: "pointer", fontSize: 12,
            fontWeight: 500, marginBottom: 16, padding: 0, fontFamily: "inherit",
            transition: "color 0.2s",
          }}
            onMouseOver={e => e.currentTarget.style.color = "#fff"}
            onMouseOut={e => e.currentTarget.style.color = "#71717a"}
          >
            <ArrowLeft size={14} /> All Subjects
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${subject.color || "#0ea5e9"}, #3b82f6)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#fff",
            }}>
              {subject.code?.split(" ")[1]?.slice(0, 3) || subject.code?.slice(0, 3) || "?"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {subject.name}
              </div>
              <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{subject.code}</div>
            </div>
          </div>
        </div>

        {/* Exam Mode Toggle */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div onClick={() => setExamMode(v => !v)} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: 9, cursor: "pointer",
            background: examMode ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${examMode ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`,
            transition: "all 0.2s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: examMode ? "#ef4444" : "#71717a" }}>
              <Zap size={14} color={examMode ? "#ef4444" : "#71717a"} /> Exam Mode
            </div>
            <div style={{ width: 32, height: 18, background: examMode ? "#ef4444" : "rgba(255,255,255,0.1)", borderRadius: 10, position: "relative", transition: "all 0.2s" }}>
              <div style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: examMode ? 16 : 2, transition: "all 0.2s" }} />
            </div>
          </div>
        </div>

        {/* ── SOURCES SECTION ── */}
        <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Sources ({docs.length})
            </span>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#0ea5e9" }}>
              <button onClick={() => setSelectedDocs(new Set(docs.map(d => d.id)))} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>All</button>
              <button onClick={() => setSelectedDocs(new Set())} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>None</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={13} color="#52525b" />
              <input placeholder="Search docs…" value={docSearch} onChange={e => setDocSearch(e.target.value)} style={{ background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: 12, width: "100%", fontFamily: "inherit" }} />
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: "#fff", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer", color: "#000", fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center" }}>
              {uploading ? <Loader size={14} /> : <Plus size={16} />}
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          </div>
          {uploadError && <div style={{ fontSize: 11, color: "#ef4444", padding: "6px 8px", background: "rgba(239,68,68,0.08)", borderRadius: 6, marginBottom: 6 }}>{uploadError}</div>}
        </div>

        {/* Doc list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
          {loadingDocs ? (
            <div style={{ fontSize: 12, color: "#52525b", padding: "10px 4px" }}>Loading…</div>
          ) : filteredDocs.length === 0 ? (
            <div style={{ fontSize: 12, color: "#52525b", padding: "10px 4px", textAlign: "center" }}>No documents found.</div>
          ) : filteredDocs.map(doc => {
            const active = selectedDocs.has(doc.id);
            return (
              <div key={doc.id} onClick={() => toggleDoc(doc.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                borderRadius: 9, marginBottom: 3, cursor: "pointer",
                background: active ? "rgba(14,165,233,0.07)" : "transparent",
                border: `1px solid ${active ? "rgba(14,165,233,0.2)" : "transparent"}`,
                transition: "all 0.15s",
              }}
                onMouseOver={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseOut={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {active
                  ? <div style={{ width: 16, height: 16, background: "#0ea5e9", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={11} color="#fff" strokeWidth={3} /></div>
                  : <div style={{ width: 16, height: 16, border: "1.5px solid #3f3f46", borderRadius: 4, flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: active ? "#fff" : "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                    <FileText size={11} color={active ? "#0ea5e9" : "#52525b"} /> {doc.name}
                  </div>
                  <div style={{ fontSize: 10, color: "#52525b", marginTop: 2, paddingLeft: 17 }}>{fmtSize(doc.size_bytes)}</div>
                </div>
                <button onClick={ev => { ev.stopPropagation(); window.open(doc.file_url, "_blank"); }} style={{ background: "transparent", border: "none", color: "#52525b", cursor: "pointer", padding: 4, borderRadius: 6, display: "flex", alignItems: "center" }}
                  onMouseOver={e => e.currentTarget.style.color = "#fff"}
                  onMouseOut={e => e.currentTarget.style.color = "#52525b"}
                >
                  <ExternalLink size={11} />
                </button>
              </div>
            );
          })}
        </div>

        {/* ── FIX 2: CHAT HISTORY SECTION ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 6px" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Chat History
            </span>
            <button onClick={startNewThread} style={{
              display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "4px 9px",
              color: "#a1a1aa", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.2s",
            }}
              onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#fff"; }}
              onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#a1a1aa"; }}
            >
              <Plus size={11} /> New
            </button>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", padding: "2px 10px 10px" }}>
            {threads.length === 0 ? (
              <div style={{ fontSize: 11, color: "#3f3f46", padding: "6px 4px", textAlign: "center" }}>No conversations yet</div>
            ) : threads.map(t => {
              const isActive = t.thread_id === activeThreadId;
              return (
                <div key={t.thread_id}
                  onClick={() => { setActiveThreadId(t.thread_id); clearInteractiveMode(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 9px",
                    borderRadius: 8, cursor: "pointer", marginBottom: 2,
                    background: isActive ? "rgba(14,165,233,0.1)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(14,165,233,0.25)" : "transparent"}`,
                    transition: "all 0.15s", position: "relative",
                  }}
                  onMouseOver={e => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    (e.currentTarget.querySelector(".del-btn") as HTMLElement | null)?.style && ((e.currentTarget.querySelector(".del-btn") as HTMLElement).style.opacity = "1");
                  }}
                  onMouseOut={e => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                    (e.currentTarget.querySelector(".del-btn") as HTMLElement | null)?.style && ((e.currentTarget.querySelector(".del-btn") as HTMLElement).style.opacity = "0");
                  }}
                >
                  <MessageSquare size={11} color={isActive ? "#0ea5e9" : "#52525b"} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: isActive ? "#fff" : "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isActive ? 600 : 400 }}>
                    {t.title}
                  </span>
                  <button className="del-btn" onClick={e => deleteThread(t.thread_id, e)} style={{
                    background: "transparent", border: "none", color: "#71717a", cursor: "pointer",
                    padding: 3, borderRadius: 5, display: "flex", opacity: 0, transition: "opacity 0.15s",
                  }}
                    onMouseOver={e => { e.currentTarget.style.color = "#ef4444"; }}
                    onMouseOut={e => { e.currentTarget.style.color = "#71717a"; }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sources active indicator */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: canChat ? "#10b981" : "#3f3f46", boxShadow: canChat ? "0 0 8px rgba(16,185,129,0.5)" : "none", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: canChat ? "#a1a1aa" : "#52525b" }}>
            {selectedDocs.size} source{selectedDocs.size !== 1 ? "s" : ""} active
          </span>
        </div>
      </div>

      {/* ── CENTER PANEL ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0f", minWidth: 0, position: "relative" }}>
        {/* Header */}
        <div style={{ padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,10,15,0.9)", backdropFilter: "blur(12px)", flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{subject.name}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {isInteractiveActive && (
              <button onClick={clearInteractiveMode} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#a1a1aa", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
                onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#fff"; }}
                onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a1a1aa"; }}
              >
                <X size={12} /> Close Module
              </button>
            )}
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 16px", display: "flex", flexDirection: "column" }}>

          {/* Error banner */}
          {studioError && (
            <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", fontSize: 13, color: "#fca5a5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {studioError}
              <button onClick={() => setStudioError(null)} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}><X size={14} /></button>
            </div>
          )}

          {/* Loading spinner */}
          {studioLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.05)", fontSize: 13, color: "#e4e4e7", marginBottom: 16 }}>
              <Loader size={16} color="#38bdf8" style={{ animation: "spin 1s linear infinite" }} />
              Generating {activeStudioAction?.replace("_", " ")} from selected documents…
            </div>
          )}

          {/* ── Interactive modules ── */}
          {simulationSpec ? (
            <div style={{ maxWidth: 960, width: "100%" }}>
              <Simulation3DPanel spec={simulationSpec} />
            </div>
          ) : physicsSpec ? (
            <div style={{ maxWidth: 960, width: "100%" }}>
              <PhysicsSandboxPanel spec={physicsSpec} />
            </div>
          ) : quizItems && quizItems.length > 0 ? (
            <QuizView items={quizItems} index={quizIndex} setIndex={setQuizIndex} choice={quizChoice} setChoice={setQuizChoice} checked={quizChecked} setChecked={setQuizChecked} score={quizScore} setScore={setQuizScore} onClose={clearInteractiveMode} />
          ) : flashcards && flashcards.length > 0 ? (
            <FlashcardView cards={flashcards} index={flashIndex} setIndex={setFlashIndex} reveal={flashReveal} setReveal={setFlashReveal} onClose={clearInteractiveMode} />
          ) : messages.length === 0 ? (
            // Empty state
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", maxWidth: 560, margin: "0 auto", width: "100%" }}>
              <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                <MessageSquare size={28} color={canChat ? "#0ea5e9" : "#3f3f46"} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: "0 0 10px 0" }}>
                Ask about {subject.code}
              </h2>
              {!canChat ? (
                <p style={{ fontSize: 14, color: "#52525b", textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>
                  Select documents from the left panel to begin your session.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 14, color: "#71717a", marginBottom: 28, textAlign: "center" }}>
                    {activeDocNames.length} source{activeDocNames.length !== 1 ? "s" : ""} loaded. What would you like to know?
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
                    <SuggestedPrompt text="Summarise the key concepts" onClick={() => sendChatMessage("Summarise the key concepts from these documents")} />
                    <SuggestedPrompt text="What are the most important exam topics?" onClick={() => sendChatMessage("What are the most important exam topics?")} />
                    <SuggestedPrompt text="Explain the hardest concept simply" onClick={() => sendChatMessage("Explain the most complex concept from these notes simply")} />
                    <SuggestedPrompt text="Create a study plan" onClick={() => sendChatMessage("Create a study plan based on these notes")} />
                  </div>
                </>
              )}
            </div>
          ) : (
            // Messages
            <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 820, width: "100%" }}>
              {messages.map((m, i) => {
                // FIX 4: Detect interactive spec in assistant messages
                const interactiveSpec = m.role === "assistant" ? detectInteractiveSpec(m.content) : null;

                return (
                  <div key={m.id || i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    {m.role === "assistant" && (
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0, marginTop: 4 }}>
                        <Sparkles size={14} color="#fff" />
                      </div>
                    )}
                    <div style={{ maxWidth: m.role === "user" ? "75%" : "90%" }}>
                      {m.role === "user" ? (
                        <div style={{ padding: "12px 18px", borderRadius: "18px 18px 4px 18px", background: "#27272a", fontSize: 14, color: "#fff", lineHeight: 1.7 }}>
                          {m.content}
                        </div>
                      ) : (
                        <div>
                          {/* Prose part (before any code fence) */}
                          {(interactiveSpec?.prose || (interactiveSpec ? "" : null)) !== null && (
                            interactiveSpec ? (
                              interactiveSpec.prose && (
                                <div style={{ fontSize: 14, color: "#e4e4e7", lineHeight: 1.75, marginBottom: 8 }}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{interactiveSpec.prose}</ReactMarkdown>
                                </div>
                              )
                            ) : (
                              <div style={{ fontSize: 14, color: "#e4e4e7", lineHeight: 1.75 }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                  code({ node, inline, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || "");
                                    return !inline && match ? (
                                      <div style={{ borderRadius: 10, overflow: "hidden", margin: "14px 0", border: "1px solid rgba(255,255,255,0.08)" }}>
                                        <div style={{ background: "#0a0a0f", padding: "8px 14px", fontSize: 11, color: "#52525b", borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: "monospace" }}>{match[1]}</div>
                                        <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: 16, background: "#060609", fontSize: 13 }} {...props}>
                                          {String(children).replace(/\n$/, "")}
                                        </SyntaxHighlighter>
                                      </div>
                                    ) : <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4, fontSize: "0.88em", fontFamily: "monospace", color: "#38bdf8" }} {...props}>{children}</code>;
                                  }
                                }}>
                                  {m.content}
                                </ReactMarkdown>
                              </div>
                            )
                          )}

                          {/* FIX 4: Replace JSON block with interactive card */}
                          {interactiveSpec && (
                            <InteractiveModuleCard
                              type={interactiveSpec.type}
                              label={
                                interactiveSpec.type === "simulation" ? `3D Diagram: ${interactiveSpec.raw?.title || "Untitled"}` :
                                interactiveSpec.type === "physics" ? `Concept Sandbox: ${interactiveSpec.raw?.title || "Untitled"}` :
                                interactiveSpec.type === "quiz" ? `Practice Quiz (${(interactiveSpec.raw?.quiz || interactiveSpec.raw?.questions || []).length} questions)` :
                                `Flashcard Deck (${(interactiveSpec.raw?.flashcards || []).length} cards)`
                              }
                              onOpen={() => openModuleFromSpec(interactiveSpec.type, interactiveSpec.raw)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 }}>
                    <Sparkles size={14} color="#fff" />
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", gap: 5, alignItems: "center" }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#52525b", animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "14px 28px 22px", background: "linear-gradient(to top, #0a0a0f 70%, transparent)", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#18181b", border: `1px solid ${canChat ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}`,
            borderRadius: 20, padding: "8px 8px 8px 20px",
            opacity: !canChat ? 0.5 : 1, transition: "all 0.2s",
            maxWidth: 820,
          }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
              placeholder={canChat ? `Ask about ${subject.code}…` : "Select documents to start"}
              disabled={!canChat || isTyping}
              style={{ flex: 1, background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: 14, fontFamily: "inherit" }}
            />
            <button onClick={() => sendChatMessage()} disabled={!canChat || !input.trim() || isTyping}
              style={{
                background: input.trim() && canChat ? "#fff" : "rgba(255,255,255,0.06)",
                border: "none", color: input.trim() && canChat ? "#000" : "#52525b",
                width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: input.trim() && canChat ? "pointer" : "default",
                transition: "all 0.2s", flexShrink: 0,
              }}
            >
              <Send size={16} style={{ marginLeft: 1 }} />
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#3f3f46" }}>
            AI may make mistakes — always verify with your professor.
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — AI STUDIO ─────────────────────────────────────────── */}
      <div style={{ width: 300, background: "#08080d", borderLeft: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={14} color="#a78bfa" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7" }}>AI Studio</span>
          </div>

          {/* ── Doc Tools: disabled when no docs selected ── */}
          <div style={{ opacity: !canChat ? 0.4 : 1, pointerEvents: !canChat ? "none" : "auto", transition: "opacity 0.2s" }}>
            {studioLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", fontSize: 12, color: "#38bdf8", marginBottom: 18 }}>
                <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating…
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Document Tools</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
              <StudioAction icon={<FileBox size={16} color="#c084fc" />} iconBg="rgba(192,132,252,0.12)" title="Smart Flashcards" subtitle="Extract Q&A pairs" onClick={() => generateDocTool("flashcards")} disabled={studioLoading} />
              <StudioAction icon={<ListChecks size={16} color="#fbbf24" />} iconBg="rgba(251,191,36,0.12)" title="Practice Quiz" subtitle="Generate MCQs" onClick={() => generateDocTool("quiz")} disabled={studioLoading} />
              <StudioAction icon={<Sparkles size={16} color="#34d399" />} iconBg="rgba(52,211,153,0.12)" title="Deep Summary" subtitle="Condense core topics" onClick={() => generateDocTool("summary")} disabled={studioLoading} />
              <StudioAction icon={<Zap size={16} color="#f87171" />} iconBg="rgba(248,113,113,0.12)" title="Exam Focus" subtitle="High-priority topics" onClick={() => generateDocTool("exam_focus")} disabled={studioLoading} />
              <StudioAction icon={<FileText size={16} color="#60a5fa" />} iconBg="rgba(96,165,250,0.12)" title="Format Notes" subtitle="Structure selected docs" onClick={() => generateDocTool("notes")} disabled={studioLoading} />
            </div>
          </div>

          {/* ── Interactive Engines: ALWAYS enabled, no docs needed ── */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Interactive Engines</div>

            {/* Concept Sandbox */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BrainCircuit size={16} color="#22c55e" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Concept Sandbox</div>
                  <div style={{ fontSize: 11, color: "#71717a", marginTop: 1 }}>Physics & CS parameter engine</div>
                </div>
              </div>
              <input
                value={physicsPrompt} onChange={e => setPhysicsPrompt(e.target.value)}
                onKeyDown={e => e.key === "Enter" && generatePhysicsSandbox()}
                placeholder="e.g. deadlock, round robin…"
                style={{ width: "100%", background: "#060609", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", outline: "none", fontSize: 12, padding: "9px 12px", marginBottom: 10, fontFamily: "inherit", transition: "border 0.2s", boxSizing: "border-box" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(34,197,94,0.4)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
              />
              <button onClick={generatePhysicsSandbox} disabled={!physicsPrompt.trim() || studioLoading} style={{
                width: "100%", padding: "10px", borderRadius: 9, border: "none",
                background: physicsPrompt.trim() ? "#22c55e" : "rgba(255,255,255,0.05)",
                color: physicsPrompt.trim() ? "#000" : "#52525b",
                fontWeight: 600, fontSize: 12, cursor: physicsPrompt.trim() ? "pointer" : "default",
                fontFamily: "inherit", transition: "all 0.2s",
              }}>
                Launch Sandbox
              </button>
            </div>

            {/* 3D Flow Model */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,211,238,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Cuboid size={16} color="#22d3ee" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>3D Flow Model</div>
                  <div style={{ fontSize: 11, color: "#71717a", marginTop: 1 }}>Interactive node architectures</div>
                </div>
              </div>
              <input
                value={simulationPrompt} onChange={e => setSimulationPrompt(e.target.value)}
                onKeyDown={e => e.key === "Enter" && generate3DSimulation()}
                placeholder="e.g. TCP handshake, OS kernel…"
                style={{ width: "100%", background: "#060609", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", outline: "none", fontSize: 12, padding: "9px 12px", marginBottom: 10, fontFamily: "inherit", transition: "border 0.2s", boxSizing: "border-box" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(34,211,238,0.4)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
              />
              <button onClick={generate3DSimulation} disabled={!simulationPrompt.trim() || studioLoading} style={{
                width: "100%", padding: "10px", borderRadius: 9, border: "none",
                background: simulationPrompt.trim() ? "#22d3ee" : "rgba(255,255,255,0.05)",
                color: simulationPrompt.trim() ? "#000" : "#52525b",
                fontWeight: 600, fontSize: 12, cursor: simulationPrompt.trim() ? "pointer" : "default",
                fontFamily: "inherit", transition: "all 0.2s",
              }}>
                Render 3D Graph
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#3f3f46", textAlign: "center" }}>
              {docs.length} doc{docs.length !== 1 ? "s" : ""} available · engines work without docs
            </div>
          </div>
        </div>
      </div>

      {/* Global animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Quiz View ────────────────────────────────────────────────────────────────

function QuizView({ items, index, setIndex, choice, setChoice, checked, setChecked, score, setScore, onClose }: {
  items: QuizItem[]; index: number; setIndex: (n: number) => void;
  choice: string | null; setChoice: (s: string | null) => void;
  checked: boolean; setChecked: (b: boolean) => void;
  score: number; setScore: (n: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const isCorrect = (opt: string) => opt.trim().toLowerCase() === item.answer.trim().toLowerCase();

  return (
    <div style={{ maxWidth: 720, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Practice Quiz</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#0ea5e9", background: "rgba(14,165,233,0.1)", padding: "5px 12px", borderRadius: 20 }}>
            Q{index + 1}/{items.length} · Score {score}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#a1a1aa", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Exit
          </button>
        </div>
      </div>
      <div style={{ background: "#111116", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", lineHeight: 1.6, marginBottom: 24 }}>{item.question}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {item.options.map((opt, i) => {
            const correct = isCorrect(opt);
            const selected = choice === opt;
            let bg = "rgba(255,255,255,0.03)"; let border = "rgba(255,255,255,0.08)";
            if (checked) {
              if (correct) { bg = "rgba(16,185,129,0.12)"; border = "rgba(16,185,129,0.4)"; }
              else if (selected) { bg = "rgba(239,68,68,0.1)"; border = "rgba(239,68,68,0.35)"; }
            } else if (selected) { bg = "rgba(14,165,233,0.12)"; border = "rgba(14,165,233,0.4)"; }

            return (
              <button key={i} onClick={() => !checked && setChoice(opt)} style={{
                textAlign: "left", borderRadius: 10, border: `1px solid ${border}`,
                background: bg, color: "#e4e4e7", padding: "12px 16px", fontSize: 14,
                cursor: checked ? "default" : "pointer", transition: "all 0.15s", fontFamily: "inherit",
              }}>
                <span style={{ fontWeight: 600, color: "#52525b", marginRight: 10 }}>{String.fromCharCode(65 + i)}.</span> {opt}
              </button>
            );
          })}
        </div>

        {checked && (
          <div style={{ marginTop: 18, padding: "14px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: choice && isCorrect(choice) ? "#34d399" : "#f87171", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {choice && isCorrect(choice) ? <><Check size={16} /> Correct!</> : <><X size={16} /> Incorrect — Answer: {item.answer}</>}
            </div>
            {item.explanation && item.explanation}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          {!checked ? (
            <button onClick={() => { if (!choice) return; setChecked(true); if (choice && isCorrect(choice)) setScore(score + 1); }} disabled={!choice}
              style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: choice ? "#fff" : "rgba(255,255,255,0.06)", color: choice ? "#000" : "#52525b", fontWeight: 600, fontSize: 13, cursor: choice ? "pointer" : "default", fontFamily: "inherit" }}>
              Check Answer
            </button>
          ) : (
            <button onClick={() => { if (index + 1 < items.length) { setIndex(index + 1); setChoice(null); setChecked(false); } else { onClose(); } }}
              style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: "#0ea5e9", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {index + 1 < items.length ? "Next Question →" : "Finish Quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Flashcard View ───────────────────────────────────────────────────────────

function FlashcardView({ cards, index, setIndex, reveal, setReveal, onClose }: {
  cards: FlashcardItem[]; index: number; setIndex: (n: number) => void;
  reveal: boolean; setReveal: (b: boolean) => void; onClose: () => void;
}) {
  return (
    <div style={{ maxWidth: 680, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Flashcards</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "5px 12px", borderRadius: 20 }}>
            {index + 1} / {cards.length}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#a1a1aa", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Exit</button>
        </div>
      </div>

      <div onClick={() => setReveal(!reveal)} style={{
        background: "#111116", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18,
        padding: "40px 36px", minHeight: 240, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center", cursor: "pointer",
        transition: "border-color 0.2s",
      }}
        onMouseOver={e => e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"}
        onMouseOut={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          {reveal ? "ANSWER" : "QUESTION"}
        </div>
        <div style={{ fontSize: reveal ? 17 : 21, fontWeight: reveal ? 400 : 600, color: reveal ? "#a1a1aa" : "#fff", lineHeight: 1.6 }}>
          {reveal ? cards[index].answer : cards[index].question}
        </div>
        <div style={{ marginTop: 28, fontSize: 11, color: "#3f3f46" }}>Click to {reveal ? "show question" : "reveal answer"}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { if (index > 0) { setIndex(index - 1); setReveal(false); } }} disabled={index === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: index > 0 ? "#fff" : "#3f3f46", fontSize: 13, cursor: index > 0 ? "pointer" : "default", fontFamily: "inherit" }}>
            <ChevronLeft size={15} /> Prev
          </button>
          <button onClick={() => { if (index + 1 < cards.length) { setIndex(index + 1); setReveal(false); } }} disabled={index + 1 >= cards.length}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: index + 1 < cards.length ? "#fff" : "#3f3f46", fontSize: 13, cursor: index + 1 < cards.length ? "pointer" : "default", fontFamily: "inherit" }}>
            Next <ChevronRight size={15} />
          </button>
        </div>
        <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: "#18181b", color: "#a1a1aa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Exit Deck</button>
      </div>
    </div>
  );
}

// ─── Fetch enrolled subjects (unchanged from original) ────────────────────────

async function fetchSubjects(studentId: string, email?: string): Promise<Subject[]> {
  let effectiveStudentId = studentId;

  if (email) {
    const { data: userRow } = await supabase.from("users").select("id").ilike("email", email).maybeSingle();
    if (userRow?.id) effectiveStudentId = userRow.id;
  }

  const mergedByKey = new Map<string, Subject>();
  const addSubjects = (items: Subject[]) => {
    for (const item of items) {
      const key = normalizeSubjectCode(item.code) || (item.name || "").toLowerCase().trim();
      if (!key) continue;
      const existing = mergedByKey.get(key);
      mergedByKey.set(key, existing ? { ...existing, ...item, teacher_name: item.teacher_name || existing.teacher_name } : item);
    }
  };

  // Try subject_enrollments
  const { data: se } = await supabase.from("subject_enrollments").select("subject_id").eq("student_id", effectiveStudentId);
  if (se && se.length > 0) {
    const { data: subs } = await supabase.from("subjects").select("id,name,code,color,semester,professor_id").in("id", se.map((x: any) => x.subject_id));
    if (subs) {
      const pids = subs.map((s: any) => s.professor_id).filter(Boolean);
      const { data: profs } = pids.length ? await supabase.from("users").select("id,name,email").in("id", pids) : { data: [] };
      const pm = new Map((profs || []).map((p: any) => [p.id, p]));
      addSubjects(subs.map((s: any) => ({ ...s, teacher_name: pm.get(s.professor_id)?.name || "—", teacher_email: pm.get(s.professor_id)?.email || "" })));
    }
  }

  // Attendance cache fallback
  if (email) {
    const { data: ac } = await supabase.from("attendance_cache").select("subject_code,subject_name").eq("user_email", email);
    if (ac && ac.length > 0) {
      const seen = new Set<string>();
      const fallback: Subject[] = (ac || []).map((r: any) => {
        const key = `${r.subject_code}|${r.subject_name}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return { id: r.subject_code || key, code: r.subject_code || "SUBJ", name: r.subject_name || "Subject", color: "#7c3aed", semester: 0, teacher_name: "—", teacher_email: "" };
      }).filter(Boolean) as Subject[];
      addSubjects(fallback);
    }
  }

  return Array.from(mergedByKey.values());
}

// ─── Main SubjectsPage ────────────────────────────────────────────────────────

export function SubjectsPage({ studentId, email }: { studentId: string; email?: string }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [open,     setOpen]     = useState<Subject | null>(null);
  const [q,        setQ]        = useState("");

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    setLoading(true);
    fetchSubjects(studentId, email).then(async subs => {
      if (subs.length === 0) { setSubjects([]); setLoading(false); return; }

      // ── Attendance from attendance_cache (written by scraper) ──
      const { data: attRows } = await supabase
        .from("attendance_cache")
        .select("subject_code, subject_name, percent, attended, total")
        .eq("user_email", email || "");

      const attMap = new Map<string, { percentage: number; attended: number; total: number }>();
      for (const r of (attRows || [])) {
        const key = normalizeSubjectCode((r as any).subject_code || (r as any).subject_name || "");
        if (key) attMap.set(key, { percentage: (r as any).percent ?? 0, attended: (r as any).attended ?? 0, total: (r as any).total ?? 0 });
      }

      // ── Doc counts ──
      const subjectIds = subs.map((s: Subject) => s.id).filter(Boolean);
      const { data: docsData } = subjectIds.length
        ? await supabase.from("documents").select("subject_id").in("subject_id", subjectIds)
        : { data: [] as any[] };

      const docCountMap = new Map<string, number>();
      for (const d of (docsData || [])) {
        docCountMap.set((d as any).subject_id, (docCountMap.get((d as any).subject_id) || 0) + 1);
      }

      setSubjects(subs.map((s: Subject) => ({
        ...s,
        attendance: attMap.get(normalizeSubjectCode(s.code)) ?? attMap.get(normalizeSubjectCode(s.name)),
        doc_count:  docCountMap.get(s.id) || 0,
      })));
      setLoading(false);
    });
  }, [studentId, email]);

  if (open) return <SubjectWorkspace subject={open} studentId={studentId} onBack={() => setOpen(null)} />;

  const filtered = subjects.filter(s =>
    `${s.name} ${s.code} ${s.teacher_name}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px", background: "#0a0a0f", fontFamily: "'Inter', system-ui, sans-serif", color: "#e4e4e7" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Your Subjects</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "0 12px", width: 240 }}>
          <Search size={14} color="#52525b" />
          <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13, padding: "9px 0", flex: 1, fontFamily: "inherit" }} />
        </div>
      </div>

      {loading && <div style={{ fontSize: 13, color: "#52525b", display: "flex", alignItems: "center", gap: 10 }}><Loader size={14} /> Loading subjects…</div>}
      {!loading && subjects.length === 0 && <div style={{ color: "#52525b", padding: 40, textAlign: "center", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 16 }}>No subjects found.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }}>
        {filtered.map(sub => {
          const pct = sub.attendance?.percentage;
          const pctColor = !pct ? "#fff" : pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
          return (
            <div key={sub.id} onClick={() => setOpen(sub)} style={{
              background: "#0f0f14", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, cursor: "pointer", overflow: "hidden", transition: "all 0.2s",
            }}
              onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
            >
              <div style={{ height: 3, background: sub.color || "#0ea5e9" }} />
              <div style={{ padding: "18px 18px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: `${sub.color || "#0ea5e9"}14`, border: `1px solid ${sub.color || "#0ea5e9"}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: sub.color || "#0ea5e9", letterSpacing: "-0.02em" }}>
                    {/* Show letter prefix e.g. "MAT" or "CSS", not the number */}
                    {(sub.code || "").replace(/[\s\-]?\d+.*$/, "").trim().slice(0, 3) || "?"}
                  </div>
                  {pct !== undefined && <div style={{ fontSize: 18, fontWeight: 700, color: pctColor, lineHeight: 1, marginTop: 4 }}>{Math.round(pct)}%</div>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4, lineHeight: 1.3 }}>{sub.name}</div>
                <div style={{ fontSize: 11, color: "#52525b" }}>{sub.code}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11, color: "#71717a" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><FileText size={11} color="#52525b" /> {sub.doc_count || 0} docs</span>
                  {sub.teacher_name && sub.teacher_name !== "—" && <span style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><BookOpen size={11} color="#52525b" /> {sub.teacher_name}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
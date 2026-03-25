  "use client";
  // components/student/SubjectsPage.tsx v4 — Full Workspace (Threads, Upload, PDF Viewer)
  // ─────────────────────────────────────────────────────────────────────────────

  import React, { useState, useEffect, useRef, useCallback } from "react";
  import {
    ArrowLeft, Download, ExternalLink, BookOpen, FileText,
    Upload, Plus, Loader, AlertTriangle, User, Search,
    CheckSquare, Square, Send, Zap, BrainCircuit, ListChecks, FileBox,
    MessageSquare, Trash2, Clock, History, MoreVertical, X, Check, Sparkles // <--- ADDED HERE
  } from "lucide-react";
  import ReactMarkdown from "react-markdown";
  import remarkGfm from "remark-gfm";
  import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
  import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
  import { supabase } from "@/lib/supabase";
  import { getAllDocsForSubject, uploadStudentDocument } from "@/lib/db_extended";

  // ── Types ─────────────────────────────────────────────────────────────────────
  interface Subject {
    id: string; name: string; code: string; color: string; semester: number;
    teacher_name: string; teacher_email: string;
    attendance?: { percentage: number; attended: number; total: number };
    doc_count?: number;
  }

  interface Doc {
    id: string; name: string; file_url: string; size_bytes?: number;
    created_at: string; doc_type?: string; _source: "teacher" | "student";
    uploader?: { name: string };
  }

  interface Message {
    id: string; role: "user" | "assistant"; content: string; thread_id: string;
  }

  function fmtSize(b?: number) {
    if (!b) return "—";
    return b > 1_000_000 ? `${(b/1_000_000).toFixed(1)} MB` : `${(b/1024).toFixed(0)} KB`;
  }

  // ── Fetch enrolled subjects ───────────────────────────────────────────────────
  async function fetchSubjects(studentId: string): Promise<Subject[]> {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select(`subject:subjects (id, name, code, color, semester, professor:users!professor_id(name, email))`)
      .eq("student_id", studentId);

    if (enrollments && enrollments.length > 0) {
      return enrollments.map((e: any) => ({
        ...e.subject,
        teacher_name:  e.subject?.professor?.name  || "—",
        teacher_email: e.subject?.professor?.email || "",
      }));
    }

    const { data: agentSubs } = await supabase
      .from("subjects")
      .select("id, name, code, color, semester, professor:users!professor_id(name,email)")
      .eq("student_id", studentId);

    return (agentSubs || []).map((s: any) => ({
      ...s,
      teacher_name:  s.professor?.name  || "—",
      teacher_email: s.professor?.email || "",
    }));
  }

  // ── 3-Panel Subject Workspace ─────────────────────────────────────────────────
  export function SubjectWorkspace({
    subject, studentId, onBack,
  }: {
    subject: any; studentId: string; onBack: () => void;
  }) {
    const [docs, setDocs] = useState<any[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(true);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Workspace State
    const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
    const [docSearch, setDocSearch] = useState("");
    const [examMode, setExamMode] = useState(false);
    
    // Threads State
    const [threads, setThreads] = useState<any[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    
    // Chat State
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    const loadDocs = useCallback(async () => {
      setLoadingDocs(true);
      const { all } = await getAllDocsForSubject(subject.id, studentId);
      setDocs(all || []);
      setSelectedDocs(new Set((all || []).map((d: any) => d.id)));
      setLoadingDocs(false);
    }, [subject.id, studentId]);

    const loadThreads = useCallback(async () => {
      const { data } = await supabase
        .from("messages")
        .select("thread_id, content, created_at")
        .eq("user_id", studentId)
        .like("thread_id", `subj_${subject.id}_%`) 
        .order("created_at", { ascending: false });

      if (data) {
        const seen = new Set<string>();
        const ts: any[] = [];
        for (const m of data) {
          if (!seen.has(m.thread_id)) {
            seen.add(m.thread_id);
            ts.push({ thread_id: m.thread_id, title: m.content.slice(0, 32) + "…" });
          }
        }
        setThreads(ts);
        if (ts.length > 0 && !activeThreadId) setActiveThreadId(ts[0].thread_id);
      }
    }, [studentId, subject.id, activeThreadId]);

    useEffect(() => { loadDocs(); loadThreads(); }, [loadDocs, loadThreads]);

    useEffect(() => {
      if (!activeThreadId) { setMessages([]); return; }
      supabase.from("messages").select("*").eq("thread_id", activeThreadId).order("created_at", { ascending: true })
        .then(({ data }) => { if (data) setMessages(data); });
    }, [activeThreadId]);

    const handleUpload = async (file: File) => {
      setUploading(true);
      try {
        const doc = await uploadStudentDocument(studentId, subject.id, file);
        setDocs(prev => [{ ...(doc as any), _source: "student" }, ...prev]);
        setSelectedDocs(prev => new Set(prev).add((doc as any).id));
      } catch (e: any) {
        console.error("Upload failed", e);
      } finally { 
        setUploading(false); 
      }
    };

    const toggleDoc = (id: string) => {
      setSelectedDocs(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    const startNewThread = () => { setActiveThreadId(null); setMessages([]); setShowHistory(false); };

    const deleteThread = async (tid: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await supabase.from("messages").delete().eq("thread_id", tid).eq("user_id", studentId);
      setThreads(p => p.filter(t => t.thread_id !== tid));
      if (activeThreadId === tid) { setActiveThreadId(null); setMessages([]); }
    };

    const sendChatMessage = async (overridePrompt?: string) => {
      const text = overridePrompt || input;
      if (!text.trim() || isTyping || selectedDocs.size === 0) return;

      const threadId = activeThreadId || `subj_${subject.id}_${crypto.randomUUID()}`;
      const isNewThread = !activeThreadId;
      
      setInput("");
      setIsTyping(true);

      const newMsg = { id: Date.now().toString(), role: "user", content: text, thread_id: threadId };
      setMessages(prev => [...prev, newMsg]);
      await supabase.from("messages").insert([{ role: "user", content: text, thread_id: threadId, user_id: studentId }]);

      const activeDocNames = docs.filter(d => selectedDocs.has(d.id)).map(d => d.name);

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text, user_id: studentId,
            subject_context: { subject_name: subject.name, subject_code: subject.code, selected_docs: activeDocNames, exam_mode: examMode },
            context: { attendance: subject.attendance }
          })
        });

        if (!res.ok) throw new Error("Network error");
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let aiContent = "";
        const aiMsgId = (Date.now() + 1).toString();
        
        setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", content: "", thread_id: threadId }]);

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            aiContent += decoder.decode(value, { stream: true });
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: aiContent } : m));
          }
        }
        
        await supabase.from("messages").insert([{ role: "assistant", content: aiContent, thread_id: threadId, user_id: studentId }]);
        if (isNewThread) { setActiveThreadId(threadId); loadThreads(); }
      } catch (error) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Error generating response.", thread_id: threadId }]);
      } finally {
        setIsTyping(false);
      }
    };

    const filteredDocs = docs.filter(d => d.name.toLowerCase().includes(docSearch.toLowerCase()));
    const canChat = selectedDocs.size > 0;

    return (
      <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: "#040404", color: "#fff", fontFamily: "'Inter', sans-serif" }}>
        
        {/* 🧠 LEFT PANEL — DOCUMENT SOURCES */}
        <div style={{ width: 320, background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "24px 20px" }}>
            <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:12, marginBottom:24, padding:0, transition: "color 0.2s" }} onMouseOver={e=>e.currentTarget.style.color="#fff"} onMouseOut={e=>e.currentTarget.style.color="rgba(255,255,255,0.4)"}>
              <ArrowLeft size={14}/> All Subjects
            </button>
            
            <div style={{ display: "flex", alignItems: "center", justifyItems: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                <div style={{ width:40, height:40, borderRadius:8, background:"#0ea5e9", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0 }}>
                  {subject.code.split(" ")[1] || subject.code.slice(0,2)}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>{subject.code.split(" ")[1] || "Subject"}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{subject.name}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", borderRadius: 10, marginBottom: 16, cursor: "pointer", transition: "all 0.2s" }} onClick={() => setExamMode(!examMode)} onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"} onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: examMode ? "#fff" : "rgba(255,255,255,0.6)" }}>
                <Zap size={16} color={examMode ? "#ef4444" : "rgba(255,255,255,0.4)"} /> Exam Mode
              </div>
              <div style={{ width: 32, height: 18, background: examMode ? "#ef4444" : "rgba(255,255,255,0.1)", borderRadius: 10, position: "relative", transition: "all 0.2s" }}>
                <div style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: examMode ? 16 : 2, transition: "all 0.2s" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>SOURCES ({docs.length})</span>
              <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#0ea5e9" }}>
                <button onClick={() => setSelectedDocs(new Set(docs.map(d=>d.id)))} style={{ background:"none", border:"none", color:"inherit", cursor:"pointer", padding:0 }}>All</button>
                <button onClick={() => setSelectedDocs(new Set())} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", padding:0 }}>None</button>
              </div>
            </div>

            {/* Search & Upload Row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <Search size={14} color="rgba(255,255,255,0.3)" />
                <input placeholder="Find document..." value={docSearch} onChange={e=>setDocSearch(e.target.value)} style={{ background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: 13, width: "100%" }} />
              </div>
              <button onClick={()=>fileRef.current?.click()} disabled={uploading} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", transition: "all 0.2s" }} title="Upload Notes" onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"} onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
                {uploading ? <Loader size={14} className="animate-spin" /> : <Plus size={16} />}
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.pptx,.docx" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleUpload(f);e.target.value=""}}/>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px" }}>
            {loadingDocs ? <div style={{fontSize:12, color:"rgba(255,255,255,0.4)", padding: "0 8px"}}>Loading...</div> : 
            filteredDocs.map(doc => {
              const active = selectedDocs.has(doc.id);
              return (
                <div key={doc.id} 
                      onClick={() => toggleDoc(doc.id)} 
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background: active ? "rgba(14,165,233,0.08)" : "transparent", border: `1px solid ${active ? "rgba(14,165,233,0.15)" : "transparent"}`, borderRadius: 10, marginBottom: 4, cursor:"pointer", transition: "all 0.2s" }}
                      onMouseOver={e => { if(!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)" }}
                      onMouseOut={e => { if(!active) e.currentTarget.style.background = "transparent" }}>
                  
                  {/* 1. CHECKBOX */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {active ? <div style={{ width: 16, height: 16, background: "#0ea5e9", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckSquare size={12} color="#000" strokeWidth={3}/></div> : <div style={{ width: 16, height: 16, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4 }} />}
                  </div>

                  {/* 2. DOCUMENT INFO */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: active ? "#fff" : "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                      <FileText size={14} color={active ? "#0ea5e9" : "rgba(255,255,255,0.3)"} />
                      {doc.name}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, paddingLeft: 20 }}>
                      {fmtSize(doc.size_bytes)}
                    </div>
                  </div>

                  {/* 3. VIEW PDF BUTTON */}
                  <button onClick={(e) => { e.stopPropagation(); window.open(doc.file_url, "_blank"); }} 
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }} 
                          title="View PDF"
                          onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
                          onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}>
                    <ExternalLink size={13} />
                  </button>

                </div>
              )
            })}
          </div>
          
          {/* Bottom indicator */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: canChat ? "#0ea5e9" : "rgba(255,255,255,0.2)" }} />
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              {selectedDocs.size} source{selectedDocs.size !== 1 && 's'} active
            </span>
          </div>
        </div>

        {/* 🧠 CENTER PANEL — AI CHAT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
          
          {/* Header */}
          <div style={{ padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{subject.name}</span>
              {!canChat ? (
                <span style={{ fontSize: 11, padding: "4px 10px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontWeight: 500 }}>Select sources to chat</span>
              ) : (
                <span style={{ fontSize: 11, padding: "4px 10px", background: "rgba(14,165,233,0.1)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)", borderRadius: 12, fontWeight: 500 }}>{selectedDocs.size} Source{selectedDocs.size !== 1 && 's'} Active</span>
              )}
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <button onClick={() => setShowHistory(!showHistory)} style={{ display: "flex", alignItems: "center", gap: 6, background: showHistory ? "rgba(255,255,255,0.1)" : "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"} onMouseOut={e=>{if(!showHistory) e.currentTarget.style.background="transparent"}}>
                <History size={14} /> History
              </button>
              <button onClick={startNewThread} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0ea5e9", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#0284c7"} onMouseOut={e=>e.currentTarget.style.background="#0ea5e9"}>
                <Plus size={14} /> New Chat
              </button>

              {/* History Dropdown */}
              {showHistory && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 280, background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 8, zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", padding: "8px 12px", textTransform: "uppercase" }}>Previous Chats</div>
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    {threads.length === 0 ? <div style={{ padding: 12, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No history yet.</div> : 
                    threads.map(t => (
                      <div key={t.thread_id} onClick={() => { setActiveThreadId(t.thread_id); setShowHistory(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: activeThreadId === t.thread_id ? "rgba(14,165,233,0.15)" : "transparent", color: activeThreadId === t.thread_id ? "#0ea5e9" : "rgba(255,255,255,0.8)", marginBottom: 2 }} onMouseOver={e => { if(activeThreadId !== t.thread_id) e.currentTarget.style.background = "rgba(255,255,255,0.05)" }} onMouseOut={e => { if(activeThreadId !== t.thread_id) e.currentTarget.style.background = "transparent" }}>
                        <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                        <button onClick={(e) => deleteThread(t.thread_id, e)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 2 }}><Trash2 size={12}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 32px 32px", display: "flex", flexDirection: "column" }}>
            {messages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", maxWidth: 600, margin: "0 auto", width: "100%" }}>
                <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                  <BookOpen size={28} color={canChat ? "#0ea5e9" : "rgba(255,255,255,0.2)"} />
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 12px 0" }}>Ask about {subject.code.split(" ")[1] || "Subject"}</h2>
                
                {!canChat ? (
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 40, textAlign: "center" }}>
                    Select documents from the left panel to build your workspace context.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 40 }}>Your sources are ready. Ask me anything.</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                      <SuggestedPrompt text="Summarise key concepts from these notes" onClick={() => sendChatMessage("Summarise key concepts from these notes")} />
                      <SuggestedPrompt text="What are the most important exam topics?" onClick={() => sendChatMessage("What are the most important exam topics based on these notes?")} />
                      <SuggestedPrompt text="Explain the most complex concept simply" onClick={() => sendChatMessage("Explain the most complex concept from these notes simply")} />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 20 }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "80%", padding: "16px 20px", borderRadius: 16, background: m.role === "user" ? "rgba(255,255,255,0.05)" : "transparent", fontSize: 15, color: "#e5e5e5", lineHeight: 1.6, overflowX: "auto" }}>
                      {m.role === "assistant" ? (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]} 
                          components={{ 
                            code({ node, inline, className, children, ...props }: any) { 
                              const match = /language-(\w+)/.exec(className || ""); 
                              return !inline && match ? (
                                <div style={{ borderRadius: 8, overflow: "hidden", margin: "12px 0", border: "1px solid rgba(255,255,255,0.1)" }}>
                                  <div style={{ background: "#111", padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.5)", borderBottom: "1px solid rgba(255,255,255,0.05)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Mono', monospace" }}>{match[1]}</div>
                                  <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: 16, background: "#0a0a0a", fontSize: 13 }} {...props}>{String(children).replace(/\n$/, "")}</SyntaxHighlighter>
                                </div>
                              ) : <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 6, fontSize: "0.9em", fontFamily: "'DM Mono', monospace", color: "#a78bfa" }} {...props}>{children}</code>; 
                            } 
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      ) : (
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ padding: "16px 20px", color: "rgba(255,255,255,0.4)", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 16, height: 16, border: "2px solid rgba(14,165,233,0.3)", borderTopColor: "#0ea5e9", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{ padding: "0 32px 32px", width: "100%", maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${!canChat ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)"}`, borderRadius: 24, padding: "6px 6px 6px 24px", opacity: !canChat ? 0.5 : 1, transition: "all 0.2s" }}>
              <input 
                value={input} onChange={e => setInput(e.target.value)} 
                onKeyDown={e => e.key === "Enter" && canChat && sendChatMessage()}
                placeholder={canChat ? `Ask about ${subject.code.split(" ")[1] || subject.name}...` : "Select at least 1 document to chat"} 
                style={{ flex: 1, background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: 15 }} 
                disabled={!canChat || isTyping}
              />
              <button onClick={() => sendChatMessage()} disabled={!canChat || !input.trim() || isTyping} style={{ background: input.trim() && canChat ? "rgba(255,255,255,0.1)" : "transparent", border: "none", color: input.trim() && canChat ? "#fff" : "rgba(255,255,255,0.3)", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() && canChat ? "pointer" : "default", transition: "all 0.2s" }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 🧠 RIGHT PANEL — AI STUDIO */}
        <div style={{ width: 280, background: "#0a0a0a", borderLeft: "1px solid rgba(255,255,255,0.05)", padding: "24px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", marginBottom: 20 }}>STUDIO</div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, opacity: !canChat ? 0.4 : 1, pointerEvents: !canChat ? "none" : "auto", transition: "opacity 0.2s" }}>
            <StudioAction icon={<FileBox size={16} color="#c084fc"/>} iconBg="rgba(192,132,252,0.1)" title="Flashcards" subtitle="Click to generate" onClick={() => sendChatMessage("Create 5 key flashcards (Question & Answer format) from the selected documents.")} />
            <StudioAction icon={<Sparkles size={16} color="#34d399"/>} iconBg="rgba(52,211,153,0.1)" title="Summarise" subtitle="Key concepts" onClick={() => sendChatMessage("Provide a concise bulleted summary of the key concepts from the selected documents.")} />
            <StudioAction icon={<ListChecks size={16} color="#fbbf24"/>} iconBg="rgba(251,191,36,0.1)" title="Practice Quiz" subtitle="5 questions" onClick={() => sendChatMessage("Create 5 multiple choice questions based on the active documents. Provide an answer key at the end.")} />
            <StudioAction icon={<Zap size={16} color="#f87171"/>} iconBg="rgba(248,113,113,0.1)" title="Exam Focus" subtitle="Priority topics" onClick={() => sendChatMessage("Based on these documents, what are the most likely topics to appear on an exam? Highlight key focus areas.")} />
            <StudioAction icon={<FileText size={16} color="#60a5fa"/>} iconBg="rgba(96,165,250,0.1)" title="Generate Notes" subtitle="Structured notes" onClick={() => sendChatMessage("Generate comprehensive structured notes summarizing the selected documents.")} />
            
            <div style={{ marginTop: "auto", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>
              {docs.length} docs · Sem {subject.semester}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function SuggestedPrompt({ text, onClick }: { text: string; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{ width: "100%", padding: "16px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer", transition: "all 0.2s", textAlign: "left" }}
        onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#fff"; }}
        onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
      >
        {text}
      </button>
    );
  }

  function StudioAction({ icon, iconBg, title, subtitle, onClick }: { icon: React.ReactNode; iconBg: string; title: string; subtitle: string; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, cursor: "pointer", transition: "all 0.2s", textAlign: "left", width: "100%" }}
        onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
        onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{subtitle}</div>
        </div>
      </button>
    );
  }
  // ── Main Dashboard Page ───────────────────────────────────────────────────────
  export function SubjectsPage({ studentId }: { studentId: string }) {
    const [subjects,  setSubjects]  = useState<Subject[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [open,      setOpen]      = useState<Subject | null>(null);
    const [q,         setQ]         = useState("");

    useEffect(() => {
      if (!studentId) { setLoading(false); return; }
      setLoading(true);
      fetchSubjects(studentId).then(async subs => {
        if (subs.length > 0) {
          const { data: att } = await supabase.from("attendance").select("subject_id, percentage, attended, total").eq("student_id", studentId).in("subject_id", subs.map(s => s.id));
          const attMap = new Map((att || []).map((a: any) => [a.subject_id, a]));
          const { data: docCounts } = await supabase.from("documents").select("subject_id").in("subject_id", subs.map(s => s.id));
          const docMap = new Map<string, number>();
          (docCounts || []).forEach((d: any) => docMap.set(d.subject_id, (docMap.get(d.subject_id)||0)+1));

          setSubjects(subs.map(s => ({ ...s, attendance: attMap.get(s.id), doc_count: docMap.get(s.id) || 0 })));
        } else { setSubjects([]); }
        setLoading(false);
      });
    }, [studentId]);

    if (open) return <SubjectWorkspace subject={open} studentId={studentId} onBack={()=>setOpen(null)}/>;

    const filtered = subjects.filter(s => `${s.name} ${s.code} ${s.teacher_name}`.toLowerCase().includes(q.toLowerCase()));

    return (
      <div style={{ flex:1, overflowY:"auto", padding:"28px 28px 40px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff" }}>Your Subjects</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"0 12px", width:220 }}>
            <input placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} style={{ background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:13, padding:"8px 0", flex:1 }}/>
          </div>
        </div>

        {loading && <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)" }}>Loading your subjects…</div>}
        {!loading && subjects.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", padding: 40 }}>No subjects assigned.</div>}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
          {filtered.map(sub => {
            const pct = sub.attendance?.percentage;
            const pctColor = !pct ? "#fff" : pct >= 75 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
            return (
              <div key={sub.id} onClick={()=>setOpen(sub)} style={{ background:"rgba(255,255,255,0.02)", border:`1px solid rgba(255,255,255,0.07)`, borderRadius:14, cursor:"pointer", overflow:"hidden", transition:"all .2s" }}>
                <div style={{ height:3, background:sub.color }}/>
                <div style={{ padding:"16px 16px 14px" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ width:40,height:40,borderRadius:10,background:`${sub.color}18`,border:`1px solid ${sub.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:sub.color }}>
                      {sub.code.split(" ")[1] || sub.code.slice(0,3)}
                    </div>
                    {pct !== undefined && <div style={{ fontSize:18, fontWeight:700, color:pctColor, lineHeight:1 }}>{Math.round(pct)}%</div>}
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:4 }}>{sub.name}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:10 }}>{sub.code}</div>
                  <div style={{ display:"flex", gap:10, marginTop:10, fontSize:11, color:"rgba(255,255,255,0.3)" }}>
                    <span>📄 {sub.doc_count || 0} docs</span>
                    {sub.attendance && <span>{sub.attendance.attended}/{sub.attendance.total} classes</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
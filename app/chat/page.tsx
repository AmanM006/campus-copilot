"use client";
import React, { useState, useEffect, useRef } from "react";
import { 
  Send, Bot, User, Plus, MessageSquare, Settings, 
  Terminal, Search, LayoutGrid, Calendar, Trash2
} from "lucide-react";
import ReactMarkdown from "react-markdown"; // <-- 1. ADD THIS IMPORT
import Link from "next/link";
import { supabase } from "@/lib/supabase"; // <-- This connects your DB!

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  thread_id: string;
}

interface Thread {
  thread_id: string;
  title: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const activeUser = "aman_m_006"; // Hackathon hardcode

  // --- 1. FETCH THREADS FROM SUPABASE ---
  const fetchThreads = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('thread_id, content, created_at')
      .eq('user_id', activeUser)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error fetching threads:", error);
      return;
    }

    if (data) {
      const threadMap: Record<string, string> = {};
      data.forEach(msg => {
        // Use the very first message in the thread as the title
        if (!threadMap[msg.thread_id]) {
          threadMap[msg.thread_id] = msg.content.slice(0, 25) + "...";
        }
      });
      
      const uniqueThreads = Object.entries(threadMap).map(([id, title]) => ({
        thread_id: id,
        title: title
      })).reverse(); // Put newest at the top
      
      setThreads(uniqueThreads);
    }
  };

  // Load threads on initial page load
  useEffect(() => { fetchThreads(); }, []);

  // --- 2. FETCH MESSAGES WHEN YOU CLICK A THREAD ---
  useEffect(() => {
    const loadThreadMessages = async () => {
      if (!activeThreadId) return;
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', activeThreadId)
        .order('created_at', { ascending: true });
      
      if (data) setMessages(data);
    };
    loadThreadMessages();
  }, [activeThreadId]);

  // Auto-scroll to bottom
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messages, isTyping]);

  // --- 3. HANDLE SENDING MESSAGES ---
  const handleSend = async (textToSend: string = input) => {
    if (!textToSend.trim()) return;

    const userContent = textToSend.trim();
    // If we are in an empty chat, generate a new thread ID, otherwise use existing
    const currentThreadId = activeThreadId || crypto.randomUUID();
    
    if (!activeThreadId) setActiveThreadId(currentThreadId);

    // Update UI instantly (Optimistic update)
    setMessages(prev => [...prev, { role: "user", content: userContent, thread_id: currentThreadId }]);
    setInput("");
    setIsTyping(true);

    try {
      // Save User Message to DB
      await supabase.from('messages').insert([
        { user_id: activeUser, content: userContent, role: 'user', thread_id: currentThreadId }
      ]);
      const recentHistory = messages.slice(-4).map(m => ({ 
        role: m.role, 
        content: m.content 
      }));

      // Call Python Backend
    const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userContent,
          user_id: activeUser,
          history: recentHistory // <-- WE ARE NOW SENDING MEMORY!
        })
      });
      const data = await response.json();

      // Save AI Message to DB
      await supabase.from('messages').insert([
        { user_id: activeUser, content: data.reply, role: 'assistant', thread_id: currentThreadId }
      ]);

      setMessages(prev => [...prev, { role: "assistant", content: data.reply, thread_id: currentThreadId }]);
      fetchThreads(); // Refresh the sidebar to show the new chat title!

    } catch (error) {
      console.error("Backend connection failed", error);
    } finally {
      setIsTyping(false);
    }
  };

  // Helper to start a completely blank chat
  const startNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
  };

  const isChatEmpty = messages.length === 0;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#050505", color: "#fff", height: "100vh", display: "flex", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

        .sidebar { width: 260px; background: #0a0a0a; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; z-index: 10; }
        .brand-header { padding: 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .sidebar-btn { margin: 16px; background: #fff; color: #000; border: none; padding: 12px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .sidebar-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(255,255,255,0.1); }
        
        .history-list { flex: 1; overflow-y: auto; padding: 0 16px; }
        .history-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,0.6); font-size: 13px; cursor: pointer; transition: all 0.2s; margin-bottom: 4px; }
        .history-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .history-item.active { background: rgba(255,255,255,0.1); color: #fff; }

        .main-chat { flex: 1; display: flex; flex-direction: column; position: relative; background: #050505; }
        .chat-nav { height: 64px; display: flex; align-items: center; justify-content: flex-end; padding: 0 32px; }
        .chat-scroll { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; align-items: center; }
        .chat-container { width: 100%; max-width: 760px; display: flex; flex-direction: column; gap: 32px; padding-bottom: 40px; }

        .message-row { display: flex; gap: 20px; width: 100%; }
        .message-row.user { flex-direction: row-reverse; }
        .avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .avatar.assistant { background: linear-gradient(135deg, #7c3aed, #3b82f6); color: #fff; }
        .avatar.user { background: rgba(255,255,255,0.1); color: #fff; }

        .bubble { font-size: 15px; line-height: 1.6; max-width: 85%; white-space: pre-wrap; }
        .bubble.user { background: rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 16px; border-top-right-radius: 4px; }
        .bubble.assistant { color: rgba(255,255,255,0.9); padding-top: 4px; }

        .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; max-width: 760px; margin: 0 auto; padding: 20px; }
        .greeting { font-size: 32px; font-weight: 500; margin-bottom: 8px; text-align: center; }
        .sub-greeting { color: rgba(255,255,255,0.5); margin-bottom: 40px; text-align: center; }
        
        .pill-container { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 40px; }
        .prompt-pill { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 100px; font-size: 13px; color: rgba(255,255,255,0.7); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
        .prompt-pill:hover { background: rgba(255,255,255,0.08); color: #fff; border-color: rgba(255,255,255,0.2); }

        .input-wrapper { width: 100%; display: flex; justify-content: center; padding: 24px; transition: all 0.3s ease; }
        .input-wrapper.centered { padding: 0; }
        .input-wrapper.bottom { background: linear-gradient(to top, #050505 80%, transparent); }

        .input-box { width: 100%; max-width: 760px; position: relative; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; display: flex; align-items: center; padding: 12px 16px 12px 24px; transition: all 0.3s ease; }
        .input-box:focus-within { border-color: rgba(124,58,237,0.5); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 4px rgba(124,58,237,0.1); }
        .chat-input { flex: 1; background: transparent; border: none; outline: none; color: #fff; font-size: 15px; }
        .chat-input::placeholder { color: rgba(255,255,255,0.4); }
        
        .send-btn { width: 36px; height: 36px; border-radius: 12px; background: #fff; color: #000; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; transition: all 0.2s; }
        .send-btn:disabled { opacity: 0.2; cursor: not-allowed; }
        .send-btn:not(:disabled):hover { background: #7c3aed; color: #fff; }

        .ai-thinking { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #3b82f6); animation: pulse-spin 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @keyframes pulse-spin { 0% { transform: scale(0.9) rotate(0deg); opacity: 0.7; } 50% { transform: scale(1.1) rotate(180deg); opacity: 1; box-shadow: 0 0 20px rgba(124,58,237,0.4); } 100% { transform: scale(0.9) rotate(360deg); opacity: 0.7; } }
      `}</style>

      {/* --- SIDEBAR --- */}
      <aside className="sidebar">
        <div className="brand-header">
          <Link href="/" style={{ fontWeight: 600, letterSpacing: '-0.02em', fontSize: '15px', color: '#fff', textDecoration: 'none' }}>
            CampusCopilot
          </Link>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>
            AM
          </div>
        </div>

        <button className="sidebar-btn" onClick={startNewChat}>
          <Plus size={16} /> New Chat
        </button>

        <div className="history-list">
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px 12px' }}>Recent</div>
          
          {/* SUPABASE THREAD MAPPING */}
          {threads.length > 0 ? (
            threads.map((t) => (
              <div 
                key={t.thread_id} 
                className={`history-item ${activeThreadId === t.thread_id ? 'active' : ''}`}
                onClick={() => setActiveThreadId(t.thread_id)}
              >
                <MessageSquare size={14} style={{ flexShrink: 0 }} /> 
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.title}
                </span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', padding: '0 12px' }}>No recent chats.</div>
          )}
        </div>
      </aside>

      {/* --- MAIN CHAT --- */}
      <main className="main-chat">
        <header className="chat-nav">
          <Settings size={20} color="rgba(255,255,255,0.4)" style={{ cursor: 'pointer' }} />
        </header>

        {isChatEmpty ? (
          <div className="empty-state">
            <h1 className="greeting">Good evening, Aman</h1>
            <p className="sub-greeting">What can I help you with today?</p>
            
            <div className="pill-container">
              <button className="prompt-pill" onClick={() => handleSend("Book the robotics lab for tomorrow at 3pm")}>
                <Calendar size={14} /> Book robotics lab
              </button>
              <button className="prompt-pill" onClick={() => handleSend("What are the prerequisites for CNC machining?")}>
                <Search size={14} /> Check prerequisites
              </button>
              <button className="prompt-pill" onClick={() => handleSend("Show my current attendance status")}>
                <LayoutGrid size={14} /> View attendance
              </button>
            </div>

            <div className="input-wrapper centered">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="input-box">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..." className="chat-input" disabled={isTyping} />
                <button type="submit" className="send-btn" disabled={!input.trim() || isTyping}>
                  <Send size={16} strokeWidth={2.5} style={{ marginLeft: '-2px' }} />
                </button>
              </form>
            </div>
            <p style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>AI can make mistakes. Please verify important actions.</p>
          </div>
        ) : (
          <>
            <div className="chat-scroll">
              <div className="chat-container">
              {messages.map((msg, idx) => (
    <div key={idx} className={`message-row ${msg.role}`}>
      <div className={`avatar ${msg.role}`}>
        {msg.role === "assistant" ? <Bot size={18} /> : <User size={18} />}
      </div>
      <div className={`bubble ${msg.role}`}>
        <ReactMarkdown>
          {msg.content}
        </ReactMarkdown>
      </div>                  </div>
                ))}
                {isTyping && (
                  <div className="message-row assistant">
                    <div className="ai-thinking" />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="input-wrapper bottom">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="input-box">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message Campus Copilot..." className="chat-input" disabled={isTyping} />
                <button type="submit" className="send-btn" disabled={!input.trim() || isTyping}>
                  <Send size={16} strokeWidth={2.5} style={{ marginLeft: '-2px' }} />
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
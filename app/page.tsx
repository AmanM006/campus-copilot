"use client";
import React, { useState } from "react";
import { ArrowUpRight, Plus, Minus, ArrowDown, Terminal, Cloud, Layers, Calendar, FileText, CheckCircle2, Activity, Send, Settings, Sidebar } from "lucide-react";

// Per-chat history store
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

export default function CampusCopilot() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [extraMessages, setExtraMessages] = useState<{ role: string; text: string }[]>([]);

  const recentChats = [
    { label: "what is the heading of th...", key: "what is the heading of th..." },
    { label: "What are the prerequisite...", key: "What are the prerequisite..." },
    { label: "Book the robotics lab for...", key: "Book the robotics lab for..." },
  ];

  const currentMessages = activeChat && activeChat !== "__new__"
    ? [...(CHAT_DATA[activeChat] || []), ...extraMessages]
    : extraMessages;

  const handleNewChat = () => {
    setActiveChat(null);
    setExtraMessages([]);
    setInputVal("");
  };

  const handleSelectChat = (key: string) => {
    setActiveChat(key);
    setExtraMessages([]);
    setInputVal("");
  };

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
      ? "✅ Robotics lab booked for tomorrow at 3:00 PM. You'll get a confirmation email shortly."
      : text.includes("prerequisite")
      ? "📋 You currently meet all prerequisites for your enrolled courses this semester."
      : "📊 Your attendance stands at 82% this semester. You need 75% to be eligible for exams — you're on track.";
    setExtraMessages([
      { role: "user", text },
      { role: "assistant", text: reply },
    ]);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0a0a0a", color: "#fff", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }
        a { text-decoration: none; color: inherit; }
        html { scroll-behavior: smooth; }

        /* ── NAV ── */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          display: flex; align-items: center; justify-content: space-between;
          padding: 22px 40px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%);
        }
        .nav-logo { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: #fff; cursor: pointer; }
        .nav-links { display: flex; gap: 40px; }
        .nav-links a {
          font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
          color: rgba(255,255,255,0.7); transition: color .2s; cursor: pointer; background: none; border: none;
        }
        .nav-links a:hover { color: #fff; }
        .nav-cta { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; cursor: pointer; display: flex; align-items: center; gap: 4px; }

        /* ── S1 HERO ── */
        .s1 {
          position: relative; height: 100vh; width: 100vw;
          display: flex; flex-direction: column;
          background-color: #000; overflow: hidden;
        }
        .s1-gradient {
          position: absolute; inset: 0; z-index: 0;
          background-image:
            linear-gradient(180deg, transparent 60%, rgba(244,244,245,0.95) 82%, #f4f4f5 100%),
            radial-gradient(ellipse 150% 65% at 50% 72%, #6d28d9 0%, #2e1065 40%, #000 75%);
          pointer-events: none;
        }
        .s1-main {
          position: relative; z-index: 2;
          flex: 1; display: flex; justify-content: space-between; align-items: center;
          padding: 0 40px; margin-top: 40px;
        }
        .s1-left { display: flex; flex-direction: column; gap: 24px; }
        .s1-headline {
          font-size: clamp(60px, 8.5vw, 120px); font-weight: 500;
          line-height: 0.95; letter-spacing: -0.03em; color: #fff;
        }
        .s1-headline-fade { color: rgba(255,255,255,0.75); }
        .s1-right {
          max-width: 280px; text-align: right;
          font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.6);
          font-weight: 400; align-self: flex-start; margin-top: 80px;
        }

        /* ── APP WINDOW ── */
        .app-window-section {
          position: relative; z-index: 5; background: #f4f4f5;
          padding: 0 40px; display: flex; justify-content: center;
          margin-top: -40px;
        }
        .app-window-wrap {
          width: 100%; max-width: 1100px; margin: 0 auto;
          transform: perspective(1800px) rotateX(2deg); transition: transform 0.4s ease;
        }
        .app-window-wrap:hover { transform: perspective(1800px) rotateX(0deg); }
        .window-chrome {
          background: #1a1a1a; border-radius: 16px; overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 40px 120px rgba(0,0,0,0.5), 0 20px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .window-titlebar {
          background: #111; height: 44px; display: flex; align-items: center;
          padding: 0 16px; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .traffic-light { width: 12px; height: 12px; border-radius: 50%; }
        .tl-red { background: #ff5f57; }
        .tl-yellow { background: #febc2e; }
        .tl-green { background: #28c840; }
        .window-title-center {
          flex: 1; text-align: center; font-size: 12px; color: rgba(255,255,255,0.4);
          font-family: 'DM Mono', monospace; letter-spacing: 0.02em;
        }
        .app-layout { display: grid; grid-template-columns: 260px 1fr; height: 520px; }

        /* Sidebar */
        .app-sidebar { background: #111; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; overflow: hidden; }
        .sidebar-header { padding: 16px 16px 8px; display: flex; align-items: center; justify-content: space-between; }
        .sidebar-brand { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
        .sidebar-icon-btn { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.2s; }
        .sidebar-icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .new-chat-btn { margin: 4px 12px 12px; padding: 10px 16px; background: #fff; color: #000; border-radius: 10px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; border: none; }
        .new-chat-btn:hover { background: rgba(255,255,255,0.88); }
        .sidebar-section-label { padding: 8px 16px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.3); }
        .chat-item { padding: 8px 16px; font-size: 12.5px; color: rgba(255,255,255,0.5); cursor: pointer; border-radius: 8px; margin: 1px 8px; display: flex; align-items: center; gap: 10px; transition: all 0.15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
        .chat-item.active { background: rgba(124,58,237,0.15); color: #fff; }
        .sidebar-footer { margin-top: auto; padding: 12px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 10px; }
        .user-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #2563eb); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .user-info { overflow: hidden; }
        .user-name { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-plan { font-size: 10px; color: rgba(255,255,255,0.4); }

        /* Chat main */
        .app-main { display: flex; flex-direction: column; background: #0d0d0d; overflow: hidden; }
        .chat-messages { flex: 1; overflow-y: auto; padding: 32px 48px 16px; display: flex; flex-direction: column; gap: 20px; scrollbar-width: none; }
        .chat-messages::-webkit-scrollbar { display: none; }
        .msg-welcome { text-align: center; padding: 48px 0 20px; margin-top:80px;}
        .msg-welcome h2 { font-size: 26px; font-weight: 600; color: #fff; letter-spacing: -0.02em; margin-bottom: 6px; }
        .msg-welcome p { font-size: 13px; color: rgba(255,255,255,0.4); }
        .quick-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
        .quick-btn { padding: 8px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; font-size: 12px; color: rgba(255,255,255,0.7); cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; white-space: nowrap; }
        .quick-btn:hover { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255,255,255,0.2); }
        .msg-bubble { display: flex; gap: 12px; }
        .msg-bubble.user { justify-content: flex-end; }
        .bubble-avatar { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; background: linear-gradient(135deg, #7c3aed, #2563eb); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; margin-top: 2px; }
        .bubble-content { max-width: 68%; padding: 12px 16px; border-radius: 16px; font-size: 13px; line-height: 1.6; white-space: pre-line; }
        .msg-bubble.assistant .bubble-content { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); border-radius: 4px 16px 16px 16px; }
        .msg-bubble.user .bubble-content { background: #7c3aed; color: #fff; border-radius: 16px 16px 4px 16px; }
        .chat-input-area { padding: 16px 48px 20px; flex-shrink: 0; width:690px;margin-left:74px}
        .chat-input-box { display: flex; margin-bottom:115px;align-items: center; gap: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 12px 16px; transition: border-color 0.2s; }
        .chat-input-box:focus-within { border-color: rgba(124,58,237,0.5); }
        .chat-input { flex: 1; background: none; border: none; outline: none; font-size: 13px; color: #fff; font-family: 'DM Sans', sans-serif; }
        .chat-input::placeholder { color: rgba(255,255,255,0.3); }
        .send-btn { width: 32px; height: 32px; border-radius: 8px; background: #ffffff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #000; transition: all 0.2s; }
        .send-btn:hover { background: #ffffff; transform: scale(1.05); }
        .input-hint { text-align: center; margin-top: 8px; font-size: 10px; color: rgba(255,255,255,0.2); font-family: 'DM Mono', monospace; }

        /* ── S2 STATEMENT ── */
        .s2 { display: flex; flex-direction: column; height:95vh; align-items: center; background: #f4f4f5; padding: 130px 40px 0; }
        .s2-grid { width: 100%; max-width: 1200px; display: grid; grid-template-columns: 7fr 5fr; gap: 80px; align-items: start; }
        .s2-headline { font-size: clamp(24px, 3.5vw, 44px); font-weight: 400; line-height: 1.25; letter-spacing: -0.02em; color: #111; }
        .s2-pill { display: inline-block; background: #111; color: #f4f4f5; padding: 2px 20px 6px; border-radius: 100px; font-size: clamp(22px, 3.2vw, 40px); font-weight: 400; margin: 0 4px; vertical-align: middle; }
        .s2-body { font-size: 15px; color: rgba(0,0,0,0.6); line-height: 1.7; margin-bottom: 24px; }
        .s2-more { display: flex; align-items: center; gap: 6px; padding-top: 24px; border-top: 1px solid rgba(0,0,0,0.1); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #000; cursor: pointer; transition: opacity .2s; }
        .s2-more:hover { opacity: 0.6; }
        .s2-bottom-bar { display: flex; align-items: center; justify-content: space-between; padding: 28px 0; border-top: 1px solid rgba(0,0,0,0.9); margin-top: 175px; width: 100%; max-width: 1500px; }
        .s2-b-text { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #000; }
        .s2-b-tech { display: flex; gap: 32px; }

        /* ── IMAGE SECTIONS ── */
        .s-image-section { min-height: 100vh; position: relative; display: flex; align-items: center; padding: 120px 40px; overflow: hidden; }
        .s-image-bg-right { position: absolute; right: 0; top: 0; width: 55%; height: 100%; background: url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=2000') center/cover; opacity: 0.35; mask-image: linear-gradient(to left, black, transparent); -webkit-mask-image: linear-gradient(to left, black, transparent); }
        .s-image-bg-left { position: absolute; left: 0; top: 0; width: 55%; height: 100%; background: url('https://images.unsplash.com/photo-1542626991-cbc4e32524cc?auto=format&fit=crop&q=80&w=2000') center/cover; opacity: 0.3; mask-image: linear-gradient(to right, black, transparent); -webkit-mask-image: linear-gradient(to right, black, transparent); }
        .s-image-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%); z-index: 1; pointer-events: none; }
        .s-image-content { position: relative; z-index: 2; width: 100%; max-width: 1200px; margin: 0 auto; display: flex; }
        .s-image-text { max-width: 550px; }
        .s-image-eyebrow { font-family: 'DM Mono', monospace; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.2em; font-size: 12px; margin-bottom: 24px; display: block; }
        .s-image-title { font-size: clamp(40px, 5vw, 64px); font-weight: 500; line-height: 1.1; color: #fff; margin-bottom: 24px; }
        .s-image-desc { font-size: 18px; color: rgba(255,255,255,0.6); line-height: 1.7; }

        /* ── CAPABILITIES (100vh) ── */
        .s5-cap { height: 100vh; background: #000; padding: 0 40px; display: flex; align-items: center; }
        .s5-grid { width: 100%; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 100px; align-items: center; }
        .cap-item { padding: 36px 0; border-top: 1px solid rgba(255,255,255,0.1); display: grid; grid-template-columns: 64px 1fr; gap: 24px; transition: border-color 0.3s; }
        .cap-item:hover { border-top-color: #7c3aed; }
        .cap-icon-box { width: 64px; height: 64px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; display: flex; align-items: center; justify-content: center; }
        .cap-item-title { font-size: 22px; font-weight: 500; color: #fff; margin-bottom: 10px; }
        .cap-item-desc { font-size: 14px; color: rgba(255,255,255,0.5); line-height: 1.6; }

        /* ── PRICING (100vh) ── */
        .pricing-section { height: 100vh; padding-top:150px;background: #000; display: flex; align-items: center; }
        .pricing-inner { width: 100%; max-width: 1200px; margin: 0 auto; }
        .pricing-header { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: end; margin-bottom: 48px; }
        .pricing-eyebrow { font-family: 'DM Mono', monospace; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.2em; font-size: 12px; margin-bottom: 20px; display: block; }
        .pricing-title { font-size: clamp(34px, 4vw, 52px); font-weight: 500; line-height: 1.05; color: #fff; letter-spacing: -0.03em; }
        .pricing-subtitle { font-size: 14px; color: rgba(255,255,255,0.45); line-height: 1.6; max-width: 360px; }
        .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .pricing-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 22px; padding: 32px; display: flex; flex-direction: column; transition: border-color 0.3s, background 0.3s; position: relative; overflow: hidden; }
        .pricing-card:hover { border-color: rgba(124,58,237,0.4); background: rgba(124,58,237,0.04); }
        .pricing-card.featured { border-color: #7c3aed; background: rgba(124,58,237,0.08); }
        .pricing-card.featured::before { content: 'MOST POPULAR'; position: absolute; top: 18px; right: 18px; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #7c3aed; background: rgba(124,58,237,0.15); padding: 4px 10px; border-radius: 100px; border: 1px solid rgba(124,58,237,0.3); }
        .plan-name { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 16px; }
        .plan-price { font-size: 46px; font-weight: 500; letter-spacing: -0.04em; color: #fff; line-height: 1; margin-bottom: 4px; }
        .plan-price span { font-size: 16px; font-weight: 400; color: rgba(255,255,255,0.4); vertical-align: top; margin-top: 8px; display: inline-block; }
        .plan-unit { font-size: 11px; color: rgba(255,255,255,0.3); margin-bottom: 20px; }
        .plan-divider { height: 1px; background: rgba(255,255,255,0.08); margin-bottom: 20px; }
        .plan-features { display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .plan-feature { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.4; }
        .plan-feature-dot { width: 5px; height: 5px; border-radius: 50%; background: #7c3aed; flex-shrink: 0; margin-top: 5px; }
        .plan-cta { margin-top: 20px; padding: 11px 0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.6); cursor: pointer; text-align: center; transition: all 0.2s; }
        .plan-cta:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .pricing-card.featured .plan-cta { background: #7c3aed; border-color: #7c3aed; color: #fff; }
        .pricing-card.featured .plan-cta:hover { background: #6d28d9; }
        .pricing-market { margin-top: 32px; padding: 22px 32px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .market-stat-num { font-size: 34px; font-weight: 500; letter-spacing: -0.03em; color: #fff; margin-bottom: 3px; }
        .market-stat-label { font-size: 12px; color: rgba(255,255,255,0.35); }

        /* ── FAQ (100vh) ── */
        .faq-section { height: 100vh; padding: 0 40px; background: #000000;padding-top:350px; display: flex; align-items: center; }
        .faq-inner { width: 100%; max-width: 1200px; margin: 0 auto; }
        .faq-header { margin-bottom: 48px; }
        .faq-title { font-size: clamp(36px, 4.5vw, 56px); font-weight: 500; line-height: 1.05; color: #fff; letter-spacing: -0.03em; }
        .faq-list { border-top: 1px solid rgba(255,255,255,0.1); }
        .faq-row { border-bottom: 1px solid rgba(255,255,255,0.08); }
        .faq-btn { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 22px 0; cursor: pointer; transition: opacity .2s; width: 100%; background: none; border: none; text-align: left; }
        .faq-btn:hover { opacity: 0.7; }
        .faq-q { font-size: 17px; font-weight: 400; color: #fff; }
        .faq-ico { width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .25s; color: #fff; }
        .faq-ico.open { background: #7c3aed; border-color: #7c3aed; }
        .faq-ans { overflow: hidden; transition: max-height .4s ease, opacity .4s ease; }
        .faq-ans-inner { padding-bottom: 20px; font-size: 14px; color: rgba(255,255,255,0.5); line-height: 1.7; max-width: 800px; }

        /* ── FOOTER ── */
        .footer { background: #000; padding: 250px 40px 0; border-top: 1px solid rgba(255,255,255,0.05); }
        .footer-top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 80px; flex-wrap: wrap; gap: 24px; }
        .footer-links { display: flex; gap: 32px; flex-wrap: wrap; }
        .footer-links a { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.5); transition: color .2s; font-weight: 500; }
        .footer-links a:hover { color: #fff; }
        .footer-word { font-size: clamp(80px, 18vw, 240px); font-weight: 900; letter-spacing: -0.04em; line-height: 0.75; text-align: center; color: #fff; user-select: none; overflow: hidden; }
      `}</style>

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
              Orchestrating<br />
              campus<br />
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
              {/* Sidebar */}
              <div className="app-sidebar">
                <div className="sidebar-header">
                  <span className="sidebar-brand">CampusCopilot</span>
                  <div className="sidebar-icon-btn"><Sidebar size={14} /></div>
                </div>
                <button className="new-chat-btn" onClick={handleNewChat}>
                  <Plus size={14} /> New Chat
                </button>
                <div className="sidebar-section-label">Recent</div>
                {recentChats.map((chat, i) => (
                  <div
                    key={i}
                    className={`chat-item ${activeChat === chat.key ? "active" : ""}`}
                    onClick={() => handleSelectChat(chat.key)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    {chat.label}
                  </div>
                ))}
                <div className="sidebar-footer">
                  <div className="user-avatar">N</div>
                  <div className="user-info">
                    <div className="user-name">aman_m_006</div>
                    <div className="user-plan">Free plan</div>
                  </div>
                  <div className="sidebar-icon-btn" style={{ marginLeft: "auto" }}><Settings size={13} /></div>
                </div>
              </div>

              {/* Main Chat */}
              <div className="app-main">
                <div className="chat-messages">
                  {activeChat === null ? (
                    <div className="msg-welcome">
                      <h2>Good evening, Aman</h2>
                      <p>What can I help you with today?</p>
                      <div className="quick-actions">
                        <div className="quick-btn" onClick={() => handleQuickAction("Book robotics lab for tomorrow at 3pm")}>
                          <Calendar size={12} /> Book robotics lab
                        </div>
                        <div className="quick-btn" onClick={() => handleQuickAction("Check my course prerequisites")}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          Check prerequisites
                        </div>
                        <div className="quick-btn" onClick={() => handleQuickAction("View my attendance")}>
                          <Activity size={12} /> View attendance
                        </div>
                      </div>
                    </div>
                  ) : (
                    currentMessages.map((msg, i) => (
                      <div key={i} className={`msg-bubble ${msg.role}`}>
                        {msg.role === "assistant" && (
                          <div className="bubble-avatar" style={{ fontSize: 9 }}>CC</div>
                        )}
                        <div className="bubble-content">{msg.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-input-area">
                  <div className="chat-input-box">
                    <input
                      className="chat-input"
                      placeholder="Ask anything..."
                      value={inputVal}
                      onChange={e => setInputVal(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSend()}
                    />
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
            <span className="s2-pill">intelligent</span>
            {" "}and unified — campus experiences.
          </h2>
          <div>
            <p className="s2-body">
              We met during a campus hackathon and realized we were all wasting 45+ minutes a week navigating scattered portals for attendance, fees, and lab bookings.
            </p>
            <p className="s2-body">
              Instead of building a generic AI, we built a tool that simultaneously retrieves prerequisites via RAG and actively books your lab slot using MCP tools.
            </p>
            <div className="s2-more">Read our story <ArrowUpRight size={14} /></div>
          </div>
        </div>

        {/* Bottom bar — SEE HOW IT WORKS left, tech labels center, SCROLL NOW right */}
        <div className="s2-bottom-bar">
          <div className="s2-b-text" onClick={() => scrollTo("features")}>SEE HOW IT WORKS</div>
          <div className="s2-b-tech">
            <div className="s2-b-text">
              <Cloud size={16} strokeWidth={2.5} style={{ color: "#3b82f6" }} /><span>AZURE AI</span>
            </div>
            <div className="s2-b-text">
              <Terminal size={16} strokeWidth={2.5} style={{ color: "#a855f7" }} /><span>MCP TOOLS</span>
            </div>
            <div className="s2-b-text">
              <Layers size={16} strokeWidth={2.5} style={{ color: "#000" }} /><span>NEXT.JS</span>
            </div>
          </div>
          <div className="s2-b-text" onClick={() => scrollTo("features")}>
            SCROLL NOW <ArrowDown size={14} />
          </div>
        </div>
      </section>

      {/* ══ S3: FEATURE — KNOWLEDGE ══ */}
      <section className="s-image-section" id="features" style={{ background: "#070707" }}>
        <div className="s-image-bg-right" />
        <div className="s-image-overlay" />
        <div className="s-image-content">
          <div className="s-image-text">
            <span className="s-image-eyebrow">Instant Context</span>
            <h3 className="s-image-title">Get fast answers<br/>about academics.</h3>
            <p className="s-image-desc">
              Give everyone instant access to campus knowledge. Ask the Copilot about course prerequisites, lab safety manuals, or exam schedules, and it retrieves the exact policy in seconds.
            </p>
          </div>
        </div>
      </section>

      {/* ══ S4: FEATURE — ACTION ══ */}
      <section className="s-image-section" style={{ background: "#0a0a0a" }}>
        <div className="s-image-bg-left" />
        <div className="s-image-overlay" />
        <div className="s-image-content" style={{ justifyContent: "flex-end" }}>
          <div className="s-image-text" style={{ textAlign: "right" }}>
            <span className="s-image-eyebrow" style={{ color: "#0ea5e9" }}>Take Action</span>
            <h3 className="s-image-title">Manage your tasks<br/>from one place.</h3>
            <p className="s-image-desc">
              Don't just ask questions — get things done. Tell the Copilot to book a robotics lab slot, verify your fee status, or log your attendance, and it executes the action directly.
            </p>
          </div>
        </div>
      </section>

      {/* ══ CAPABILITIES (100vh) ══ */}
      <section className="s5-cap" id="capabilities">
        <div className="s5-grid">
          <div>
            <span className="s-image-eyebrow">Capabilities</span>
            <h2 className="s-image-title" style={{ fontSize: "clamp(48px, 6vw, 68px)", margin: "24px 0 36px" }}>
              What you can<br/>accomplish.
            </h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "15px", lineHeight: 1.6, maxWidth: "300px" }}>
              Stop switching between disjointed campus apps. Just ask Copilot.
            </p>
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
                <div>
                  <h4 className="cap-item-title">{s.title}</h4>
                  <p className="cap-item-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING (100vh) ══ */}
      <section className="pricing-section" id="pricing">
        <div className="pricing-inner">
          <div className="pricing-header">
            <div>
              <span className="pricing-eyebrow">Pricing</span>
              <h2 className="pricing-title">Simple,<br/>campus-first<br/>pricing.</h2>
            </div>
            <p className="pricing-subtitle">
              Targeting a $50M SAM across 43M+ enrolled students in India alone. Built to scale from a single department pilot to a full university rollout.
            </p>
          </div>
          <div className="pricing-grid">
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
              <div className="plan-cta">Get Started</div>
            </div>
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
              <div className="plan-cta">Get Started</div>
            </div>
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
              <div className="plan-cta">Contact Sales</div>
            </div>
          </div>
          <div className="pricing-market">
            <div><div className="market-stat-num">43M+</div><div className="market-stat-label">enrolled students in India</div></div>
            <div><div className="market-stat-num">$50M</div><div className="market-stat-label">serviceable addressable market</div></div>
            <div><div className="market-stat-num">1,000+</div><div className="market-stat-label">universities in target market</div></div>
          </div>
        </div>
      </section>

      {/* ══ FAQ (100vh) ══ */}
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
                  <div className={`faq-ico${openFaq === i ? " open" : ""}`}>
                    {openFaq === i ? <Minus size={15} /> : <Plus size={15} />}
                  </div>
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
          <span style={{ fontSize: 11, letterSpacing: "0.05em", color: "rgba(255,255,255,0.4)" }}>
            © 2026 CAMPUS COPILOT
          </span>
        </div>
        <div className="footer-word">COPILOT</div>
      </footer>
    </div>
  );
}
"use client";
import React, { useState } from "react";
import { ArrowUpRight, Plus, Minus, ArrowDown, Database, Terminal, ShieldCheck, Cpu, Cloud, Layers, Calendar, FileText, CheckCircle2, Activity } from "lucide-react";

export default function CampusCopilot() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0a0a0a", color: "#fff", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }
        a { text-decoration: none; color: inherit; }

        /* ── NAV ── */
        .nav {
          position: absolute; top: 0; left: 0; right: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px 40px;
        }
        .nav-logo { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: #fff; }
        .nav-links { display: flex; gap: 40px; }
        .nav-links a { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.7); transition: color .2s; }
        .nav-links a:hover { color: #fff; }
        .nav-cta { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; cursor: pointer; display: flex; align-items: center; gap: 4px; }

        /* ── S1 EXACT OXALEY HERO ── */
        .s1 {
          position: relative; height: 100vh; width: 100vw;
          display: flex; flex-direction: column;
          background-color: #000; overflow: hidden;
        }
        /* The magical Oxaley Gradient */
        .s1-gradient {
          position: absolute; inset: 0; z-index: 0;
          background-image: 
            linear-gradient(180deg, transparent 65%, rgba(244,244,245,0.9) 85%, #f4f4f5 100%),
            radial-gradient(ellipse 150% 65% at 50% 80%, #6d28d9 0%, #2e1065 40%, #000 75%);
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
        .s1-headline-fade { color: rgba(255,255,255,0.35); }
        
        /* Overlapping Avatars/Icons */
        .s1-avatars { display: flex; align-items: center; padding-left: 10px; }
        .s1-avatar { 
          width: 48px; height: 48px; border-radius: 50%; 
          border: 3px solid #000; margin-left: -15px;
          background: #fff; display: flex; align-items: center; justify-content: center;
          color: #000; font-weight: bold; font-size: 12px;
        }

        .s1-right {
          max-width: 280px; text-align: right;
          font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.6);
          font-weight: 400; align-self: flex-start; margin-top: 80px;
        }

        /* Hero Bottom Row (Sits on the white area) */
        .s1-bottom {
          position: relative; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: 32px 40px; color: #000;
        }
        .s1-b-text { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .s1-b-center { 
          display: flex; gap: 12px; 
          position: absolute; left: 50%; bottom: 32px;
          transform: translateX(-50%); 
        }

        .s1-card { 
          position: relative;
          width: 150px; 
          height: 60px; 
          background: rgba(0, 0, 0, 0.8); 
          backdrop-filter: blur(12px);
          border-radius: 100px; 
          display: flex; align-items: center; justify-content: center;
          padding: 0 20px;
          color: rgba(255, 255, 255, 0.5); 
          font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer; 
          transition: all 0.3s ease;
        }

        .s1-card:hover {
          transform: translateY(-4px);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(20, 20, 20, 0.95);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }

        .s1-card-content { 
          display: flex; align-items: center; justify-content: center; gap: 10px; 
        }

        .s1-card.azure:hover { box-shadow: 0 10px 20px rgba(59, 130, 246, 0.2); }
        .s1-card.mcp:hover { box-shadow: 0 10px 20px rgba(168, 85, 247, 0.2); }
        .s1-card.next:hover { box-shadow: 0 10px 20px rgba(255, 255, 255, 0.1); }
        
        /* ── S2 STATEMENT ── */
        .s2 {
          display: flex; align-items: center;
          background: #f4f4f5; padding: 120px 40px;
        }
        .s2-grid {
          width: 100%; max-width: 1200px; margin: 0 auto;
          display: grid; grid-template-columns: 7fr 5fr; gap: 80px; align-items: start;
        }
        .s2-headline {
          font-size: clamp(24px, 3.5vw, 44px); font-weight: 400;
          line-height: 1.25; letter-spacing: -0.02em; color: #111;
        }
        .s2-pill {
          display: inline-block; background: #111; color: #f4f4f5;
          padding: 2px 20px 6px; border-radius: 100px;
          font-size: clamp(22px, 3.2vw, 40px); font-weight: 400;
          margin: 0 4px; vertical-align: middle;
        }
        .s2-body { font-size: 15px; color: rgba(0,0,0,0.6); line-height: 1.7; margin-bottom: 24px; }
        .s2-more {
          display: flex; align-items: center; gap: 6px;
          padding-top: 24px; border-top: 1px solid rgba(0,0,0,0.1);
          font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          color: #000; cursor: pointer; transition: opacity .2s;
        }
        .s2-more:hover { opacity: 0.6; }

        /* ── S3 & S4: IMAGE/OUTCOME SECTIONS (100vh) ── */
        .s-image-section { 
          min-height: 100vh; position: relative; display: flex; 
          align-items: center; padding: 120px 40px; overflow: hidden; 
        }
        .s-image-bg-right { 
          position: absolute; right: 0; top: 0; width: 55%; height: 100%; 
          background: url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=2000') center/cover; 
          opacity: 0.35; mask-image: linear-gradient(to left, black, transparent); -webkit-mask-image: linear-gradient(to left, black, transparent); 
        }
        .s-image-bg-left { 
          position: absolute; left: 0; top: 0; width: 55%; height: 100%; 
          background: url('https://images.unsplash.com/photo-1542626991-cbc4e32524cc?auto=format&fit=crop&q=80&w=2000') center/cover; 
          opacity: 0.3; mask-image: linear-gradient(to right, black, transparent); -webkit-mask-image: linear-gradient(to right, black, transparent); 
        }
        .s-image-overlay { 
          position: absolute; inset: 0; 
          background: linear-gradient(to bottom, #0a0a0a 0%, transparent 15%, transparent 85%, #0a0a0a 100%); 
          z-index: 1; pointer-events: none; 
        }
        .s-image-content { 
          position: relative; z-index: 2; width: 100%; max-width: 1200px; margin: 0 auto; display: flex; 
        }
        .s-image-text { max-width: 550px; }
        .s-image-eyebrow { 
          font-family: 'DM Mono', monospace; color: #7c3aed; text-transform: uppercase; 
          letter-spacing: 0.2em; font-size: 12px; margin-bottom: 24px; display: block; 
        }
        .s-image-title { font-size: clamp(40px, 5vw, 64px); font-weight: 500; line-height: 1.1; color: #fff; margin-bottom: 24px; }
        .s-image-desc { font-size: 18px; color: rgba(255,255,255,0.6); line-height: 1.7; }

        /* ── S5: CAPABILITIES LIST (100vh) ── */
        .s5-cap { min-height: 100vh; background: #000; padding: 120px 40px; display: flex; align-items: center; }
        .s5-grid { width: 100%; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 100px; align-items: center; }
        .cap-item { 
          padding: 40px 0; border-top: 1px solid rgba(255,255,255,0.1); 
          display: grid; grid-template-columns: 64px 1fr; gap: 24px; transition: border-color 0.3s ease; 
        }
        .cap-item:hover { border-top-color: #7c3aed; }
        .cap-icon-box { 
          width: 64px; height: 64px; background: rgba(255,255,255,0.03); 
          border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; 
          display: flex; align-items: center; justify-content: center; 
        }
        .cap-item-title { font-size: 24px; font-weight: 500; color: #fff; margin-bottom: 12px; }
        .cap-item-desc { font-size: 15px; color: rgba(255,255,255,0.5); line-height: 1.6; }

        /* ── S6: REAL-WORLD CASE STUDY (100vh) ── */
        .s6-synth { 
          min-height: 100vh; background: #050505; position: relative; 
          overflow: hidden; padding: 120px 40px; display: flex; align-items: center; justify-content: center; 
        }
        .s6-ambient { 
          position: absolute; width: 80vh; height: 80vh; border-radius: 50%; 
          background: radial-gradient(circle, #7c3aed 0%, transparent 70%); 
          opacity: 0.08; filter: blur(100px); 
        }
        .s6-card { 
          position: relative; z-index: 10; background: rgba(255,255,255,0.02); 
          border: 1px solid rgba(255,255,255,0.08); border-radius: 40px; padding: 80px; 
          width: 100%; max-width: 1200px; display: grid; grid-template-columns: 1.2fr 0.8fr; 
          gap: 80px; backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); 
        }
        .chat-box { 
          margin: 40px 0; padding: 32px; background: rgba(255,255,255,0.03); 
          border-radius: 16px; font-size: 20px; line-height: 1.5; color: #fff; 
        }
        .chat-eyebrow { 
          opacity: 0.5; font-size: 14px; display: block; margin-bottom: 12px; 
        }
        .viz-sphere { 
          width: 320px; height: 320px; border-radius: 50%; background: #000; 
          border: 1px solid rgba(124,58,237,0.3); position: relative; overflow: hidden; 
          box-shadow: 0 0 80px rgba(124,58,237,0.15); display: flex; align-items: center; justify-content: center; 
        }
        .scan-line { 
          position: absolute; width: 120%; height: 2px; background: #7c3aed; 
          box-shadow: 0 0 20px #7c3aed; top: 50%; left: -10%; 
          animation: scan 4s ease-in-out infinite; opacity: 0.6; 
        }
        .viz-inner-ring { position: absolute; inset: 40px; border: 1px solid rgba(124,58,237,0.2); border-radius: 50%; }
        @keyframes scan { 0%, 100% { transform: translateY(-100px) rotate(-15deg); } 50% { transform: translateY(100px) rotate(-15deg); } }

        /* ── S7 FAQ ── */
        .s7 { padding: 120px 40px; background: #050505; }
        .s7-grid { width: 100%; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 4fr 8fr; gap: 80px; align-items: start; }
        .s7-headline { font-size: clamp(34px, 4.5vw, 54px); font-weight: 400; line-height: 1.1; letter-spacing: -0.03em; color: #fff; }
        .s7-list { border-top: 1px solid rgba(255,255,255,0.1); }
        .faq-row { border-bottom: 1px solid rgba(255,255,255,0.1); }
        .faq-btn { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 32px 0; cursor: pointer; transition: opacity .2s; width: 100%; background: none; border: none; text-align: left; }
        .faq-btn:hover { opacity: 0.7; }
        .faq-q { font-size: 18px; font-weight: 400; color: #fff; }
        .faq-ico { width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .25s; color: #fff; }
        .faq-ico.open { background: #7c3aed; border-color: #7c3aed; }
        .faq-ans { overflow: hidden; transition: max-height .45s ease, opacity .45s ease; }
        .faq-ans-inner { padding-bottom: 32px; font-size: 15px; color: rgba(255,255,255,0.5); line-height: 1.7; max-width: 600px; }

        /* ── FOOTER ── */
        .footer { background: #000; padding: 60px 40px 0; border-top: 1px solid rgba(255,255,255,0.05); }
        .footer-top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 80px; flex-wrap: wrap; gap: 24px; }
        .footer-links { display: flex; gap: 32px; flex-wrap: wrap; }
        .footer-links a { font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.5); transition: color .2s; font-weight: 500; }
        .footer-links a:hover { color: #fff; }
        .footer-word {
          font-size: clamp(80px, 18vw, 240px); font-weight: 900;
          letter-spacing: -0.04em; line-height: 0.75; text-align: center;
          color: #ffffff; user-select: none; overflow: hidden;
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <span className="nav-logo">CampusCopilot</span>
        <div className="nav-links">
          <a href="#">Architecture</a>
          <a href="#">Features</a>
          <a href="#">Pricing</a>
          <a href="#">FAQ</a>
        </div>
        <a href="/login" className="nav-cta">STUDENT LOGIN <ArrowUpRight size={14} /></a>
      </nav>

      {/* ══ S1: HERO (EXACT OXALEY MATCH) ══ */}
      <section className="s1">
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

        <div className="s1-bottom">
          <div className="s1-b-text">SEE HOW IT WORKS</div>
          <div className="s1-b-center">
          <div className="s1-b-text">
          <Cloud size={16} strokeWidth={2.5} style={{ color: '#3b82f6' }} />
                <span style={{marginRight:20}}>AZURE AI</span>
              </div>
            
            <div className="s1-b-text">
            <Terminal size={16} strokeWidth={2.5} style={{ color: '#a855f7' }} />
                <span style={{marginRight:20}}>MCP TOOLS</span>
            </div>
            
            <div className="s1-b-text">
              <div className="s1-card-content">
                <Layers size={16} strokeWidth={2.5} style={{ color: '#000' }} />
                <span style={{marginRight:20}}>NEXT.JS</span>
              </div>
            </div>
          </div>
          <div className="s1-b-text">SCROLL NOW <ArrowDown size={14} /></div>
        </div>
      </section>

      {/* ══ S2: STATEMENT ══ */}
      <section className="s2 h-175">
        <div className="s2-grid">
          <h2 className="s2-headline">
            At Campus Copilot we believe that university tech is not just about isolated portals but also about creating — 
            <span className="s2-pill">intelligent</span>
            and unified — campus experiences.
          </h2>
          <div>
            <p className="s2-body">
              We met during a campus hackathon and realized we were all wasting 45+ minutes a week navigating scattered portals for attendance, fees, and lab bookings.
            </p>
            <p className="s2-body">
              Instead of building a generic AI, we built a tool that simultaneously retrieves prerequisites via RAG and actively books your lab slot using MCP tools.
            </p>
            <div className="s2-more">
              Read our story <ArrowUpRight size={14} />
            </div>
          </div>
        </div>
      </section>

      {/* ══ S3: SLACK-STYLE FEATURE 1 (KNOWLEDGE) ══ */}
      <section className="s-image-section" style={{ background: '#070707' }}>
        <div className="s-image-bg-right" />
        <div className="s-image-overlay" />
        
        <div className="s-image-content">
          <div className="s-image-text">
            <span className="s-image-eyebrow">Instant Context</span>
            <h3 className="s-image-title">Get fast answers<br/>about academics.</h3>
            <p className="s-image-desc">
              Give everyone instant access to campus knowledge. Ask the Copilot about course prerequisites, lab safety manuals, or exam schedules, and it retrieves the exact policy in seconds so you can stop searching through PDFs.
            </p>
          </div>
        </div>
      </section>

      {/* ══ S4: SLACK-STYLE FEATURE 2 (ACTION) ══ */}
      <section className="s-image-section" style={{ background: '#0a0a0a' }}>
        <div className="s-image-bg-left" />
        <div className="s-image-overlay" />
        
        <div className="s-image-content" style={{ justifyContent: 'flex-end' }}>
          <div className="s-image-text" style={{ textAlign: 'right' }}>
            <span className="s-image-eyebrow" style={{ color: '#0ea5e9' }}>Take Action</span>
            <h3 className="s-image-title">Manage your tasks<br/>from one place.</h3>
            <p className="s-image-desc">
              Don't just ask questions—get things done. Tell the Copilot to book a robotics lab slot, verify your fee status, or log your attendance, and it executes the action directly in your campus portal.
            </p>
          </div>
        </div>
      </section>

      {/* ══ S5: CAPABILITIES (What you can accomplish) ══ */}
      <section className="s5-cap">
        <div className="s5-grid">
          <div>
            <span className="s-image-eyebrow">Capabilities</span>
            <h2 className="s-image-title" style={{ fontSize: '72px', margin: '24px 0 40px' }}>What you can<br/>accomplish.</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '16px', lineHeight: 1.6, maxWidth: '320px' }}>
              Stop switching between disjointed campus apps. Just ask Copilot.
            </p>
          </div>
          <div className="cap-list">
            {[
              { icon: <Calendar size={28} color="#7c3aed"/>, title: "Book campus resources", desc: "Reserve lab equipment, study rooms, or faculty meeting slots instantly through chat." },
              { icon: <FileText size={28} color="#0ea5e9"/>, title: "Navigate academic policies", desc: "Instantly find out if you meet course prerequisites without digging through course catalogues." },
              { icon: <CheckCircle2 size={28} color="#10b981"/>, title: "Track student records", desc: "Ask the bot to securely pull your current attendance percentage or outstanding fee balances." },
              { icon: <Activity size={28} color="#f59e0b"/>, title: "Automate routine updates", desc: "Faculty can automate lab conflict resolutions and receive weekly class analytics summaries." }
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

      {/* ══ S6: SYNTHESIS CASE STUDY (REAL-WORLD) ══ */}
      <section className="s6-synth">
        <div className="s6-ambient" />
        <div className="s6-card">
          <div>
            <span className="s-image-eyebrow">In Action</span>
            <div style={{ marginTop: '48px' }}>
              <h3 style={{ fontSize: '40px', fontWeight: 500, color: '#fff', marginBottom: '8px' }}>Arjun (Student)</h3>
              <p style={{ color: '#7c3aed', fontFamily: 'DM Mono', fontSize: '13px' }}>3rd Year B.Tech CSE Student</p>
              
              <div className="chat-box">
                <span className="chat-eyebrow">Arjun asks:</span>
                "Book the robotics lab tomorrow at 3pm and tell me the CNC prerequisites."
              </div>
              
              <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
                <strong style={{ color: '#fff', fontWeight: 500 }}>Copilot responds:</strong>
                <br/><br/>
                <span style={{ color: '#7c3aed' }}>"Your lab slot is booked for 3:00 PM tomorrow. Note: The CNC machine requires you to complete the ME-102 safety certification first."</span>
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="viz-sphere">
              <div className="scan-line" />
              <div className="viz-inner-ring" />
              <Cpu size={48} color="#7c3aed" style={{ opacity: 0.4 }} />
            </div>
            <span className="s-image-eyebrow" style={{ marginTop: '40px', fontSize: '10px' }}>Synthesis Engine Active</span>
          </div>
        </div>
      </section>

      {/* ══ S7: FAQ / PRICING ══ */}
      <section className="s7">
        <div className="s7-grid">
          <div>
            <h2 className="s7-headline">Pricing &<br />Market Info</h2>
            <p style={{ marginTop: 20, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: 280 }}>
              Targeting a $50M SAM across 43M+ enrolled students in India alone.
            </p>
          </div>
          <div className="s7-list">
            {[
              { q:"Starter Pilot — $2 / student / year", a:"Up to 5,000 students. 5 MCP tools, basic RAG pipeline, web dashboard. Best for pilot programs validating the product before full rollout." },
              { q:"Campus Rollout — $4 / student / year", a:"Full MCP tool suite, custom RAG collections via Azure AI Search, analytics dashboards, and M365 Copilot + GitHub Copilot extension integration." },
              { q:"Enterprise — Custom pricing", a:"Multi-campus deployments with SSO via Azure AD B2C, strict SLAs, white-label options, and a dedicated engineering support team." },
              { q:"What is the Model Context Protocol (MCP)?", a:"MCP is a standardized interface that connects AI models to external tools and APIs. It allows Campus Copilot to securely execute real actions (like booking a lab) instead of just retrieving text." }
            ].map((f, i) => (
              <div key={i} className="faq-row">
                <button className="faq-btn" onClick={() => setOpenFaq(openFaq===i ? null : i)}>
                  <span className="faq-q">{f.q}</span>
                  <div className={`faq-ico${openFaq===i?" open":""}`}>
                    {openFaq===i ? <Minus size={16}/> : <Plus size={16}/>}
                  </div>
                </button>
                <div className="faq-ans" style={{ maxHeight: openFaq===i ? 200 : 0, opacity: openFaq===i ? 1 : 0 }}>
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
            <a href="#">Team Fight Club</a>
            <a href="#">MIT Manipal</a>
            <a href="#">Azure AI Foundry</a>
            <a href="#">GitHub Marketplace</a>
          </div>
          <span style={{ fontSize: 11, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>
            © 2026 CAMPUS COPILOT
          </span>
        </div>
        <div className="footer-word">COPILOT</div>
      </footer>
    </div>
  );
}
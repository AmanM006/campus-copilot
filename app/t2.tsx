import React from 'react';
import { Terminal, Cpu, Zap, Github, Twitter, Mail, ArrowRight, Code, Server, Database } from 'lucide-react';

export default function CyberBrutalism() {
  const stack = ["Python", "C++", "Node.js", "Docker", "Linux", "Next.js"];
  
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#CCFF00] font-mono selection:bg-[#FF00F5] selection:text-white overflow-x-hidden">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b-4 border-[#CCFF00] bg-[#0A0A0A] p-4 flex justify-between items-center shadow-[0_4px_0_0_#CCFF00]">
        <h1 className="text-2xl font-black italic uppercase tracking-tighter">SYS_ADMIN</h1>
        <div className="hidden md:flex gap-8 font-bold uppercase">
          {["Manifesto", "Lab", "Work", "Arsenal"].map(s => (
            <a key={s} href={`#${s}`} className="hover:bg-[#CCFF00] hover:text-black px-2 transition-colors duration-200">{s}</a>
          ))}
        </div>
        <button className="border-2 border-[#CCFF00] px-4 py-1 font-bold hover:bg-[#CCFF00] hover:text-black hover:shadow-[4px_4px_0px_0px_#FF00F5] transition-all active:translate-y-1 active:translate-x-1 active:shadow-none">
          INITIATE
        </button>
      </nav>

      {/* 1. Hero */}
      <section className="h-screen flex flex-col justify-center items-center text-center p-4 pt-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none flex flex-wrap justify-center items-center text-9xl font-black break-words overflow-hidden">
          01001000 01000101 01001100 01001100 01001111
        </div>
        <div className="border-8 border-[#CCFF00] bg-[#0A0A0A] p-8 md:p-16 relative z-10 hover:shadow-[16px_16px_0px_0px_#FF00F5] transition-all duration-300 group">
            <div className="absolute -top-6 -left-6 bg-[#FF00F5] text-white px-4 py-1 font-black animate-pulse">LIVE_ENV</div>
            <h2 className="text-6xl md:text-9xl font-black uppercase leading-none group-hover:tracking-widest transition-all duration-500">Digital<br/>Riot</h2>
            <p className="mt-6 text-xl bg-[#CCFF00] text-black font-bold inline-block px-4 py-2 transform -skew-x-12">
              BUILDING UNAPOLOGETIC WEB EXPERIENCES
            </p>
        </div>
      </section>

      {/* 2. Manifesto / About */}
      <section id="Manifesto" className="py-24 px-8 border-t-4 border-[#CCFF00] bg-[#FF00F5] text-white">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-5xl font-black mb-8 border-b-4 border-white inline-block">THE_MANIFESTO</h3>
          <p className="text-2xl md:text-4xl font-bold leading-tight uppercase">
            We don't do subtle. We build high-performance, full-stack systems that demand attention. From chaotic frontend interfaces to rock-solid backend architecture.
          </p>
        </div>
      </section>

      {/* 3. Features / Lab */}
      <section id="Lab" className="py-24 px-8 border-t-4 border-[#CCFF00] bg-[#111]">
        <h3 className="text-5xl font-black mb-12 text-center underline decoration-wavy decoration-[#FF00F5]">CORE_MODULES</h3>
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {[
            { icon: <Terminal size={40}/>, title: "CLI_TOOLS", desc: "Terminal-first development and automation scripts." },
            { icon: <Database size={40}/>, title: "DATA_OPS", desc: "Pinecone vector databases and raw data pipelines." },
            { icon: <Zap size={40}/>, title: "AI_INTEGRATION", desc: "Hooking up Gemini and deep learning models to the web." }
          ].map((feature, i) => (
            <div key={i} className="border-4 border-[#CCFF00] p-6 bg-[#0A0A0A] hover:bg-[#CCFF00] hover:text-black hover:-translate-y-2 hover:translate-x-2 shadow-[8px_8px_0px_0px_#CCFF00] hover:shadow-[12px_12px_0px_0px_#FF00F5] transition-all group cursor-crosshair">
              <div className="text-[#FF00F5] group-hover:text-black mb-4">{feature.icon}</div>
              <h4 className="text-2xl font-bold">[{feature.title}]</h4>
              <p className="mt-4 font-semibold opacity-80">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Marquee Divider */}
      <div className="overflow-hidden whitespace-nowrap bg-[#CCFF00] text-black py-3 border-y-4 border-black flex">
        <div className="animate-[marquee_10s_linear_infinite] flex gap-4 text-2xl font-black uppercase">
          {Array(10).fill("BREAK THE RULES // WRITE BETTER CODE // ").map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      {/* 4. Projects */}
      <section id="Work" className="py-24 px-8 bg-[#0A0A0A]">
        <h3 className="text-5xl font-black mb-12 uppercase text-[#FF00F5]">&gt; Deployed_Projects</h3>
        <div className="flex flex-col gap-12 max-w-5xl mx-auto">
          {[
            { name: "TubeMind", type: "AI Interface", desc: "Chat interface for YouTube videos using Next.js, Python, and Gemini." },
            { name: "PixelTalk", type: "Web Platform", desc: "Retro-themed public chatrooms and discussion threads via MERN." },
            { name: "Kaskade CRM", type: "ChurnOpp Hackathon", desc: "Customer loyalty dashboard and rewards recommendation engine." }
          ].map((proj, i) => (
            <div key={i} className="group border-4 border-[#CCFF00] p-6 flex flex-col md:flex-row justify-between items-start md:items-center hover:bg-[#222] transition-colors">
              <div>
                <span className="bg-[#CCFF00] text-black px-2 py-1 text-sm font-bold uppercase">{proj.type}</span>
                <h4 className="text-4xl font-black mt-4">{proj.name}</h4>
                <p className="mt-2 text-xl text-white max-w-xl">{proj.desc}</p>
              </div>
              <button className="mt-6 md:mt-0 border-2 border-[#FF00F5] text-[#FF00F5] p-4 group-hover:bg-[#FF00F5] group-hover:text-white transition-all">
                <ArrowRight size={32} className="group-hover:-rotate-45 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Arsenal / Stack */}
      <section id="Arsenal" className="py-20 px-8 border-y-4 border-[#CCFF00] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiMzMzMiLz48L3N2Zz4=')]">
        <div className="max-w-6xl mx-auto text-center bg-[#0A0A0A] border-4 border-[#CCFF00] p-12 shadow-[16px_16px_0px_0px_#FF00F5]">
          <h3 className="text-4xl font-black mb-8">TECH_ARSENAL</h3>
          <div className="flex flex-wrap justify-center gap-4">
            {stack.map(tech => (
              <span key={tech} className="text-2xl font-bold border-2 border-[#CCFF00] px-6 py-3 hover:bg-[#CCFF00] hover:text-black transition-colors cursor-pointer">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="bg-[#CCFF00] text-black p-12 md:p-24 border-t-8 border-black">
        <div className="flex flex-col md:flex-row justify-between items-end gap-8">
          <div>
            <h2 className="text-6xl md:text-9xl font-black italic leading-none hover:text-[#FF00F5] transition-colors cursor-pointer">SYS.END</h2>
            <p className="mt-4 font-bold text-2xl uppercase border-l-4 border-black pl-4">AmanM006 // 2026</p>
          </div>
          <div className="flex gap-6">
            <a href="#" className="p-4 border-4 border-black hover:bg-black hover:text-[#CCFF00] hover:-translate-y-2 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><Github size={32} /></a>
            <a href="#" className="p-4 border-4 border-black hover:bg-[#FF00F5] hover:text-white hover:-translate-y-2 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><Twitter size={32} /></a>
            <a href="#" className="p-4 border-4 border-black hover:bg-white hover:-translate-y-2 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><Mail size={32} /></a>
          </div>
        </div>
      </footer>
      
      {/* Required style for marquee */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
      `}} />
    </div>
  );
}
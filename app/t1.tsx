import React from 'react';
import { Menu, Plus, ArrowUpRight, Circle, Square, Triangle } from 'lucide-react';

export default function SwissAcid() {
  const projects = [
    { title: "TubeMind", category: "AI / Next.js", year: "2025" },
    { title: "PixelTalk", category: "Web / MERN", year: "2025" },
    { title: "Kaskade CRM", category: "Hackathon / Data", year: "2025" },
    { title: "Conceptio", category: "Frontend", year: "2025" }
  ];

  return (
    <div className="min-h-screen bg-[#F4F4F4] text-[#111111] font-sans selection:bg-[#FF4D00] selection:text-white">
      
      {/* 1. Navbar */}
      <header className="grid grid-cols-4 w-full border-b-[3px] border-[#111] sticky top-0 bg-[#F4F4F4] z-50">
        <div className="p-6 border-r-[3px] border-[#111] font-black text-2xl hover:bg-[#FF4D00] hover:text-white transition-colors cursor-pointer">A/M</div>
        {/* FIX APPLIED HERE: Added border-r-[3px] and border-[#111] to this column */}
        <div className="col-span-2 p-6 border-r-[3px] border-[#111] flex items-center justify-center font-bold tracking-tighter uppercase text-xl">
          International_Grid_System
        </div>
        {/* FIX APPLIED HERE: Removed border-l-[3px] from the Menu column */}
        <div className="p-6 flex justify-end items-center group cursor-pointer hover:bg-[#111] hover:text-[#F4F4F4] transition-colors">
          <Menu className="group-hover:rotate-180 transition-transform duration-500" />
        </div>
      </header>

      {/* 2. Hero */}
      <section className="grid grid-cols-1 md:grid-cols-4 min-h-[90vh] border-b-[3px] border-[#111]">
        <div className="md:col-span-3 border-r-[3px] border-[#111] p-8 md:p-16 flex flex-col justify-between bg-white relative overflow-hidden group">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[#D1FAE5] rounded-full blur-3xl opacity-0 group-hover:opacity-50 transition-opacity duration-1000 z-0"></div>
          <h1 className="text-[12vw] font-black leading-[0.8] tracking-tighter uppercase z-10 relative">
            Logic<br/>Meets<br/><span className="text-[#FF4D00] inline-block hover:scale-110 transition-transform origin-left">Acid.</span>
          </h1>
          <div className="flex justify-between items-end z-10 relative mt-12">
            <p className="max-w-md font-medium text-2xl leading-tight">Structuring digital chaos into highly functional, aggressively beautiful interfaces.</p>
            <div className="animate-[spin_8s_linear_infinite]"><Circle size={64} fill="#111" /></div>
          </div>
        </div>
        <div className="bg-[#E0E7FF] p-8 flex flex-col justify-between italic hover:bg-[#FF4D00] hover:text-white transition-colors duration-500 cursor-s-resize">
          <p className="text-lg uppercase font-bold tracking-widest">Scroll to explore</p>
          <div className="text-9xl font-black self-center animate-bounce">↓</div>
        </div>
      </section>

      {/* Marquee */}
      <section className="border-b-[3px] border-[#111] overflow-hidden bg-[#111] text-[#F4F4F4] py-6 whitespace-nowrap">
        <div className="flex gap-12 animate-[marquee_15s_linear_infinite] text-4xl font-black uppercase tracking-tighter">
          {Array(8).fill("SYSTEMATIC DESIGN • CLEAN ARCHITECTURE • ").map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </section>

      {/* 3. Services / Capabilities */}
      <section className="grid md:grid-cols-3 border-b-[3px] border-[#111]">
         <div className="p-16 border-r-[3px] border-[#111] flex flex-col gap-8 bg-white hover:bg-[#D1FAE5] transition-colors duration-300">
            <Square size={80} strokeWidth={1.5} className="text-[#FF4D00]" />
            <h2 className="text-3xl font-black uppercase">Frontend<br/>Engineering</h2>
            <p className="text-lg font-medium">React, Next.js, and strict layout systems engineered for scale.</p>
         </div>
         <div className="p-16 border-r-[3px] border-[#111] flex flex-col gap-8 bg-white hover:bg-[#E0E7FF] transition-colors duration-300">
            <Triangle size={80} strokeWidth={1.5} className="text-[#FF4D00]" />
            <h2 className="text-3xl font-black uppercase">Backend<br/>Architecture</h2>
            <p className="text-lg font-medium">Node.js, Python, and robust APIs feeding the visual grid.</p>
         </div>
         <div className="p-16 bg-[#FF4D00] text-white flex flex-col justify-between group">
            <h2 className="text-7xl font-black tracking-tighter leading-none group-hover:translate-x-4 transition-transform">START A<br/>PROJECT</h2>
            <button className="mt-12 self-start px-8 py-4 bg-white text-[#FF4D00] font-black text-xl hover:bg-[#111] hover:text-white transition-colors uppercase flex items-center gap-2">
              Get in Touch <ArrowUpRight />
            </button>
         </div>
      </section>

      {/* 4. Selected Projects */}
      <section className="bg-white">
        <div className="border-b-[3px] border-[#111] p-8">
          <h2 className="text-5xl font-black uppercase tracking-tighter">Selected_Index (04)</h2>
        </div>
        <div className="flex flex-col">
          {projects.map((proj, i) => (
            <div key={i} className="grid grid-cols-12 border-b-[3px] border-[#111] hover:bg-[#111] hover:text-white transition-colors duration-300 group cursor-pointer">
              <div className="col-span-1 p-8 border-r-[3px] border-[#111] group-hover:border-white font-bold text-xl flex items-center justify-center">
                0{i + 1}
              </div>
              <div className="col-span-8 p-8 border-r-[3px] border-[#111] group-hover:border-white flex items-center">
                <h3 className="text-5xl font-black tracking-tighter group-hover:translate-x-4 transition-transform">{proj.title}</h3>
              </div>
              <div className="col-span-2 p-8 border-r-[3px] border-[#111] group-hover:border-white flex items-center font-medium text-lg uppercase">
                {proj.category}
              </div>
              <div className="col-span-1 p-8 flex items-center justify-center group-hover:rotate-45 transition-transform duration-300">
                <ArrowUpRight size={40} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Tech Index */}
      <section className="grid grid-cols-1 md:grid-cols-2 border-b-[3px] border-[#111]">
        <div className="p-16 border-r-[3px] border-[#111] bg-[#D1FAE5] flex items-center justify-center">
           <Plus size={160} strokeWidth={0.5} className="animate-[spin_20s_linear_infinite]" />
        </div>
        <div className="p-16 bg-white font-mono text-xl leading-loose flex flex-col justify-center">
          <h4 className="font-black text-2xl mb-6 font-sans uppercase">Technology_Stack</h4>
          <ul className="list-disc pl-6 space-y-2">
            <li>Languages: Python, C, C++, JavaScript, Java</li>
            <li>Web: HTML, CSS, Next.js</li>
            <li>Environment: Node.js, Git, Docker, Linux, Windows</li>
          </ul>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="grid grid-cols-2 md:grid-cols-4 bg-[#111] text-[#F4F4F4]">
        <div className="p-12 border-r border-b md:border-b-0 border-[#333] hover:bg-white hover:text-[#111] transition-colors cursor-pointer">
          <p className="font-black uppercase tracking-widest text-sm mb-4">Social</p>
          <a href="#" className="text-2xl font-bold block hover:underline">GitHub</a>
          <a href="#" className="text-2xl font-bold block hover:underline">LinkedIn</a>
        </div>
        <div className="p-12 border-r border-b md:border-b-0 border-[#333] hover:bg-white hover:text-[#111] transition-colors cursor-pointer">
          <p className="font-black uppercase tracking-widest text-sm mb-4">Location</p>
          <p className="text-2xl font-bold">Manipal, KA</p>
          <p className="text-2xl font-bold">India</p>
        </div>
        <div className="p-12 border-r border-[#333] flex items-end">
          <p className="font-black text-4xl tracking-tighter">AMAN M.</p>
        </div>
        <div className="p-12 bg-[#FF4D00] flex items-end justify-end">
          <p className="font-black text-6xl tracking-tighter">©26</p>
        </div>
      </footer>

      {/* Required style for marquee */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
      `}} />
    </div>
  );
}
"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Search, Check, X, Send, Bot, User, Copy, Download,
  Eye, Layers, Sparkles, Brain, Zap, Hash, Pin, ChevronRight,
  Bell, Target, Calendar, Star, GitCompare, FileText, Lightbulb, HelpCircle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SubjectDoc { id:string;name:string;type:"pdf"|"notes"|"slides";pages:number;size:string;uploadedBy:string;date:string; }
interface Subject { id:string;code:string;name:string;shortName:string;professor:string;semester:number;color:string;docs:SubjectDoc[]; }
interface ChatMessage { id:string;role:"user"|"assistant";content:string;pinned?:boolean; }
interface Flashcard { front:string;back:string; }
interface Notification { id:string;icon:string;title:string;body:string;time:string;read:boolean;type:string; }
interface StudyDay { day:string;date:string;subject:string;topics:string[];duration:string; }

const STUDENT_FALLBACK={id:"213CS1001",name:"Aman Mehta",initials:"AM",branch:"CSE",semester:4};

const SUBJECTS: Subject[]=[
  {id:"os",code:"CSS 2204",name:"Operating Systems",shortName:"OS",professor:"Dr. Rajesh Kumar",semester:4,color:"#7c3aed",
   docs:[{id:"os1",name:"OS Lab Manual.pdf",type:"pdf",pages:84,size:"3.2 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-10"},
         {id:"os2",name:"Unit 1 — Process Management.pdf",type:"pdf",pages:42,size:"1.8 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-14"},
         {id:"os3",name:"Unit 2 — Memory Management.pdf",type:"pdf",pages:38,size:"1.4 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-20"},
         {id:"os4",name:"Unit 3 — File Systems.pdf",type:"pdf",pages:31,size:"1.1 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-27"},
         {id:"os5",name:"Previous Year Questions.pdf",type:"pdf",pages:12,size:"0.4 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-03-01"}]},
  {id:"dbms",code:"CSS 2201",name:"Database Systems",shortName:"DBMS",professor:"Dr. Anitha Rao",semester:4,color:"#0ea5e9",
   docs:[{id:"db1",name:"DBMS Complete Notes.pdf",type:"pdf",pages:120,size:"5.1 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-05"},
         {id:"db2",name:"SQL Practice Problems.pdf",type:"pdf",pages:28,size:"0.9 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-12"},
         {id:"db3",name:"ER Diagram Slides.pdf",type:"slides",pages:55,size:"2.3 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-18"},
         {id:"db4",name:"Normalization Tutorial.pdf",type:"notes",pages:22,size:"0.7 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-25"}]},
  {id:"ai",code:"CSS 2203",name:"Introduction to AI",shortName:"AI",professor:"Dr. Priya Sharma",semester:4,color:"#10b981",
   docs:[{id:"ai1",name:"AI Fundamentals — Unit 1.pdf",type:"pdf",pages:60,size:"2.7 MB",uploadedBy:"Dr. Priya Sharma",date:"2026-02-08"},
         {id:"ai2",name:"Search Algorithms.pdf",type:"pdf",pages:35,size:"1.3 MB",uploadedBy:"Dr. Priya Sharma",date:"2026-02-15"},
         {id:"ai3",name:"Machine Learning Basics.pdf",type:"notes",pages:45,size:"1.9 MB",uploadedBy:"Dr. Priya Sharma",date:"2026-02-22"}]},
  {id:"dsa",code:"CSS 2202",name:"Design & Analysis of Algorithms",shortName:"DAA",professor:"Dr. Mohit Verma",semester:4,color:"#f59e0b",
   docs:[{id:"dsa1",name:"Algorithm Design Notes.pdf",type:"pdf",pages:95,size:"4.2 MB",uploadedBy:"Dr. Mohit Verma",date:"2026-02-07"},
         {id:"dsa2",name:"Complexity Analysis.pdf",type:"pdf",pages:30,size:"1.1 MB",uploadedBy:"Dr. Mohit Verma",date:"2026-02-16"},
         {id:"dsa3",name:"Graph Algorithms.pdf",type:"slides",pages:48,size:"2.0 MB",uploadedBy:"Dr. Mohit Verma",date:"2026-02-24"}]},
  {id:"maths",code:"MAT 2201",name:"Probability and Optimization",shortName:"Maths",professor:"Dr. Suresh Iyer",semester:4,color:"#ef4444",
   docs:[{id:"m1",name:"Probability Theory.pdf",type:"pdf",pages:72,size:"3.0 MB",uploadedBy:"Dr. Suresh Iyer",date:"2026-02-06"},
         {id:"m2",name:"Optimization Methods.pdf",type:"pdf",pages:58,size:"2.4 MB",uploadedBy:"Dr. Suresh Iyer",date:"2026-02-13"}]},
];

const FLASHCARDS: Record<string,Flashcard[]>={
  os:[{front:"What is a process?",back:"A program in execution — includes code, PC, registers, stack and data section. Has its own PCB."},
      {front:"Process vs Thread?",back:"Process has own memory space. Threads share memory within process — lighter, faster to create/switch."},
      {front:"What is deadlock?",back:"Two or more processes waiting on each other to release resources — all are stuck permanently."},
      {front:"4 conditions for deadlock?",back:"Mutual Exclusion · Hold and Wait · No Preemption · Circular Wait — all four must hold simultaneously."},
      {front:"What is virtual memory?",back:"Technique allowing processes to use more memory than physically available by using disk as RAM extension."}],
  dbms:[{front:"What is normalization?",back:"Organizing a database to reduce redundancy and improve integrity — decomposes tables into smaller ones."},
        {front:"Primary key?",back:"Columns that uniquely identify each row. Cannot be NULL, must be unique across the table."},
        {front:"INNER JOIN vs LEFT JOIN?",back:"INNER: only matching rows from both tables. LEFT: all rows from left + matching rows from right."},
        {front:"What is ACID?",back:"Atomicity, Consistency, Isolation, Durability — guarantees reliable database transaction processing."}],
  ai:[{front:"What is a heuristic?",back:"Estimates cost from node to goal. Used in A* as h(n). Must be admissible: h(n) ≤ actual cost."},
      {front:"BFS vs DFS?",back:"BFS: level-by-level, uses queue, finds shortest path. DFS: deep-first, uses stack, less memory."},
      {front:"Supervised learning?",back:"ML model trained on labeled data — each input has a known correct output used to learn patterns."}],
};

const EXAM_DATA: Record<string,{important:string[];questions:string[];revision:string[]}>={
  os:{important:["Process vs Thread lifecycle and PCB","Deadlock — 4 conditions + Banker's algorithm","Virtual memory + page replacement (LRU, FIFO, Optimal)","CPU scheduling (FCFS, SJF, Round Robin, Priority)","File system structure — inode, FAT, directory"],
      questions:["Dining philosophers problem and solution","Compare preemptive vs non-preemptive scheduling","What is thrashing? Working set model prevention","Explain paging vs segmentation with diagrams","Describe inode structure and file access path"],
      revision:["Process = program + PCB (state, PC, regs, memory)","4 deadlock conditions: ME + HW + NP + CW","Page fault → TLB miss → page table → load from disk","Scheduler selects process; dispatcher performs context switch","inode holds metadata + pointers to data blocks"]},
  dbms:{important:["Normalization — 1NF through BCNF with examples","SQL JOINs — INNER, LEFT, RIGHT, FULL OUTER","ACID properties and transaction management","ER diagrams — entities, relationships, cardinality","Indexing — B+ trees, hash indexes, clustered vs unclustered"],
        questions:["Normalize given relation to BCNF using functional dependencies","Write SQL to find second highest salary in department","Explain two-phase locking (2PL) protocol","What is phantom read? How does MVCC prevent it?","Design ER diagram for a university database"],
        revision:["1NF: atomic. 2NF: no partial. 3NF: no transitive. BCNF: all determinants are superkeys","ACID: All-or-nothing | consistent state | isolated execution | durable after commit","B+ tree: balanced, all data at leaves, great for range queries","JOIN: INNER=intersection, LEFT=all left+matching, CROSS=cartesian product"]},
  ai:{important:["Search: BFS, DFS, A*, Greedy Best-First, IDA*","Heuristic admissibility and consistency","ML types: supervised, unsupervised, reinforcement","Neural networks and backpropagation","Knowledge representation — logic, frames, semantic nets"],
      questions:["Trace A* algorithm on a given graph with h values","When is a heuristic admissible? Give an example","Compare supervised and unsupervised learning with examples","Describe perceptron learning rule and limitations","Explain the frame problem in knowledge representation"],
      revision:["A* = f(n)=g(n)+h(n); admissible if h(n)≤actual cost; consistent if h(n)≤c(n,n')+h(n')","BFS: complete+optimal. DFS: incomplete, not optimal, less memory","Supervised=labeled data. Unsupervised=find patterns. RL=reward signal","Backprop: forward pass, compute loss, chain rule backward, update weights"]},
};

const STUDY_PLAN: StudyDay[]=[
  {day:"Monday",date:"Mar 23",subject:"Operating Systems",topics:["Process Management","Deadlock conditions","Banker's Algorithm"],duration:"2.5h"},
  {day:"Tuesday",date:"Mar 24",subject:"Database Systems",topics:["Normalization to BCNF","SQL JOINs practice","ACID transactions"],duration:"2h"},
  {day:"Wednesday",date:"Mar 25",subject:"Introduction to AI",topics:["A* algorithm","Heuristic functions","Search comparison"],duration:"2h"},
  {day:"Thursday",date:"Mar 26",subject:"Design & Algorithms",topics:["Graph algorithms","Complexity analysis","DP problems"],duration:"2.5h"},
  {day:"Friday",date:"Mar 27",subject:"Maths",topics:["Probability distributions","Bayes theorem","Optimization basics"],duration:"2h"},
  {day:"Saturday",date:"Mar 28",subject:"Revision",topics:["OS + DBMS past papers","AI MCQs","Formula sheet review"],duration:"3h"},
  {day:"Sunday",date:"Mar 29",subject:"Rest & Light Review",topics:["Flashcard run-through","Last-minute notes","Sleep well 😴"],duration:"1h"},
];

const NOTIFS: Notification[]=[
  {id:"n1",icon:"✅",title:"Lab Request Approved",body:"Your Robotics Lab booking for Mar 12 approved by Dr. Rajesh Kumar.",time:"2m ago",read:false,type:"success"},
  {id:"n2",icon:"📄",title:"New Notes Uploaded",body:"Dr. Priya Sharma uploaded 'Unit 3 — Neural Networks.pdf' to AI.",time:"1h ago",read:false,type:"info"},
  {id:"n3",icon:"⚠️",title:"Attendance Alert",body:"Your Database Systems attendance is at 69% — below 75% requirement.",time:"3h ago",read:false,type:"warn"},
  {id:"n4",icon:"🎯",title:"Exam in 3 Days",body:"CSS 2203 Introduction to AI midterm is on March 22.",time:"5h ago",read:true,type:"warn"},
  {id:"n5",icon:"🏆",title:"7-Day Streak!",body:"You've studied for 7 days in a row. Keep it up!",time:"1d ago",read:true,type:"success"},
];

function docIcon(t:string){return t==="slides"?"🎞️":t==="notes"?"📝":"📄";}
function copyText(t:string){navigator.clipboard.writeText(t).catch(()=>{});}

// ─── Notification Bell ────────────────────────────────────────────────────────
function NotificationBell(){
  const [open,setOpen]=useState(false);
  const [notifs,setNotifs]=useState(NOTIFS);
  const unread=notifs.filter(n=>!n.read).length;
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(p=>!p)} style={{position:"relative",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.55)",transition:"all 0.2s"}}
        onMouseOver={e=>(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.08)"} onMouseOut={e=>(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.04)"}>
        <Bell size={14}/>
        {unread>0&&<span style={{position:"absolute",top:5,right:5,width:7,height:7,background:"#ef4444",borderRadius:"50%",border:"1.5px solid #060608"}}/>}
      </button>
      {open&&(
        <div style={{position:"absolute",top:42,right:0,width:310,background:"#0f0f18",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",zIndex:500,overflow:"hidden",animation:"slideDown 0.2s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 15px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>Notifications</span>
            <button onClick={()=>setNotifs(p=>p.map(n=>({...n,read:true})))} style={{fontSize:11,color:"#7c3aed",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Mark all read</button>
          </div>
          <div style={{maxHeight:340,overflowY:"auto"}}>
            {notifs.map(n=>(
              <div key={n.id} onClick={()=>setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x))} style={{display:"flex",gap:9,padding:"11px 15px",cursor:"pointer",background:n.read?"transparent":"rgba(124,58,237,0.05)",borderBottom:"1px solid rgba(255,255,255,0.04)",transition:"background 0.2s"}}
                onMouseOver={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.04)"} onMouseOut={e=>(e.currentTarget as HTMLDivElement).style.background=n.read?"transparent":"rgba(124,58,237,0.05)"}>
                <span style={{fontSize:16,flexShrink:0,lineHeight:1.3}}>{n.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:5}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#fff"}}>{n.title}</div>
                    {!n.read&&<div style={{width:6,height:6,borderRadius:"50%",background:"#7c3aed",flexShrink:0}}/>}
                  </div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",lineHeight:1.5,marginTop:2}}>{n.body}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.22)",marginTop:3}}>{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Streak Badge ─────────────────────────────────────────────────────────────
function StreakBadge({streak,xp}:{streak:number;xp:number}){
  const pct=Math.min(100,Math.round((xp/500)*100));
  return(
    <div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 11px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9}}>
      <span style={{fontSize:14}}>🔥</span>
      <div>
        <div style={{fontSize:11,fontWeight:600,color:"#f59e0b"}}>{streak} day streak</div>
        <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
          <div style={{width:52,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2}}>
            <div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,#7c3aed,#f59e0b)",borderRadius:2}}/>
          </div>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.28)"}}>{xp} XP</span>
        </div>
      </div>
    </div>
  );
}

// ─── Exam Readiness Card ──────────────────────────────────────────────────────
function ExamReadinessCard({onOpen}:{onOpen:()=>void}){
  const r=68;
  return(
    <div style={{background:"linear-gradient(135deg,rgba(124,58,237,0.1),rgba(59,130,246,0.07))",border:"1px solid rgba(124,58,237,0.22)",borderRadius:16,padding:"20px 24px",marginBottom:26,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,background:"radial-gradient(circle,rgba(124,58,237,0.12),transparent 70%)",pointerEvents:"none"}}/>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
            <Target size={14} style={{color:"#a78bfa"}}/>
            <span style={{fontSize:11,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.07em"}}>Exam Readiness</span>
          </div>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:30,fontWeight:800,color:"#fff",lineHeight:1,marginBottom:7,letterSpacing:"-0.02em"}}>
            You are <span style={{color:"#a78bfa"}}>{r}%</span> ready
          </div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:12}}>Midsem exams start in 3 days. Focus on OS and DBMS.</div>
          <div style={{height:5,background:"rgba(255,255,255,0.08)",borderRadius:3,maxWidth:300,marginBottom:11}}>
            <div style={{width:`${r}%`,height:"100%",background:"linear-gradient(90deg,#7c3aed,#3b82f6)",borderRadius:3}}/>
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {[{s:"OS",p:55,c:"#7c3aed"},{s:"DBMS",p:62,c:"#0ea5e9"},{s:"AI",p:78,c:"#10b981"},{s:"DAA",p:71,c:"#f59e0b"}].map(x=>(
              <div key={x.s} style={{fontSize:11,color:x.c,background:`${x.c}15`,border:`1px solid ${x.c}28`,padding:"2px 9px",borderRadius:100}}>{x.s} {x.p}%</div>
            ))}
          </div>
        </div>
        <button onClick={onOpen} style={{padding:"9px 15px",background:"linear-gradient(135deg,#7c3aed,#3b82f6)",border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Outfit',sans-serif",whiteSpace:"nowrap",flexShrink:0}}>
          Start Studying →
        </button>
      </div>
    </div>
  );
}

// ─── Study Plan Modal ─────────────────────────────────────────────────────────
function StudyPlanModal({onClose}:{onClose:()=>void}){
  const [ready,setReady]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setReady(true),1800);return()=>clearTimeout(t);},[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(12px)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div style={{background:"#0f0f18",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"22px 26px",width:"100%",maxWidth:580,maxHeight:"80vh",overflowY:"auto",animation:"slideUp 0.25s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div><div style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:700,color:"#fff",marginBottom:2}}>📅 7-Day Study Plan</div><div style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>AI-generated based on your exams</div></div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"rgba(255,255,255,0.4)",width:28,height:28,borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={13}/></button>
        </div>
        {!ready?(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"36px 20px",gap:12}}>
            <div style={{width:32,height:32,border:"3px solid rgba(124,58,237,0.3)",borderTopColor:"#7c3aed",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.4)"}}>Analysing syllabus and exam schedule…</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {STUDY_PLAN.map((d,i)=>(
              <div key={i} style={{display:"flex",gap:11,padding:"11px 13px",background:i===0?"rgba(124,58,237,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${i===0?"rgba(124,58,237,0.2)":"rgba(255,255,255,0.06)"}`,borderRadius:11}}>
                <div style={{minWidth:68,flexShrink:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:i===0?"#a78bfa":"rgba(255,255,255,0.55)"}}>{d.day}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>{d.date}</div>
                </div>
                <div style={{width:1,background:"rgba(255,255,255,0.06)",flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#fff",marginBottom:4}}>{d.subject}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {d.topics.map((t,j)=><span key={j} style={{fontSize:10,color:"rgba(255,255,255,0.45)",background:"rgba(255,255,255,0.05)",padding:"2px 7px",borderRadius:5}}>{t}</span>)}
                  </div>
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.28)",flexShrink:0,alignSelf:"center"}}>{d.duration}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Flashcard Viewer ─────────────────────────────────────────────────────────
function FlashcardViewer({cards,onClose}:{cards:Flashcard[];onClose:()=>void}){
  const [idx,setIdx]=useState(0);
  const [flipped,setFlipped]=useState(false);
  const [known,setKnown]=useState(new Set<number>());
  const card=cards[idx];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(16px)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:500,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><span style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:700,color:"#fff"}}>Flashcards </span><span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>{idx+1}/{cards.length}</span></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:"#10b981"}}>{known.size} known</span>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.07)",border:"none",color:"rgba(255,255,255,0.5)",width:27,height:27,borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={13}/></button>
          </div>
        </div>
        <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2}}>
          <div style={{width:`${((idx+1)/cards.length)*100}%`,height:"100%",background:"linear-gradient(90deg,#7c3aed,#3b82f6)",borderRadius:2,transition:"width 0.4s ease"}}/>
        </div>
        <div onClick={()=>setFlipped(p=>!p)} style={{cursor:"pointer",background:flipped?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.03)",border:`1px solid ${flipped?"rgba(124,58,237,0.28)":"rgba(255,255,255,0.09)"}`,borderRadius:18,padding:32,minHeight:190,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)",boxShadow:flipped?"0 0 36px rgba(124,58,237,0.12)":"none"}}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.22)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14}}>{flipped?"Answer ✨":"Question — tap to flip"}</div>
          <div style={{fontSize:flipped?14:16,fontWeight:flipped?400:600,color:"#fff",lineHeight:1.7}}>{flipped?card.back:card.front}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
          <button onClick={()=>{setIdx(p=>Math.max(0,p-1));setFlipped(false);}} disabled={idx===0} style={{padding:"8px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,color:idx===0?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.65)",cursor:idx===0?"not-allowed":"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif"}}>← Prev</button>
          <button onClick={()=>setFlipped(p=>!p)} style={{padding:"8px 0",background:"rgba(124,58,237,0.14)",border:"1px solid rgba(124,58,237,0.28)",borderRadius:9,color:"#a78bfa",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Flip</button>
          <button onClick={()=>{setIdx(p=>Math.min(cards.length-1,p+1));setFlipped(false);}} disabled={idx===cards.length-1} style={{padding:"8px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,color:idx===cards.length-1?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.65)",cursor:idx===cards.length-1?"not-allowed":"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif"}}>Next →</button>
        </div>
        {flipped&&(
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>{setKnown(p=>{const n=new Set(p);n.add(idx);return n;});setIdx(p=>Math.min(cards.length-1,p+1));setFlipped(false);}} style={{flex:1,padding:"8px 0",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.22)",borderRadius:9,color:"#10b981",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif"}}>✓ I knew this</button>
            <button onClick={()=>{setIdx(p=>Math.min(cards.length-1,p+1));setFlipped(false);}} style={{flex:1,padding:"8px 0",background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.18)",borderRadius:9,color:"#ef4444",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif"}}>✗ Review again</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Exam Mode Panel ──────────────────────────────────────────────────────────
function ExamModePanel({subject,onClose,onAsk}:{subject:Subject;onClose:()=>void;onAsk:(q:string)=>void}){
  const [tab,setTab]=useState<"important"|"questions"|"revision">("important");
  const [loading,setLoading]=useState(true);
  const data=EXAM_DATA[subject.id]||EXAM_DATA.os;
  useEffect(()=>{setLoading(true);const t=setTimeout(()=>setLoading(false),1600);return()=>clearTimeout(t);},[subject.id]);
  return(
    <div style={{background:"linear-gradient(135deg,rgba(245,158,11,0.07),rgba(239,68,68,0.04))",border:"1px solid rgba(245,158,11,0.22)",borderRadius:13,padding:"14px 16px",marginBottom:0}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#f59e0b",animation:"pulse 2s ease infinite",boxShadow:"0 0 7px #f59e0b"}}/>
          <span style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:"0.07em"}}>🎯 Exam Mode</span>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.28)",cursor:"pointer",display:"flex"}}><X size={13}/></button>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {(["important","questions","revision"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"4px 9px",borderRadius:6,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,fontFamily:"'Outfit',sans-serif",transition:"all 0.15s",background:tab===t?"rgba(245,158,11,0.18)":"rgba(255,255,255,0.04)",color:tab===t?"#f59e0b":"rgba(255,255,255,0.38)"}}>
            {t==="important"?"⚡ Key Topics":t==="questions"?"❓ Exam Qs":"📌 Quick Notes"}
          </button>
        ))}
      </div>
      {loading?(
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 0"}}>
          <div style={{width:13,height:13,border:"2px solid rgba(245,158,11,0.3)",borderTopColor:"#f59e0b",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>Analysing {subject.shortName} documents…</span>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:150,overflowY:"auto"}}>
          {(tab==="important"?data.important:tab==="questions"?data.questions:data.revision).map((item,i)=>(
            <div key={i} style={{display:"flex",gap:7,fontSize:12,color:"rgba(255,255,255,0.7)",lineHeight:1.5}}>
              <span style={{color:"#f59e0b",flexShrink:0,fontSize:10,marginTop:2}}>{tab==="important"?"★":tab==="questions"?"Q.":"•"}</span>
              <span style={{flex:1}}>{item}
                {tab==="questions"&&<button onClick={()=>onAsk(item)} style={{marginLeft:7,fontSize:10,color:"#7c3aed",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Ask →</button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subject Workspace ────────────────────────────────────────────────────────
function SubjectWorkspace({subject,onBack,studentId}:{subject:Subject;onBack:()=>void;studentId:string}){
  const [selectedDocs,setSelectedDocs]=useState<Set<string>>(new Set([subject.docs[0]?.id]));
  const [docSearch,setDocSearch]=useState("");
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [input,setInput]=useState("");
  const [isTyping,setIsTyping]=useState(false);
  const [typingLabel,setTypingLabel]=useState("Thinking…");
  const [previewDoc,setPreviewDoc]=useState<SubjectDoc|null>(null);
  const [showCards,setShowCards]=useState(false);
  const [cardsGenerated,setCardsGenerated]=useState(false);
  const [copied,setCopied]=useState<string|null>(null);
  const [pinnedIds,setPinnedIds]=useState(new Set<string>());
  const [examMode,setExamMode]=useState(false);
  const [xp,setXp]=useState(0);
  const endRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages,isTyping]);

  const TYPING_STEPS=["Thinking…","Reading your sources…","Generating answer…","Almost there…"];
  useEffect(()=>{
    if(!isTyping){setTypingLabel("Thinking…");return;}
    let i=0;const t=setInterval(()=>{i=(i+1)%TYPING_STEPS.length;setTypingLabel(TYPING_STEPS[i]);},1600);
    return()=>clearInterval(t);
  },[isTyping]);

  const filteredDocs=subject.docs.filter(d=>d.name.toLowerCase().includes(docSearch.toLowerCase()));
  const selCount=selectedDocs.size;
  const noSrc=selCount===0;

  const toggleDoc=(id:string)=>{setSelectedDocs(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});setCardsGenerated(false);};
  const selAll=()=>{setSelectedDocs(new Set(subject.docs.map(d=>d.id)));setCardsGenerated(false);};
  const selNone=()=>{setSelectedDocs(new Set());setCardsGenerated(false);};

  const handleSend=async(text:string=input)=>{
    if(!text.trim()||isTyping) return;
    const uMsg:ChatMessage={id:Date.now().toString(),role:"user",content:text.trim()};
    setMessages(p=>[...p,uMsg]);setInput("");setIsTyping(true);setXp(p=>p+5);
    const docNames=subject.docs.filter(d=>selectedDocs.has(d.id)).map(d=>d.name);
    try{
      const res=await fetch("http://localhost:8000/api/chat/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text.trim(),user_id:studentId,history:messages.slice(-6).map(m=>({role:m.role,content:m.content})),role:"student",subject_context:{subject_name:subject.name,subject_code:subject.code,selected_docs:docNames}})});
      const sid="s-"+Date.now();
      setMessages(p=>[...p,{id:sid,role:"assistant",content:""}]);
      if(!res.body){setIsTyping(false);return;}
      const reader=res.body.getReader();const dec=new TextDecoder();
      let buf="";let full="";let wb="";
      while(true){
        const {done,value}=await reader.read();if(done) break;
        buf+=dec.decode(value,{stream:true});const lines=buf.split("\n");buf=lines.pop()||"";
        let ev="";let ds="";
        for(const l of lines){
          if(l.startsWith("event:"))ev=l.slice(6).trim();
          else if(l.startsWith("data:"))ds=l.slice(5).trim();
          else if(l===""&&ev&&ds){
            try{const d=JSON.parse(ds);
              if(ev==="token"){wb+=d.text||"";if(/[\s\n]/.test(wb.slice(-1))||wb.length>15){full+=wb;wb="";setMessages(p=>p.map(m=>m.id===sid?{...m,content:full}:m));await new Promise(r=>setTimeout(r,18));}}
              else if(ev==="done"){if(wb){full+=wb;setMessages(p=>p.map(m=>m.id===sid?{...m,content:full}:m));}setXp(p=>p+10);}
              else if(ev==="error")setMessages(p=>p.map(m=>m.id===sid?{...m,content:"Something went wrong."}:m));
            }catch{}ev="";ds="";
          }
        }
      }
    }catch{setMessages(p=>[...p,{id:Date.now().toString(),role:"assistant",content:"Couldn't connect to backend."}]);}
    setIsTyping(false);
  };

  const C=subject.color;
  const STARTERS=["Summarise key concepts from these notes","What are the most important exam topics?","Explain the most complex concept simply"];

  return(
    <div style={{display:"flex",height:"100vh",background:"#060608",color:"#fff",fontFamily:"'Outfit',sans-serif",overflow:"hidden"}}>
      {previewDoc&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setPreviewDoc(null)}>
          <div style={{background:"#0f0f14",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:24,width:"100%",maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <span style={{fontSize:22}}>{docIcon(previewDoc.type)}</span>
              <button onClick={()=>setPreviewDoc(null)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.35)",cursor:"pointer"}}><X size={16}/></button>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:12,lineHeight:1.4}}>{previewDoc.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:16}}>
              {[["Pages",previewDoc.pages],["Size",previewDoc.size],["By",previewDoc.uploadedBy],["Date",previewDoc.date]].map(([l,v])=>(
                <div key={l as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px 11px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{l}</div>
                  <div style={{fontSize:12,color:"#fff",fontWeight:500}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:7}}>
              <button style={{flex:1,padding:"8px 0",background:"rgba(124,58,237,0.13)",border:"1px solid rgba(124,58,237,0.27)",borderRadius:9,color:"#a78bfa",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Eye size={12}/>Preview</button>
              <button style={{flex:1,padding:"8px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Download size={12}/>Download</button>
            </div>
          </div>
        </div>
      )}
      {showCards&&cardsGenerated&&(FLASHCARDS[subject.id]||[]).length>0&&<FlashcardViewer cards={FLASHCARDS[subject.id]} onClose={()=>setShowCards(false)}/>}

      {/* LEFT: Sources */}
      <div style={{width:248,background:"#0a0a0e",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"13px 12px 10px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:5,background:"transparent",border:"none",color:"rgba(255,255,255,0.33)",cursor:"pointer",fontSize:11,fontFamily:"'Outfit',sans-serif",marginBottom:10,padding:0,transition:"color 0.2s"}}
            onMouseOver={e=>(e.currentTarget.style.color="#fff")} onMouseOut={e=>(e.currentTarget.style.color="rgba(255,255,255,0.33)")}>
            <ArrowLeft size={12}/> All Subjects
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:8,background:C,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{subject.shortName.slice(0,2)}</div>
            <div><div style={{fontSize:12,fontWeight:700,color:"#fff",lineHeight:1.2}}>{subject.shortName}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>{subject.code}</div></div>
          </div>
        </div>

        {/* Exam Mode toggle */}
        <div style={{padding:"8px 11px 7px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
          <button onClick={()=>setExamMode(p=>!p)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 9px",background:examMode?"rgba(245,158,11,0.09)":"rgba(255,255,255,0.02)",border:`1px solid ${examMode?"rgba(245,158,11,0.28)":"rgba(255,255,255,0.07)"}`,borderRadius:8,cursor:"pointer",fontFamily:"'Outfit',sans-serif",transition:"all 0.2s"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12}}>🎯</span><span style={{fontSize:11,fontWeight:600,color:examMode?"#f59e0b":"rgba(255,255,255,0.45)"}}>Exam Mode</span></div>
            <div style={{width:26,height:15,borderRadius:100,background:examMode?"#f59e0b":"rgba(255,255,255,0.09)",position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{width:11,height:11,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:examMode?13:2,transition:"left 0.2s"}}/>
            </div>
          </button>
        </div>

        <div style={{padding:"9px 12px 5px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Sources ({subject.docs.length})</span>
          <div style={{display:"flex",gap:3}}>
            <button onClick={selAll} style={{fontSize:10,color:C,background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",padding:"1px 4px"}}>All</button>
            <span style={{color:"rgba(255,255,255,0.12)",fontSize:10}}>·</span>
            <button onClick={selNone} style={{fontSize:10,color:"rgba(255,255,255,0.28)",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",padding:"1px 4px"}}>None</button>
          </div>
        </div>
        <div style={{padding:"0 12px 6px"}}>
          <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7,padding:"5px 8px"}}>
            <Search size={10} style={{color:"rgba(255,255,255,0.22)",flexShrink:0}}/>
            <input value={docSearch} onChange={e=>setDocSearch(e.target.value)} placeholder="Find document…" style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:11,fontFamily:"'Outfit',sans-serif"}}/>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"0 6px 6px"}}>
          {filteredDocs.map(doc=>{const sel=selectedDocs.has(doc.id);return(
            <div key={doc.id} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 7px",borderRadius:8,marginBottom:2,cursor:"pointer",background:sel?`${C}0f`:"transparent",border:`1px solid ${sel?`${C}28`:"transparent"}`,transition:"all 0.15s"}}
              onClick={()=>toggleDoc(doc.id)}>
              <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${sel?C:"rgba(255,255,255,0.16)"}`,background:sel?C:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                {sel&&<Check size={8} style={{color:"#fff"}}/>}
              </div>
              <span style={{fontSize:12,flexShrink:0}}>{docIcon(doc.type)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:sel?"#fff":"rgba(255,255,255,0.65)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.name}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.27)",marginTop:1}}>{doc.pages}p · {doc.size}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();setPreviewDoc(doc);}} className="doc-eye" style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.2)",cursor:"pointer",padding:2,borderRadius:4,flexShrink:0}}>
                <Eye size={10}/>
              </button>
            </div>
          );})}
        </div>

        {selCount>=2&&(
          <div style={{padding:"6px 8px"}}>
            <button onClick={()=>handleSend("Compare and contrast these selected documents: similarities, differences, and unique concepts in each.")} style={{width:"100%",padding:"7px 0",background:`${C}12`,border:`1px solid ${C}22`,borderRadius:8,color:C,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"all 0.2s"}}
              onMouseOver={e=>(e.currentTarget as HTMLButtonElement).style.background=`${C}20`} onMouseOut={e=>(e.currentTarget as HTMLButtonElement).style.background=`${C}12`}>
              <GitCompare size={11}/> Compare {selCount} Docs
            </button>
          </div>
        )}

        {selCount>0&&<div style={{padding:"5px 11px 9px",fontSize:10,color:"rgba(255,255,255,0.3)",display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:C}}/>{selCount} source{selCount>1?"s":""} active</div>}
      </div>

      {/* CENTER: Chat */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{height:48,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",borderBottom:"1px solid rgba(255,255,255,0.05)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:C}}/>
            <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{subject.name}</span>
            {selCount>0&&<span style={{fontSize:10,background:`${C}15`,color:C,border:`1px solid ${C}30`,padding:"2px 7px",borderRadius:100}}>{selCount} source{selCount>1?"s":""} active</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.22)"}}>{subject.professor}</span>
            {xp>0&&<span style={{fontSize:10,color:"#f59e0b",background:"rgba(245,158,11,0.09)",border:"1px solid rgba(245,158,11,0.18)",padding:"2px 7px",borderRadius:100}}>+{xp} XP</span>}
          </div>
        </div>

        {examMode&&<div style={{padding:"9px 13px 0",flexShrink:0}}><ExamModePanel subject={subject} onClose={()=>setExamMode(false)} onAsk={handleSend}/></div>}

        <div style={{flex:1,overflowY:"auto",padding:"18px 16px",display:"flex",flexDirection:"column",gap:16}}>
          {messages.length===0&&(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 16px",textAlign:"center",minHeight:280}}>
              <div style={{width:52,height:52,borderRadius:14,background:`${C}14`,border:`1px solid ${C}22`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12,fontSize:22}}>📖</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,color:"#fff",marginBottom:5}}>Ask about {subject.shortName}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.32)",maxWidth:280,lineHeight:1.65,marginBottom:20}}>
                {noSrc?"Select your notes on the left — I'll answer based only on those documents.":"Your sources are ready. Ask me anything."}
              </div>
              {!noSrc&&<div style={{display:"flex",flexDirection:"column",gap:5,width:"100%",maxWidth:360}}>
                {STARTERS.map((q,i)=>(
                  <button key={i} onClick={()=>handleSend(q)} style={{padding:"9px 13px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,color:"rgba(255,255,255,0.5)",fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textAlign:"left",transition:"all 0.2s"}}
                    onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background=`${C}10`;(e.currentTarget as HTMLButtonElement).style.borderColor=`${C}30`;(e.currentTarget as HTMLButtonElement).style.color="#fff";}}
                    onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.03)";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(255,255,255,0.07)";(e.currentTarget as HTMLButtonElement).style.color="rgba(255,255,255,0.5)";}}>
                    {q}
                  </button>
                ))}
              </div>}
            </div>
          )}

          {messages.map((msg)=>(
            <div key={msg.id} style={{display:"flex",gap:8,flexDirection:msg.role==="user"?"row-reverse":"row",animation:"msgIn 0.3s ease"}}>
              <div style={{width:26,height:26,borderRadius:7,background:msg.role==="assistant"?`linear-gradient(135deg,${C},${C}88)`:"rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                {msg.role==="assistant"?<Bot size={13}/>:<User size={13}/>}
              </div>
              <div style={{maxWidth:"83%"}}>
                <div style={{fontSize:13,lineHeight:1.75,color:"rgba(255,255,255,0.87)",background:msg.role==="user"?"rgba(255,255,255,0.06)":"transparent",border:msg.role==="user"?"1px solid rgba(255,255,255,0.08)":"none",padding:msg.role==="user"?"9px 13px":"0",borderRadius:msg.role==="user"?"13px 13px 3px 13px":"0"}}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    code({node,inline,className,children,...props}:any){const m=/language-(\w+)/.exec(className||"");return !inline&&m?(<div style={{borderRadius:8,overflow:"hidden",margin:"9px 0"}}><div style={{background:"#1a1a1a",padding:"4px 13px",fontSize:9,color:"#555",borderBottom:"1px solid #222"}}>{m[1]}</div><SyntaxHighlighter style={vscDarkPlus as any} language={m[1]} PreTag="div" customStyle={{margin:0,padding:13,background:"#141414",fontSize:11}} {...props}>{String(children).replace(/\n$/,"")}</SyntaxHighlighter></div>):<code style={{background:"rgba(255,255,255,0.09)",padding:"2px 5px",borderRadius:4,fontSize:"0.87em",fontFamily:"DM Mono,monospace"}} {...props}>{children}</code>;},
                    table({children}:any){return<table style={{borderCollapse:"collapse",width:"100%",margin:"9px 0",fontSize:12}}>{children}</table>;},
                    th({children}:any){return<th style={{background:`${C}14`,color:C,padding:"6px 11px",border:"1px solid rgba(255,255,255,0.09)",textAlign:"left",fontWeight:600,fontSize:11}}>{children}</th>;},
                    td({children}:any){return<td style={{padding:"5px 11px",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.78)"}}>{children}</td>;},
                  }}>{msg.content}</ReactMarkdown>
                </div>

                {msg.role==="assistant"&&msg.content&&(
                  <div className="msg-actions-row" style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",opacity:0}}>
                    <button onClick={()=>{copyText(msg.content);setCopied(msg.id);setTimeout(()=>setCopied(null),1400);}} style={{display:"flex",alignItems:"center",gap:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.35)",padding:"3px 7px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      {copied===msg.id?<Check size={9}/>:<Copy size={9}/>}{copied===msg.id?"Copied":"Copy"}
                    </button>
                    <button onClick={()=>setPinnedIds(p=>{const n=new Set(p);n.has(msg.id)?n.delete(msg.id):n.add(msg.id);return n;})} style={{display:"flex",alignItems:"center",gap:3,background:pinnedIds.has(msg.id)?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.04)",border:`1px solid ${pinnedIds.has(msg.id)?"rgba(124,58,237,0.26)":"rgba(255,255,255,0.07)"}`,color:pinnedIds.has(msg.id)?"#a78bfa":"rgba(255,255,255,0.35)",padding:"3px 7px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      <Pin size={9}/>{pinnedIds.has(msg.id)?"Pinned":"Pin"}
                    </button>
                    <button onClick={()=>handleSend(`Simplify this explanation for a complete beginner: "${msg.content.slice(0,100)}"`)} style={{display:"flex",alignItems:"center",gap:3,background:"rgba(16,185,129,0.07)",border:"1px solid rgba(16,185,129,0.15)",color:"#10b981",padding:"3px 7px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      <Lightbulb size={9}/>Simplify
                    </button>
                    <button onClick={()=>handleSend(`Give a real-world example to understand this: "${msg.content.slice(0,100)}"`)} style={{display:"flex",alignItems:"center",gap:3,background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.14)",color:"#f59e0b",padding:"3px 7px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      <HelpCircle size={9}/>Example
                    </button>
                    <button onClick={()=>handleSend(`Give me an easy-to-remember analogy for this concept: "${msg.content.slice(0,100)}"`)} style={{display:"flex",alignItems:"center",gap:3,background:"rgba(96,165,250,0.07)",border:"1px solid rgba(96,165,250,0.14)",color:"#60a5fa",padding:"3px 7px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      <Star size={9}/>Analogy
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping&&(
            <div style={{display:"flex",gap:8}}>
              <div style={{width:26,height:26,borderRadius:7,background:`linear-gradient(135deg,${C},${C}88)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Bot size={13}/></div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:11}}>
                <div style={{width:12,height:12,border:`2px solid ${C}3a`,borderTopColor:C,borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.38)"}}>{typingLabel}</span>
              </div>
            </div>
          )}
          <div ref={endRef}/>
        </div>

        <div style={{padding:"9px 14px 13px",background:"linear-gradient(to top,#060608 60%,transparent)",flexShrink:0}}>
          {noSrc&&<div style={{fontSize:11,color:"#f59e0b",marginBottom:6,display:"flex",alignItems:"center",gap:5}}>⚠️ No sources selected — pick at least one document.</div>}
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.04)",border:`1px solid ${noSrc?"rgba(245,158,11,0.18)":"rgba(255,255,255,0.08)"}`,borderRadius:12,padding:"8px 8px 8px 14px",transition:"all 0.25s"}}>
            <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSend()} placeholder={noSrc?"Select sources first…":`Ask about ${subject.shortName}…`} disabled={isTyping} style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:13,fontFamily:"'Outfit',sans-serif"}}/>
            <button disabled={!input.trim()||isTyping} onClick={()=>handleSend()} style={{width:28,height:28,borderRadius:7,background:input.trim()&&!isTyping?C:"rgba(255,255,255,0.07)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:input.trim()&&!isTyping?"pointer":"not-allowed",opacity:!input.trim()||isTyping?0.3:1,transition:"all 0.2s"}}><Send size={12} strokeWidth={2.5}/></button>
          </div>
        </div>
      </div>

      {/* RIGHT: Studio */}
      <div style={{width:224,background:"#0a0a0e",borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"13px 12px 10px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Studio</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 8px",display:"flex",flexDirection:"column",gap:4}}>

          {/* Flashcards button */}
          {(()=>{const cards=FLASHCARDS[subject.id]||[];const d=noSrc;return(
            <button onClick={()=>{if(d)return;if(!cardsGenerated){setCardsGenerated(true);return;}setShowCards(true);}} disabled={d}
              style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",background:d?"rgba(255,255,255,0.02)":"rgba(124,58,237,0.08)",border:`1px solid ${d?"rgba(255,255,255,0.06)":"rgba(124,58,237,0.2)"}`,borderRadius:9,cursor:d?"not-allowed":"pointer",opacity:d?0.4:1,width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif",transition:"all 0.2s"}}
              onMouseOver={e=>{if(!d)(e.currentTarget as HTMLButtonElement).style.background="rgba(124,58,237,0.13)";}} onMouseOut={e=>(e.currentTarget as HTMLButtonElement).style.background=d?"rgba(255,255,255,0.02)":"rgba(124,58,237,0.08)"}>
              <div style={{width:26,height:26,borderRadius:7,background:d?"rgba(255,255,255,0.05)":"rgba(124,58,237,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Layers size={12} style={{color:d?"rgba(255,255,255,0.2)":"#a78bfa"}}/>
              </div>
              <div><div style={{fontSize:11,fontWeight:600,color:d?"rgba(255,255,255,0.28)":"#fff"}}>Flashcards</div><div style={{fontSize:9,color:"rgba(255,255,255,0.28)",marginTop:1}}>{d?"Select sources":!cardsGenerated?"Click to generate":`${cards.length} cards`}</div></div>
            </button>
          );})()}

          {/* Studio action buttons */}
          {[
            {l:"Summarise",s:"Key concepts",icon:Sparkles,c:"#10b981",p:"Summarise all selected documents — key concepts, important points, and exam tips."},
            {l:"Practice Quiz",s:"5 questions",icon:Brain,c:"#f59e0b",p:"Generate 5 exam-style quiz questions from the selected documents with answers."},
            {l:"Exam Focus",s:"Priority topics",icon:Zap,c:"#ef4444",p:"What are the most likely exam topics? Give me a prioritised list."},
            {l:"Generate Notes",s:"Structured notes",icon:FileText,c:"#60a5fa",p:"Generate clean structured notes with clear headings and bullet points."},
          ].map(btn=>{const d=noSrc;return(
            <button key={btn.l} onClick={()=>{if(!d)handleSend(btn.p);}} disabled={d}
              style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,cursor:d?"not-allowed":"pointer",opacity:d?0.4:1,width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif",transition:"all 0.2s"}}
              onMouseOver={e=>{if(!d){(e.currentTarget as HTMLButtonElement).style.background=`${btn.c}10`;(e.currentTarget as HTMLButtonElement).style.borderColor=`${btn.c}28`;}}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.02)";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(255,255,255,0.06)";}}>
              <div style={{width:26,height:26,borderRadius:7,background:`${btn.c}12`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <btn.icon size={12} style={{color:d?"rgba(255,255,255,0.2)":btn.c}}/>
              </div>
              <div><div style={{fontSize:11,fontWeight:600,color:d?"rgba(255,255,255,0.28)":"#fff"}}>{btn.l}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.28)",marginTop:1}}>{d?"Select sources":btn.s}</div></div>
            </button>
          );})}

          <button style={{display:"flex",alignItems:"center",gap:8,padding:"10px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:9,cursor:"not-allowed",opacity:0.38,width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif"}}>
            <div style={{width:26,height:26,borderRadius:7,background:"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Hash size={12} style={{color:"rgba(255,255,255,0.25)"}}/></div>
            <div><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.25)"}}>Mind Map</div><div style={{fontSize:9,color:"rgba(255,255,255,0.18)",marginTop:1}}>Coming soon</div></div>
          </button>

          {pinnedIds.size>0&&(
            <div style={{marginTop:8}}>
              <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.22)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6,padding:"0 2px"}}>📌 Pinned ({pinnedIds.size})</div>
              {messages.filter(m=>pinnedIds.has(m.id)).map(m=>(
                <div key={m.id} style={{padding:"7px 8px",background:"rgba(124,58,237,0.07)",border:"1px solid rgba(124,58,237,0.14)",borderRadius:8,marginBottom:4}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.42)",lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:3 as any,WebkitBoxOrient:"vertical" as any}}>{m.content.slice(0,80)}{m.content.length>80?"…":""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:"8px 10px",borderTop:"1px solid rgba(255,255,255,0.05)"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.2)"}}>{subject.docs.length} docs · Sem {subject.semester}</div></div>
      </div>

      <style>{`
        @keyframes msgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px;}
        .msg-actions-row{opacity:0;transition:opacity 0.2s;}
        div:hover>.msg-actions-row{opacity:1!important;}
        .doc-eye{opacity:0!important;transition:opacity 0.15s!important;}
        div:hover>.doc-eye{opacity:1!important;}
      `}</style>
    </div>
  );
}

// ─── Subjects Landing Page ────────────────────────────────────────────────────
export default function SubjectsPage(){
  const router=useRouter();
  const [search,setSearch]=useState("");
  const [openSubject,setOpenSubject]=useState<Subject|null>(null);
  const [STUDENT,setStudent]=useState(STUDENT_FALLBACK);
  const [showPlan,setShowPlan]=useState(false);

  useEffect(()=>{
    const email=sessionStorage.getItem("cc_email");
    const role=sessionStorage.getItem("cc_role");
    const name=sessionStorage.getItem("cc_name")||"";
    if(!email||!role){router.replace("/login");return;}
    if(role==="faculty"){router.replace("/teacher");return;}
    setStudent({...STUDENT_FALLBACK,id:email.split("@")[0],name,initials:name.split(" ").filter(Boolean).map((n:string)=>n[0]).slice(0,2).join("").toUpperCase()});
  },[router]);

  if(openSubject) return <SubjectWorkspace subject={openSubject} onBack={()=>setOpenSubject(null)} studentId={STUDENT.id}/>;

  const filtered=SUBJECTS.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())||s.code.toLowerCase().includes(search.toLowerCase()));

  return(
    <div style={{minHeight:"100vh",background:"#060608",color:"#fff",fontFamily:"'Outfit',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#7c3aed;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px;}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
        .subj-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:18px;cursor:pointer;transition:all 0.25s;display:flex;flex-direction:column;gap:11px;position:relative;overflow:hidden;}
        .subj-card:hover{background:rgba(255,255,255,0.04);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,0.35);}
      `}</style>
      {showPlan&&<StudyPlanModal onClose={()=>setShowPlan(false)}/>}

      {/* Topbar */}
      <div style={{borderBottom:"1px solid rgba(255,255,255,0.05)",padding:"0 28px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:"rgba(6,6,8,0.92)",backdropFilter:"blur(12px)",zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Link href="/chat" style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"rgba(255,255,255,0.33)",textDecoration:"none",transition:"color 0.2s"}}
            onMouseOver={e=>(e.currentTarget.style.color="#fff")} onMouseOut={e=>(e.currentTarget.style.color="rgba(255,255,255,0.33)")}>
            <ArrowLeft size={12}/> Back to chat
          </Link>
          <div style={{width:1,height:13,background:"rgba(255,255,255,0.07)"}}/>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#fff"}}>Campus<span style={{color:"#7c3aed"}}>Copilot</span></span>
          <span style={{fontSize:10,color:"#7c3aed",background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)",padding:"2px 7px",borderRadius:100,fontWeight:600,letterSpacing:"0.04em"}}>SUBJECTS</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <StreakBadge streak={3} xp={240}/>
          <NotificationBell/>
          <div style={{width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#7c3aed,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{STUDENT.initials}</div>
          <span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>{STUDENT.name}</span>
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:"32px 28px"}}>
        <ExamReadinessCard onOpen={()=>setOpenSubject(SUBJECTS[0])}/>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.02em",marginBottom:3}}>Your Subjects</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.32)"}}>Select a subject to open its workspace.</div>
          </div>
          <button onClick={()=>setShowPlan(true)} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 14px",background:"rgba(124,58,237,0.09)",border:"1px solid rgba(124,58,237,0.22)",borderRadius:9,color:"#a78bfa",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Outfit',sans-serif",transition:"all 0.2s"}}
            onMouseOver={e=>(e.currentTarget as HTMLButtonElement).style.background="rgba(124,58,237,0.16)"} onMouseOut={e=>(e.currentTarget as HTMLButtonElement).style.background="rgba(124,58,237,0.09)"}>
            <Calendar size={12}/> Create Study Plan
          </button>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"8px 13px",marginBottom:20,maxWidth:320}}>
          <Search size={13} style={{color:"rgba(255,255,255,0.22)",flexShrink:0}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subjects…" style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:13,fontFamily:"'Outfit',sans-serif"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.28)",cursor:"pointer"}}><X size={12}/></button>}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:11}}>
          {filtered.map(s=>(
            <div key={s.id} className="subj-card" onClick={()=>setOpenSubject(s)} style={{borderColor:`${s.color}20`}}>
              <div style={{height:2,borderRadius:2,background:`linear-gradient(90deg,${s.color},${s.color}44)`,width:"100%"}}/>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                <div style={{width:38,height:38,borderRadius:10,background:`${s.color}15`,border:`1px solid ${s.color}25`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:s.color,fontFamily:"'Syne',sans-serif"}}>{s.shortName.slice(0,2)}</div>
                <span style={{fontSize:9,color:"rgba(255,255,255,0.22)",fontFamily:"'DM Mono',monospace",marginTop:3}}>{s.code}</span>
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:2,fontFamily:"'Syne',sans-serif"}}>{s.name}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.32)"}}>{s.professor}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",gap:5}}>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.32)",background:"rgba(255,255,255,0.04)",padding:"2px 7px",borderRadius:5}}>{s.docs.length} docs</span>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.32)",background:"rgba(255,255,255,0.04)",padding:"2px 7px",borderRadius:5}}>Sem {s.semester}</span>
                </div>
                <ChevronRight size={12} style={{color:"rgba(255,255,255,0.2)"}}/>
              </div>
            </div>
          ))}
        </div>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"52px 0",color:"rgba(255,255,255,0.2)",fontSize:13}}>No subjects found for "{search}"</div>}
      </div>
    </div>
  );
}
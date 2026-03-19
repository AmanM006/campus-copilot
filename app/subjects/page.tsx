"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Search, FileText, Plus, Pin, ChevronRight,
  BookOpen, Brain, Zap, RotateCcw, Check, X, Send,
  Bot, User, Copy, Download, Eye, Layers, List,
  ChevronLeft, Sparkles, MessageSquare, Settings, Hash,
  PanelLeftClose, Link as LinkIcon
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SubjectDoc {
  id: string;
  name: string;
  type: "pdf"|"notes"|"slides";
  pages: number;
  size: string;
  uploadedBy: string;
  date: string;
}
interface Subject {
  id: string;
  code: string;
  name: string;
  shortName: string;
  professor: string;
  semester: number;
  color: string;
  docs: SubjectDoc[];
}
interface ChatMessage {
  id: string;
  role: "user"|"assistant";
  content: string;
  pinned?: boolean;
}
interface Notebook {
  id: string;
  title: string;
  subjectId: string;
  selectedDocIds: string[];
  messages: ChatMessage[];
  createdAt: string;
  pinned?: boolean;
}
interface Flashcard {
  front: string;
  back: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const STUDENT_FALLBACK = {
  id:"213CS1001", name:"Aman Mehta", initials:"AM",
  branch:"Computer Science & Engineering", semester:4,
};

const SUBJECTS: Subject[] = [
  {
    id:"os", code:"CSS 2204", name:"Operating Systems", shortName:"OS",
    professor:"Dr. Rajesh Kumar", semester:4, color:"#7c3aed",
    docs:[
      {id:"os1",name:"OS Lab Manual.pdf",type:"pdf",pages:84,size:"3.2 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-10"},
      {id:"os2",name:"Unit 1 — Process Management.pdf",type:"pdf",pages:42,size:"1.8 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-14"},
      {id:"os3",name:"Unit 2 — Memory Management.pdf",type:"pdf",pages:38,size:"1.4 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-20"},
      {id:"os4",name:"Unit 3 — File Systems.pdf",type:"pdf",pages:31,size:"1.1 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-02-27"},
      {id:"os5",name:"Previous Year Questions.pdf",type:"pdf",pages:12,size:"0.4 MB",uploadedBy:"Dr. Rajesh Kumar",date:"2026-03-01"},
    ],
  },
  {
    id:"dbms", code:"CSS 2201", name:"Database Systems", shortName:"DBMS",
    professor:"Dr. Anitha Rao", semester:4, color:"#0ea5e9",
    docs:[
      {id:"db1",name:"DBMS Complete Notes.pdf",type:"pdf",pages:120,size:"5.1 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-05"},
      {id:"db2",name:"SQL Practice Problems.pdf",type:"pdf",pages:28,size:"0.9 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-12"},
      {id:"db3",name:"ER Diagram Slides.pdf",type:"slides",pages:55,size:"2.3 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-18"},
      {id:"db4",name:"Normalization Tutorial.pdf",type:"notes",pages:22,size:"0.7 MB",uploadedBy:"Dr. Anitha Rao",date:"2026-02-25"},
    ],
  },
  {
    id:"ai", code:"CSS 2203", name:"Introduction to AI", shortName:"AI",
    professor:"Dr. Priya Sharma", semester:4, color:"#10b981",
    docs:[
      {id:"ai1",name:"AI Fundamentals — Unit 1.pdf",type:"pdf",pages:60,size:"2.7 MB",uploadedBy:"Dr. Priya Sharma",date:"2026-02-08"},
      {id:"ai2",name:"Search Algorithms.pdf",type:"pdf",pages:35,size:"1.3 MB",uploadedBy:"Dr. Priya Sharma",date:"2026-02-15"},
      {id:"ai3",name:"Machine Learning Basics.pdf",type:"notes",pages:45,size:"1.9 MB",uploadedBy:"Dr. Priya Sharma",date:"2026-02-22"},
    ],
  },
  {
    id:"dsa", code:"CSS 2202", name:"Design & Analysis of Algorithms", shortName:"DAA",
    professor:"Dr. Mohit Verma", semester:4, color:"#f59e0b",
    docs:[
      {id:"dsa1",name:"Algorithm Design Notes.pdf",type:"pdf",pages:95,size:"4.2 MB",uploadedBy:"Dr. Mohit Verma",date:"2026-02-07"},
      {id:"dsa2",name:"Complexity Analysis.pdf",type:"pdf",pages:30,size:"1.1 MB",uploadedBy:"Dr. Mohit Verma",date:"2026-02-16"},
      {id:"dsa3",name:"Graph Algorithms.pdf",type:"slides",pages:48,size:"2.0 MB",uploadedBy:"Dr. Mohit Verma",date:"2026-02-24"},
    ],
  },
  {
    id:"maths", code:"MAT 2201", name:"Probability and Optimization", shortName:"Maths",
    professor:"Dr. Suresh Iyer", semester:4, color:"#ef4444",
    docs:[
      {id:"m1",name:"Probability Theory.pdf",type:"pdf",pages:72,size:"3.0 MB",uploadedBy:"Dr. Suresh Iyer",date:"2026-02-06"},
      {id:"m2",name:"Optimization Methods.pdf",type:"pdf",pages:58,size:"2.4 MB",uploadedBy:"Dr. Suresh Iyer",date:"2026-02-13"},
    ],
  },
];

// ─── Mock flashcards per subject ──────────────────────────────────────────────
const MOCK_FLASHCARDS: Record<string,Flashcard[]> = {
  os:[
    {front:"What is a process?",back:"A process is a program in execution. It includes the program code (text section), current activity (program counter, registers), and its own stack and data section."},
    {front:"Difference between process and thread?",back:"A process has its own memory space. Threads share memory within a process. Threads are lighter and faster to create/switch."},
    {front:"What is deadlock?",back:"A situation where two or more processes are waiting for each other to release resources, causing all to be stuck permanently."},
    {front:"What are the four conditions for deadlock?",back:"1. Mutual Exclusion 2. Hold and Wait 3. No Preemption 4. Circular Wait — all four must hold simultaneously."},
    {front:"What is virtual memory?",back:"A memory management technique that allows processes to use more memory than physically available by using disk space as an extension of RAM."},
  ],
  dbms:[
    {front:"What is normalization?",back:"The process of organizing a database to reduce redundancy and improve data integrity by decomposing tables into smaller, well-structured ones."},
    {front:"What is a primary key?",back:"A column (or set of columns) that uniquely identifies each row in a table. It cannot be NULL and must be unique."},
    {front:"Difference between INNER JOIN and LEFT JOIN?",back:"INNER JOIN returns only matching rows from both tables. LEFT JOIN returns all rows from the left table plus matching rows from the right."},
    {front:"What is ACID in databases?",back:"Atomicity, Consistency, Isolation, Durability — four properties that guarantee database transactions are processed reliably."},
  ],
  ai:[
    {front:"What is a heuristic function?",back:"A function that estimates the cost from a node to the goal in search algorithms. Used in A* to guide search efficiently."},
    {front:"What is the difference between BFS and DFS?",back:"BFS explores level by level (uses a queue) and finds the shortest path. DFS goes deep first (uses a stack) and uses less memory."},
    {front:"What is supervised learning?",back:"A type of machine learning where the model is trained on labeled data — each input has a known correct output."},
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function copyText(t:string){navigator.clipboard.writeText(t).catch(()=>{});}

function getDocIcon(type:string){
  if(type==="slides") return "🎞️";
  if(type==="notes")  return "📝";
  return "📄";
}

// ─── Flashcard Viewer ─────────────────────────────────────────────────────────
function FlashcardViewer({cards,onClose}:{cards:Flashcard[];onClose:()=>void}){
  const [idx,setIdx]=useState(0);
  const [flipped,setFlipped]=useState(false);
  const card=cards[idx];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(12px)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:520,display:"flex",flexDirection:"column",gap:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:700,color:"#fff"}}>Flashcards</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.4)"}}>{idx+1} / {cards.length}</span>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",width:28,height:28,borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
          </div>
        </div>

        {/* Card */}
        <div onClick={()=>setFlipped(p=>!p)} style={{cursor:"pointer",background:flipped?"rgba(124,58,237,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${flipped?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.1)"}`,borderRadius:20,padding:36,minHeight:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",transition:"all 0.3s ease"}}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16}}>{flipped?"Answer":"Question — tap to reveal"}</div>
          <div style={{fontSize:flipped?15:17,fontWeight:flipped?400:600,color:"#fff",lineHeight:1.6}}>{flipped?card.back:card.front}</div>
        </div>

        {/* Controls */}
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{setIdx(p=>Math.max(0,p-1));setFlipped(false);}} disabled={idx===0}
            style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:idx===0?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.7)",cursor:idx===0?"not-allowed":"pointer",fontSize:13,fontFamily:"'Outfit',sans-serif"}}>
            ← Previous
          </button>
          <button onClick={()=>setFlipped(p=>!p)}
            style={{flex:1,padding:"10px 0",background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.3)",borderRadius:10,color:"#a78bfa",cursor:"pointer",fontSize:13,fontFamily:"'Outfit',sans-serif"}}>
            Flip
          </button>
          <button onClick={()=>{setIdx(p=>Math.min(cards.length-1,p+1));setFlipped(false);}} disabled={idx===cards.length-1}
            style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:idx===cards.length-1?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.7)",cursor:idx===cards.length-1?"not-allowed":"pointer",fontSize:13,fontFamily:"'Outfit',sans-serif"}}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PDF Preview Modal ─────────────────────────────────────────────────────────
function DocPreview({doc,onClose}:{doc:SubjectDoc;onClose:()=>void}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div style={{background:"#0f0f14",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:28,width:"100%",maxWidth:420,animation:"slideUp 0.2s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div style={{fontSize:24}}>{getDocIcon(doc.type)}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer"}}><X size={18}/></button>
        </div>
        <div style={{fontSize:16,fontWeight:600,color:"#fff",marginBottom:8,lineHeight:1.4}}>{doc.name}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
          {[["Pages",doc.pages],["Size",doc.size],["Uploaded by",doc.uploadedBy],["Date",doc.date]].map(([l,v])=>(
            <div key={l as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:9,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,color:"#fff",fontWeight:500}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={{flex:1,padding:"10px 0",background:"rgba(124,58,237,0.15)",border:"1px solid rgba(124,58,237,0.3)",borderRadius:10,color:"#a78bfa",cursor:"pointer",fontSize:13,fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Eye size={14}/> Preview
          </button>
          <button style={{flex:1,padding:"10px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:13,fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <Download size={14}/> Download
          </button>
        </div>
      </div>
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
  const [previewDoc,setPreviewDoc]=useState<SubjectDoc|null>(null);
  const [showFlashcards,setShowFlashcards]=useState(false);
  const [rightTool,setRightTool]=useState<"tools"|"summary">("tools");
  const [copied,setCopied]=useState<string|null>(null);
  const [pinnedIds,setPinnedIds]=useState<Set<string>>(new Set());
  const messagesEndRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,isTyping]);

  const flashcards = MOCK_FLASHCARDS[subject.id] || [];
  const filteredDocs = subject.docs.filter(d=>d.name.toLowerCase().includes(docSearch.toLowerCase()));
  const selectedCount = selectedDocs.size;

  const toggleDoc=(id:string)=>{
    setSelectedDocs(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  };
  const selectAll=()=>setSelectedDocs(new Set(subject.docs.map(d=>d.id)));
  const clearAll=()=>setSelectedDocs(new Set());
  const togglePin=(id:string)=>setPinnedIds(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});

  const handleSend=async(text:string=input)=>{
    if(!text.trim()||isTyping) return;
    const userMsg:ChatMessage={id:Date.now().toString(),role:"user",content:text.trim()};
    setMessages(p=>[...p,userMsg]);
    setInput(""); setIsTyping(true);

    // Build selected doc names for context indicator
    const selectedDocNames=subject.docs.filter(d=>selectedDocs.has(d.id)).map(d=>d.name);

    try{
      const res=await fetch("http://localhost:8000/api/chat/stream",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          message:text.trim(),
          user_id:studentId,
          history:messages.slice(-6).map(m=>({role:m.role,content:m.content})),
          role:"student",
          subject_context:{
            subject_name:subject.name,
            subject_code:subject.code,
            selected_docs:selectedDocNames,
          }
        }),
      });

      const streamId="s-"+Date.now();
      setMessages(p=>[...p,{id:streamId,role:"assistant",content:""}]);

      if(!res.body){setIsTyping(false);return;}
      const reader=res.body.getReader();const decoder=new TextDecoder();
      let buffer="";let fullText="";
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split("\n");
        buffer=lines.pop()||"";
        let event="";let dataStr="";
        for(const line of lines){
          if(line.startsWith("event:")) event=line.slice(6).trim();
          else if(line.startsWith("data:")) dataStr=line.slice(5).trim();
          else if(line===""&&event&&dataStr){
            try{
              const data=JSON.parse(dataStr);
              if(event==="token"){
                fullText+=data.text||"";
                setMessages(p=>p.map(m=>m.id===streamId?{...m,content:fullText}:m));
                await new Promise(r=>setTimeout(r,15));
              } else if(event==="done") break;
              else if(event==="error"){
                setMessages(p=>p.map(m=>m.id===streamId?{...m,content:"Something went wrong."}:m));
              }
            }catch{}
            event="";dataStr="";
          }
        }
      }
    }catch{
      setMessages(p=>[...p,{id:Date.now().toString(),role:"assistant",content:"Couldn't connect to the backend. Is it running?"}]);
    }
    setIsTyping(false);
  };

  return(
    <div style={{display:"flex",height:"100vh",background:"#060608",color:"#fff",fontFamily:"'Outfit',sans-serif",overflow:"hidden"}}>
      {previewDoc&&<DocPreview doc={previewDoc} onClose={()=>setPreviewDoc(null)}/>}
      {showFlashcards&&flashcards.length>0&&<FlashcardViewer cards={flashcards} onClose={()=>setShowFlashcards(false)}/>}

      {/* ── LEFT: Sources ── */}
      <div style={{width:260,background:"#0a0a0e",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",flexShrink:0}}>
        {/* Back + subject header */}
        <div style={{padding:"16px 14px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:12,fontFamily:"'Outfit',sans-serif",marginBottom:12,padding:0,transition:"color 0.2s"}}
            onMouseOver={e=>(e.currentTarget.style.color="#fff")} onMouseOut={e=>(e.currentTarget.style.color="rgba(255,255,255,0.4)")}>
            <ArrowLeft size={13}/> All Subjects
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,borderRadius:9,background:subject.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>
              {subject.shortName.slice(0,2)}
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1.2}}>{subject.shortName}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{subject.code}</div>
            </div>
          </div>
        </div>

        {/* Sources header */}
        <div style={{padding:"12px 14px 8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Sources ({subject.docs.length})</span>
          <div style={{display:"flex",gap:4}}>
            <button onClick={selectAll} style={{fontSize:10,color:"#7c3aed",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",padding:"2px 5px"}}>All</button>
            <span style={{color:"rgba(255,255,255,0.2)",fontSize:10}}>·</span>
            <button onClick={clearAll} style={{fontSize:10,color:"rgba(255,255,255,0.35)",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'Outfit',sans-serif",padding:"2px 5px"}}>None</button>
          </div>
        </div>

        {/* Doc search */}
        <div style={{padding:"0 14px 8px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"6px 10px"}}>
            <Search size={12} style={{color:"rgba(255,255,255,0.3)",flexShrink:0}}/>
            <input value={docSearch} onChange={e=>setDocSearch(e.target.value)} placeholder="Find document…"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:12,fontFamily:"'Outfit',sans-serif"}}/>
          </div>
        </div>

        {/* Doc list */}
        <div style={{flex:1,overflowY:"auto",padding:"0 8px 8px"}}>
          {filteredDocs.map(doc=>(
            <div key={doc.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 8px",borderRadius:9,marginBottom:2,cursor:"pointer",background:selectedDocs.has(doc.id)?"rgba(124,58,237,0.08)":"transparent",border:selectedDocs.has(doc.id)?"1px solid rgba(124,58,237,0.2)":"1px solid transparent",transition:"all 0.15s"}}
              onClick={()=>toggleDoc(doc.id)}>
              <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${selectedDocs.has(doc.id)?"#7c3aed":"rgba(255,255,255,0.2)"}`,background:selectedDocs.has(doc.id)?"#7c3aed":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                {selectedDocs.has(doc.id)&&<Check size={9} style={{color:"#fff"}}/>}
              </div>
              <span style={{fontSize:14,flexShrink:0}}>{getDocIcon(doc.type)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.3}}>{doc.name}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:1}}>{doc.pages}p · {doc.size}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();setPreviewDoc(doc);}} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.25)",cursor:"pointer",padding:3,borderRadius:5,flexShrink:0,opacity:0}}
                className="doc-info-btn">
                <Eye size={12}/>
              </button>
            </div>
          ))}
        </div>

        {/* Selected count */}
        {selectedCount>0&&(
          <div style={{padding:"10px 14px",borderTop:"1px solid rgba(255,255,255,0.05)",fontSize:12,color:selectedCount>0?"#a78bfa":"rgba(255,255,255,0.3)"}}>
            {selectedCount} source{selectedCount>1?"s":""} selected
          </div>
        )}
      </div>

      {/* ── CENTER: Chat ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* Chat header */}
        <div style={{height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:subject.color}}/>
            <span style={{fontSize:14,fontWeight:600,color:"#fff"}}>{subject.name}</span>
            {selectedCount>0&&(
              <span style={{fontSize:11,background:`${subject.color}20`,color:subject.color,border:`1px solid ${subject.color}40`,padding:"2px 8px",borderRadius:100}}>
                {selectedCount} source{selectedCount>1?"s":""} active
              </span>
            )}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>{subject.professor}</div>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:20}}>
          {messages.length===0&&(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",textAlign:"center"}}>
              <div style={{width:56,height:56,borderRadius:16,background:`${subject.color}20`,border:`1px solid ${subject.color}30`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,fontSize:24}}>
                📖
              </div>
              <div style={{fontSize:18,fontWeight:700,color:"#fff",marginBottom:8,fontFamily:"'Syne',sans-serif"}}>Ask about {subject.shortName}</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,0.4)",maxWidth:320,lineHeight:1.6,marginBottom:24}}>
                Select sources on the left, then ask any question. I'll answer based only on those documents.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",maxWidth:400}}>
                {["Summarise the key concepts from these notes","What are the main topics I should focus on for the exam?","Explain the most complex concept in simple terms"].map((q,i)=>(
                  <button key={i} onClick={()=>handleSend(q)} style={{padding:"10px 16px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"rgba(255,255,255,0.6)",fontSize:13,cursor:"pointer",fontFamily:"'Outfit',sans-serif",textAlign:"left",transition:"all 0.2s"}}
                    onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background=`${subject.color}15`;(e.currentTarget as HTMLButtonElement).style.borderColor=`${subject.color}40`;(e.currentTarget as HTMLButtonElement).style.color="#fff";}}
                    onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.03)";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(255,255,255,0.08)";(e.currentTarget as HTMLButtonElement).style.color="rgba(255,255,255,0.6)";}}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg,i)=>(
            <div key={msg.id} style={{display:"flex",gap:10,flexDirection:msg.role==="user"?"row-reverse":"row",animation:"msgIn 0.3s ease"}}>
              <div style={{width:28,height:28,borderRadius:8,background:msg.role==="assistant"?`linear-gradient(135deg,${subject.color},${subject.color}88)`:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                {msg.role==="assistant"?<Bot size={15}/>:<User size={15}/>}
              </div>
              <div style={{maxWidth:"82%"}}>
                <div style={{fontSize:14,lineHeight:1.75,color:"rgba(255,255,255,0.85)",background:msg.role==="user"?"rgba(255,255,255,0.06)":"transparent",border:msg.role==="user"?"1px solid rgba(255,255,255,0.08)":"none",padding:msg.role==="user"?"10px 14px":"0",borderRadius:msg.role==="user"?"14px 14px 4px 14px":"0"}}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    code({node,inline,className,children,...props}:any){
                      const match=/language-(\w+)/.exec(className||"");
                      return !inline&&match?(
                        <div style={{borderRadius:8,overflow:"hidden",margin:"10px 0"}}>
                          <div style={{background:"#1a1a1a",padding:"4px 14px",fontSize:10,color:"#555",borderBottom:"1px solid #222"}}>{match[1]}</div>
                          <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" customStyle={{margin:0,padding:14,background:"#141414",fontSize:12}} {...props}>{String(children).replace(/\n$/,"")}</SyntaxHighlighter>
                        </div>
                      ):<code style={{background:"rgba(255,255,255,0.09)",padding:"2px 6px",borderRadius:4,fontSize:"0.88em",fontFamily:"DM Mono,monospace"}} {...props}>{children}</code>;
                    },
                    table({children}:any){return<table style={{borderCollapse:"collapse",width:"100%",margin:"10px 0",fontSize:13}}>{children}</table>},
                    th({children}:any){return<th style={{background:`${subject.color}20`,color:subject.color,padding:"7px 12px",border:"1px solid rgba(255,255,255,0.1)",textAlign:"left",fontWeight:600,fontSize:12}}>{children}</th>},
                    td({children}:any){return<td style={{padding:"6px 12px",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.8)"}}>{children}</td>},
                  }}>{msg.content}</ReactMarkdown>
                </div>
                {msg.role==="assistant"&&msg.content&&(
                  <div style={{display:"flex",gap:6,marginTop:6,opacity:0}} className="msg-hover-actions">
                    <button onClick={()=>{copyText(msg.content);setCopied(msg.id);setTimeout(()=>setCopied(null),1500);}} style={{display:"flex",alignItems:"center",gap:4,background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.35)",padding:"3px 8px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      {copied===msg.id?<Check size={11}/>:<Copy size={11}/>}{copied===msg.id?"Copied":"Copy"}
                    </button>
                    <button onClick={()=>togglePin(msg.id)} style={{display:"flex",alignItems:"center",gap:4,background:pinnedIds.has(msg.id)?"rgba(124,58,237,0.15)":"transparent",border:`1px solid ${pinnedIds.has(msg.id)?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.08)"}`,color:pinnedIds.has(msg.id)?"#a78bfa":"rgba(255,255,255,0.35)",padding:"3px 8px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      <Pin size={11}/>{pinnedIds.has(msg.id)?"Pinned":"Pin"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping&&(
            <div style={{display:"flex",gap:10}}>
              <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${subject.color},${subject.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Bot size={15}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12}}>
                <div style={{width:14,height:14,border:"2px solid rgba(124,58,237,0.3)",borderTopColor:subject.color,borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>Thinking…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef}/>
        </div>

        {/* Input */}
        <div style={{padding:"12px 20px 16px",background:"linear-gradient(to top,#060608 60%,transparent)",flexShrink:0}}>
          {selectedCount===0&&(
            <div style={{fontSize:12,color:"#f59e0b",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              ⚠️ No sources selected — select at least one document on the left.
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.04)",border:`1px solid ${selectedCount>0?"rgba(255,255,255,0.09)":"rgba(245,158,11,0.2)"}`,borderRadius:14,padding:"9px 10px 9px 16px",transition:"all 0.25s"}}>
            <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSend()}
              placeholder={selectedCount>0?`Ask about ${subject.shortName}…`:"Select sources first…"}
              disabled={isTyping}
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",fontSize:14,fontFamily:"'Outfit',sans-serif"}}/>
            <button disabled={!input.trim()||isTyping} onClick={()=>handleSend()}
              style={{width:32,height:32,borderRadius:9,background:input.trim()&&!isTyping?subject.color:"rgba(255,255,255,0.08)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:input.trim()&&!isTyping?"pointer":"not-allowed",transition:"all 0.2s",opacity:!input.trim()||isTyping?0.3:1}}>
              <Send size={14} strokeWidth={2.5}/>
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Tools ── */}
      <div style={{width:240,background:"#0a0a0e",borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"16px 14px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Studio</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 10px",display:"flex",flexDirection:"column",gap:6}}>

          {/* Flashcards */}
          <button onClick={()=>flashcards.length>0&&setShowFlashcards(true)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"12px 12px",background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)",borderRadius:11,cursor:flashcards.length>0?"pointer":"not-allowed",transition:"all 0.2s",opacity:flashcards.length>0?1:0.5,width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif"}}
            onMouseOver={e=>{if(flashcards.length>0)(e.currentTarget as HTMLButtonElement).style.background="rgba(124,58,237,0.14)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(124,58,237,0.08)";}}>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(124,58,237,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Layers size={14} style={{color:"#a78bfa"}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>Flashcards</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:1}}>{flashcards.length} cards ready</div>
            </div>
          </button>

          {/* Summarise */}
          <button onClick={()=>handleSend("Summarise all the selected documents for me — key concepts, important points, and exam tips.")}
            style={{display:"flex",alignItems:"center",gap:10,padding:"12px 12px",background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.15)",borderRadius:11,cursor:"pointer",transition:"all 0.2s",width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif"}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(16,185,129,0.12)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(16,185,129,0.06)";}}>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(16,185,129,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Sparkles size={14} style={{color:"#10b981"}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>Summarise</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:1}}>Key concepts</div>
            </div>
          </button>

          {/* Quiz */}
          <button onClick={()=>handleSend("Generate 5 exam-style quiz questions based on the selected documents with answers.")}
            style={{display:"flex",alignItems:"center",gap:10,padding:"12px 12px",background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:11,cursor:"pointer",transition:"all 0.2s",width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif"}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(245,158,11,0.12)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(245,158,11,0.06)";}}>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(245,158,11,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Brain size={14} style={{color:"#f59e0b"}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>Practice Quiz</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:1}}>5 questions</div>
            </div>
          </button>

          {/* Exam tips */}
          <button onClick={()=>handleSend("What are the most likely exam topics from these documents? Give me a priority list.")}
            style={{display:"flex",alignItems:"center",gap:10,padding:"12px 12px",background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:11,cursor:"pointer",transition:"all 0.2s",width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif"}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(239,68,68,0.12)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(239,68,68,0.06)";}}>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(239,68,68,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Zap size={14} style={{color:"#ef4444"}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>Exam Focus</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:1}}>Priority topics</div>
            </div>
          </button>

          {/* Mind map placeholder */}
          <button style={{display:"flex",alignItems:"center",gap:10,padding:"12px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:11,cursor:"not-allowed",opacity:0.5,width:"100%",textAlign:"left",fontFamily:"'Outfit',sans-serif"}}>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Hash size={14} style={{color:"rgba(255,255,255,0.4)"}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.4)"}}>Mind Map</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:1}}>Coming soon</div>
            </div>
          </button>

          {/* Pinned messages */}
          {pinnedIds.size>0&&(
            <div style={{marginTop:12}}>
              <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,padding:"0 2px"}}>📌 Pinned ({pinnedIds.size})</div>
              {messages.filter(m=>pinnedIds.has(m.id)).map(m=>(
                <div key={m.id} style={{padding:"8px 10px",background:"rgba(124,58,237,0.07)",border:"1px solid rgba(124,58,237,0.15)",borderRadius:9,marginBottom:5}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:3 as any,WebkitBoxOrient:"vertical" as any}}>
                    {m.content.slice(0,80)}{m.content.length>80?"…":""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom — doc info */}
        <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.25)",lineHeight:1.5}}>
            {subject.docs.length} documents · Sem {subject.semester}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px;}
        .msg-hover-actions{opacity:0;transition:opacity 0.2s;}
        div:hover>.msg-hover-actions{opacity:1!important;}
        .doc-info-btn{opacity:0;transition:opacity 0.15s!important;}
        div:hover>.doc-info-btn{opacity:1!important;}
      `}</style>
    </div>
  );
}

// ─── Subjects Grid (landing page) ────────────────────────────────────────────

export default function SubjectsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [openSubject, setOpenSubject] = useState<Subject | null>(null);
  const [STUDENT, setStudent] = useState(STUDENT_FALLBACK);

  useEffect(() => {
    const email = sessionStorage.getItem("cc_email");
    const role = sessionStorage.getItem("cc_role");
    const name = sessionStorage.getItem("cc_name") || "";
    if (!email || !role) { router.replace("/login"); return; }
    if (role === "faculty") { router.replace("/teacher"); return; }
    setStudent({
      ...STUDENT_FALLBACK, id: email.split("@")[0], name,
      initials: name.split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    });
  }, [router]);

  if (openSubject) return <SubjectWorkspace subject={openSubject} onBack={() => setOpenSubject(null)} studentId={STUDENT.id} />;

  const filtered = SUBJECTS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "#060608", color: "#fff", fontFamily: "'Outfit',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        
        /* Force dark background on the whole page to kill any white bleed */
        body { background-color: #060608; margin: 0; padding: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }
        
        /* Invisible/Sleek Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #060608; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        /* Modern Search Input */
        .search-container {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 14px 20px;
          margin-bottom: 40px;
          max-width: 480px;
          transition: all 0.2s ease;
        }
        .search-container:focus-within {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(124, 58, 237, 0.5);
          box-shadow: 0 0 20px rgba(124, 58, 237, 0.1);
        }

        /* Sleek Horizontal List Items */
        .subject-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 20px 24px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .subject-row:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.1);
          transform: translateX(4px);
        }
        .subject-row:hover .arrow-icon {
          transform: translateX(4px);
          color: #fff !important;
        }
        
        /* Responsive tweaks */
        @media (max-width: 768px) {
          .subject-row { flex-direction: column; align-items: flex-start; gap: 16px; }
          .row-right { width: 100%; justify-content: space-between; }
        }
      `}</style>

      {/* FIXED Topbar (Will never move) */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(6, 6, 8, 0.8)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/chat" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none", transition: "color 0.2s" }}
            onMouseOver={e => (e.currentTarget.style.color = "#fff")} onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
            <ArrowLeft size={13} /> Back to chat
          </Link>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: "#fff" }}>Campus<span style={{ color: "#7c3aed" }}>Copilot</span></span>
          <span style={{ fontSize: 11, color: "#7c3aed", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)", padding: "2px 8px", borderRadius: 100, fontWeight: 600, letterSpacing: "0.04em" }}>SUBJECTS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{STUDENT.initials}</div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{STUDENT.name}</span>
        </div>
      </div>

      {/* Main Content Area - Added paddingTop so it clears the fixed navbar */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "100px 32px 60px" }}>
        
        {/* Header Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 32, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>
            Your Workspace
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 500, lineHeight: 1.5 }}>
            Select a subject to open its workspace — ask questions, generate flashcards, and explore your materials.
          </p>
        </div>

        {/* Search Bar */}
        <div className="search-container">
          <Search size={16} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects or codes…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 15, fontFamily: "'Outfit',sans-serif" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex" }}><X size={16} /></button>}
        </div>

        {/* Completely Redesigned List View */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filtered.map(subject => (
            <div key={subject.id} className="subject-row" onClick={() => setOpenSubject(subject)}>
              
              {/* Left Color Indicator Line */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: subject.color, boxShadow: `0 0 10px ${subject.color}60` }} />

              {/* Left side: Icon + Name + Code */}
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${subject.color}15`, border: `1px solid ${subject.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: subject.color, fontFamily: "'Syne',sans-serif" }}>
                  {subject.shortName.slice(0, 2)}
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: "#fff", fontFamily: "'Outfit',sans-serif", letterSpacing: "0.01em" }}>{subject.name}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono',monospace", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                      {subject.code}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>{subject.professor}</span>
                </div>
              </div>

              {/* Right side: Stats & Action */}
              <div className="row-right" style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: 8 }}>
                    {subject.docs.length} docs
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: 8 }}>
                    Sem {subject.semester}
                  </span>
                </div>
                <ChevronRight className="arrow-icon" size={18} style={{ color: "rgba(255,255,255,0.2)", transition: "all 0.2s ease" }} />
              </div>

            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Search size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
            <p>No subjects found for "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
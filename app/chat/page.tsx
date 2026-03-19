"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Bot, User, Plus, MessageSquare, Settings, Trash2,
  PanelLeftClose, PanelLeftOpen, LayoutGrid, FlaskConical,
  FileText, Bell, BarChart3, TrendingUp, X, BookOpen,
  ArrowLeft, PanelRightClose, Eye, Clock, Search,
  Copy, RotateCcw, Check, ChevronRight, Database
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id?: string; role: "user"|"assistant"; content: string;
  thread_id: string; action?: ToolAction|null;
  sources?: RagSource[];
}
interface Thread { thread_id: string; title: string; }
interface ToolAction { type: string; tool_name: string; status: string; details: Record<string,any>; }
interface RagSource { text: string; score: number; }

// ─── Hardcoded Student (kept for dashboard; auth pulls real identity) ─────────
const STUDENT_FALLBACK = {
  id:"213CS1001", name:"Aman Mehta", program:"SCE", semester:4,
  branch:"Computer Science & Engineering", cgpa:8.4, initials:"AM", year:"2nd Year",
};
const EXAM_SCHEDULE_RAW = [
  { code:"MAT 2201", subject:"Probability and Optimization",           date:"2026-03-06", day:"Fri", time:"8:30 AM – 10:00 AM" },
  { code:"CSS 2201", subject:"Database Systems",                        date:"2026-03-07", day:"Sat", time:"8:30 AM – 10:00 AM" },
  { code:"CSS 2202", subject:"Design & Analysis of Algorithms",         date:"2026-03-09", day:"Mon", time:"8:30 AM – 10:00 AM" },
  { code:"CSS 2203", subject:"Introduction to Artificial Intelligence", date:"2026-03-10", day:"Tue", time:"8:30 AM – 10:00 AM" },
  { code:"CSS 2204", subject:"Operating Systems",                       date:"2026-03-11", day:"Wed", time:"8:30 AM – 10:00 AM" },
];
const TIMETABLE: Record<string,Array<{time:string;end:string;subject:string;room:string;type:string;startH:number;startM:number;endH:number;endM:number}>> = {
  Monday:   [{time:"08:00",end:"09:00",subject:"Probability & Optimization",room:"LH-301",type:"lecture",startH:8,startM:0,endH:9,endM:0},{time:"09:00",end:"10:00",subject:"Database Systems",room:"LH-204",type:"lecture",startH:9,startM:0,endH:10,endM:0},{time:"10:15",end:"11:15",subject:"Design & Analysis of Algo",room:"LH-102",type:"lecture",startH:10,startM:15,endH:11,endM:15},{time:"11:30",end:"13:30",subject:"OS Lab",room:"OSDL-B",type:"lab",startH:11,startM:30,endH:13,endM:30},{time:"14:30",end:"15:30",subject:"Operating Systems",room:"LH-301",type:"lecture",startH:14,startM:30,endH:15,endM:30}],
  Tuesday:  [{time:"08:00",end:"09:00",subject:"Intro to AI",room:"LH-205",type:"lecture",startH:8,startM:0,endH:9,endM:0},{time:"09:00",end:"10:00",subject:"Operating Systems",room:"LH-301",type:"lecture",startH:9,startM:0,endH:10,endM:0},{time:"11:00",end:"13:00",subject:"DBMS Lab",room:"LAB-4",type:"lab",startH:11,startM:0,endH:13,endM:0},{time:"14:00",end:"15:00",subject:"Probability & Optimization",room:"LH-102",type:"lecture",startH:14,startM:0,endH:15,endM:0}],
  Wednesday:[{time:"08:00",end:"09:00",subject:"Database Systems",room:"LH-204",type:"lecture",startH:8,startM:0,endH:9,endM:0},{time:"09:15",end:"10:15",subject:"Design & Analysis of Algo",room:"LH-102",type:"lecture",startH:9,startM:15,endH:10,endM:15},{time:"10:30",end:"11:30",subject:"Intro to AI",room:"LH-205",type:"lecture",startH:10,startM:30,endH:11,endM:30},{time:"14:00",end:"15:00",subject:"Operating Systems",room:"LH-301",type:"lecture",startH:14,startM:0,endH:15,endM:0}],
  Thursday: [{time:"08:00",end:"09:00",subject:"Probability & Optimization",room:"LH-301",type:"lecture",startH:8,startM:0,endH:9,endM:0},{time:"10:00",end:"12:00",subject:"Algorithms Lab",room:"CC-3",type:"lab",startH:10,startM:0,endH:12,endM:0},{time:"13:00",end:"14:00",subject:"Database Systems",room:"LH-204",type:"lecture",startH:13,startM:0,endH:14,endM:0},{time:"14:00",end:"15:00",subject:"Intro to AI",room:"LH-205",type:"lecture",startH:14,startM:0,endH:15,endM:0}],
  Friday:   [{time:"08:00",end:"09:00",subject:"Design & Analysis of Algo",room:"LH-102",type:"lecture",startH:8,startM:0,endH:9,endM:0},{time:"09:00",end:"10:00",subject:"Operating Systems",room:"LH-301",type:"lecture",startH:9,startM:0,endH:10,endM:0},{time:"10:15",end:"11:15",subject:"Intro to AI",room:"LH-205",type:"lecture",startH:10,startM:15,endH:11,endM:15}],
  Saturday: [{time:"08:00",end:"09:00",subject:"Database Systems",room:"LH-204",type:"lecture",startH:8,startM:0,endH:9,endM:0},{time:"09:00",end:"10:00",subject:"Probability & Optimization",room:"LH-102",type:"lecture",startH:9,startM:0,endH:10,endM:0}],
  Sunday:   [],
};
const ATTENDANCE = [
  {code:"MAT 2201",name:"Probability & Optimization",attended:38,total:45,percent:84,missed:[{date:"2026-02-03",reason:"Medical leave"},{date:"2026-02-14",reason:"Not marked"},{date:"2026-02-21",reason:"Late arrival"},{date:"2026-03-01",reason:"Not marked"}]},
  {code:"CSS 2201",name:"Database Systems",attended:29,total:42,percent:69,missed:[{date:"2026-01-20",reason:"Medical leave"},{date:"2026-01-27",reason:"Not marked"},{date:"2026-02-03",reason:"Not marked"},{date:"2026-02-10",reason:"Personal"},{date:"2026-02-17",reason:"Not marked"},{date:"2026-02-24",reason:"Late arrival"},{date:"2026-03-02",reason:"Not marked"},{date:"2026-03-03",reason:"Not marked"},{date:"2026-03-04",reason:"Personal"}]},
  {code:"CSS 2202",name:"Design & Analysis of Algorithms",attended:40,total:44,percent:91,missed:[{date:"2026-02-10",reason:"Not marked"},{date:"2026-02-28",reason:"Medical leave"}]},
  {code:"CSS 2203",name:"Introduction to Artificial Intelligence",attended:31,total:43,percent:72,missed:[{date:"2026-01-22",reason:"Not marked"},{date:"2026-02-05",reason:"Medical leave"},{date:"2026-02-12",reason:"Personal"},{date:"2026-02-19",reason:"Not marked"},{date:"2026-03-02",reason:"Not marked"}]},
  {code:"CSS 2204",name:"Operating Systems",attended:22,total:24,percent:92,missed:[{date:"2026-02-16",reason:"Medical leave"},{date:"2026-02-23",reason:"Not marked"}]},
];
const QUICK_PROMPTS = [
  {icon:FlaskConical, label:"Request a lab slot",     text:"I need to use the robotics lab tomorrow afternoon"},
  {icon:BarChart3,    label:"How's my attendance?",   text:"Show me my attendance for all subjects"},
  {icon:Bell,         label:"What's happening on campus?", text:"Show me the latest campus announcements"},
  {icon:FileText,     label:"Get a bonafide letter",  text:"I need a bonafide certificate for opening a bank account"},
  {icon:TrendingUp,   label:"Check my grades",        text:"What are my current grades and CGPA?"},
  {icon:BookOpen,     label:"When's my next exam?",   text:"Show me my upcoming exam schedule"},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDayName(offset=0){const d=new Date();d.setDate(d.getDate()+offset);return d.toLocaleDateString("en-IN",{weekday:"long"});}
function getClassStatus(sH:number,sM:number,eH:number,eM:number){const n=new Date();const nm=n.getHours()*60+n.getMinutes();const s=sH*60+sM;const e=eH*60+eM;return nm>e?"done":nm>=s?"current":"upcoming";}
function daysUntil(ds:string){const t=new Date();t.setHours(0,0,0,0);const g=new Date(ds);g.setHours(0,0,0,0);return Math.round((g.getTime()-t.getTime())/86400000);}
function copyText(t:string){navigator.clipboard.writeText(t).catch(()=>{});}

// ─── RAG Sources Panel ────────────────────────────────────────────────────────
function RagSources({sources}:{sources:RagSource[]}){
  const [open,setOpen]=useState(false);
  // Only show if we have sources with meaningful relevance
  const relevant = sources?.filter(s=>s.score>0.3)||[];
  if(relevant.length===0) return null;
  return(
    <div className="rag-panel">
      <button className="rag-toggle" onClick={()=>setOpen(p=>!p)}>
        📚 Answer based on {relevant.length} campus document{relevant.length>1?"s":""}
        <ChevronRight size={11} style={{transform:open?"rotate(90deg)":"none",transition:"transform 0.2s",marginLeft:4}}/>
      </button>
      {open&&(
        <div className="rag-sources">
          {relevant.map((src,i)=>(
            <div key={i} className="rag-source-item">
              <div className="rag-score">{Math.round(src.score*100)}%</div>
              <div className="rag-text">{src.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rich Tool Result Cards ────────────────────────────────────────────────────

function LabAccessCard({action}:{action:ToolAction}){
  const [confirmed,setConfirmed]=useState(false);
  const [cancelled,setCancelled]=useState(false);
  const [bookingAlt,setBookingAlt]=useState(false);
  const d=action.details;
  const isConflict = d.status==="conflict";

  // Format date nicely
  const dateStr = d.date ? (() => {
    try { return new Date(d.date).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"}); }
    catch { return d.date; }
  })() : "—";

  if(isConflict) return(
    <div className="tool-card tool-card-enter" style={{borderColor:"rgba(245,158,11,0.3)"}}>
      <div className="tool-card-header" style={{color:"#f59e0b"}}>
        <FlaskConical size={13}/>
        <span>SLOT NOT AVAILABLE</span>
        <span className="badge badge-warn">Conflict</span>
      </div>
      <div style={{fontSize:14,color:"rgba(255,255,255,0.8)",marginBottom:4}}>
        <strong>{d.lab_name}</strong>
      </div>
      <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:10}}>
        The {d.slot} slot on {dateStr} is already booked.
      </div>
      {d.alt_slot && !bookingAlt && !confirmed && (
        <div>
          <div style={{fontSize:12,color:"#f59e0b",marginBottom:10,padding:"8px 10px",background:"rgba(245,158,11,0.08)",borderRadius:8}}>
            💡 The <strong>{d.alt_slot}</strong> slot is free — want to book that instead?
          </div>
          <div className="tool-card-actions">
            <button className="tc-btn tc-confirm" onClick={()=>setBookingAlt(true)}>
              Yes, book {d.alt_slot} slot
            </button>
            <button className="tc-btn tc-cancel" onClick={()=>setCancelled(true)}>No thanks</button>
          </div>
        </div>
      )}
      {bookingAlt && !confirmed && (
        <div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginBottom:10}}>
            Switching to <strong>{d.alt_slot}</strong> slot on {dateStr}. Confirm?
          </div>
          <div className="tool-card-actions">
            <button className="tc-btn tc-confirm" onClick={()=>setConfirmed(true)}>Confirm request</button>
            <button className="tc-btn tc-cancel" onClick={()=>{setBookingAlt(false);}}>Go back</button>
          </div>
        </div>
      )}
      {confirmed && <div style={{fontSize:13,color:"#10b981"}}>✅ Request sent for the {d.alt_slot} slot!</div>}
      {cancelled && <div style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>Okay, no booking made.</div>}
    </div>
  );

  return(
    <div className="tool-card tool-card-enter">
      <div className="tool-card-header">
        <FlaskConical size={13}/>
        <span>LAB ACCESS REQUEST</span>
        {!confirmed&&!cancelled&&<span className="badge badge-warn">Confirm to send</span>}
        {confirmed&&<span className="badge badge-ok">✓ Request sent</span>}
        {cancelled&&<span className="badge badge-err">Cancelled</span>}
      </div>
      {!confirmed&&!cancelled&&(
        <>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:17,fontWeight:700,color:"#fff",marginBottom:4}}>{d.lab_name}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>
              {dateStr} · {d.slot ? d.slot.charAt(0).toUpperCase()+d.slot.slice(1) : "—"} slot
            </div>
            {d.purpose&&d.purpose!=="—"&&<div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:4}}>For: {d.purpose}</div>}
            {d.booking_id&&<div style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:4,fontFamily:"'DM Mono',monospace"}}>{d.booking_id}</div>}
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:12,padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:8}}>
            📋 Faculty approval required. You'll be notified once it's confirmed.
          </div>
          <div className="tool-card-actions">
            <button className="tc-btn tc-confirm" onClick={()=>setConfirmed(true)}>Yes, send request</button>
            <button className="tc-btn tc-cancel"  onClick={()=>setCancelled(true)}>Not now</button>
          </div>
        </>
      )}
      {confirmed&&(
        <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",lineHeight:1.6}}>
          ✅ Your request for <strong>{d.lab_name}</strong> has been sent to faculty. You'll be notified when it's approved!
        </div>
      )}
      {cancelled&&(
        <div style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>No problem — request cancelled.</div>
      )}
    </div>
  );
}

function GrievanceCard({action}:{action:ToolAction}){
  const d=action.details;
  return(
    <div className="tool-card tool-card-enter" style={{borderColor:"rgba(59,130,246,0.3)"}}>
      <div className="tool-card-header" style={{color:"#60a5fa"}}>
        <FileText size={13}/>
        <span>COMPLAINT SUBMITTED</span>
        <span className="badge" style={{color:"#10b981",background:"rgba(16,185,129,0.1)"}}>Received</span>
      </div>
      <div style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:4}}>{d.subject}</div>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:10}}>
        Category: {d.category} · Priority: {d.urgency}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:8}}>
        <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Ticket ID</span>
        <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#60a5fa"}}>{d.ticket_id}</span>
      </div>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:8}}>⏱ Expected response in {d.expected_response}</div>
    </div>
  );
}

function DocumentCard({action}:{action:ToolAction}){
  const d=action.details;
  return(
    <div className="tool-card tool-card-enter" style={{borderColor:"rgba(16,185,129,0.3)"}}>
      <div className="tool-card-header" style={{color:"#10b981"}}>
        <FileText size={13}/>
        <span>DOCUMENT REQUEST</span>
        <span className="badge badge-ok">Processing</span>
      </div>
      <div style={{fontSize:14,fontWeight:600,color:"#fff",marginBottom:4}}>{d.document_type}</div>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:10}}>For: {d.purpose}</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:8}}>
        <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Request ID</span>
        <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#10b981"}}>{d.request_id}</span>
      </div>
      <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:8}}>📄 Ready in {d.ready_in}. Collect from the admin office.</div>
    </div>
  );
}

function ToolCallCard({action}:{action:ToolAction}){
  const t=action.type;
  if(t==="tool_interaction"||t==="lab_availability") return <LabAccessCard action={action}/>;
  if(t==="grievance_submitted")                      return <GrievanceCard action={action}/>;
  if(t==="document_request")                         return <DocumentCard action={action}/>;
  return null;
}

// ─── Message Actions Bar ──────────────────────────────────────────────────────
function MessageActions({content,onRegenerate}:{content:string;onRegenerate:()=>void}){
  const [copied,setCopied]=useState(false);
  return(
    <div className="msg-actions">
      <button className="msg-action-btn" onClick={()=>{copyText(content);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>
        {copied?<Check size={12}/>:<Copy size={12}/>}{copied?"Copied!":"Copy"}
      </button>
      <button className="msg-action-btn" onClick={onRegenerate}>
        <RotateCcw size={12}/>Try again
      </button>
    </div>
  );
}

// ─── AI Spinner ───────────────────────────────────────────────────────────────
function AISpinner(){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"rgba(124,58,237,0.05)",border:"1px solid rgba(124,58,237,0.12)",borderRadius:12,width:"fit-content"}}>
      <div style={{width:16,height:16,border:"2px solid rgba(124,58,237,0.3)",borderTopColor:"#a78bfa",borderRadius:"50%",animation:"spin 0.7s linear infinite",flexShrink:0}}/>
      <span style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>Thinking…</span>
    </div>
  );
}

// ─── Command Palette ──────────────────────────────────────────────────────────
function CommandPalette({threads,onSelect,onNew,onClose}:{threads:Thread[];onSelect:(id:string)=>void;onNew:()=>void;onClose:()=>void}){
  const [q,setQ]=useState("");
  const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  const filtered=threads.filter(t=>t.title.toLowerCase().includes(q.toLowerCase())).slice(0,8);
  const CMDS=[
    {key:"new",    label:"Start a new chat",         icon:Plus,        action:()=>{onNew();onClose();}},
    {key:"attn",   label:"How's my attendance?",     icon:BarChart3,   action:()=>{onClose();}},
    {key:"lab",    label:"Request a lab slot",        icon:FlaskConical,action:()=>{onClose();}},
    {key:"notices",label:"What's happening on campus?",icon:Bell,      action:()=>{onClose();}},
  ];
  return(
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-box" onClick={e=>e.stopPropagation()}>
        <div className="palette-input-wrap">
          <Search size={15} style={{color:"rgba(255,255,255,0.3)",flexShrink:0}}/>
          <input ref={ref} className="palette-input" placeholder="Search chats, run commands…" value={q} onChange={e=>setQ(e.target.value)}/>
          <span className="palette-esc" onClick={onClose}>ESC</span>
        </div>
        <div className="palette-results">
          {q===""&&(
            <>
              <div className="palette-section">Commands</div>
              {CMDS.map(c=>(
                <button key={c.key} className="palette-item" onClick={c.action}>
                  <c.icon size={13} style={{opacity:0.6}}/> {c.label}
                </button>
              ))}
              {filtered.length>0&&<div className="palette-section">Recent Chats</div>}
            </>
          )}
          {filtered.map(t=>(
            <button key={t.thread_id} className="palette-item" onClick={()=>{onSelect(t.thread_id);onClose();}}>
              <MessageSquare size={13} style={{opacity:0.5}}/> {t.title}
            </button>
          ))}
          {q!==""&&filtered.length===0&&<div className="palette-empty">No results for "{q}"</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Attendance Ring ──────────────────────────────────────────────────────────
function AttendanceRing({percent,size=40}:{percent:number;size?:number}){
  const r=(size-8)/2;const circ=2*Math.PI*r;const fill=(percent/100)*circ;
  const color=percent>=75?"#10b981":percent>=65?"#f59e0b":"#ef4444";
  return(<svg width={size} height={size} style={{transform:"rotate(-90deg)",flexShrink:0}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"/></svg>);
}

// ─── Attendance Detail ────────────────────────────────────────────────────────
function AttendanceDetail({subject,onBack}:{subject:typeof ATTENDANCE[0];onBack:()=>void}){
  const color=subject.percent>=75?"#10b981":subject.percent>=65?"#f59e0b":"#ef4444";
  const months:Record<string,typeof subject.missed>={};
  subject.missed.forEach(m=>{const mo=new Date(m.date).toLocaleDateString("en-IN",{month:"long",year:"numeric"});if(!months[mo])months[mo]=[];months[mo].push(m);});
  return(
    <div className="detail-page">
      <button className="detail-back" onClick={onBack}><ArrowLeft size={14}/> Back</button>
      <div className="detail-hero">
        <div className="detail-code">{subject.code}</div>
        <div className="detail-name">{subject.name}</div>
        <div className="detail-pct" style={{color}}>{subject.percent}%</div>
        <div className="detail-bar-wrap">
          <div className="detail-bar-bg"><div className="detail-bar-fill" style={{width:`${subject.percent}%`,background:color}}/><div className="detail-75-marker"/></div>
          <div className="detail-75-label">75%</div>
        </div>
        <div className="detail-stats-row">
          {[["Attended",subject.attended],["Missed",subject.total-subject.attended],["Total",subject.total]].map(([l,v])=>(
            <div key={l} className="detail-stat"><span className="ds-val">{v}</span><span className="ds-label">{l}</span></div>
          ))}
        </div>
      </div>
      <div className="detail-section-title">Missed Classes</div>
      {Object.entries(months).map(([month,missed])=>(
        <div key={month} className="detail-month-group">
          <div className="detail-month-label">{month}</div>
          {missed.map((m,i)=>(
            <div key={i} className="detail-missed-row">
              <div className="dmr-dot"/>
              <div className="dmr-date">{new Date(m.date).toLocaleDateString("en-IN",{day:"numeric",weekday:"short",month:"short"})}</div>
              <div className="dmr-reason">{m.reason}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Timetable Popup ──────────────────────────────────────────────────────────
function TimetablePopup({day,onClose,onAsk}:{day:string;onClose:()=>void;onAsk:(q:string)=>void}){
  const classes=TIMETABLE[day]||[];const isToday=day===getDayName(0);
  return(
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-box" onClick={e=>e.stopPropagation()}>
        <div className="popup-header"><div><div className="popup-title">{day}'s Schedule</div><div className="popup-sub">{isToday?"Today":"Tomorrow"} · {classes.length} classes</div></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
        {classes.length===0?<div className="popup-empty">No classes 🎉</div>:(
          <div className="popup-timeline">{classes.map((cls,i)=>{
            const status=isToday?getClassStatus(cls.startH,cls.startM,cls.endH,cls.endM):"upcoming";
            return(<div key={i} className="ptl-row"><div className="ptl-time"><span className="ptl-start">{cls.time}</span><span className="ptl-end">{cls.end}</span></div><div className="ptl-dot-col"><div className={`ptl-dot ${status}`}/>{i<classes.length-1&&<div className="ptl-line"/>}</div><div className={`ptl-card ${status}`}><div className="ptl-subject">{cls.subject}</div><div className="ptl-meta">{cls.room}<span className={`ptl-type ${cls.type}`}>{cls.type}</span>{status==="current"&&<span className="ptl-now">● NOW</span>}{status==="done"&&<span className="ptl-done">Done</span>}</div></div></div>);
          })}</div>
        )}
        <div className="popup-footer"><button className="popup-ask-btn" onClick={()=>{onAsk("Show my full week timetable");onClose();}}>Ask AI for full week →</button></div>
      </div>
    </div>
  );
}

// ─── Dashboard Panel ──────────────────────────────────────────────────────────
function DashboardPanel({onClose,onAsk,student}:{onClose:()=>void;onAsk:(q:string)=>void;student:typeof STUDENT_FALLBACK}){
  const [activeTab,setActiveTab]=useState<"schedule"|"attendance"|"exams">("schedule");
  const [timetableDay,setTimetableDay]=useState<string|null>(null);
  const [attDetail,setAttDetail]=useState<typeof ATTENDANCE[0]|null>(null);
  const now=new Date();
  const todayName=getDayName(0),tomorrowName=getDayName(1);
  const todayClasses=TIMETABLE[todayName]||[],tomorrowClasses=TIMETABLE[tomorrowName]||[];
  const overallPct=Math.round(ATTENDANCE.reduce((s,a)=>s+a.percent,0)/ATTENDANCE.length);
  const atRisk=ATTENDANCE.filter(a=>a.percent<75).length;
  const examsWithDays=EXAM_SCHEDULE_RAW.map(e=>({...e,daysLeft:daysUntil(e.date)})).filter(e=>e.daysLeft>=0);
  const nextExam=examsWithDays[0];
  let activeClass=todayClasses.find(c=>getClassStatus(c.startH,c.startM,c.endH,c.endM)==="current");
  if(!activeClass) activeClass=todayClasses.find(c=>getClassStatus(c.startH,c.startM,c.endH,c.endM)==="upcoming");
  // Student-first insights
  const atRiskNames=ATTENDANCE.filter(a=>a.percent<75).map(a=>a.name.split(" ")[0]);
  const insights=[
    atRisk>0
      ? `⚠️ ${atRiskNames.join(", ")} attendance needs attention`
      : "✅ All your subjects are on track",
    nextExam
      ? `📅 ${nextExam.code} in ${nextExam.daysLeft} day${nextExam.daysLeft===1?"":"s"} — time to start prepping!`
      : "🎉 No upcoming exams — enjoy the break!",
    ATTENDANCE.find(a=>a.name.includes("Database")&&a.percent<75)
      ? "💡 Attend your next 3 DBMS classes to get back to 75%"
      : "",
  ].filter(Boolean);

  if(attDetail&&activeTab==="attendance") return(
    <aside className="dash-panel"><div className="dash-header"><button className="icon-btn" onClick={()=>setAttDetail(null)} style={{marginRight:8}}><ArrowLeft size={16}/></button><span style={{fontSize:13,fontWeight:600,color:"#fff"}}>Attendance Detail</span><button className="icon-btn" onClick={onClose} style={{marginLeft:"auto"}}><PanelRightClose size={17}/></button></div><div style={{flex:1,overflowY:"auto",padding:"0 14px 20px"}}><AttendanceDetail subject={attDetail} onBack={()=>setAttDetail(null)}/></div></aside>
  );

  return(
    <>
      {timetableDay&&<TimetablePopup day={timetableDay} onClose={()=>setTimetableDay(null)} onAsk={onAsk}/>}
      <aside className="dash-panel">
        <div className="dash-header">
          <div><div className="dash-greeting">Hi, {student.name.split(" ")[0]} 👋</div><div className="dash-time">{now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} · {now.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</div></div>
          <button className="icon-btn" onClick={onClose}><PanelRightClose size={17}/></button>
        </div>
        <div className="student-strip">
          <div className="student-avatar">{student.initials}</div>
          <div className="student-info"><div className="student-name">{student.name}</div><div className="student-meta">{student.id} · {student.branch} · Sem {student.semester}</div></div>
          <div className="student-cgpa"><div className="cgpa-val">{student.cgpa}</div><div className="cgpa-label">CGPA</div></div>
        </div>
        {/* AI Insights */}
        <div className="insights-strip">
          {insights.map((ins,i)=><div key={i} className="insight-item">{ins}</div>)}
        </div>
        <div className="stat-cards">
          <div className={`stat-card ${overallPct<75?"stat-danger":"stat-ok"}`}><div className="stat-icon"><BarChart3 size={13}/></div><div className="stat-val">{overallPct}%</div><div className="stat-label">Attendance</div><div className="stat-sub">{atRisk>0?`${atRisk} at risk`:"All safe"}</div></div>
          <div className={`stat-card ${!nextExam?"stat-ok":nextExam.daysLeft<=3?"stat-danger":nextExam.daysLeft<=7?"stat-warn-card":"stat-ok"}`}><div className="stat-icon"><BookOpen size={13}/></div><div className="stat-val">{nextExam?`${nextExam.daysLeft}d`:"Done"}</div><div className="stat-label">Next exam</div><div className="stat-sub">{nextExam?nextExam.code:"No upcoming"}</div></div>
          <div className="stat-card stat-info"><div className="stat-icon"><Clock size={13}/></div><div className="stat-val">{activeClass?activeClass.time:"—"}</div><div className="stat-label">{activeClass?(getClassStatus(activeClass.startH,activeClass.startM,activeClass.endH,activeClass.endM)==="current"?"In class":"Next class"):"Free now"}</div><div className="stat-sub" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeClass?activeClass.room:"No more today"}</div></div>
        </div>
        <div className="dash-tabs">
          {(["schedule","attendance","exams"] as const).map(t=>(
            <button key={t} className={`dash-tab ${activeTab===t?"active":""}`} onClick={()=>setActiveTab(t)}>
              {t==="schedule"?"Schedule":t==="attendance"?"Attendance":"Exams"}
            </button>
          ))}
        </div>
        <div className="dash-body">
          {activeTab==="schedule"&&(
            <div className="sched-wrap">
              <div className="sched-day-header"><span className="sched-day-label">Today · {todayName}</span><button className="sched-expand-btn" onClick={()=>setTimetableDay(todayName)}><Eye size={12}/> Expand</button></div>
              {todayClasses.length===0?<div className="sched-empty">No classes today 🎉</div>:todayClasses.map((cls,i)=>{const status=getClassStatus(cls.startH,cls.startM,cls.endH,cls.endM);return(<div key={i} className={`sched-row ${status}`}><div className="sched-time-col"><span className="sched-time">{cls.time}</span></div><div className={`sched-bar ${status}`}/><div className="sched-info"><div className="sched-subj">{cls.subject}</div><div className="sched-meta">{cls.room} · <span className={`sched-type ${cls.type}`}>{cls.type}</span>{status==="current"&&<span className="sched-now">NOW</span>}</div></div></div>);})}
              <div className="sched-day-header" style={{marginTop:16}}><span className="sched-day-label">Tomorrow · {tomorrowName}</span><button className="sched-expand-btn" onClick={()=>setTimetableDay(tomorrowName)}><Eye size={12}/> Expand</button></div>
              {tomorrowClasses.length===0?<div className="sched-empty">No classes tomorrow 🎉</div>:tomorrowClasses.slice(0,3).map((cls,i)=>(<div key={i} className="sched-row upcoming"><div className="sched-time-col"><span className="sched-time">{cls.time}</span></div><div className="sched-bar upcoming"/><div className="sched-info"><div className="sched-subj">{cls.subject}</div><div className="sched-meta">{cls.room} · <span className={`sched-type ${cls.type}`}>{cls.type}</span></div></div></div>))}
              {tomorrowClasses.length>3&&<button className="sched-more-btn" onClick={()=>setTimetableDay(tomorrowName)}>+{tomorrowClasses.length-3} more →</button>}
            </div>
          )}
          {activeTab==="attendance"&&(
            <div className="att-wrap">
              {ATTENDANCE.map((sub,i)=>{
                const color=sub.percent>=75?"#10b981":sub.percent>=65?"#f59e0b":"#ef4444";
                const label=sub.percent>=75?"Safe":sub.percent>=65?"At risk":"Danger";
                return(
                  <div key={i} className="att-card" onClick={()=>setAttDetail(sub)}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sub.name}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:2}}>{sub.code} · {sub.attended} of {sub.total} classes</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                        <div style={{fontFamily:"'Outfit',sans-serif",fontSize:20,fontWeight:700,color,lineHeight:1}}>{sub.percent}%</div>
                        <div style={{fontSize:10,color,marginTop:2}}>{label}</div>
                      </div>
                    </div>
                    <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:4,position:"relative",overflow:"visible"}}>
                      <div style={{height:"100%",width:`${sub.percent}%`,background:color,borderRadius:4,transition:"width 0.6s ease"}}/>
                      <div style={{position:"absolute",top:-3,left:"75%",width:2,height:10,background:"rgba(255,255,255,0.3)"}}/>
                    </div>
                  </div>
                );
              })}
              <button className="dash-ask-btn" onClick={()=>onAsk("Analyse my full attendance and give me a recovery plan")}>How do I improve my attendance? →</button>
            </div>
          )}
          {activeTab==="exams"&&(
            <div className="exam-wrap">
              <div className="exam-header-note">IV Sem Midterm · March 2026 · 8:30–10:00 AM</div>
              {examsWithDays.map((ex,i)=>{
                const urgent=ex.daysLeft<=2,soon=ex.daysLeft<=5;
                const accentColor=urgent?"#ef4444":soon?"#f59e0b":"#10b981";
                return(<div key={i} className="exam-card" style={{borderLeftColor:accentColor}}>
                  <div className="exam-left"><div className="exam-countdown" style={{color:accentColor}}>{ex.daysLeft===0?"TODAY":ex.daysLeft===1?"TMR":`${ex.daysLeft}d`}</div><div className="exam-day">{ex.day}</div></div>
                  <div className="exam-mid"><div className="exam-subj">{ex.subject}</div><div className="exam-code">{ex.code}</div><div className="exam-date">{new Date(ex.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})} · {ex.time}</div></div>
                  {urgent&&<div className="exam-alert-dot"/>}
                </div>);
              })}
              <button className="dash-ask-btn" onClick={()=>onAsk("Create a study schedule for my upcoming midsem exams")}>Help me make a study plan →</button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Streaming hook ───────────────────────────────────────────────────────────
function useStreamingChat(){
  const sendMessage=useCallback(async(
    message:string,
    userId:string,
    history:{role:string;content:string}[],
    onToken:(t:string)=>void,
    onSources:(s:RagSource[])=>void,
    onAction:(a:ToolAction)=>void,
    onDone:(full:string)=>void,
    onError:(e:string)=>void,
  )=>{
    // Word buffer — we collect tokens and flush whole words for a ChatGPT-like feel
    let wordBuffer = "";
    const flushWord = async (force=false) => {
      if(!wordBuffer) return;
      // Flush on space/newline boundary or when forced
      if(force || /[\s\n]/.test(wordBuffer.slice(-1))){
        onToken(wordBuffer);
        wordBuffer = "";
        await new Promise(r=>setTimeout(r,22)); // ~22ms per word = natural pace
      }
    };

    try{
      const res=await fetch("http://localhost:8000/api/chat/stream",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message,user_id:userId,history,role:"student"}),
      });
      if(!res.body) throw new Error("No stream body");
      const reader=res.body.getReader();const decoder=new TextDecoder();
      let buffer="";
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
              if(event==="rag")    onSources(data.sources||[]);
              else if(event==="token"){
                wordBuffer += (data.text||"");
                await flushWord();
              }
              else if(event==="action") onAction(data);
              else if(event==="done"){
                await flushWord(true); // flush any remaining buffer
                onDone(data.full_text||"");
              }
              else if(event==="error")  onError(data.message||"Error");
            }catch{}
            event="";dataStr="";
          }
        }
      }
      await flushWord(true);
    }catch(e){onError("Connection failed. Is the backend running?");}
  },[]);
  return {sendMessage};
}

// ─── Full Dashboard View (occupies main content area) ────────────────────────
function FullDashboard({student,onClose,onAsk}:{student:typeof STUDENT_FALLBACK;onClose:()=>void;onAsk:(q:string)=>void}){
  const [attDetail,setAttDetail]=useState<typeof ATTENDANCE[0]|null>(null);
  const [timetableDay,setTimetableDay]=useState<string|null>(null);
  const now=new Date();
  const todayName=getDayName(0),tomorrowName=getDayName(1);
  const todayClasses=TIMETABLE[todayName]||[];
  const tomorrowClasses=TIMETABLE[tomorrowName]||[];
  const overallPct=Math.round(ATTENDANCE.reduce((s,a)=>s+a.percent,0)/ATTENDANCE.length);
  const atRisk=ATTENDANCE.filter(a=>a.percent<75).length;
  const examsWithDays=EXAM_SCHEDULE_RAW.map(e=>({...e,daysLeft:daysUntil(e.date)})).filter(e=>e.daysLeft>=0);
  const nextExam=examsWithDays[0];
  let activeClass=todayClasses.find(c=>getClassStatus(c.startH,c.startM,c.endH,c.endM)==="current");
  if(!activeClass) activeClass=todayClasses.find(c=>getClassStatus(c.startH,c.startM,c.endH,c.endM)==="upcoming");

  if(attDetail) return(
    <div className="fd-wrap">
      <div className="fd-header">
        <button className="fd-back" onClick={()=>setAttDetail(null)}><ArrowLeft size={15}/> Back to dashboard</button>
      </div>
      <div className="fd-scroll">
        <AttendanceDetail subject={attDetail} onBack={()=>setAttDetail(null)}/>
      </div>
    </div>
  );

  if(timetableDay) return(
    <div className="fd-wrap">
      <TimetablePopup day={timetableDay} onClose={()=>setTimetableDay(null)} onAsk={q=>{onAsk(q);onClose();}}/>
    </div>
  );

  return(
    <div className="fd-wrap">
      {/* Header */}
      <div className="fd-header">
        <div>
          <div className="fd-title">Dashboard</div>
          <div className="fd-sub">{now.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
        <button className="fd-close-btn" onClick={onClose}>
          <ArrowLeft size={15}/> Back to chat
        </button>
      </div>

      <div className="fd-scroll">
        {/* Student card */}
        <div className="fd-student-card">
          <div className="fd-avatar">{student.initials}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>{student.name}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginTop:2}}>{student.id} · {student.branch} · Semester {student.semester}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontSize:28,fontWeight:700,color:"#10b981",lineHeight:1}}>{student.cgpa}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>CGPA</div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="fd-stats-grid">
          <div className={`fd-stat ${overallPct<75?"fd-stat-danger":"fd-stat-ok"}`}>
            <div className="fd-stat-val">{overallPct}%</div>
            <div className="fd-stat-label">Overall attendance</div>
            <div className="fd-stat-note">{atRisk>0?`${atRisk} subject${atRisk>1?"s":""} need attention`:"All on track ✅"}</div>
          </div>
          <div className={`fd-stat ${!nextExam?"fd-stat-ok":nextExam.daysLeft<=3?"fd-stat-danger":nextExam.daysLeft<=7?"fd-stat-warn":"fd-stat-ok"}`}>
            <div className="fd-stat-val">{nextExam?`${nextExam.daysLeft}d`:"All done"}</div>
            <div className="fd-stat-label">Next exam</div>
            <div className="fd-stat-note">{nextExam?`${nextExam.code} · ${new Date(nextExam.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`:"No upcoming exams 🎉"}</div>
          </div>
          <div className="fd-stat fd-stat-ok">
            <div className="fd-stat-val">{activeClass?activeClass.time:"Free"}</div>
            <div className="fd-stat-label">{activeClass?(getClassStatus(activeClass.startH,activeClass.startM,activeClass.endH,activeClass.endM)==="current"?"Currently in class":"Next class"):"Right now"}</div>
            <div className="fd-stat-note">{activeClass?`${activeClass.room} · ${activeClass.type}`:"No more classes today"}</div>
          </div>
        </div>

        {/* Insights */}
        <div className="fd-section">
          <div className="fd-section-title">Your summary</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {ATTENDANCE.filter(a=>a.percent<75).map((a,i)=>(
              <div key={i} className="fd-alert fd-alert-warn">
                <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>⚠️ {a.name}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,0.55)"}}>You're at {a.percent}% — need to attend {Math.ceil((0.75*a.total-a.attended)/0.25)} more classes to reach 75%</div>
              </div>
            ))}
            {nextExam&&nextExam.daysLeft<=5&&(
              <div className="fd-alert fd-alert-exam">
                <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>📅 {nextExam.subject}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,0.55)"}}>Coming up in {nextExam.daysLeft} day{nextExam.daysLeft===1?"":"s"} — {nextExam.code} · {nextExam.time}</div>
              </div>
            )}
            {ATTENDANCE.filter(a=>a.percent>=75).map((a,i)=>(
              <div key={i} className="fd-alert fd-alert-ok">
                <div style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>✅ {a.name} — {a.percent}% ({a.attended}/{a.total})</div>
              </div>
            ))}
          </div>
        </div>

        <div className="fd-two-col">
          {/* Today's schedule */}
          <div className="fd-section">
            <div className="fd-section-title-row">
              <div className="fd-section-title">Today · {todayName}</div>
              <button className="fd-expand-btn" onClick={()=>setTimetableDay(todayName)}>View timeline →</button>
            </div>
            {todayClasses.length===0?<div className="fd-empty">No classes today 🎉</div>:todayClasses.map((cls,i)=>{
              const status=getClassStatus(cls.startH,cls.startM,cls.endH,cls.endM);
              return(
                <div key={i} className={`fd-class-row ${status}`}>
                  <div className="fd-class-time">{cls.time}</div>
                  <div style={{flex:1}}>
                    <div className="fd-class-name">{cls.subject}</div>
                    <div className="fd-class-meta">{cls.room} · <span style={{color:cls.type==="lab"?"#60a5fa":"rgba(255,255,255,0.3)"}}>{cls.type}</span>{status==="current"&&<span className="fd-now-badge">LIVE NOW</span>}</div>
                  </div>
                  {status==="done"&&<div style={{fontSize:11,color:"rgba(255,255,255,0.2)"}}>Done</div>}
                </div>
              );
            })}
          </div>

          {/* Upcoming exams */}
          <div className="fd-section">
            <div className="fd-section-title">Upcoming exams</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.25)",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.06em"}}>IV Sem Midterm · 8:30–10:00 AM</div>
            {examsWithDays.length===0?<div className="fd-empty">No upcoming exams 🎉</div>:examsWithDays.map((ex,i)=>{
              const urgent=ex.daysLeft<=2,soon=ex.daysLeft<=5;
              const color=urgent?"#ef4444":soon?"#f59e0b":"#10b981";
              return(
                <div key={i} className="fd-exam-row" style={{borderLeftColor:color}}>
                  <div style={{fontFamily:"'Outfit',sans-serif",fontSize:22,fontWeight:700,color,minWidth:48,textAlign:"center"}}>
                    {ex.daysLeft===0?"TODAY":ex.daysLeft===1?"TMR":`${ex.daysLeft}d`}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{ex.subject}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:2}}>{ex.code} · {new Date(ex.date).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</div>
                  </div>
                  {urgent&&<div style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",animation:"blink 1.2s ease infinite",flexShrink:0}}/>}
                </div>
              );
            })}
            <button className="fd-ai-btn" onClick={()=>{onAsk("Help me make a study plan for my upcoming exams");onClose();}}>Help me make a study plan →</button>
          </div>
        </div>

        {/* Attendance detail */}
        <div className="fd-section">
          <div className="fd-section-title-row">
            <div className="fd-section-title">Attendance</div>
            <button className="fd-ai-btn-inline" onClick={()=>{onAsk("How do I improve my attendance?");onClose();}}>Ask for tips →</button>
          </div>
          <div className="fd-att-grid">
            {ATTENDANCE.map((sub,i)=>{
              const color=sub.percent>=75?"#10b981":sub.percent>=65?"#f59e0b":"#ef4444";
              return(
                <div key={i} className="fd-att-card" onClick={()=>setAttDetail(sub)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{sub.name}</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:2}}>{sub.code}</div>
                    </div>
                    <div style={{fontFamily:"'Outfit',sans-serif",fontSize:24,fontWeight:700,color}}>{sub.percent}%</div>
                  </div>
                  <div style={{height:5,background:"rgba(255,255,255,0.06)",borderRadius:4,position:"relative"}}>
                    <div style={{height:"100%",width:`${sub.percent}%`,background:color,borderRadius:4}}/>
                    <div style={{position:"absolute",top:-4,left:"75%",width:2,height:13,background:"rgba(255,255,255,0.25)"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:12,color:"rgba(255,255,255,0.4)"}}>
                    <span>{sub.attended}/{sub.total} classes</span>
                    <span style={{color}}>{sub.percent>=75?"On track":"Needs attention"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage(){
  const router=useRouter();
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [threads,        setThreads]        = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string|null>(null);
  const [input,          setInput]          = useState("");
  const [isTyping,       setIsTyping]       = useState(false);
  const [currentView,    setCurrentView]    = useState<"chat"|"settings"|"dashboard">("chat");
  const [isSidebarOpen,  setIsSidebarOpen]  = useState(true);
  const [isDashOpen,     setIsDashOpen]     = useState(true);
  const [deletingId,     setDeletingId]     = useState<string|null>(null);
  const [paletteOpen,    setPaletteOpen]    = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string|null>(null);
  const [STUDENT,        setStudent]        = useState(STUDENT_FALLBACK);
  const [authReady,      setAuthReady]      = useState(false);
  const messagesEndRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const userIdRef=useRef<string>(""); // always holds current userId, avoids stale closure
  const {sendMessage}=useStreamingChat();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    const email=sessionStorage.getItem("cc_email");
    const role =sessionStorage.getItem("cc_role");
    const name =sessionStorage.getItem("cc_name")||"";
    if(!email||!role){router.replace("/login");return;}
    if(role==="faculty"){router.replace("/teacher");return;}
    const id = email.split("@")[0];
    userIdRef.current = id;
    setStudent({...STUDENT_FALLBACK,id,name,
      initials:name.split(" ").filter(Boolean).map((n:string)=>n[0]).slice(0,2).join("").toUpperCase()});
    setAuthReady(true);
  },[router]);

  // ── Keyboard shortcut: ⌘K ──────────────────────────────────────────────────
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setPaletteOpen(p=>!p);}if(e.key==="Escape")setPaletteOpen(false);};
    window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
  },[]);

  // fetchThreads uses ref so it never has a stale userId
  const fetchThreads=useCallback(async()=>{
    const uid=userIdRef.current;
    if(!uid) return;
    const {data,error}=await supabase.from("messages")
      .select("thread_id,content,created_at")
      .eq("user_id",uid)
      .order("created_at",{ascending:false});
    if(error){console.error("fetchThreads error:",error);return;}
    if(data){
      const seen=new Set<string>();
      const threads:Thread[]=[];
      for(const m of data){
        if(!seen.has(m.thread_id)){
          seen.add(m.thread_id);
          // Use first user message in thread as title — fetch it separately
          threads.push({thread_id:m.thread_id,title:m.content.slice(0,32)+"…"});
        }
      }
      setThreads(threads);
    }
  },[]);

  useEffect(()=>{if(authReady)fetchThreads();},[fetchThreads,authReady]);

  // Load thread history — but NOT if we're currently streaming (would overwrite live content)
  useEffect(()=>{
    if(!activeThreadId||isTyping) return;
    supabase.from("messages").select("*")
      .eq("thread_id",activeThreadId)
      .order("created_at",{ascending:true})
      .then(({data})=>{ if(data && data.length > 0) setMessages(data); });
  },[activeThreadId]); // intentionally exclude isTyping to avoid re-run loop

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,isTyping]);

  const handleSend=async(text:string=input)=>{
    if(!text.trim()||isTyping) return;
    const userContent=text.trim();
    const isNewThread = !activeThreadId;
    const threadId=activeThreadId||crypto.randomUUID();
    // For new threads, we DON'T call setActiveThreadId yet — doing so triggers
    // the useEffect that re-fetches messages from Supabase, overwriting the stream.
    // We set it only after the full response is saved.

    const userMsg:Message={role:"user",content:userContent,thread_id:threadId};
    setMessages(p=>[...p,userMsg]);
    setInput(""); setIsTyping(true);

    const streamId="stream-"+Date.now();
    const streamMsg:Message={id:streamId,role:"assistant",content:"",thread_id:threadId};
    setMessages(p=>[...p,streamMsg]);
    setStreamingMsgId(streamId);

    await supabase.from("messages").insert([{user_id:STUDENT.id,content:userContent,role:"user",thread_id:threadId}]);

    const history=messages.slice(-6).map(m=>({role:m.role,content:m.content}));

    await sendMessage(
      userContent, STUDENT.id, history,
      (token)=>{
        setMessages(p=>p.map(m=>m.id===streamId?{...m,content:m.content+token}:m));
      },
      (sources)=>{ setMessages(p=>p.map(m=>m.id===streamId?{...m,sources}:m)); },
      (action)=>{ setMessages(p=>p.map(m=>m.id===streamId?{...m,action}:m)); },
      async(full)=>{
        // Save to Supabase first, THEN set activeThreadId (safe now — content is persisted)
        await supabase.from("messages").insert([{user_id:STUDENT.id,content:full,role:"assistant",thread_id:threadId}]);
        if(isNewThread) setActiveThreadId(threadId);
        fetchThreads();
      },
      (err)=>{ setMessages(p=>p.map(m=>m.id===streamId?{...m,content:err}:m)); }
    );
    setStreamingMsgId(null); setIsTyping(false);
  };

  const handleRegenerate=async(msgIndex:number)=>{
    const prevUserMsg=messages.slice(0,msgIndex).reverse().find(m=>m.role==="user");
    if(!prevUserMsg) return;
    setMessages(p=>p.slice(0,msgIndex));
    await handleSend(prevUserMsg.content);
  };

  const deleteThread=async(tid:string,e:React.MouseEvent)=>{
    e.stopPropagation();setDeletingId(tid);
    await supabase.from("messages").delete().eq("thread_id",tid).eq("user_id",STUDENT.id);
    setThreads(p=>p.filter(t=>t.thread_id!==tid));
    if(activeThreadId===tid){setActiveThreadId(null);setMessages([]);}
    setDeletingId(null);
  };
  const deleteAllChats=async()=>{
    if(!window.confirm(`Delete all chats for ${STUDENT.id}?`)) return;
    await supabase.from("messages").delete().eq("user_id",STUDENT.id);
    setThreads([]);setMessages([]);setActiveThreadId(null);
  };
  const startNewChat=()=>{setActiveThreadId(null);setMessages([]);inputRef.current?.focus();};
  const isChatEmpty=messages.length===0;

  if(!authReady) return null;

  return(
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:#7c3aed;color:#fff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px;}
        .root{font-family:'Outfit',sans-serif;background:#060608;color:#fff;height:100vh;display:flex;overflow:hidden;position:relative;}
        .root::before{content:'';position:fixed;top:-200px;left:-200px;width:600px;height:600px;background:radial-gradient(circle,rgba(124,58,237,0.06) 0%,transparent 70%);pointer-events:none;animation:drift 12s ease-in-out infinite alternate;}
        .root::after{content:'';position:fixed;bottom:-200px;right:100px;width:500px;height:500px;background:radial-gradient(circle,rgba(59,130,246,0.05) 0%,transparent 70%);pointer-events:none;animation:drift 15s ease-in-out infinite alternate-reverse;}
        @keyframes drift{0%{transform:translate(0,0)}100%{transform:translate(60px,40px)}}
        .sidebar{background:#0a0a0e;border-right:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;z-index:20;transition:width 0.3s cubic-bezier(0.4,0,0.2,1);overflow:hidden;white-space:nowrap;}
        .sidebar.open{width:252px;}.sidebar.closed{width:0;border:none;}
        .sidebar-inner{width:252px;height:100%;display:flex;flex-direction:column;}
        .sb-brand{padding:18px 18px 14px;display:flex;align-items:center;justify-content:space-between;}
        .sb-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:15px;color:#fff;letter-spacing:-0.02em;text-decoration:none;}
        .sb-logo span{color:#7c3aed;}
        .icon-btn{background:transparent;border:none;color:rgba(255,255,255,0.35);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:7px;transition:all 0.2s;}
        .icon-btn:hover{background:rgba(255,255,255,0.07);color:#fff;}
        .sb-palette-btn{margin:0 10px 4px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35);padding:8px 12px;border-radius:9px;display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;}
        .sb-palette-btn:hover{background:rgba(124,58,237,0.1);color:#a78bfa;border-color:rgba(124,58,237,0.2);}
        .sb-palette-kbd{margin-left:auto;font-size:10px;background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:4px;font-family:'DM Mono',monospace;}
        .sb-new-btn{margin:0 10px 8px;background:rgba(124,58,237,0.12);color:#c4b5fd;border:1px solid rgba(124,58,237,0.2);padding:10px 14px;border-radius:10px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;}
        .sb-new-btn:hover{background:rgba(124,58,237,0.2);color:#fff;}
        .sb-history{flex:1;overflow-y:auto;padding:0 8px;}
        .sb-section-label{font-size:10px;font-weight:600;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.08em;padding:10px 10px 5px;}
        .sb-thread{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;color:rgba(255,255,255,0.5);font-size:13px;cursor:pointer;transition:all 0.2s;margin-bottom:1px;}
        .sb-thread:hover{background:rgba(255,255,255,0.05);color:#fff;}.sb-thread:hover .sb-del{opacity:1;}
        .sb-thread.active{background:rgba(124,58,237,0.1);color:#c4b5fd;}
        .sb-thread-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .sb-del{opacity:0;transition:opacity 0.2s;background:transparent;border:none;color:rgba(255,100,100,0.6);cursor:pointer;display:flex;padding:2px;border-radius:4px;flex-shrink:0;}
        .sb-del:hover{color:#ef4444;background:rgba(239,68,68,0.1);}
        .sb-del.spinning{animation:spin 0.5s linear;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .sb-footer{padding:10px;border-top:1px solid rgba(255,255,255,0.05);}
        .sb-user-row{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background 0.2s;}
        .sb-user-row:hover{background:rgba(255,255,255,0.04);}
        .sb-avatar{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;}
        .sb-uname{font-size:13px;font-weight:500;color:#fff;overflow:hidden;text-overflow:ellipsis;}
        .sb-usub{font-size:11px;color:rgba(255,255,255,0.3);}
        .main{flex:1;display:flex;flex-direction:column;background:#060608;min-width:0;position:relative;}
        .topbar{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid rgba(255,255,255,0.04);flex-shrink:0;z-index:10;}
        .topbar-left{display:flex;align-items:center;gap:8px;}.topbar-right{display:flex;align-items:center;gap:6px;}
        .dash-toggle{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;font-weight:500;transition:all 0.2s;}
        .dash-toggle.on{background:rgba(124,58,237,0.12);color:#c4b5fd;}.dash-toggle.off{background:transparent;color:rgba(255,255,255,0.35);}
        .dash-toggle:hover{background:rgba(124,58,237,0.15);color:#c4b5fd;}
        .chat-scroll{flex:1;overflow-y:auto;padding:32px 16px 16px;display:flex;flex-direction:column;align-items:center;}
        .chat-inner{width:100%;max-width:700px;display:flex;flex-direction:column;gap:24px;padding-bottom:40px;}
        .msg-row{display:flex;gap:12px;width:100%;animation:msg-in 0.3s ease;position:relative;}
        @keyframes msg-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .msg-row.user{flex-direction:row-reverse;}
        .msg-avatar{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
        .msg-avatar.assistant{background:linear-gradient(135deg,#7c3aed,#3b82f6);}
        .msg-avatar.user{background:rgba(255,255,255,0.08);}
        .msg-body{display:flex;flex-direction:column;gap:6px;max-width:88%;}
        .bubble{font-size:14px;line-height:1.75;color:rgba(255,255,255,0.85);}
        .bubble p{margin-bottom:10px;}.bubble>*:last-child{margin-bottom:0;}.bubble>*:first-child{margin-top:0;}
        .bubble h1,.bubble h2,.bubble h3{margin:18px 0 8px;font-family:'Syne',sans-serif;font-weight:600;}
        .bubble ul,.bubble ol{margin-left:18px;margin-bottom:10px;}.bubble li{margin-bottom:4px;}
        .bubble table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px;}
        .bubble th,.bubble td{border:1px solid rgba(255,255,255,0.1);padding:6px 10px;text-align:left;}
        .bubble th{background:rgba(124,58,237,0.1);color:#a78bfa;}
        .bubble.user{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);padding:10px 14px;border-radius:14px;border-top-right-radius:4px;width:fit-content;align-self:flex-end;}
        .bubble table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;}
        .bubble th{background:rgba(124,58,237,0.12);color:#c4b5fd;font-weight:600;padding:8px 12px;text-align:left;border:1px solid rgba(124,58,237,0.2);font-size:12px;}
        .bubble td{padding:7px 12px;border:1px solid rgba(255,255,255,0.07);color:rgba(255,255,255,0.8);vertical-align:middle;}
        .bubble tr:nth-child(even) td{background:rgba(255,255,255,0.02);}
        .bubble.streaming::after{content:'▋';animation:cursor-blink 0.8s ease infinite;}
        @keyframes cursor-blink{0%,100%{opacity:1}50%{opacity:0}}
        /* RAG sources */
        .rag-panel{margin-top:4px;}
        .rag-toggle{display:flex;align-items:center;gap:5px;background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:10px;cursor:pointer;font-family:'Outfit',sans-serif;padding:0;transition:color 0.2s;}
        .rag-toggle:hover{color:rgba(255,255,255,0.6);}
        .rag-sources{margin-top:6px;display:flex;flex-direction:column;gap:4px;}
        .rag-source-item{display:flex;gap:8px;padding:7px 10px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.1);border-radius:8px;align-items:flex-start;}
        .rag-score{font-family:'DM Mono',monospace;font-size:10px;color:#60a5fa;flex-shrink:0;padding-top:1px;}
        .rag-text{font-size:11px;color:rgba(255,255,255,0.4);line-height:1.5;}
        /* Message actions */
        .msg-actions{display:flex;gap:4px;opacity:0;transition:opacity 0.2s;}
        .msg-row:hover .msg-actions{opacity:1;}
        .msg-action-btn{display:flex;align-items:center;gap:4px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35);padding:3px 8px;border-radius:6px;font-size:10px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all 0.15s;}
        .msg-action-btn:hover{background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.15);}
        /* Tool card */
        .tool-card{margin-top:10px;background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.22);border-radius:14px;padding:14px 16px;max-width:380px;}
        .tool-card-enter{animation:tool-enter 0.4s cubic-bezier(0.34,1.56,0.64,1);}
        @keyframes tool-enter{from{opacity:0;transform:scale(0.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .tool-card-header{display:flex;align-items:center;gap:7px;margin-bottom:10px;font-size:11px;font-weight:700;color:#a78bfa;letter-spacing:0.06em;}
        .badge{margin-left:auto;font-size:10px;padding:2px 8px;border-radius:100px;font-weight:600;}
        .badge-warn{color:#f59e0b;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);}
        .badge-ok{color:#10b981;background:rgba(16,185,129,0.1);}
        .badge-err{color:#ef4444;background:rgba(239,68,68,0.1);}
        .tool-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;}
        .tool-card-cell{background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 10px;}
        .tc-label{font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;}
        .tc-val{font-size:13px;color:#fff;font-weight:500;}
        .tool-card-actions{display:flex;gap:6px;}
        .tc-btn{flex:1;padding:8px 0;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;border:none;}
        .tc-confirm{background:#7c3aed;color:#fff;}.tc-confirm:hover{background:#6d28d9;}
        .tc-cancel{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.1)!important;}
        /* Thinking indicator */
        .thinking-wrap{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;}
        .thinking-dots{display:flex;gap:4px;align-items:center;}
        .thinking-dots span{width:5px;height:5px;border-radius:50%;background:#a78bfa;display:block;}
        .thinking-dots span:nth-child(1){animation:dot-bounce 1.2s ease-in-out infinite;}
        .thinking-dots span:nth-child(2){animation:dot-bounce 1.2s ease-in-out 0.2s infinite;}
        .thinking-dots span:nth-child(3){animation:dot-bounce 1.2s ease-in-out 0.4s infinite;}
        @keyframes dot-bounce{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1.1);opacity:1}}
        .thinking-label{font-size:13px;color:rgba(255,255,255,0.35);font-style:italic;}
        /* Empty state */
        .empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;width:100%;max-width:700px;margin:0 auto;}
        .empty-greeting{font-family:'Syne',sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em;margin-bottom:6px;text-align:center;}
        .empty-sub{font-size:14px;color:rgba(255,255,255,0.4);margin-bottom:32px;text-align:center;}
        .prompt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;width:100%;margin-bottom:32px;}
        .prompt-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);padding:11px 13px;border-radius:11px;font-size:12px;color:rgba(255,255,255,0.6);cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px;text-align:left;font-family:'Outfit',sans-serif;}
        .prompt-card:hover{background:rgba(124,58,237,0.08);color:#c4b5fd;border-color:rgba(124,58,237,0.25);transform:translateY(-1px);}
        /* Input */
        .input-wrap{width:100%;padding:12px 16px 18px;}
        .input-wrap.bottom{background:linear-gradient(to top,#060608 60%,transparent);}
        .input-wrap.center{padding:0;display:flex;justify-content:center;width:100%;}
        .input-box{width:100%;max-width:700px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px;display:flex;align-items:center;padding:9px 10px 9px 16px;transition:all 0.25s;}
        .input-box:focus-within{border-color:rgba(124,58,237,0.45);background:rgba(255,255,255,0.055);box-shadow:0 0 0 3px rgba(124,58,237,0.07);}
        .chat-input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:14px;font-family:'Outfit',sans-serif;}
        .chat-input::placeholder{color:rgba(255,255,255,0.28);}
        .send-btn{width:32px;height:32px;border-radius:9px;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
        .send-btn:disabled{opacity:0.2;cursor:not-allowed;background:rgba(255,255,255,0.08);}
        .send-btn:not(:disabled):hover{background:#6d28d9;transform:scale(1.06);}
        .input-hint{text-align:center;margin-top:10px;font-size:11px;color:rgba(255,255,255,0.18);}
        /* Dashboard panel */
        .dash-panel-wrap{transition:width 0.3s cubic-bezier(0.4,0,0.2,1);overflow:hidden;}
        .dash-panel-wrap.open{width:320px;}.dash-panel-wrap.closed{width:0;}
        .dash-panel{width:320px;height:100%;background:#0a0a0e;border-left:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;overflow:hidden;}
        .dash-header{padding:16px 16px 12px;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .dash-greeting{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:#fff;}
        .dash-time{font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px;}
        .student-strip{display:flex;align-items:center;gap:10px;padding:12px 14px;margin:10px 10px 0;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;flex-shrink:0;}
        .student-avatar{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;}
        .student-info{flex:1;min-width:0;}.student-name{font-size:13px;font-weight:600;color:#fff;}
        .student-meta{font-size:10px;color:rgba(255,255,255,0.35);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .student-cgpa{text-align:right;flex-shrink:0;}
        .cgpa-val{font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:#10b981;}
        .cgpa-label{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.06em;}
        /* AI Insights - prominent */
        .insights-strip{margin:10px 10px 0;display:flex;flex-direction:column;gap:5px;}
        .insight-item{font-size:12px;color:rgba(255,255,255,0.65);padding:8px 11px;background:rgba(255,255,255,0.03);border-radius:9px;border-left:3px solid rgba(124,58,237,0.5);line-height:1.45;transition:background 0.2s;}
        .insight-item:hover{background:rgba(255,255,255,0.05);}
        /* Stat cards */
        .stat-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 10px 0;flex-shrink:0;}
        .stat-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 10px 8px;}
        .stat-card.stat-ok{border-color:rgba(16,185,129,0.15);}.stat-card.stat-danger{border-color:rgba(239,68,68,0.2);}
        .stat-card.stat-warn-card{border-color:rgba(245,158,11,0.2);}.stat-card.stat-info{border-color:rgba(59,130,246,0.15);}
        .stat-icon{color:rgba(255,255,255,0.3);margin-bottom:4px;}
        .stat-val{font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:#fff;line-height:1;letter-spacing:-0.01em;}
        .stat-label{font-size:10px;color:rgba(255,255,255,0.35);margin-top:2px;}
        .stat-sub{font-size:9px;color:rgba(255,255,255,0.25);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .dash-tabs{display:flex;gap:4px;padding:10px 10px 0;flex-shrink:0;}
        .dash-tab{flex:1;padding:7px 0;border-radius:8px;border:none;cursor:pointer;font-size:11px;font-weight:500;font-family:'Outfit',sans-serif;transition:all 0.2s;text-transform:capitalize;}
        .dash-tab.active{background:rgba(124,58,237,0.18);color:#a78bfa;}
        .dash-tab:not(.active){background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.4);}
        .dash-tab:not(.active):hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);}
        .dash-body{flex:1;overflow-y:auto;padding:10px 10px 16px;}
        /* Schedule */
        .sched-wrap{display:flex;flex-direction:column;gap:4px;}
        .sched-day-header{display:flex;align-items:center;justify-content:space-between;padding:6px 2px 4px;}
        .sched-day-label{font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;}
        .sched-expand-btn{display:flex;align-items:center;gap:4px;font-size:10px;color:#7c3aed;background:rgba(124,58,237,0.1);border:none;padding:3px 8px;border-radius:6px;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;}
        .sched-expand-btn:hover{background:rgba(124,58,237,0.2);}
        .sched-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;transition:background 0.2s;}
        .sched-row.current{background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);}
        .sched-row.done{opacity:0.4;}
        .sched-time-col{width:36px;flex-shrink:0;}
        .sched-time{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.35);}
        .sched-bar{width:2px;height:32px;border-radius:2px;flex-shrink:0;}
        .sched-bar.current{background:#7c3aed;}.sched-bar.done{background:rgba(255,255,255,0.1);}.sched-bar.upcoming{background:rgba(255,255,255,0.15);}
        .sched-info{flex:1;min-width:0;}
        .sched-subj{font-size:12px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sched-meta{font-size:10px;color:rgba(255,255,255,0.35);display:flex;align-items:center;gap:5px;}
        .sched-type.lecture{color:rgba(255,255,255,0.35);}.sched-type.lab{color:#60a5fa;}
        .sched-now{font-size:9px;background:rgba(124,58,237,0.25);color:#c4b5fd;padding:1px 6px;border-radius:4px;font-weight:700;letter-spacing:0.04em;}
        .sched-empty{font-size:12px;color:rgba(255,255,255,0.25);padding:10px 4px;}
        .sched-more-btn{background:transparent;border:1px dashed rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);padding:7px 0;border-radius:8px;font-size:11px;cursor:pointer;transition:all 0.2s;width:100%;font-family:'Outfit',sans-serif;}
        .sched-more-btn:hover{border-color:rgba(124,58,237,0.4);color:#a78bfa;}
        /* Attendance */
        .att-wrap{display:flex;flex-direction:column;gap:6px;}
        .att-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:11px;padding:11px 12px;cursor:pointer;transition:all 0.2s;}
        .att-card:hover{background:rgba(255,255,255,0.04);border-color:rgba(124,58,237,0.2);}
        .att-top{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
        .att-info{flex:1;min-width:0;}.att-name{font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .att-code{font-size:10px;color:rgba(255,255,255,0.35);margin-top:1px;}
        .att-pct{font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;flex-shrink:0;}
        .att-progress{height:3px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:visible;position:relative;margin-bottom:6px;}
        .att-prog-fill{height:100%;border-radius:3px;transition:width 0.6s ease;}
        .att-75-line{position:absolute;top:-3px;left:75%;width:1px;height:9px;background:rgba(255,255,255,0.2);}
        .att-status-row{display:flex;align-items:center;justify-content:space-between;font-size:10px;margin-top:2px;}
        .att-detail-link{color:rgba(255,255,255,0.3);font-size:10px;}
        /* Detail page */
        .detail-page{padding:0;}
        .detail-back{background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;font-family:'Outfit',sans-serif;padding:8px 0;margin-bottom:6px;transition:color 0.2s;}
        .detail-back:hover{color:#fff;}
        .detail-hero{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;margin-bottom:14px;}
        .detail-code{font-size:10px;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;letter-spacing:0.06em;margin-bottom:4px;}
        .detail-name{font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;color:#fff;margin-bottom:10px;}
        .detail-pct{font-family:'Outfit',sans-serif;font-size:32px;font-weight:700;letter-spacing:-0.02em;margin-bottom:10px;}
        .detail-bar-wrap{display:flex;align-items:center;gap:6px;margin-bottom:14px;}
        .detail-bar-bg{flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:4px;position:relative;overflow:visible;}
        .detail-bar-fill{height:100%;border-radius:4px;transition:width 0.7s ease;}
        .detail-75-marker{position:absolute;left:75%;top:-4px;width:2px;height:14px;background:rgba(255,255,255,0.3);border-radius:1px;}
        .detail-75-label{font-size:9px;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;}
        .detail-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
        .detail-stat{background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 6px;text-align:center;}
        .ds-val{display:block;font-family:'Outfit',sans-serif;font-size:17px;font-weight:600;color:#fff;}
        .ds-label{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.05em;}
        .detail-section-title{font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;}
        .detail-month-group{margin-bottom:12px;}
        .detail-month-label{font-size:11px;color:rgba(255,255,255,0.4);font-weight:600;margin-bottom:6px;}
        .detail-missed-row{display:flex;align-items:center;gap:8px;padding:7px 8px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1);border-radius:8px;margin-bottom:4px;}
        .dmr-dot{width:5px;height:5px;border-radius:50%;background:#ef4444;flex-shrink:0;}
        .dmr-date{font-size:11px;color:rgba(255,255,255,0.7);font-family:'DM Mono',monospace;}
        .dmr-reason{font-size:11px;color:rgba(255,255,255,0.35);margin-left:auto;}
        .dash-ask-btn{width:100%;background:transparent;border:1px dashed rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);padding:8px 0;border-radius:9px;font-size:11px;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;margin-top:6px;}
        .dash-ask-btn:hover{border-color:rgba(124,58,237,0.4);color:#a78bfa;}
        /* Exams */
        .exam-wrap{display:flex;flex-direction:column;gap:5px;}
        .exam-header-note{font-size:9px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.08em;padding:4px 2px 8px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:4px;}
        .exam-card{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-left:3px solid transparent;border-radius:10px;transition:all 0.2s;overflow:hidden;}
        .exam-card:hover{background:rgba(255,255,255,0.04);}
        .exam-left{text-align:center;flex-shrink:0;width:52px;min-width:52px;overflow:hidden;}
        .exam-countdown{font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;line-height:1;white-space:nowrap;}
        .exam-day{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;}
        .exam-mid{flex:1;min-width:0;overflow:hidden;}
        .exam-subj{font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .exam-code{font-size:10px;color:rgba(255,255,255,0.35);font-family:'DM Mono',monospace;margin-top:1px;}
        .exam-date{font-size:10px;color:rgba(255,255,255,0.3);margin-top:2px;}
        .exam-alert-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:blink 1.2s ease infinite;flex-shrink:0;}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        /* Popup */
        .popup-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:100;display:flex;align-items:center;justify-content:center;animation:fade-in 0.2s ease;}
        @keyframes fade-in{from{opacity:0}to{opacity:1}}
        .popup-box{background:#0f0f14;border:1px solid rgba(255,255,255,0.08);border-radius:20px;width:440px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;animation:slide-up 0.25s ease;}
        @keyframes slide-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .popup-header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,0.06);}
        .popup-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#fff;}
        .popup-sub{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;}
        .popup-empty{padding:32px;text-align:center;color:rgba(255,255,255,0.35);font-size:14px;}
        .popup-timeline{overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:0;}
        .ptl-row{display:flex;gap:12px;align-items:flex-start;}
        .ptl-time{width:48px;flex-shrink:0;padding-top:6px;}
        .ptl-start{display:block;font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.5);}
        .ptl-end{display:block;font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,0.25);}
        .ptl-dot-col{display:flex;flex-direction:column;align-items:center;padding-top:8px;}
        .ptl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .ptl-dot.current{background:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.2);}
        .ptl-dot.upcoming{background:rgba(255,255,255,0.2);}.ptl-dot.done{background:rgba(255,255,255,0.1);}
        .ptl-line{width:1px;flex:1;min-height:24px;background:rgba(255,255,255,0.07);margin:3px 0;}
        .ptl-card{flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;margin-bottom:6px;}
        .ptl-card.current{background:rgba(124,58,237,0.07);border-color:rgba(124,58,237,0.25);}
        .ptl-card.done{opacity:0.45;}
        .ptl-subject{font-size:13px;font-weight:600;color:#fff;margin-bottom:3px;}
        .ptl-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(255,255,255,0.4);}
        .ptl-type.lecture{color:rgba(255,255,255,0.35);}.ptl-type.lab{color:#60a5fa;}
        .ptl-now{font-size:9px;background:rgba(124,58,237,0.25);color:#c4b5fd;padding:1px 7px;border-radius:5px;font-weight:700;}
        .ptl-done{font-size:9px;color:rgba(255,255,255,0.2);}
        .popup-footer{padding:14px 20px;border-top:1px solid rgba(255,255,255,0.06);}
        .popup-ask-btn{width:100%;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);color:#a78bfa;padding:10px 0;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;}
        .popup-ask-btn:hover{background:rgba(124,58,237,0.2);}
        /* Command palette */
        .palette-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(12px);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;animation:fade-in 0.15s ease;}
        .palette-box{background:#0f0f14;border:1px solid rgba(255,255,255,0.1);border-radius:16px;width:100%;max-width:520px;overflow:hidden;animation:slide-up 0.2s ease;}
        .palette-input-wrap{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.07);}
        .palette-input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:15px;font-family:'Outfit',sans-serif;}
        .palette-input::placeholder{color:rgba(255,255,255,0.25);}
        .palette-esc{font-size:10px;color:rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);padding:2px 7px;border-radius:5px;font-family:'DM Mono',monospace;cursor:pointer;flex-shrink:0;}
        .palette-results{padding:6px;max-height:320px;overflow-y:auto;}
        .palette-section{font-size:10px;font-weight:700;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.08em;padding:8px 10px 4px;}
        .palette-item{width:100%;display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;border:none;background:transparent;color:rgba(255,255,255,0.6);font-size:13px;cursor:pointer;font-family:'Outfit',sans-serif;text-align:left;transition:all 0.15s;}
        .palette-item:hover{background:rgba(124,58,237,0.1);color:#c4b5fd;}
        .palette-empty{padding:20px;text-align:center;font-size:13px;color:rgba(255,255,255,0.25);}
        /* Settings */
        .settings-wrap{flex:1;overflow-y:auto;background:#060608;}
        .settings-nav{height:52px;display:flex;align-items:center;padding:0 20px;border-bottom:1px solid rgba(255,255,255,0.04);}
        .back-btn{background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:13px;display:flex;align-items:center;gap:7px;cursor:pointer;font-family:'Outfit',sans-serif;transition:color 0.2s;}
        .back-btn:hover{color:#fff;}
        .settings-inner{max-width:520px;margin:32px auto;padding:0 24px;display:flex;flex-direction:column;gap:32px;}
        .settings-section h2{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:18px;}
        .setting-row{display:flex;flex-direction:column;gap:5px;}
        .setting-row label{font-size:13px;color:#fff;font-weight:500;}
        .setting-desc{font-size:12px;color:rgba(255,255,255,0.3);}
        .setting-input{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:11px 13px;border-radius:9px;font-size:13px;outline:none;font-family:'Outfit',sans-serif;transition:all 0.2s;}
        .setting-input:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,0.08);}
        .danger-zone{background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.12);border-radius:12px;padding:18px;}
        .danger-btn{background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:9px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;font-family:'Outfit',sans-serif;transition:all 0.2s;display:flex;align-items:center;gap:7px;margin-top:12px;}
        .danger-btn:hover{background:#ef4444;color:#fff;}
        /* ── FULL DASHBOARD VIEW ── */
        .fd-wrap{flex:1;display:flex;flex-direction:column;background:#060608;overflow:hidden;}
        .fd-header{display:flex;align-items:center;justify-content:space-between;padding:20px 32px 16px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .fd-title{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:#fff;}
        .fd-sub{font-size:13px;color:rgba(255,255,255,0.35);margin-top:2px;}
        .fd-back{background:transparent;border:none;color:rgba(255,255,255,0.4);font-size:13px;display:flex;align-items:center;gap:7px;cursor:pointer;font-family:'Outfit',sans-serif;transition:color 0.2s;}
        .fd-back:hover{color:#fff;}
        .fd-close-btn{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);padding:8px 16px;border-radius:9px;font-size:13px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all 0.2s;}
        .fd-close-btn:hover{background:rgba(255,255,255,0.08);color:#fff;}
        .fd-scroll{flex:1;overflow-y:auto;padding:24px 32px 40px;display:flex;flex-direction:column;gap:24px;}
        .fd-student-card{display:flex;align-items:center;gap:16px;padding:20px 24px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:16px;}
        .fd-avatar{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#3b82f6);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#fff;flex-shrink:0;}
        .fd-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
        .fd-stat{padding:18px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);}
        .fd-stat-ok{border-color:rgba(16,185,129,0.2);}
        .fd-stat-danger{border-color:rgba(239,68,68,0.25);background:rgba(239,68,68,0.03);}
        .fd-stat-warn{border-color:rgba(245,158,11,0.25);background:rgba(245,158,11,0.03);}
        .fd-stat-val{font-family:'Outfit',sans-serif;font-size:32px;font-weight:700;color:#fff;line-height:1;letter-spacing:-0.02em;}
        .fd-stat-label{font-size:13px;color:rgba(255,255,255,0.45);margin-top:6px;}
        .fd-stat-note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:4px;}
        .fd-section{display:flex;flex-direction:column;gap:10px;}
        .fd-section-title{font-size:13px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.07em;}
        .fd-section-title-row{display:flex;align-items:center;justify-content:space-between;}
        .fd-expand-btn{font-size:12px;color:#7c3aed;background:transparent;border:none;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-expand-btn:hover{color:#a78bfa;}
        .fd-alert{padding:14px 16px;border-radius:12px;border-left:3px solid;}
        .fd-alert-warn{background:rgba(245,158,11,0.06);border-left-color:#f59e0b;}
        .fd-alert-exam{background:rgba(124,58,237,0.07);border-left-color:#7c3aed;}
        .fd-alert-ok{background:rgba(255,255,255,0.02);border-left-color:rgba(16,185,129,0.4);padding:10px 14px;}
        .fd-two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;}
        .fd-class-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);transition:background 0.2s;}
        .fd-class-row.current{background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.2);}
        .fd-class-row.done{opacity:0.4;}
        .fd-class-time{font-family:'DM Mono',monospace;font-size:12px;color:rgba(255,255,255,0.35);min-width:44px;}
        .fd-class-name{font-size:14px;font-weight:500;color:#fff;}
        .fd-class-meta{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;display:flex;align-items:center;gap:6px;}
        .fd-now-badge{font-size:9px;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:0.05em;margin-left:4px;}
        .fd-empty{font-size:14px;color:rgba(255,255,255,0.25);padding:20px 0;text-align:center;}
        .fd-exam-row{display:flex;align-items:center;gap:16px;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);border-left:3px solid transparent;background:rgba(255,255,255,0.02);margin-bottom:4px;}
        .fd-ai-btn{width:100%;margin-top:8px;background:transparent;border:1px dashed rgba(124,58,237,0.3);color:#7c3aed;padding:10px 0;border-radius:9px;font-size:13px;cursor:pointer;font-family:'Outfit',sans-serif;transition:all 0.2s;}
        .fd-ai-btn:hover{background:rgba(124,58,237,0.1);border-style:solid;}
        .fd-ai-btn-inline{font-size:12px;color:#7c3aed;background:transparent;border:none;cursor:pointer;font-family:'Outfit',sans-serif;}
        .fd-ai-btn-inline:hover{color:#a78bfa;}
        .fd-att-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        .fd-att-card{padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.2s;}
        .fd-att-card:hover{background:rgba(255,255,255,0.04);border-color:rgba(124,58,237,0.2);transform:translateY(-1px);}
      `}</style>

      {/* ⌘K Palette */}
      {paletteOpen&&<CommandPalette threads={threads} onSelect={id=>{setActiveThreadId(id);}} onNew={startNewChat} onClose={()=>setPaletteOpen(false)}/>}

      {/* Left Sidebar */}
      <aside className={`sidebar ${isSidebarOpen?"open":"closed"}`}>
        <div className="sidebar-inner">
          <div className="sb-brand">
            <Link href="/" className="sb-logo">Campus<span>Copilot</span></Link>
            <button className="icon-btn" onClick={()=>setIsSidebarOpen(false)}><PanelLeftClose size={16}/></button>
          </div>
          <button className="sb-palette-btn" onClick={()=>setPaletteOpen(true)}>
            <Search size={12}/> Search…<span className="sb-palette-kbd">⌘K</span>
          </button>
          <button className="sb-new-btn" onClick={startNewChat}><Plus size={14}/> New Chat</button>
          <Link href="/subjects" style={{margin:"0 10px 8px",background:"rgba(255,255,255,0.03)",color:"rgba(255,255,255,0.5)",border:"1px solid rgba(255,255,255,0.07)",padding:"10px 14px",borderRadius:10,display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:500,cursor:"pointer",transition:"all 0.2s",fontFamily:"'Outfit',sans-serif",textDecoration:"none"}}
            onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.background="rgba(124,58,237,0.1)";(e.currentTarget as HTMLAnchorElement).style.color="#c4b5fd";(e.currentTarget as HTMLAnchorElement).style.borderColor="rgba(124,58,237,0.2)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.background="rgba(255,255,255,0.03)";(e.currentTarget as HTMLAnchorElement).style.color="rgba(255,255,255,0.5)";(e.currentTarget as HTMLAnchorElement).style.borderColor="rgba(255,255,255,0.07)";}}>
            <BookOpen size={14}/> Subjects & Notes
          </Link>
          <div className="sb-history">
            <div className="sb-section-label">Recent</div>
            {threads.length===0?<div style={{fontSize:12,color:"rgba(255,255,255,0.2)",padding:"4px 10px"}}>No chats yet.</div>:threads.map(t=>(
              <div key={t.thread_id} className={`sb-thread ${activeThreadId===t.thread_id?"active":""}`} onClick={()=>setActiveThreadId(t.thread_id)}>
                <MessageSquare size={12} style={{flexShrink:0,opacity:0.5}}/>
                <span className="sb-thread-title">{t.title}</span>
                <button className={`sb-del ${deletingId===t.thread_id?"spinning":""}`} onClick={e=>deleteThread(t.thread_id,e)}><Trash2 size={12}/></button>
              </div>
            ))}
          </div>
          <div className="sb-footer">
            <div className="sb-user-row" onClick={()=>setCurrentView("settings")}>
              <div className="sb-avatar">{STUDENT.initials}</div>
              <div style={{flex:1,minWidth:0}}><div className="sb-uname">{STUDENT.name}</div><div className="sb-usub">{STUDENT.id}</div></div>
              <Settings size={13} style={{color:"rgba(255,255,255,0.25)",flexShrink:0}}/>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      {currentView==="settings"?(
        <div className="settings-wrap" style={{flex:1}}>
          <header className="settings-nav"><button className="back-btn" onClick={()=>setCurrentView("chat")}>← Back to Chat</button></header>
          <div className="settings-inner">
            <div className="settings-section"><h2>Account</h2>
              <div className="setting-row"><label>Name</label><input className="setting-input" value={STUDENT.name} readOnly/></div>
              <div className="setting-row" style={{marginTop:12}}><label>Student ID</label><p className="setting-desc">Linked via Microsoft SSO — read-only.</p><input className="setting-input" value={STUDENT.id} readOnly/></div>
              <div className="setting-row" style={{marginTop:12}}><label>Branch</label><input className="setting-input" value={STUDENT.branch} readOnly/></div>
            </div>
            <div className="settings-section"><h2>Data</h2>
              <div className="danger-zone">
                <div className="setting-row"><label style={{color:"#ef4444"}}>Clear All Chat History</label><p className="setting-desc">Permanently deletes all conversations for <strong>{STUDENT.id}</strong>.</p></div>
                <button className="danger-btn" onClick={deleteAllChats}><Trash2 size={13}/> Delete All Data</button>
              </div>
            </div>
            <div className="settings-section"><h2>Sign Out</h2>
              <p className="setting-desc" style={{marginBottom:16}}>You're signed in as <strong>{STUDENT.name}</strong>. Signing out will clear your session.</p>
              <button style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.65)",border:"1px solid rgba(255,255,255,0.12)",padding:"10px 18px",borderRadius:9,cursor:"pointer",fontSize:13,fontFamily:"'Outfit',sans-serif",transition:"all 0.2s"}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(239,68,68,0.08)";(e.currentTarget as HTMLButtonElement).style.color="#ef4444";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(239,68,68,0.2)";}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.04)";(e.currentTarget as HTMLButtonElement).style.color="rgba(255,255,255,0.65)";(e.currentTarget as HTMLButtonElement).style.borderColor="rgba(255,255,255,0.12)";}}
                onClick={()=>{sessionStorage.clear();router.replace("/login");}}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      ):(
        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              {!isSidebarOpen&&<button className="icon-btn" onClick={()=>setIsSidebarOpen(true)}><PanelLeftOpen size={18}/></button>}
              {!isSidebarOpen&&<span style={{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)",letterSpacing:"-0.01em"}}>Campus<span style={{color:"#7c3aed"}}>Copilot</span></span>}
            </div>
            <div className="topbar-right">
              <button className={`dash-toggle ${currentView==="dashboard"?"on":"off"}`} onClick={()=>setCurrentView(v=>v==="dashboard"?"chat":"dashboard")}>
                <LayoutGrid size={14}/> Dashboard
              </button>
            </div>
          </header>

          {currentView==="dashboard"?(
            <FullDashboard student={STUDENT} onClose={()=>setCurrentView("chat")} onAsk={handleSend}/>
          ):isChatEmpty?(
            <div className="empty-state">
              <div className="empty-greeting">Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, {STUDENT.name.split(" ")[0]} 👋</div>
              <p className="empty-sub">What do you need help with today?</p>
              <div className="prompt-grid">
                {QUICK_PROMPTS.map((p,i)=>(
                  <button key={i} className="prompt-card" onClick={()=>handleSend(p.text)}>
                    <p.icon size={13} style={{flexShrink:0,opacity:0.6}}/>{p.label}
                  </button>
                ))}
              </div>
              <div className="input-wrap center" style={{width:"100%",maxWidth:700}}>
                <div className="input-box">
                  <input ref={inputRef} className="chat-input" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSend()} placeholder="Ask me anything — labs, attendance, exams, fees…" disabled={isTyping}/>
                  <button className="send-btn" disabled={!input.trim()||isTyping} onClick={()=>handleSend()}><Send size={14} strokeWidth={2.5}/></button>
                </div>
                <p className="input-hint">Try: "Am I safe to skip a class?" or "When's my OS exam?"</p>
              </div>
            </div>
          ):(
            <>
              <div className="chat-scroll">
                <div className="chat-inner">
                  {messages.map((msg,i)=>(
                    <div key={i} className={`msg-row ${msg.role}`}>
                      <div className={`msg-avatar ${msg.role}`}>{msg.role==="assistant"?<Bot size={15}/>:<User size={15}/>}</div>
                      <div className="msg-body">
                        <div className={`bubble ${msg.role} ${msg.id===streamingMsgId&&msg.content?"streaming":""}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            code({node,inline,className,children,...props}:any){
                              const match=/language-(\w+)/.exec(className||"");
                              return !inline&&match?(
                                <div style={{borderRadius:8,overflow:"hidden",margin:"12px 0"}}>
                                  <div style={{background:"#1a1a1a",padding:"5px 14px",fontSize:10,color:"#555",borderBottom:"1px solid #222"}}>{match[1]}</div>
                                  <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" customStyle={{margin:0,padding:14,background:"#141414",fontSize:12}} {...props}>{String(children).replace(/\n$/,"")}</SyntaxHighlighter>
                                </div>
                              ):<code style={{background:"rgba(255,255,255,0.09)",padding:"2px 6px",borderRadius:4,fontSize:"0.88em",fontFamily:"DM Mono,monospace"}} {...props}>{children}</code>;
                            }
                          }}>{msg.content}</ReactMarkdown>
                          {msg.action&&<ToolCallCard action={msg.action}/>}
                        </div>
                        {msg.role==="assistant"&&msg.sources&&<RagSources sources={msg.sources}/>}
                        {msg.role==="assistant"&&msg.content&&msg.id!==streamingMsgId&&<MessageActions content={msg.content} onRegenerate={()=>handleRegenerate(i)}/>}
                      </div>
                    </div>
                  ))}
                  {isTyping&&!messages.find(m=>m.id===streamingMsgId)&&(
                    <div className="msg-row assistant">
                      <div className="msg-avatar assistant"><Bot size={15}/></div>
                      <AISpinner/>
                    </div>
                  )}
                  <div ref={messagesEndRef}/>
                </div>
              </div>
              <div className="input-wrap bottom">
                <div className="input-box" style={{maxWidth:700,margin:"0 auto"}}>
                  <input ref={inputRef} className="chat-input" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSend()} placeholder="Ask anything…" disabled={isTyping}/>
                  <button className="send-btn" disabled={!input.trim()||isTyping} onClick={()=>handleSend()}><Send size={14} strokeWidth={2.5}/></button>
                </div>
              </div>
            </>
          )}
          </main>
      )}
    </div>
  );
}
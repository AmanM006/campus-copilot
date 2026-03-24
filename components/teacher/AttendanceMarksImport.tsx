"use client";
// components/teacher/AttendanceMarksImport.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Drop into teacher/page.tsx SubjectsView or as a standalone panel.
// Two tabs: Attendance import | Marks import
// Each supports: CSV upload, paste text, or manual row entry.

import React, { useState, useRef, useCallback } from "react";
import { Upload, FileText, Check, AlertTriangle, RefreshCw, Plus, Trash2 } from "lucide-react";
import {
  importAttendanceFromCSV, upsertMarks, parseAttendanceCSV, parseMarksCSV,
} from "@/lib/db_extended";

type Tab = "attendance" | "marks";
type Mode = "csv" | "paste" | "manual";

interface Props {
  subjectId: string;
  subjectCode: string;
  facultyId: string;
  students: { id: string; name: string; email: string }[];
  onDone?: () => void;
}

const COLORS = { attendance:"#3b82f6", marks:"#10b981" };
const F = "'Geist',system-ui,sans-serif";
const M = "'JetBrains Mono',monospace";

function Cell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding:"8px 12px", fontSize:12, borderBottom:"1px solid rgba(255,255,255,0.04)", color:"rgba(226,232,240,0.85)", ...style }}>{children}</td>;
}

// ── Simple toast ──────────────────────────────────────────────────────────────
function toast(msg: string, ok = true) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position:"fixed", top:"14px", right:"14px", zIndex:"9999",
    padding:"10px 16px", borderRadius:"8px", maxWidth:"300px",
    background: ok ? "#166534" : "#991b1b", color:"#fff", fontSize:"13px", fontWeight:"500",
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function AttendanceMarksImport({ subjectId, subjectCode, facultyId, students, onDone }: Props) {
  const [tab,     setTab]     = useState<Tab>("attendance");
  const [mode,    setMode]    = useState<Mode>("csv");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [busy,    setBusy]    = useState(false);
  const [drag,    setDrag]    = useState(false);
  const [error,   setError]   = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Manual rows state
  const [manualRows, setManualRows] = useState<any[]>(
    students.map(s => ({ student_id: s.id, student_name: s.name, attended:"", total:"", score:"", max_score:"100", exam_type:"midsem" }))
  );

  // ── Parse CSV text into preview rows ───────────────────────────────────────
  const parsePreview = useCallback((text: string) => {
    setError("");
    try {
      const rows = tab === "attendance" ? parseAttendanceCSV(text) : parseMarksCSV(text);
      // Enrich with student name if known
      const enriched = rows.map((r: any) => {
        const stu = students.find(s => s.id === r.student_id || s.email === r.student_id);
        return { ...r, student_name: stu?.name || r.student_id, subject_id: r.subject_id || subjectId };
      });
      setPreview(enriched);
    } catch (e: any) {
      setError(e.message);
      setPreview([]);
    }
  }, [tab, students, subjectId]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => { const txt = e.target?.result as string; setCsvText(txt); parsePreview(txt); };
    reader.readAsText(file);
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    setBusy(true);
    try {
      const rows = mode === "manual"
        ? (tab === "attendance"
            ? manualRows.filter(r => r.attended !== "").map(r => ({ student_id:r.student_id, subject_id:subjectId, attended:parseInt(r.attended)||0, total:parseInt(r.total)||0 }))
            : manualRows.filter(r => r.score !== "").map(r => ({ student_id:r.student_id, subject_id:subjectId, score:parseFloat(r.score)||0, max_score:parseFloat(r.max_score)||100, exam_type:r.exam_type||"midsem", entered_by:facultyId }))
          )
        : preview;

      if (!rows.length) { toast("No valid rows to import", false); return; }

      if (tab === "attendance") {
        await importAttendanceFromCSV(rows as any, "teacher");
      } else {
        await upsertMarks(rows.map((r: any) => ({ ...r, entered_by: facultyId, source: "teacher" })));
      }

      toast(`✓ ${rows.length} ${tab} records saved`);
      setCsvText(""); setPreview([]); setMode("csv");
      onDone?.();
    } catch (e: any) {
      toast(`Import failed: ${e.message}`, false);
    } finally { setBusy(false); }
  };

  const fieldStyle: React.CSSProperties = {
    background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
    borderRadius:6, padding:"6px 8px", color:"#e2e8f0", fontSize:12, fontFamily:M, outline:"none", width:"100%",
  };

  const ATTENDANCE_TEMPLATE = "student_id,attended,total\n" + students.slice(0,3).map(s=>`${s.id},0,0`).join("\n");
  const MARKS_TEMPLATE      = "student_id,score,max_score,exam_type\n" + students.slice(0,3).map(s=>`${s.id},0,100,midsem`).join("\n");

  return (
    <div style={{ fontFamily:F, color:"#e2e8f0" }}>
      {/* Tab selector */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {(["attendance","marks"] as Tab[]).map(t => (
          <button key={t} onClick={()=>{setTab(t);setPreview([]);setCsvText("");setError("");}}
            style={{ padding:"7px 16px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:F, fontSize:12, fontWeight:600,
              background: tab===t ? COLORS[t] : "rgba(255,255,255,0.05)",
              color: tab===t ? "#fff" : "rgba(255,255,255,0.45)",
            }}>
            {t === "attendance" ? "📊 Attendance" : "📝 Marks"}
          </button>
        ))}
      </div>

      {/* Mode selector */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {(["csv","paste","manual"] as Mode[]).map(m=>(
          <button key={m} onClick={()=>setMode(m)} style={{
            padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F,
            border:`1px solid ${mode===m?"rgba(59,130,246,0.4)":"rgba(255,255,255,0.08)"}`,
            background:mode===m?"rgba(59,130,246,0.1)":"transparent",
            color:mode===m?"#60a5fa":"rgba(255,255,255,0.4)",
          }}>
            {m==="csv"?"📁 Upload CSV":m==="paste"?"📋 Paste CSV":"✏️ Manual"}
          </button>
        ))}
      </div>

      {/* CSV Upload */}
      {mode === "csv" && (
        <div
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current?.click()}
          style={{
            border:`2px dashed ${drag?"#3b82f6":"rgba(255,255,255,0.1)"}`,
            background:drag?"rgba(59,130,246,0.05)":"transparent",
            borderRadius:10, padding:24, textAlign:"center", cursor:"pointer", marginBottom:12, transition:"all .2s",
          }}>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);}}/>
          <Upload size={20} color="rgba(255,255,255,0.2)" style={{marginBottom:8}}/>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",fontWeight:500}}>Drop CSV file or click to browse</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginTop:4,fontFamily:M}}>
            {tab==="attendance" ? "student_id, attended, total" : "student_id, score, max_score, exam_type"}
          </div>
        </div>
      )}

      {/* Paste CSV */}
      {mode === "paste" && (
        <div style={{ marginBottom:12 }}>
          <textarea value={csvText} onChange={e=>{setCsvText(e.target.value);parsePreview(e.target.value);}}
            rows={6} placeholder={tab==="attendance"?ATTENDANCE_TEMPLATE:MARKS_TEMPLATE}
            style={{ ...fieldStyle, resize:"vertical", width:"100%", height:120 }}/>
        </div>
      )}

      {/* Manual entry */}
      {mode === "manual" && (
        <div style={{ border:"1px solid rgba(255,255,255,0.07)", borderRadius:9, overflow:"hidden", marginBottom:12 }}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"rgba(255,255,255,0.02)"}}>
                <th style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>Student</th>
                {tab==="attendance" ? <>
                  <th style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>Attended</th>
                  <th style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>Total</th>
                </> : <>
                  <th style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>Score</th>
                  <th style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>Max</th>
                  <th style={{padding:"8px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>Type</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {manualRows.map((row,i)=>(
                <tr key={row.student_id}>
                  <Cell>{row.student_name}</Cell>
                  {tab==="attendance" ? <>
                    <Cell><input type="number" min="0" value={row.attended} onChange={e=>setManualRows(p=>p.map((r,j)=>j===i?{...r,attended:e.target.value}:r))} style={{...fieldStyle,width:70}}/></Cell>
                    <Cell><input type="number" min="0" value={row.total}    onChange={e=>setManualRows(p=>p.map((r,j)=>j===i?{...r,total:e.target.value}:r))} style={{...fieldStyle,width:70}}/></Cell>
                  </> : <>
                    <Cell><input type="number" min="0" value={row.score}    onChange={e=>setManualRows(p=>p.map((r,j)=>j===i?{...r,score:e.target.value}:r))} style={{...fieldStyle,width:70}}/></Cell>
                    <Cell><input type="number" min="0" value={row.max_score} onChange={e=>setManualRows(p=>p.map((r,j)=>j===i?{...r,max_score:e.target.value}:r))} style={{...fieldStyle,width:70}}/></Cell>
                    <Cell>
                      <select value={row.exam_type} onChange={e=>setManualRows(p=>p.map((r,j)=>j===i?{...r,exam_type:e.target.value}:r))} style={{...fieldStyle,width:100}}>
                        {["midsem","endsem","quiz","assignment","practical"].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </Cell>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{display:"flex",gap:8,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:9,padding:"10px 13px",fontSize:12,color:"#fca5a5",marginBottom:10}}>
          <AlertTriangle size={13} style={{flexShrink:0,marginTop:1}}/><span>{error}</span>
        </div>
      )}

      {/* Preview table (CSV modes) */}
      {preview.length > 0 && mode !== "manual" && (
        <div style={{border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"8px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.4)"}}>
            Preview — {preview.length} rows
          </div>
          <div style={{maxHeight:200,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"rgba(255,255,255,0.02)"}}>
                  {Object.keys(preview[0]).filter(k=>k!=="subject_id").map(h=>(
                    <th key={h} style={{padding:"6px 12px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.3)",textAlign:"left",textTransform:"uppercase",letterSpacing:".06em"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0,15).map((r,i)=>(
                  <tr key={i}>
                    {Object.entries(r).filter(([k])=>k!=="subject_id").map(([k,v])=>(
                      <Cell key={k}>{String(v)}</Cell>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import button */}
{/* Import button */}
<button disabled={busy || (mode !== "manual" && preview.length === 0)} onClick={handleImport}        style={{
          padding:"10px 20px", background: tab==="attendance"?COLORS.attendance:COLORS.marks,
          border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600,
          cursor:"pointer", fontFamily:F, opacity: (mode==="manual"||preview.length>0)?1:0.4,
          display:"flex", alignItems:"center", gap:8,
        }}>
        {busy ? <><RefreshCw size={13} style={{animation:"spin .7s linear infinite"}}/> Saving…</> : <><Check size={13}/> Import {tab === "attendance" ? "Attendance" : "Marks"}</>}
      </button>
    </div>
  );
}
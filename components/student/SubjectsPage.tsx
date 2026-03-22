// components/student/SubjectsPage.tsx
// ─── Student subject browser with live documents from Supabase ────────────────
// Mount this at /subjects (replaces static page).

"use client";
import React, { useState } from "react";
import { ArrowLeft, Download, ExternalLink, BookOpen, FileText } from "lucide-react";
import { useStudentSubjects } from "@/hooks/useData";
import { useDocuments } from "@/hooks/useData";
import type { DBSubject, DBDocument } from "@/lib/types";

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function DocIcon({ type }: { type: DBDocument["type"] }) {
  if (type === "slides") return <span>🎞️</span>;
  if (type === "notes")  return <span>📝</span>;
  return <span>📄</span>;
}

// ── Document list for one subject ─────────────────────────────────────────────
function SubjectDocuments({ subject, studentId, onBack }: {
  subject: DBSubject; studentId: string; onBack: () => void;
}) {
  const { docs, loading, error } = useDocuments(subject.id);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "transparent", border: "none",
        color: "rgba(255,255,255,0.4)", cursor: "pointer",
        fontSize: 13, marginBottom: 20, fontFamily: "'Outfit',sans-serif", padding: 0,
      }}
        onMouseOver={e => (e.currentTarget.style.color = "#fff")}
        onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
        <ArrowLeft size={14} /> All Subjects
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${subject.color}20`, border: `1px solid ${subject.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: subject.color,
        }}>{subject.code.split(" ")[1]}</div>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff" }}>
            {subject.name}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            {subject.code} · Study Materials
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "20px 0" }}>
          Fetching documents…
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#ef4444" }}>Failed to load: {error}</div>
      )}
      {!loading && docs.length === 0 && (
        <div style={{
          fontSize: 14, color: "rgba(255,255,255,0.25)",
          padding: "48px 0", textAlign: "center",
          border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 14,
        }}>
          <BookOpen size={28} style={{ opacity: 0.2, marginBottom: 10 }} />
          <div>No materials uploaded by faculty yet.</div>
          <div style={{ fontSize: 12, marginTop: 4, color: "rgba(255,255,255,0.15)" }}>
            Check back later — you'll get a notification when new docs arrive.
          </div>
        </div>
      )}

      {docs.map(doc => (
        <div key={doc.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, marginBottom: 6,
          transition: "all 0.2s",
        }}
          onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseOut={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}>
          <span style={{ fontSize: 20, flexShrink: 0 }}><DocIcon type={doc.type} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {formatSize(doc.size_bytes)}
              {doc.pages ? ` · ${doc.pages} pages` : ""}
              {" · Uploaded "}{new Date(doc.created_at).toLocaleDateString("en-IN")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", background: "rgba(14,165,233,0.1)",
                border: "1px solid rgba(14,165,233,0.2)", color: "#0ea5e9",
                borderRadius: 8, fontSize: 11, fontWeight: 600,
                textDecoration: "none", fontFamily: "'Outfit',sans-serif",
                transition: "all 0.2s",
              }}
              onMouseOver={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#0ea5e9"; (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
              onMouseOut={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(14,165,233,0.1)"; (e.currentTarget as HTMLAnchorElement).style.color = "#0ea5e9"; }}>
              <ExternalLink size={11} /> Open
            </a>
            <a href={doc.file_url} download={doc.name}
              style={{
                display: "flex", alignItems: "center",
                padding: "6px 8px", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)",
                borderRadius: 8, textDecoration: "none", transition: "all 0.2s",
              }}
              onMouseOver={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
              onMouseOut={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.5)"; }}>
              <Download size={12} />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Subject list ───────────────────────────────────────────────────────────────
export default function StudentSubjectsPage({ studentId }: { studentId: string }) {
  const { data: subjects, loading, error } = useStudentSubjects(studentId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId && subjects) {
    const subject = subjects.find((s: DBSubject) => s.id === openId);
    if (subject) {
      return <SubjectDocuments subject={subject} studentId={studentId} onBack={() => setOpenId(null)} />;
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
        Subjects & Notes
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>
        Access study materials uploaded by your faculty. Updates are instant.
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading your subjects…</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#ef4444" }}>Error: {error}</div>
      )}
      {!loading && (subjects || []).length === 0 && (
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", padding: "40px 0", textAlign: "center" }}>
          You have no enrolled subjects. Contact your administrator.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {(subjects || []).map((s: DBSubject) => (
          <button key={s.id} onClick={() => setOpenId(s.id)} style={{
            padding: "20px", background: "rgba(255,255,255,0.02)",
            border: `1px solid ${s.color}25`, borderRadius: 14,
            textAlign: "left", cursor: "pointer", transition: "all 0.2s",
            fontFamily: "'Outfit',sans-serif",
          }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
            <div style={{ height: 3, background: s.color, borderRadius: 3, marginBottom: 16 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11, background: `${s.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: s.color,
              }}>{s.code.split(" ")[1]}</div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono',monospace" }}>{s.code}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, fontFamily: "'Syne',sans-serif" }}>
              {s.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={10} /> Tap to view materials
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
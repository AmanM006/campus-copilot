// components/faculty/SubjectsView.tsx
// ─── Replaces the hardcoded SubjectsView in teacher/page.tsx ────────────────
// Drop-in replacement — same props surface as before plus facultyId.

"use client";
import React, { useState, useRef } from "react";
import { ArrowLeft, Upload, Trash2, ChevronRight, FileText, ExternalLink } from "lucide-react";
import { useDocuments, useFacultySubjects } from "@/hooks/useData";
import type { DBSubject, DBDocument } from "@/lib/types";

// ── helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes: number) {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function DocIcon({ type }: { type: DBDocument["type"] }) {
  if (type === "slides") return <span>🎞️</span>;
  if (type === "notes")  return <span>📝</span>;
  return <span>📄</span>;
}

// ── Subject detail (documents for one subject) ────────────────────────────────
function SubjectDetail({
  subject,
  facultyId,
  onBack,
}: {
  subject: DBSubject;
  facultyId: string;
  onBack: () => void;
}) {
  const { docs, loading, error, upload, remove } = useDocuments(subject.id);
  const [uploading, setUploading] = useState(false);
  const [notif, setNotif]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (m: string) => { setNotif(m); setTimeout(() => setNotif(null), 3500); };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await upload(file, facultyId);
      notify(`✅ "${file.name}" uploaded — visible to students instantly`);
    } catch (e: any) {
      notify(`❌ Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (doc: DBDocument) => {
    if (!confirm(`Remove "${doc.name}"?`)) return;
    try {
      await remove({ id: doc.id, file_path: doc.file_path });
      notify("Document removed.");
    } catch (e: any) {
      notify(`❌ ${e.message}`);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      {notif && (
        <div style={{
          position: "fixed", top: 20, right: 20,
          background: notif.startsWith("❌") ? "#ef4444" : "#0ea5e9",
          color: "#fff", padding: "10px 18px", borderRadius: 10,
          fontSize: 13, fontWeight: 500, zIndex: 100,
        }}>{notif}</div>
      )}

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
            {subject.code}
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div style={{
        background: "rgba(14,165,233,0.05)", border: "2px dashed rgba(14,165,233,0.2)",
        borderRadius: 14, padding: "20px 24px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <Upload size={20} style={{ color: "#0ea5e9", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
            Upload Study Material
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            PDFs, slides, and notes appear instantly for enrolled students
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.ppt,.pptx,.doc,.docx"
          onChange={handleUpload}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 18px", background: "#0ea5e9", color: "#fff",
            border: "none", borderRadius: 9, cursor: uploading ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "'Outfit',sans-serif",
            opacity: uploading ? 0.6 : 1,
          }}>
          {uploading
            ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            : <Upload size={14} />}
          {uploading ? "Uploading…" : "Choose File"}
        </button>
      </div>

      {/* Document list */}
      <div style={{
        fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.3)",
        textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10,
      }}>
        Uploaded Materials ({docs.length})
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>
          Fetching documents…
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#ef4444", padding: "8px 0" }}>
          Error: {error}
        </div>
      )}
      {!loading && docs.length === 0 && (
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)", padding: "32px 0", textAlign: "center" }}>
          No materials uploaded yet. Upload the first one above.
        </div>
      )}

      {docs.map(doc => (
        <div key={doc.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, marginBottom: 6,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}><DocIcon type={doc.type} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {formatSize(doc.size_bytes || 0)}
              {doc.pages ? ` · ${doc.pages} pages` : ""}
              {" · "}{new Date(doc.created_at).toLocaleDateString("en-IN")}
            </div>
          </div>
          <span style={{
            fontSize: 10, color: "#10b981", background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)", padding: "2px 8px", borderRadius: 100, flexShrink: 0,
          }}>Live</span>
          <a
            href={doc.file_url} target="_blank" rel="noopener noreferrer"
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: 4, borderRadius: 5, display: "flex", flexShrink: 0, textDecoration: "none" }}
            onMouseOver={e => (e.currentTarget.style.color = "#0ea5e9")}
            onMouseOut={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}>
            <ExternalLink size={13} />
          </a>
          <button
            onClick={() => handleDelete(doc)}
            style={{ background: "transparent", border: "none", color: "rgba(255,100,100,0.5)", cursor: "pointer", padding: 4, borderRadius: 5, display: "flex", flexShrink: 0 }}
            onMouseOver={e => (e.currentTarget.style.color = "#ef4444")}
            onMouseOut={e => (e.currentTarget.style.color = "rgba(255,100,100,0.5)")}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Subject list ───────────────────────────────────────────────────────────────
export default function SubjectsView({ facultyId }: { facultyId: string }) {
  const { data: subjects, loading, error } = useFacultySubjects(facultyId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId && subjects) {
    const subject = subjects.find((s: DBSubject) => s.id === openId);
    if (subject) {
      return <SubjectDetail subject={subject} facultyId={facultyId} onBack={() => setOpenId(null)} />;
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
        Subjects
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>
        Manage materials for each subject. Uploads appear instantly for students.
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading subjects…</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#ef4444" }}>Error: {error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {(subjects || []).map((s: any) => (
          <button
            key={s.id}
            onClick={() => setOpenId(s.id)}
            style={{
              padding: "20px", background: "rgba(255,255,255,0.02)",
              border: `1px solid ${s.color}25`, borderRadius: 14,
              textAlign: "left", cursor: "pointer", transition: "all 0.2s",
              fontFamily: "'Outfit',sans-serif",
            }}
            onMouseOver={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
            }}
            onMouseOut={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}>
            <div style={{ height: 3, background: s.color, borderRadius: 3, marginBottom: 16 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: `${s.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: s.color,
              }}>{s.code.split(" ")[1]}</div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono',monospace" }}>{s.code}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, fontFamily: "'Syne',sans-serif" }}>
              {s.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {s.document_count ?? 0} docs · {s.student_count ?? 0} students
              </span>
              <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.25)" }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
"use client";
import { SubjectsPage } from "@/components/student/SubjectsPage";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function Page() {
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  
  useEffect(() => {
    try {
      setId(sessionStorage.getItem("cc_id") || "");
      setEmail(sessionStorage.getItem("cc_email") || "");
    } catch {}
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#04070e", color: "#fff" }}>
      {/* Optional: A quick nav bar so you can get back to the chat dashboard */}
      <div style={{ padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <Link href="/chat" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: "'Outfit', sans-serif" }}>
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>
      </div>
      
      {/* The actual subjects page */}
      <SubjectsPage studentId={id} email={email} />
    </div>
  );
}
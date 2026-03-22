"use client";
// app/login/page.tsx  v4
// ─────────────────────────────────────────────────────────────────────────────
// Changes:
//  1. Microsoft SSO button — collects institutional email, calls /api/microsoft-auth
//     which auto-creates the user if domain is registered
//  2. Email+password fallback — looks up via lookupUserByEmail (exact + ILIKE)
//  3. Clear error messages (tells user if domain not registered vs wrong password)

import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  lookupUserByEmail, persistSession, dashboardFor,
  guessRoleFromEmail, emailToId, upsertUser,
} from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [info,     setInfo]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  // ── Email + password login ────────────────────────────────────────────────
  const attempt = async (rawEmail: string, rawPw: string) => {
    setError(""); setInfo(""); setLoading(true);
    const e = rawEmail.trim().toLowerCase();

    if (rawPw.trim() !== "demo") {
      setError("Incorrect password. Default password is: demo");
      setLoading(false); return;
    }

    const user = await lookupUserByEmail(e);
    if (!user) {
      // Try auto-creating from domain if college is registered
      const domain = e.split("@")[1] || "";
      const created = await tryAutoCreate(e, domain);
      if (created) {
        persistSession(created);
        router.push(dashboardFor(created.role));
        return;
      }
      setError(
        `"${e}" is not in the system yet.\n\n` +
        `If your college is registered:\n` +
        `→ Ask your admin to add your email in Admin → User Registry\n` +
        `→ Or use the Microsoft SSO button below\n\n` +
        `If you're an admin setting up a new college:\n` +
        `→ Complete onboarding at /onboarding first`
      );
      setLoading(false); return;
    }

    persistSession(user);
    router.push(dashboardFor(user.role));
  };

  // ── Auto-create if domain is from a registered college ───────────────────
  const tryAutoCreate = async (email: string, domain: string) => {
    try {
      const { supabase } = await import("@/lib/supabase");
      // Check if any integration_sources matches this domain
      const domainBase = domain.split(".").slice(-2).join(".");
      const { data } = await supabase
        .from("integration_sources")
        .select("college_name")
        .ilike("portal_url", `%${domainBase}%`)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      const role = guessRoleFromEmail(email);
      const id   = emailToId(email);
      const user = {
        id,
        email:       email.toLowerCase(),
        name:        email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        role,
        department:  data.college_name,
        designation: role === "student" ? "Student" : "Faculty",
      };
      const ok = await upsertUser(user);
      return ok ? user : null;
    } catch { return null; }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password.trim()) { setError("Please enter your password."); return; }
    attempt(email, password);
  };

  // ── Microsoft SSO ─────────────────────────────────────────────────────────
  // In production: replace prompt() with real MSAL / Azure AD OAuth flow.
  // The /api/microsoft-auth route handles creating the user in Supabase.
  const handleMicrosoft = async () => {
    setSsoLoading(true);
    setError(""); setInfo("");

    // Simulate Microsoft OAuth — collect email (in real app this comes from
    // Azure AD id_token after redirect)
    const msEmail = window.prompt(
      "Microsoft SSO — Enter your institutional email:\n(In production this popup is replaced by Azure AD)"
    );
    if (!msEmail) { setSsoLoading(false); return; }

    try {
      const resp = await fetch("/api/microsoft-auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email: msEmail.trim().toLowerCase(),
          name:  msEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          // In real OAuth: also send id_token, access_token from MSAL
        }),
      });
      const data = await resp.json();

      if (data.success && data.user) {
        persistSession(data.user);
        router.push(dashboardFor(data.user.role));
      } else {
        setError(data.error || "Microsoft login failed");
      }
    } catch (err: any) {
      setError(`SSO error: ${err.message}`);
    } finally {
      setSsoLoading(false);
    }
  };

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", height:"100vh", background:"#000", color:"#fff", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        .bg{position:fixed;inset:0;background:radial-gradient(ellipse 120% 80% at 50% -10%,rgba(47,128,237,0.22) 0%,#000 55%);}
        .field{width:100%;height:50px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:0 14px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s;}
        .field:focus{border-color:rgba(47,128,237,0.6);}
        .field::placeholder{color:rgba(255,255,255,0.25);}
        .btn-ms{width:100%;height:50px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px;font-weight:500;font-family:'DM Sans',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;transition:all .2s;margin-bottom:20px;}
        .btn-ms:hover:not(:disabled){background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.2);}
        .btn-ms:disabled{opacity:0.5;cursor:not-allowed;}
        .btn-main{width:100%;height:50px;background:#2f80ed;border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;font-family:'DM Sans',sans-serif;}
        .btn-main:hover:not(:disabled){background:#1d6cd9;transform:translateY(-1px);}
        .btn-main:disabled{opacity:.5;cursor:not-allowed;}
        .divider{display:flex;align-items:center;color:rgba(255,255,255,0.2);font-size:10px;text-transform:uppercase;letter-spacing:.12em;margin:20px 0;}
        .divider::before,.divider::after{content:'';flex:1;border-bottom:1px solid rgba(255,255,255,0.07);}
        .divider::before{margin-right:12px;}.divider::after{margin-left:12px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;}
      `}</style>

      <div className="bg" />

      <nav style={{ position:"relative", zIndex:10, padding:"22px 36px" }}>
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".06em", color:"rgba(255,255,255,.35)", textDecoration:"none" }}>
          <ArrowLeft size={13} /> Back
        </Link>
      </nav>

      <div style={{ flex:1, position:"relative", zIndex:10, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ fontSize:34, fontWeight:500, letterSpacing:"-0.03em", marginBottom:6 }}>Sign in</div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,.4)", marginBottom:28 }}>CampusCopilot — your institutional account</div>

          {/* Microsoft SSO */}
          <button className="btn-ms" onClick={handleMicrosoft} disabled={ssoLoading}>
            {ssoLoading ? <span className="spin"/> : (
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
                <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
            )}
            Continue with Microsoft
          </button>

          <div className="divider">or sign in with email + password</div>

          {/* Error */}
          {error && (
            <div style={{ display:"flex", gap:9, background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.2)", borderRadius:10, padding:"11px 14px", fontSize:12, color:"#fca5a5", marginBottom:14, whiteSpace:"pre-wrap", lineHeight:1.7 }}>
              <AlertCircle size={14} style={{ flexShrink:0, marginTop:2 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Info */}
          {info && (
            <div style={{ display:"flex", gap:9, background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.2)", borderRadius:10, padding:"11px 14px", fontSize:12, color:"#4ade80", marginBottom:14 }}>
              <CheckCircle size={14} style={{ flexShrink:0, marginTop:1 }} />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <input type="email" placeholder="Institutional email" className="field"
              value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
              autoComplete="email" />
            <div style={{ position:"relative" }}>
              <input type={showPw ? "text" : "password"} placeholder="Password (default: demo)" className="field"
                value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
                style={{ paddingRight:44 }} />
              <button type="button" onClick={() => setShowPw(p=>!p)}
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", color:"rgba(255,255,255,.3)", cursor:"pointer", display:"flex", padding:4 }}>
                {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
            <button type="submit" className="btn-main" disabled={loading} style={{ marginTop:4 }}>
              {loading ? <span className="spin"/> : <>Sign In <ArrowRight size={14}/></>}
            </button>
          </form>

          <div style={{ marginTop:24, padding:"14px 16px", background:"rgba(255,255,255,.02)", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, fontSize:11, color:"rgba(255,255,255,.3)", fontFamily:"'DM Mono',monospace", lineHeight:2 }}>
            <div>@learner.manipal.edu → Student → /chat</div>
            <div>@manipal.edu → Faculty → /teacher</div>
            <div>Admin (from onboarding) → /admin</div>
            <div style={{ marginTop:4 }}>Default password: <span style={{ color:"rgba(255,255,255,.55)" }}>demo</span></div>
            <div style={{ marginTop:6, fontSize:10, color:"rgba(255,255,255,.2)" }}>
              If your email is not found, ask your admin to add it in<br/>Admin → User Registry → Add User
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
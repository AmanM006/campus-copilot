"use client";
import React, { useState } from "react";
import { ArrowLeft, ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORISED ACCOUNTS — add/remove emails here for the prototype
// Role is auto-detected from domain:
//   @learner.manipal.edu  →  student  →  /chat
//   @manipal.edu          →  faculty  →  /teacher
// ─────────────────────────────────────────────────────────────────────────────
const ACCOUNTS: Record<string, { name: string; password: string }> = {
  // ── Students ──────────────────────────────────────────────────────────────
  "240957160@learner.manipal.edu":  { name: "Aman Mishra",          password: "demo" },
  "213cs1001@learner.manipal.edu":  { name: "Aman Mehta",           password: "demo" },
  "213cs1002@learner.manipal.edu":  { name: "Priya Nair",           password: "demo" },

  // ── Faculty ───────────────────────────────────────────────────────────────
  "kkp.prakash@manipal.edu":        { name: "Krishna Prakasha K",   password: "demo" },
  "priya.sharma@manipal.edu":       { name: "Dr. Priya Sharma",     password: "demo" },
};

function detectRole(email: string): "student" | "faculty" | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain === "learner.manipal.edu") return "student";
  if (domain === "manipal.edu")         return "faculty";
  return null;
}

export default function LoginPage() {
  const router   = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const attemptLogin = (rawEmail: string, rawPassword: string) => {
    setError("");
    const e = rawEmail.trim().toLowerCase();
    const account = ACCOUNTS[e];

    if (!account) {
      setError("Email not recognised. Contact your administrator.");
      return;
    }
    if (account.password !== rawPassword) {
      setError("Incorrect password.");
      return;
    }
    const role = detectRole(e);
    if (!role) {
      setError("Email domain not supported.");
      return;
    }

    setLoading(true);
    // Store session (replace with real JWT/session cookie in production)
    sessionStorage.setItem("cc_email", e);
    sessionStorage.setItem("cc_name",  account.name);
    sessionStorage.setItem("cc_role",  role);

    setTimeout(() => {
      router.push(role === "faculty" ? "/teacher" : "/chat");
    }, 800);
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    attemptLogin(email, password);
  };

  // Simulated Microsoft SSO — in production wire up MSAL.js here
  // The token from Azure AD will contain user.mail which we compare against ACCOUNTS
  const handleMicrosoftSSO = () => {
    const mockEmail = window.prompt("🔵 Microsoft SSO (prototype)\n\nEnter your Manipal email:");
    if (!mockEmail) return;
    attemptLogin(mockEmail, "demo"); // SSO skips password check in real flow
  };

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif", height: "100vh", width: "100vw",
      overflow: "hidden", position: "relative", display: "flex",
      flexDirection: "column", color: "#fff",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }

        .login-bg {
          position: absolute; inset: 0; z-index: 0; background: #000;
        }
        .login-bg::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse 100% 100% at 50% -20%, rgba(109,40,217,0.4) 0%, rgba(10,10,10,1) 60%);
          pointer-events: none;
        }

        .login-container {
          position: relative; z-index: 10; flex: 1;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px 20px;
        }
        .login-content { width: 100%; max-width: 420px; }

        .login-headline {
          font-size: clamp(42px, 6vw, 68px);
          font-weight: 500; letter-spacing: -0.04em;
          line-height: 0.95; margin-bottom: 14px; color: #fff;
        }
        .login-sub {
          color: rgba(255,255,255,0.45); font-size: 15px;
          line-height: 1.6; margin-bottom: 40px;
        }

        .pill-input {
          width: 100%; height: 54px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 100px;
          padding: 0 24px; color: #fff; font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.25s; outline: none; margin-bottom: 12px; display: block;
        }
        .pill-input:focus {
          border-color: #7c3aed;
          background: rgba(124,58,237,0.06);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        .pill-input::placeholder { color: rgba(255,255,255,0.28); }

        .pill-btn-primary {
          width: 100%; height: 54px;
          background: #fff; color: #000;
          border: none; border-radius: 100px;
          font-size: 13px; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
          cursor: pointer; display: flex;
          align-items: center; justify-content: center; gap: 8px;
          transition: all 0.25s; margin-top: 4px;
        }
        .pill-btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255,255,255,0.12);
        }
        .pill-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .pill-btn-ms {
          width: 100%; height: 54px;
          background: rgba(255,255,255,0.04); color: #fff;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 100px;
          font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 11px; transition: all 0.25s;
          margin-bottom: 28px;
        }
        .pill-btn-ms:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.2);
        }

        .divider {
          display: flex; align-items: center; color: rgba(255,255,255,0.2);
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
          margin: 28px 0;
        }
        .divider::before, .divider::after {
          content: ''; flex: 1;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .divider::before { margin-right: 12px; }
        .divider::after  { margin-left:  12px; }

        .error-box {
          display: flex; align-items: center; gap: 9px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.22);
          border-radius: 12px; padding: 11px 16px;
          font-size: 13px; color: #fca5a5; margin-bottom: 14px;
          animation: err-in 0.2s ease;
        }
        @keyframes err-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

        .role-hint {
          margin-top: 28px; text-align: center;
          font-size: 11px; color: rgba(255,255,255,0.18);
          font-family: 'DM Mono', monospace; letter-spacing: 0.08em;
          line-height: 1.8;
        }
        .role-dot-student { color: #a78bfa; }
        .role-dot-faculty { color: #60a5fa; }

        .loader {
          width: 17px; height: 17px;
          border: 2px solid rgba(0,0,0,0.15);
          border-bottom-color: #000; border-radius: 50%;
          animation: spin 0.8s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="login-bg" />

      {/* Back nav */}
      <nav style={{ position:"absolute", top:0, left:0, right:0, zIndex:100, padding:"28px 36px" }}>
        <Link href="/" style={{
          display:"flex", alignItems:"center", gap:7,
          fontSize:11, fontWeight:700, textTransform:"uppercase",
          letterSpacing:"0.06em", color:"rgba(255,255,255,0.4)",
          width:"max-content", textDecoration:"none", transition:"color 0.2s",
        }}
          onMouseOver={e => (e.currentTarget.style.color="#fff")}
          onMouseOut={e  => (e.currentTarget.style.color="rgba(255,255,255,0.4)")}>
          <ArrowLeft size={13}/> Return
        </Link>
      </nav>

      <div className="login-container">
        <div className="login-content">

          <h1 className="login-headline">Sign in to<br/>Copilot.</h1>
          <p className="login-sub">Your unified campus intelligence platform.</p>

          {/* Microsoft SSO */}
          <button className="pill-btn-ms" onClick={handleMicrosoftSSO}>
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            Continue with Microsoft
          </button>

          <div className="divider">or sign in with email</div>

          {/* Error */}
          {error && (
            <div className="error-box">
              <AlertCircle size={15} style={{ flexShrink:0 }}/>
              {error}
            </div>
          )}

          {/* Email + password form */}
          <form onSubmit={handleSubmit}>
            <input
              id="email-input"
              type="email"
              placeholder="Manipal email address"
              className="pill-input"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              required
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              className="pill-input"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              required
              autoComplete="current-password"
            />
            <button type="submit" className="pill-btn-primary" disabled={loading}>
              {loading ? <span className="loader"/> : <> Sign In <ArrowRight size={15}/> </>}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}
"use client";
// app/login/page.tsx — OTP login, all redirect bugs fixed (Frontend Direct)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, Suspense } from "react";
import { Mail, ShieldCheck, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Step = "email" | "otp" | "done";

function dashFor(role: string) {
  if (role === "admin")   return "/admin";
  if (role === "faculty") return "/teacher";
  return "/chat";
}

function LoginContent() {
  const [step,  setStep]  = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp,   setOtp]   = useState("");
  const [error, setError] = useState("");
  const [info,  setInfo]  = useState("");
  const [busy,  setBusy]  = useState(false);
  const going = useRef(false);   // prevent double redirect

  // If sessionStorage already has a session, go straight to dashboard
  useEffect(() => {
    try {
      const e = sessionStorage.getItem("cc_email");
      const r = sessionStorage.getItem("cc_role");
      if (e && r && !going.current) {
        going.current = true;
        window.location.replace(dashFor(r));
      }
    } catch { /* SSR or private mode */ }
  }, []);

  // ── Send OTP ───────────────────────────────────────────────────────────────
  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr.includes("@")) { setError("Enter a valid email address."); return; }

    setError(""); setInfo(""); setBusy(true);

    try {
      // 1. Check allow-list — only admin-added emails can log in
      const { data: row, error: dbErr } = await supabase
        .from("users")
        .select("id, email, name, role")
        .ilike("email", addr)
        .maybeSingle();

      if (dbErr) throw new Error(dbErr.message);

      if (!row) {
        setError(
          `"${addr}" is not registered.\n\n` +
          `Ask your college admin to add you in\nAdmin → User Registry.`
        );
        return;
      }

      // 2. Send OTP via Supabase Auth
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: addr,
        options: {
          shouldCreateUser: true,   // creates auth.users entry for bulk-imported users
        },
      });

      if (otpErr) throw new Error(otpErr.message);

      setInfo(`Code sent to ${addr}. Check your inbox and spam folder.`);
      setStep("otp");

    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otp.trim();
    const addr  = email.trim().toLowerCase();

    if (token.length < 6) { setError("Enter the full code."); return; }
    if (going.current) return;

    setError(""); setBusy(true);

    try {
      // verifyOtp with type:"email"
      const { data, error: vErr } = await supabase.auth.verifyOtp({
        email: addr,
        token,
        type:  "email",
      });

      // If Supabase returns an error the code is wrong/expired
      if (vErr) {
        setError(`Incorrect or expired code.\n${vErr.message}`);
        setBusy(false);
        return;
      }

      // ── Verification succeeded ──────────────────────────────────────────
      // Force sync the secure session to the local browser immediately
      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
      }

      // Fetch profile from public.users (not auth.users — we want our data)
      const { data: row } = await supabase
        .from("users")
        .select("id, name, role, email")
        .ilike("email", addr)
        .maybeSingle();

      const role = row?.role || "student";
      const name = row?.name || addr.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const id   = row?.id   || addr.split("@")[0].replace(/[^a-z0-9_-]/gi, "_");

      // Write to sessionStorage
      try {
        sessionStorage.setItem("cc_email", addr);
        sessionStorage.setItem("cc_name",  name);
        sessionStorage.setItem("cc_role",  role);
        sessionStorage.setItem("cc_id",    id);
      } catch { /* private mode */ }

      going.current = true;
      setStep("done");

      // Tiny timeout ensures the browser completes writing the secure token to cookies/localStorage
      // before we trigger the hard page navigation.
      setTimeout(() => {
        window.location.href = dashFor(role);
      }, 400);

    } catch (err: any) {
      setError(err.message || "Verification failed. Try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: "#fff",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        .glow{position:fixed;inset:0;background:radial-gradient(ellipse 140% 70% at 50% -5%,rgba(47,128,237,0.18),#000 55%);pointer-events:none}
        .card{position:relative;z-index:1;width:100%;max-width:400px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);border-radius:20px;padding:36px 30px}
        .field{width:100%;height:52px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:0 14px;color:#fff;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s,box-shadow .2s}
        .field:focus{border-color:rgba(47,128,237,0.6);box-shadow:0 0 0 3px rgba(47,128,237,0.08)}
        .field::placeholder{color:rgba(255,255,255,0.2)}
        .otp-field{text-align:center;font-size:30px;font-weight:700;letter-spacing:0.3em;font-family:'DM Mono',monospace;height:64px;padding:0 8px}
        .btn{width:100%;height:50px;background:#2f80ed;border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;font-family:'DM Sans',sans-serif}
        .btn:hover:not(:disabled){background:#1d6cd9;transform:translateY(-1px);box-shadow:0 4px 16px rgba(47,128,237,0.3)}
        .btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
        .ghost{background:transparent;border:none;color:rgba(255,255,255,0.35);font-size:12px;cursor:pointer;text-decoration:underline;font-family:'DM Sans',sans-serif;padding:0}
        .ghost:hover{color:rgba(255,255,255,0.65)}
        .err{display:flex;gap:8px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:11px 14px;font-size:12px;color:#fca5a5;margin-bottom:14px;white-space:pre-wrap;line-height:1.7;align-items:flex-start}
        .inf{display:flex;gap:8px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:11px 14px;font-size:12px;color:#4ade80;margin-bottom:14px;align-items:flex-start}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{width:15px;height:15px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
        @keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .up{animation:up .22s ease}
      `}</style>

      <div className="glow" />
      <div className="card up">

        {/* ── Header ── */}
        <div style={{ textAlign:"center", marginBottom:26 }}>
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:"rgba(255,255,255,0.3)", marginBottom:10 }}>
            Campus<span style={{ color:"#2f80ed" }}>Copilot</span>
          </div>

          {step === "email" && <>
            <div style={{ fontSize:25, fontWeight:600, letterSpacing:"-0.02em" }}>Sign in</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginTop:6, lineHeight:1.65 }}>
              Enter your institutional email —<br/>we'll send a one-time sign-in code.
            </div>
          </>}

          {step === "otp" && <>
            <div style={{ fontSize:25, fontWeight:600, letterSpacing:"-0.02em" }}>Check your email</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginTop:6, lineHeight:1.65 }}>
              Code sent to<br/>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"rgba(255,255,255,0.7)" }}>{email}</span>
            </div>
          </>}

          {step === "done" && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"8px 0" }}>
              <CheckCircle size={40} color="#10b981" strokeWidth={1.5} />
              <div style={{ fontSize:20, fontWeight:600, color:"#4ade80" }}>Signed in!</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>Taking you to your dashboard…</div>
            </div>
          )}
        </div>

        {/* ── Error / Info banners ── */}
        {error && (
          <div className="err">
            <AlertCircle size={14} style={{ marginTop:2, flexShrink:0 }} />
            <span>{error}</span>
          </div>
        )}
        {info && !error && (
          <div className="inf">
            <CheckCircle size={14} style={{ marginTop:2, flexShrink:0 }} />
            <span>{info}</span>
          </div>
        )}

        {/* ── Email form ── */}
        {step === "email" && (
          <form onSubmit={sendOtp} style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ position:"relative" }}>
              <Mail size={14} color="rgba(255,255,255,0.22)" style={{
                position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", pointerEvents:"none",
              }}/>
              <input
                type="email"
                className="field"
                placeholder="you@yourcollege.edu"
                value={email}
                autoComplete="email"
                autoFocus
                onChange={e => { setEmail(e.target.value); setError(""); }}
                style={{ paddingLeft:40 }}
              />
            </div>
            <button className="btn" type="submit" disabled={busy || !email.includes("@")}>
              {busy ? <span className="spin"/> : <><ShieldCheck size={14}/> Send Code</>}
            </button>
          </form>
        )}

        {/* ── OTP form ── */}
        {step === "otp" && (
          <form onSubmit={verifyOtp} style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <input
              type="text"
              inputMode="numeric"
              className="field otp-field"
              placeholder="00000000"
              maxLength={8}
              value={otp}
              autoFocus
              onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
            />
            <button className="btn" type="submit" disabled={busy || otp.length < 6}>
              {busy ? <span className="spin"/> : <><ArrowRight size={14}/> Verify & Sign In</>}
            </button>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <button type="button" className="ghost"
                onClick={() => { setStep("email"); setOtp(""); setError(""); setInfo(""); }}>
                ← Change email
              </button>
              <button type="button" className="ghost" disabled={busy}
                onClick={() => { setOtp(""); setError(""); setInfo(""); sendOtp(); }}>
                Resend code
              </button>
            </div>
          </form>
        )}

        {/* ── Footer ── */}
        {step !== "done" && (
          <div style={{
            marginTop:22, padding:"11px 13px",
            background:"rgba(255,255,255,0.02)",
            border:"1px solid rgba(255,255,255,0.05)",
            borderRadius:10,
            fontFamily:"'DM Mono',monospace",
            fontSize:10, lineHeight:2,
            color:"rgba(255,255,255,0.22)",
          }}>
            <div>@learner.manipal.edu → Student → /chat</div>
            <div>@manipal.edu         → Faculty → /teacher</div>
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, marginTop:5, color:"rgba(255,255,255,0.18)" }}>
              Only admin-added emails can sign in.{" "}
              <a href="/onboarding" style={{ color:"#2f80ed", textDecoration:"none" }}>
                Set up your college →
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ height:"100vh", background:"#000" }}/>}>
      <LoginContent/>
    </Suspense>
  );
}
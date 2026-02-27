"use client";
import React, { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // 1. Grab the email from the input (assuming you add an ID 'email-input' to it)
    const email = (document.getElementById('email-input') as HTMLInputElement)?.value || "arjun@learner.manipal.edu";
    
    // 2. Extract the university name (e.g., 'manipal' from 'learner.manipal.edu')
    const domain = email.split('@')[1]; // 'learner.manipal.edu'
    const uniName = domain.split('.')[1]; // 'manipal'

    // 3. Route them to the chat, passing the university as a URL parameter
    setTimeout(() => {
      router.push(`/chat?uni=${uniName}`); 
    }, 1200);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", height: "100vh", width: "100vw", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #7c3aed; color: #fff; }

        /* Premium dark studio gradient background */
/* New visible deep violet gradient */
        .login-bg {
          position: absolute; inset: 0; z-index: 0;
          background: #000;
        }
        .login-bg::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse 100% 100% at 50% -20%, rgba(109, 40, 217, 0.4) 0%, rgba(10, 10, 10, 1) 60%);
          pointer-events: none;
        }
        .login-container {
          position: relative; z-index: 10; flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 40px 20px;
        }

        .login-content {
          width: 100%; max-width: 420px;
        }

        /* Massive, editorial typography matching the landing page */
        .login-headline {
          font-size: clamp(48px, 6vw, 72px);
          font-weight: 500;
          letter-spacing: -0.04em;
          line-height: 0.95;
          margin-bottom: 16px;
          color: #fff;
        }
        .login-sub {
          color: rgba(255,255,255,0.5);
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 48px;
        }

        /* Sleek Pill Inputs */
        .input-group { position: relative; margin-bottom: 16px; }
        .pill-input {
          width: 100%; height: 56px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1); 
          border-radius: 100px;
          padding: 0 24px; color: #fff; font-size: 15px;
          transition: all 0.3s ease; outline: none;
        }
        .pill-input:focus { 
          border-color: #7c3aed; 
          background: rgba(255,255,255,0.06); 
        }
        .pill-input::placeholder { color: rgba(255,255,255,0.3); }

        /* Pill Buttons */
        .pill-btn-primary {
          width: 100%; height: 56px;
          background: #fff; color: #000;
          border: none; border-radius: 100px;
          font-size: 14px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.3s ease; margin-top: 8px;
        }
        .pill-btn-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 20px rgba(255,255,255,0.1); }
        
        .pill-btn-ms {
          width: 100%; height: 56px;
          background: rgba(255,255,255,0.05); color: #fff;
          border: 1px solid rgba(255,255,255,0.1); border-radius: 100px;
          font-size: 15px; font-weight: 500;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px;
          transition: all 0.3s ease; margin-bottom: 32px;
        }
        .pill-btn-ms:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }

        .divider {
          display: flex; align-items: center; text-align: center; color: rgba(255,255,255,0.2);
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin: 32px 0;
        }
        .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .divider:not(:empty)::before { margin-right: 1em; }
        .divider:not(:empty)::after { margin-left: 1em; }

        .loader {
          width: 18px; height: 18px; border: 2px solid rgba(0,0,0,0.2);
          border-bottom-color: #000; border-radius: 50%;
          display: inline-block; box-sizing: border-box; animation: rotation 1s linear infinite;
        }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>

      {/* Top Nav / Back Button */}
      <nav style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, padding: '32px 40px' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', width: 'max-content', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#fff'} onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}>
          <ArrowLeft size={14} /> RETURN
        </Link>
      </nav>

      {/* New subtle, premium dark gradient background */}
      <div className="login-bg" />

      <div className="login-container">
        <div className="login-content">
          
          <h1 className="login-headline">Sign in to<br/>Copilot.</h1>
          <p className="login-sub">Access your unified campus intelligence.</p>

          {/* Microsoft SSO Button */}
          <button className="pill-btn-ms" onClick={handleDemoLogin}>
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            Continue with Microsoft
          </button>

          <div className="divider">or use email</div>

          {/* Clean, empty email form */}
          <form onSubmit={handleDemoLogin}>
            <div className="input-group">
              <input type="email" placeholder="Learner Email Address" className="pill-input" required />
            </div>
            
            <div className="input-group">
              <input type="password" placeholder="Password" className="pill-input" required />
            </div>

            <button type="submit" className="pill-btn-primary" disabled={isLoading}>
              {isLoading ? <span className="loader"></span> : (
                <>Sign In <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div style={{ marginTop: '48px', fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em' }}>
            SECURED VIA AZURE AD B2C
          </div>

        </div>
      </div>
    </div>
  );
}
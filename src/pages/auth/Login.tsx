import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const EMAIL_RE = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, config: object) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { signInWithGoogleCredential, signInWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const redirectTo = (location.state as { from?: string } | null)?.from || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [emailErr, setEmailErr] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#1B202A";

    const scriptId = "google-gsi";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    } else {
      initGoogle();
    }

    return () => {
      document.body.style.backgroundColor = originalBg;
    };
  }, []);

  function initGoogle() {
    if (!window.google || !googleBtnRef.current || !GOOGLE_CLIENT_ID) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
    googleBtnRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: googleBtnRef.current.offsetWidth || 390,
      text: "signin_with",
    });
  }

  async function handleGoogleCredential(response: { credential: string }) {
    try {
      setIsSubmitting(true);
      setGoogleError("");
      await signInWithGoogleCredential(response.credential);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : "Google sign-in failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let valid = true;
    setEmailErr("");
    setPwErr("");
    setFormError("");

    if (!EMAIL_RE.test(email.toLowerCase())) {
      setEmailErr("Please enter a valid email.");
      valid = false;
    }
    if (password.length === 0) {
      setPwErr("Please enter your password.");
      valid = false;
    }
    if (!valid) return;

    try {
      setIsSubmitting(true);
      await signInWithEmail(email, password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputStyle = (err: boolean): React.CSSProperties => ({
    width: "100%",
    height: "44px",
    border: `1px solid ${err ? "#e53e3e" : "#e0e0e0"}`,
    borderRadius: "6px",
    padding: "0 14px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: "16px",
    color: "#0f0f0f",
    background: "#f5f5f5",
    outline: "none",
    transition: "all 0.2s ease",
    boxShadow: err ? "0 0 0 3px rgba(229,62,62,0.15)" : undefined,
  });

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#1B202A] font-['DM_Sans',sans-serif] lg:justify-start lg:pl-[80px]">
      <div className="flex min-h-[620px] w-[90%] max-w-[510px] flex-col justify-center bg-[#f5f5f5] px-6 py-10 shadow-[0_8px_40px_rgba(0,0,0,0.3)] sm:px-[60px] md:w-full">
        <form onSubmit={handleSubmit} noValidate>
          <Link to="/">
            <img src="/branding/Logo.png" alt="LingoWatch" style={{ height: "60px", width: "60px", objectFit: "contain", marginBottom: "24px" }} />
          </Link>

          <h1 style={{ fontWeight: 500, fontSize: "22px", color: "#0f0f0f", marginBottom: "6px" }}>Welcome back</h1>
          <p style={{ fontWeight: 400, fontSize: "14px", color: "#888", marginBottom: "20px" }}>
            Log in to sync saved words, stories, and audio across devices.
          </p>

          <div style={{ marginBottom: "10px", display: "inline-flex", borderRadius: "999px", background: "#E8EEF8", color: "#1B202A", fontSize: "11px", fontWeight: 600, padding: "4px 10px" }}>
            Recommended: Continue with Google
          </div>
          <div ref={googleBtnRef} style={{ width: "100%", marginBottom: "12px", opacity: isSubmitting ? 0.6 : 1, pointerEvents: isSubmitting ? "none" : "auto" }} />
          {googleError && <div style={{ fontSize: "12px", color: "#e53e3e", marginBottom: "12px" }}>{googleError}</div>}

          <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
            <div style={{ flex: 1, borderBottom: "1px solid #e0e0e0" }} />
            <span style={{ padding: "0 10px", color: "#888", fontSize: "13px" }}>or use email</span>
            <div style={{ flex: 1, borderBottom: "1px solid #e0e0e0" }} />
          </div>

          <label style={{ display: "block", marginBottom: "10px" }}>
            <span style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: 600, color: "#555" }}>Email</span>
            <input type="email" placeholder="name@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }} style={inputStyle(Boolean(emailErr))} required />
            {emailErr && <div style={{ fontSize: "12px", color: "#e53e3e", marginTop: "4px", paddingLeft: "2px" }}>{emailErr}</div>}
          </label>

          <label style={{ display: "block", marginBottom: "10px", position: "relative" }}>
            <span style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: 600, color: "#555" }}>Password</span>
            <input type={showPw ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => { setPassword(e.target.value); setPwErr(""); }} style={{ ...inputStyle(Boolean(pwErr)), paddingRight: "40px" }} required />
            <button type="button" onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: "12px", top: "39px", background: "none", border: "none", cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center", padding: "4px" }}>
              {showPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            {pwErr && <div style={{ fontSize: "12px", color: "#e53e3e", marginTop: "4px", paddingLeft: "2px" }}>{pwErr}</div>}
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
            <Link to="/forgot-password" style={{ fontSize: "12px", color: "#6D5EF5", fontWeight: 700, textDecoration: "none" }}>
              Forgot password?
            </Link>
          </div>

          {formError ? <div style={{ fontSize: "12px", color: "#e53e3e", marginBottom: "12px" }}>{formError}</div> : null}

          <button type="submit" disabled={isSubmitting} style={{ width: "100%", height: "46px", background: "#0f0f0f", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "15px", borderRadius: "6px", border: "none", cursor: isSubmitting ? "default" : "pointer", marginBottom: "20px", opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? "Signing in..." : "Log in"}
          </button>

          <div style={{ fontSize: "13px" }}>
            <span style={{ color: "#888" }}>Don't have an account? </span>
            <Link to="/signup" style={{ color: "#0f0f0f", fontWeight: 600, textDecoration: "none" }}>Sign up</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

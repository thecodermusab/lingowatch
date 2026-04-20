import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const EMAIL_RE = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, config: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { signInWithGoogleCredential } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [pwErr, setPwErr]       = useState(false);
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#1B202A';

    const scriptId = 'google-gsi';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
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
    if (!window.google || !googleBtnRef.current) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      width: googleBtnRef.current.offsetWidth || 390,
      text: 'signin_with',
    });
  }

  async function handleGoogleCredential(response: { credential: string }) {
    try {
      setGoogleError('');
      await signInWithGoogleCredential(response.credential);
      navigate('/dashboard');
    } catch {
      setGoogleError('Google sign-in failed. Please try again.');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let valid = true;
    setEmailErr(false);
    setPwErr(false);
    if (!EMAIL_RE.test(email.toLowerCase())) { setEmailErr(true); valid = false; }
    if (password.length === 0)               { setPwErr(true);    valid = false; }
    if (valid) {
      console.log('Email/password login not yet implemented');
    }
  }

  const inputStyle = (err: boolean): React.CSSProperties => ({
    width: '100%', height: '44px', border: `1px solid ${err ? '#e53e3e' : '#e0e0e0'}`,
    borderRadius: '6px', padding: '0 14px', fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px', color: '#0f0f0f', background: '#f5f5f5', outline: 'none',
    transition: 'all 0.2s ease',
    boxShadow: err ? '0 0 0 3px rgba(229,62,62,0.15)' : undefined,
  });

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#1B202A] font-['DM_Sans',sans-serif] lg:justify-start lg:pl-[80px]">
      <div className="flex min-h-[590px] w-[90%] max-w-[510px] flex-col justify-center bg-[#f5f5f5] px-6 py-10 shadow-[0_8px_40px_rgba(0,0,0,0.3)] sm:px-[60px] md:w-full">
        <form onSubmit={handleSubmit} noValidate>

          <Link to="/">
            <img src="/Logo.png" alt="LingoWatch" style={{ height: '60px', width: '60px', objectFit: 'contain', marginBottom: '24px' }} />
          </Link>

          <h1 style={{ fontWeight: 500, fontSize: '22px', color: '#0f0f0f', marginBottom: '6px' }}>Welcome back</h1>
          <p style={{ fontWeight: 400, fontSize: '14px', color: '#888', marginBottom: '24px' }}>Log in to continue to LingoWatch</p>

          {/* Google Sign-In rendered button */}
          <div ref={googleBtnRef} style={{ width: '100%', marginBottom: '20px' }} />
          {googleError && <div style={{ fontSize: '12px', color: '#e53e3e', marginBottom: '12px' }}>{googleError}</div>}

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ flex: 1, borderBottom: '1px solid #e0e0e0' }} />
            <span style={{ padding: '0 10px', color: '#888', fontSize: '13px' }}>or</span>
            <div style={{ flex: 1, borderBottom: '1px solid #e0e0e0' }} />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <input type="email" placeholder="Email address*" value={email} onChange={e => { setEmail(e.target.value); setEmailErr(false); }} style={inputStyle(emailErr)} required />
            {emailErr && <div style={{ fontSize: '12px', color: '#e53e3e', marginTop: '4px', paddingLeft: '2px' }}>Please enter a valid email</div>}
          </div>

          <div style={{ marginBottom: '8px', position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} placeholder="Password*" value={password} onChange={e => { setPassword(e.target.value); setPwErr(false); }} style={{ ...inputStyle(pwErr), paddingRight: '40px' }} required />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center', padding: '4px' }}>
              {showPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            {pwErr && <div style={{ fontSize: '12px', color: '#e53e3e', marginTop: '4px', paddingLeft: '2px' }}>Please enter a valid password</div>}
          </div>

          <a href="#" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#888', textAlign: 'right', display: 'block', marginBottom: '20px', textDecoration: 'none' }}>
            Forgot password?
          </a>

          <button type="submit" style={{ width: '100%', height: '46px', background: '#0f0f0f', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: '15px', borderRadius: '6px', border: 'none', cursor: 'pointer', marginBottom: '20px', transition: 'background 0.2s ease' }}>
            Log in
          </button>

          <div style={{ fontSize: '13px' }}>
            <span style={{ color: '#888' }}>Don't have an account? </span>
            <Link to="/signup" style={{ color: '#0f0f0f', fontWeight: 600, textDecoration: 'none' }}>Sign up</Link>
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

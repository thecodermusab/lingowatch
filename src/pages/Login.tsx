import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  consumeGoogleRedirectCredential,
  promptGoogleCredential,
  startGoogleRedirectSignIn,
} from '@/lib/googleAuth';

const EMAIL_RE = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { signInWithGoogleCredential } = useAuth();
  const promptedRef = useRef(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [pwErr, setPwErr]       = useState(false);
  const [googleErr, setGoogleErr] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (promptedRef.current) return;
    promptedRef.current = true;

    const redirectCredential = consumeGoogleRedirectCredential();
    if (redirectCredential) {
      handleGoogleSignIn(redirectCredential);
      return;
    }

    promptGoogleCredential()
      .then((credential) => handleGoogleSignIn(credential))
      .catch(() => {
        // Keep the page quiet if Google chooses not to show One Tap.
      });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let valid = true;
    setEmailErr(false);
    setPwErr(false);
    if (!EMAIL_RE.test(email.toLowerCase())) { setEmailErr(true); valid = false; }
    if (password.length === 0)               { setPwErr(true);    valid = false; }
    if (valid) {
      console.log('Login submitted');
    }
  }

  async function handleGoogleSignIn(credential: string) {
    setGoogleErr('');
    setGoogleLoading(true);

    try {
      await signInWithGoogleCredential(credential);
      navigate('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      setGoogleErr(message);
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleGoogleButtonClick() {
    setGoogleErr('');

    try {
      startGoogleRedirectSignIn();
    } catch (error) {
      setGoogleErr(error instanceof Error ? error.message : 'Google sign-in failed');
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
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1B202A', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '80px', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden' }}>
      <div style={{ background: '#f5f5f5', width: '510px', height: '590px', borderRadius: 0, padding: '40px 60px', boxShadow: '0 8px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <form onSubmit={handleSubmit} noValidate>

          <Link to="/" aria-label="Go to landing page" style={{ display: 'inline-flex', width: 'fit-content', marginBottom: '24px' }}>
            <img src="/Logo.png" alt="LingoWatch" style={{ height: '60px', width: '60px', objectFit: 'contain' }} />
          </Link>

          <h1 style={{ fontWeight: 500, fontSize: '22px', color: '#0f0f0f', marginBottom: '6px' }}>Welcome back</h1>
          <p style={{ fontWeight: 400, fontSize: '14px', color: '#888', marginBottom: '24px' }}>Log in to continue to LingoWatch</p>

          <button type="button" onClick={handleGoogleButtonClick} disabled={googleLoading} style={{ width: '100%', height: '46px', background: '#fff', color: '#0f0f0f', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: '15px', borderRadius: '6px', border: '1px solid #e0e0e0', cursor: googleLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: googleErr ? '8px' : '20px', transition: 'all 0.2s ease', opacity: googleLoading ? 0.72 : 1 }}>
            <GoogleIcon />
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
          {googleErr && <div style={{ fontSize: '12px', color: '#e53e3e', marginBottom: '12px' }}>{googleErr}</div>}

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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
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

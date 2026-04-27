import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/shared/BrandLogo';
import '../../styles/landing.css';

// Paste your Chrome Web Store URL here once it's approved
const CHROME_STORE_URL = "";

const FEATURE_TABS = [
  {
    gif: '/media/features/feature1.gif',
    video: '/media/features/feature1-preview.mp4',
    poster: '/media/features/feature1-poster.jpg',
    title: 'Dual Subtitles, Instantly',
    desc: 'See the original subtitle and your Somali translation at the same time — on any YouTube video. More languages are coming soon.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    gif: '/media/features/feature2.gif',
    video: '/media/features/feature2-preview.mp4',
    poster: '/media/features/feature2-poster.jpg',
    title: 'Tap Any Word to Learn It',
    desc: 'Click a word in the subtitle to instantly see its definition, pronunciation, and example sentences. Save it to your vocabulary with one tap.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    gif: '/media/features/feature3.gif',
    video: '/media/features/feature3-preview.mp4',
    poster: '/media/features/feature3-poster.jpg',
    title: 'Frequency-Ranked Vocab Panel',
    desc: 'Your saved words are sorted by how often they appear in real content. Study what matters most — the fastest path to fluency.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
];

const FAQ_ITEMS = [
  { q: 'Is LingoWatch free to use?', a: 'Yes, LingoWatch is completely free to install and use. Simply add it to Chrome and it works instantly on any YouTube video that has subtitles — no account required.' },
  { q: 'Which languages does LingoWatch support?', a: 'LingoWatch currently supports Somali as its primary language, with full translation and vocabulary features built specifically for Somali learners. Support for more languages is on the roadmap.' },
  { q: 'Does it work on all YouTube videos?', a: 'LingoWatch works on any YouTube video that has subtitles or closed captions available — both auto-generated and manual captions. If a video has no subtitles, the extension will notify you.' },
  { q: 'How does the word saving feature work?', a: 'When you click any word in the subtitle, a popup appears showing the definition, pronunciation, and example sentences. You can save the word to your personal vocabulary library with one click and review it later inside the LingoWatch dashboard.' },
  { q: 'Is my vocabulary data private?', a: 'Yes. Your saved words are stored securely in your personal account and are never shared with third parties. Your learning data is private to you.' },
  { q: 'Does LingoWatch slow down YouTube?', a: 'No. LingoWatch is built to be extremely lightweight. It runs silently in the background and has no impact on video playback speed or quality.' },
  { q: 'Can I use LingoWatch on other websites besides YouTube?', a: 'Currently LingoWatch is optimized for YouTube. Support for additional video platforms is on our roadmap and will be added in future updates.' },
];

const FOOTER_COLS: { title: string; links: { label: string; href: string; external?: boolean; scroll?: string }[] }[] = [
  {
    title: 'Overview',
    links: [
      { label: 'Features', href: '#features', scroll: 'features' },
      { label: 'How It Works', href: '#features', scroll: 'features' },
      { label: 'FAQ', href: '#faq', scroll: 'faq' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms and Conditions', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'Email', href: 'mailto:maahir.engineer@gmail.com', external: true },
      { label: 'Twitter', href: 'https://x.com/maahir_03', external: true },
      { label: 'GitHub', href: 'https://github.com/thecodermusab', external: true },
    ],
  },
];

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hiddenNav, setHiddenNav] = useState(false);
  const scrolledRef = useRef(false);
  const hiddenNavRef = useRef(false);
  const lastScrollY = useRef(0);

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      const nextScrolled = currentY > 20;

      // Handle hide/show top nav smoothly
      if (currentY > lastScrollY.current && currentY > 80) {
        if (!hiddenNavRef.current) {
          hiddenNavRef.current = true;
          setHiddenNav(true);
        }
      } else if (currentY < lastScrollY.current) {
        if (hiddenNavRef.current) {
          hiddenNavRef.current = false;
          setHiddenNav(false);
        }
      }
      lastScrollY.current = currentY;

      if (scrolledRef.current === nextScrolled) return;

      scrolledRef.current = nextScrolled;
      setScrolled(nextScrolled);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Set body background to fix overscroll white flash
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#1B202A';

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.body.style.backgroundColor = originalBg;
    };
  }, []);

  useEffect(() => {
    ['/marketing/images/hero-lingowatch-fast.jpg', '/media/features/feature1-poster.jpg', '/media/features/feature2-poster.jpg', '/media/features/feature3-poster.jpg', '/marketing/images/me-testimonial-fast.jpg'].forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  return (
    <div style={{ backgroundColor: '#1B202A', color: '#fff', fontFamily: "'Inter', sans-serif", overflowX: 'hidden', scrollbarWidth: 'thin' }}>

      {/* ===== PILL NAVBAR ===== */}
      <nav
        className={`lw-pill-navbar${scrolled ? ' lw-pill-navbar-scrolled' : ''}${hiddenNav ? ' lw-pill-navbar-hidden' : ''}`}
        style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, width: 'fit-content', minWidth: '680px', borderRadius: '20px',
          padding: '10px 12px 10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        {/* Left: logo */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <BrandLogo alt="LingoWatch" width={60} height={60} className="h-[60px] w-[60px] object-contain" />
          </Link>
        </div>

        {/* Center: links */}
        <div className="lw-pill-links" style={{ display: 'flex', gap: '4px', transform: 'translateX(-32px)' }}>
          {['Features', 'Languages', 'FAQ'].map((label, i) => (
            <button key={i} type="button" onClick={() => scrollToSection(['features', 'languages', 'faq'][i])} className="lw-pill-link"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: '15px', color: 'rgba(255,255,255,0.80)', padding: '8px 18px', textDecoration: 'none', borderRadius: '999px', transition: 'color 0.2s ease', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Right: auth */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
          {!isLoading && user ? (
            <Link to="/dashboard" className="lw-pill-signup"
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 500, color: '#1a1a1a', background: '#f5f5f5', borderRadius: '999px', padding: '9px 22px', textDecoration: 'none', transition: 'background 0.2s ease' }}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="lw-pill-login"
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', color: 'rgba(255,255,255,0.85)', padding: '8px 16px', textDecoration: 'none', transition: 'color 0.2s ease' }}>
                Log in
              </Link>
              <Link to="/signup" className="lw-pill-signup"
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 500, color: '#1a1a1a', background: '#f5f5f5', borderRadius: '999px', padding: '9px 22px', textDecoration: 'none', transition: 'background 0.2s ease' }}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ===== HERO SECTION ===== */}
      <section style={{
        position: 'relative', width: '100vw', height: '100vh', minHeight: '800px',
        display: 'flex', flexDirection: 'column', overflow: 'visible',
        backgroundImage: "url('/marketing/images/hero-lingowatch-fast.jpg')",
        backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat',
      }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '180px', background: 'linear-gradient(to bottom, transparent, #1B202A)', pointerEvents: 'none', zIndex: 2 }} />

        <div className="lw-hero-container" style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h1 className="lw-headline lw-headline-el" style={{ fontFamily: "'Lora', serif", fontWeight: 400, fontSize: '64px', lineHeight: '70px', color: '#fff', marginBottom: '20px', letterSpacing: '-0.5px', opacity: 0 }}>
            Learn While You Watch
          </h1>
          <p className="lw-subtext lw-subtext-el" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: '16px', lineHeight: '26px', color: 'rgb(249,250,249)', maxWidth: '600px', marginBottom: '32px', opacity: 0 }}>
            A Chrome extension that adds dual subtitles, word popups, and vocabulary tracking to any YouTube video — with full Somali language support.
          </p>
          <div className="lw-cta-group lw-cta-group-el" style={{ display: 'flex', gap: '16px', opacity: 0 }}>
            {CHROME_STORE_URL ? (
              <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 28px', fontSize: '14px', fontWeight: 500, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: '#566484', color: '#fff', border: 'none' }}>
                Add to Chrome <span style={{ marginLeft: '6px', fontSize: '18px', lineHeight: 1 }}>›</span>
              </a>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 28px', fontSize: '14px', fontWeight: 500, backgroundColor: '#566484', color: 'rgba(255,255,255,0.55)', border: 'none', cursor: 'default', opacity: 0.7 }}>
                Coming to Chrome Soon
              </span>
            )}
            <button type="button" onClick={() => scrollToSection('features')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 28px', fontSize: '14px', fontWeight: 500, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)' }}>
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section id="features" className="lw-features-section lw-fade-in lw-scroll-target" style={{ backgroundColor: 'transparent', padding: '80px 60px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
          <div style={{ marginBottom: '20px', textAlign: 'left' }}>
            <h2 className="lw-section-title" style={{ fontFamily: "'Lora', 'Cormorant Garamond', serif", fontSize: '42px', whiteSpace: 'nowrap', lineHeight: 1.1, color: '#fff', fontWeight: 400, marginBottom: '12px', letterSpacing: '-0.5px' }}>
              Watch, understand, and remember
            </h2>
          </div>
          <div className="lw-features-inner" style={{ display: 'flex', gap: '48px', alignItems: 'stretch' }}>
            <div className="lw-visual-col" style={{ flex: '0 0 58%', width: '58%' }}>
              <div style={{ position: 'relative', width: '100%', minHeight: '520px', borderRadius: '16px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', backgroundImage: `url(${FEATURE_TABS[activeTab].poster})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}>
                <video
                  key={FEATURE_TABS[activeTab].video}
                  src={FEATURE_TABS[activeTab].video}
                  poster={FEATURE_TABS[activeTab].poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-label="Feature preview"
                  style={{ width: '100%', height: '520px', objectFit: 'cover', objectPosition: 'center top', borderRadius: '16px', display: 'block' }}
                />
              </div>
            </div>
            <div className="lw-text-col" style={{ flex: '0 0 42%', width: '42%', display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '520px' }}>
                {FEATURE_TABS.map((tab, i) => {
                  const isActive = activeTab === i;
                  const nextActive = activeTab === i + 1;
                  return (
                    <div
                      key={i}
                      onClick={() => setActiveTab(i)}
                      className={`lw-tab${isActive ? ' lw-tab-active' : ''}`}
                      style={{
                        borderBottom: i < FEATURE_TABS.length - 1 ? (isActive || nextActive ? 'none' : '1px solid rgba(255,255,255,0.08)') : 'none',
                        padding: '32px 24px', cursor: 'pointer', transition: 'all 0.3s ease',
                        display: 'flex', gap: '20px',
                        backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        borderRadius: '12px', flex: 1, alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ fontSize: '24px', lineHeight: 1, flexShrink: 0, paddingTop: '2px', color: '#fff' }}>{tab.icon}</div>
                      <div>
                        <h3 style={{ fontSize: '18px', color: '#fff', fontWeight: 600, marginBottom: '8px' }}>{tab.title}</h3>
                        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: 0 }}>{tab.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIAL SECTION ===== */}
      <section id="languages" className="lw-fade-in lw-scroll-target" style={{ position: 'relative', backgroundColor: 'transparent', width: '100%', padding: '100px 0', display: 'flex', justifyContent: 'center' }}>
        <div className="lw-testimonial-card" style={{ display: 'flex', flexDirection: 'row', gap: '15px', width: 'fit-content', margin: '0 auto' }}>
          <img src="/marketing/images/me-testimonial-fast.jpg" alt="Musab Mohamed Ali, CEO of LingoWatch" className="lw-testimonial-img" loading="eager" decoding="async" style={{ width: '343px', height: '482px', flexShrink: 0, objectFit: 'cover', objectPosition: 'center top' }} />
          <div className="lw-testimonial-content" style={{ width: '919px', height: '482px', padding: '48px 56px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: '22px', lineHeight: 1.7, color: '#fff', margin: '0 auto', textAlign: 'center', maxWidth: '780px' }}>
                "We built LingoWatch because we saw how hard it was for Somali speakers to learn English through content they actually enjoy. The idea was simple — watch YouTube, tap any word, understand it instantly, and never lose your flow. What started as a personal tool has become something we're genuinely proud of. LingoWatch is the learning experience we always wished existed."
              </p>
            </div>
            <div style={{ marginTop: '40px' }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Musab Mohamed Ali</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>CEO, LingoWatch</div>
              <a href="https://www.instagram.com/maahir.03" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.2s ease' }}>
                @MAAHIR.03
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="lw-fade-in lw-cta-section" style={{ position: 'relative', width: '100vw', height: '480px', overflow: 'hidden', backgroundColor: 'transparent', display: 'flex', alignItems: 'center' }}>
        <img
          src="/marketing/cta/CTA.png"
          alt="Start learning instantly"
          className="lw-cta-img"
          style={{
            position: 'absolute', right: 0, top: 0, height: '100%', width: 'auto', objectFit: 'cover', objectPosition: 'center top',
            WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%), linear-gradient(to right, transparent 0%, black 35%)',
            WebkitMaskComposite: 'source-in',
            maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%), linear-gradient(to right, transparent 0%, black 35%)',
            maskComposite: 'intersect' as React.CSSProperties['maskComposite'],
            zIndex: 2, pointerEvents: 'none',
          }}
        />
        <div className="lw-cta-content" style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 'max(80px, 12vw)', zIndex: 3 }}>
          <h2 className="lw-cta-headline" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: '52px', lineHeight: 1.2, color: '#fff', maxWidth: '480px', marginBottom: '36px' }}>
            Start learning<br />while you watch
          </h2>
          {CHROME_STORE_URL ? (
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className="lw-cta-btn lw-cta-btn-el" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: '15px', padding: '13px 28px', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', letterSpacing: '0.01em', textDecoration: 'none', width: 'fit-content', transition: 'background 0.25s ease' }}>
              Add to Chrome &nbsp;›
            </a>
          ) : (
            <span className="lw-cta-btn-el" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: '15px', padding: '13px 28px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'fit-content' }}>
              Coming to Chrome Soon
            </span>
          )}
        </div>
      </section>

      {/* ===== FAQ SECTION ===== */}
      <section id="faq" className="lw-fade-in lw-scroll-target" style={{ position: 'relative', backgroundColor: '#1B202A', padding: '100px 0', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '820px', padding: '0 24px' }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: '52px', color: '#fff', textAlign: 'center', marginBottom: '60px' }}>
            Frequently asked questions
          </h2>
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              onClick={() => setActiveFaq(activeFaq === i ? null : i)}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                borderTop: i === 0 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                padding: '28px 0', cursor: 'pointer', overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: '22px', color: '#fff', paddingRight: '20px' }}>
                  {item.q}
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)', transform: activeFaq === i ? 'rotate(180deg)' : 'none' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div className="lw-faq-answer" style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: '16px', color: 'rgba(255,255,255,0.75)', maxWidth: '680px', lineHeight: 1.6,
                gridTemplateRows: activeFaq === i ? '1fr' : '0fr',
                opacity: activeFaq === i ? 1 : 0,
              }}>
                <div className="lw-faq-answer-inner" style={{ paddingTop: activeFaq === i ? '16px' : '0' }}>
                  {item.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="lw-footer lw-fade-in" style={{ backgroundColor: 'transparent', width: '100%', padding: '64px 80px 48px 80px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
          <div className="lw-footer-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: '36px', color: '#fff', margin: 0, lineHeight: 1 }}>LingoWatch</h2>
            <p className="lw-footer-tagline" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: '28px', color: '#fff', lineHeight: 1.3, maxWidth: '420px', textAlign: 'right', margin: 0 }}>
              Your personal extension for<br />learning while you watch.
            </p>
          </div>
          <hr style={{ width: '100%', height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '48px 0 40px 0', border: 'none' }} />
          <div className="lw-footer-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
              © 2026 LingoWatch. All rights reserved.
            </div>
            <div className="lw-footer-nav" style={{ display: 'flex', gap: '80px' }}>
              {FOOTER_COLS.map((col, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: '14px', color: '#fff', marginBottom: '4px' }}>{col.title}</div>
                  {col.links.map((link, j) => (
                    link.scroll ? (
                      <button key={j} type="button" onClick={() => scrollToSection(link.scroll!)} className="lw-footer-link" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: '14px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', marginTop: '12px', transition: 'color 0.2s ease', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                        {link.label}
                      </button>
                    ) : link.external ? (
                      <a key={j} href={link.href} target="_blank" rel="noopener noreferrer" className="lw-footer-link" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: '14px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', marginTop: '12px', transition: 'color 0.2s ease' }}>
                        {link.label}
                      </a>
                    ) : (
                      <Link key={j} to={link.href} className="lw-footer-link" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: '14px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', marginTop: '12px', transition: 'color 0.2s ease' }}>
                        {link.label}
                      </Link>
                    )
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

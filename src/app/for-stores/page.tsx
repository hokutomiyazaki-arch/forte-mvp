'use client'

import { useEffect } from 'react'

export default function ForStoresPage() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('fsp-on')
        })
      },
      { threshold: 0.1 }
    )
    document.querySelectorAll('.fsp-rev').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <>
      <style>{`
/* ─── FOR-STORES PAGE (scoped with .fsp prefix) ─── */
.fsp-root {
  --black:   #08080F;
  --black2:  #0E0E1A;
  --black3:  #131325;
  --black4:  #181830;
  --gold:    #D4A843;
  --gold-lt: #E8C878;
  --gold-dk: #A8832E;
  --gray:    #9999BB;
  --gray-lt: #CCCCDD;
  --cream:   #FAFAF7;
  --cream2:  #F2EDE4;
  --text:    #1A1A2E;
  --text-lt: #555566;
  --white:   #FFFFFF;
  background: var(--black);
  color: var(--gray-lt);
  font-family: 'Noto Serif JP', serif;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}
.fsp-root *, .fsp-root *::before, .fsp-root *::after {
  margin: 0; padding: 0; box-sizing: border-box;
}

/* ─── NAV ─── */
.fsp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  padding: 1.2rem 3rem; display: flex; justify-content: space-between; align-items: center;
  background: rgba(13,13,20,0.97); backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(212,168,67,0.15);
}
.fsp-nav-logo {
  font-family: 'Lato', sans-serif; font-size: 0.75rem;
  letter-spacing: 0.35em; color: var(--gold); text-decoration: none; font-weight: 700;
}
.fsp-nav-pill {
  font-family: 'Lato', sans-serif; font-size: 0.7rem; letter-spacing: 0.15em;
  padding: 0.65rem 1.5rem; border: 1px solid rgba(212,168,67,0.5); color: var(--gold);
  text-decoration: none; transition: all 0.25s;
}
.fsp-nav-pill:hover { background: var(--gold); color: var(--black); }

/* ─── HERO (dark) ─── */
.fsp-hero-wrap {
  background: var(--black2); position: relative; overflow: hidden;
}
.fsp-hero-bg-glow {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 60% at 70% 50%, rgba(212,168,67,0.07) 0%, transparent 65%),
    radial-gradient(ellipse 30% 40% at 10% 80%, rgba(212,168,67,0.04) 0%, transparent 55%);
}
.fsp-hero {
  display: grid; grid-template-columns: 1fr 1fr;
  align-items: center; gap: 5rem;
  max-width: 1200px; margin: 0 auto;
  padding: 9rem 3rem 4rem;
  position: relative; z-index: 1;
}
.fsp-hero-eyebrow {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.3em; color: var(--gold); text-transform: uppercase; margin-bottom: 2rem;
  opacity: 0; animation: fspFadeUp 0.9s ease 0.2s forwards;
}
.fsp-hero-title {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(3.8rem,7.5vw,8rem);
  font-weight: 300; line-height: 1.02; letter-spacing: -0.025em; color: var(--cream);
  opacity: 0; animation: fspFadeUp 0.9s ease 0.4s forwards;
}
.fsp-hero-title em { font-style: italic; color: var(--gold); }
.fsp-hero-tagline {
  margin-top: 2.2rem;
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(1rem,1.6vw,1.18rem);
  font-style: italic; line-height: 1.75; color: #CCCCDD;
  border-left: 2px solid var(--gold); padding-left: 1.2rem;
  opacity: 0; animation: fspFadeUp 0.9s ease 0.6s forwards;
}
.fsp-hero-body {
  margin-top: 1.8rem; font-size: 1rem; line-height: 2;
  color: var(--gray-lt); font-weight: 400; max-width: 460px;
  opacity: 0; animation: fspFadeUp 0.9s ease 0.8s forwards;
}
.fsp-hero-cta {
  display: inline-block; margin-top: 2.8rem;
  padding: 1rem 2.5rem;
  border: 1px solid var(--gold); color: var(--gold);
  font-family: 'Lato', sans-serif; font-size: 0.72rem;
  letter-spacing: 0.2em; text-decoration: none;
  transition: all 0.28s; position: relative; overflow: hidden; z-index: 0;
  opacity: 0; animation: fspFadeUp 0.9s ease 1s forwards;
}
.fsp-hero-cta::before {
  content: ''; position: absolute; inset: 0; background: var(--gold);
  transform: scaleX(0); transform-origin: left; transition: transform 0.28s; z-index: -1;
}
.fsp-hero-cta:hover { color: var(--black); }
.fsp-hero-cta:hover::before { transform: scaleX(1); }

/* Dashboard */
.fsp-hero-right { opacity: 0; animation: fspFadeUp 0.9s ease 0.6s forwards; }
.fsp-dash {
  border-radius: 10px; overflow: hidden;
  box-shadow: 0 40px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3);
  border: 1px solid rgba(212,168,67,0.15);
  background: #0D0D14;
}
.fsp-dash-top {
  background: #060610; padding: 0.75rem 1.2rem;
  display: flex; align-items: center; gap: 0.45rem;
}
.fsp-d-dot { width: 11px; height: 11px; border-radius: 50%; }
.fsp-d-dot-r { background: #FF6058; }
.fsp-d-dot-y { background: #FFBD2E; }
.fsp-d-dot-g { background: #28C840; }
.fsp-d-ttl {
  font-family: 'Lato', sans-serif; font-size: 0.62rem;
  letter-spacing: 0.08em; color: var(--gray); margin-left: 0.5rem;
}
.fsp-dash-body { padding: 1.5rem; background: var(--black2); }
.fsp-d-lbl {
  font-family: 'Lato', sans-serif; font-size: 0.6rem;
  letter-spacing: 0.2em; color: var(--gray); text-transform: uppercase; margin-bottom: 0.9rem;
}
.fsp-d-div { height: 1px; background: rgba(255,255,255,0.06); margin: 1.1rem 0; }
.fsp-d-total {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.9rem; background: rgba(212,168,67,0.07);
  border: 1px solid rgba(212,168,67,0.18); border-radius: 5px;
}
.fsp-d-tl {
  font-family: 'Lato', sans-serif; font-size: 0.6rem;
  letter-spacing: 0.12em; color: var(--gray); text-transform: uppercase;
}
.fsp-d-ts {
  font-family: 'Lato', sans-serif; font-size: 0.62rem;
  color: var(--gray); margin-top: 0.25rem;
}
.fsp-d-num {
  font-family: 'Lato', sans-serif; font-size: 3rem; font-weight: 700;
  color: var(--gold); letter-spacing: -0.02em; line-height: 1;
}
.fsp-d-unit {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  color: var(--gray-lt); margin-left: 0.25rem;
}

/* ─── SHARED ─── */
.fsp-wrap { max-width: 1100px; margin: 0 auto; padding: 0 3rem; }
.fsp-ey {
  font-family: 'Lato', sans-serif; font-size: 0.62rem;
  letter-spacing: 0.3em; color: var(--gold); text-transform: uppercase; margin-bottom: 1.4rem;
}
.fsp-h2 {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(2.4rem,4.5vw,4rem); font-weight: 300; line-height: 1.15; color: var(--cream);
}
.fsp-h2 .fsp-num, .fsp-hero-title .fsp-num { font-family: 'Lato', sans-serif; font-style: normal; }
.fsp-h2 em { font-style: italic; color: var(--gold); }
.fsp-h2 strong { font-weight: 600; }
.fsp-bt {
  font-size: 1rem; line-height: 2; color: var(--gray-lt); font-weight: 400;
  max-width: 520px; margin-top: 1.2rem;
}

.fsp-sec-cream { background: var(--black3); padding: 5rem 0; }
.fsp-sec-white { background: var(--black2); padding: 5rem 0; }
.fsp-sec-cream2 { background: var(--black4); padding: 5rem 0; }
.fsp-sec-dark { background: var(--black2); padding: 5rem 0; }
.fsp-sec-black { background: var(--black); padding: 5rem 0; }
.fsp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 5rem; margin-top: 4rem; align-items: start; }

/* ─── REFRAME ─── */
.fsp-reframe {
  background: var(--black); padding: 6rem 3rem; text-align: center;
  border-bottom: 1px solid rgba(212,168,67,0.12);
}
.fsp-reframe-ey {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.3em; color: var(--gold); text-transform: uppercase; margin-bottom: 2.5rem;
}
.fsp-reframe-h {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(2.4rem,5vw,5rem);
  font-weight: 300; line-height: 1.2; color: var(--cream);
  max-width: 820px; margin: 0 auto 1.5rem;
}
.fsp-reframe-h em { font-style: italic; color: var(--gold-lt); }
.fsp-reframe-h strong { font-weight: 600; color: var(--gold); }
.fsp-reframe-rule { width: 48px; height: 1px; background: var(--gold); margin: 2.5rem auto; }
.fsp-reframe-body {
  font-size: 1rem; line-height: 2.05; color: #CCCCDD; font-weight: 400;
  max-width: 620px; margin: 0 auto;
}
.fsp-reframe-punch {
  margin-top: 2.5rem; font-family: 'Cormorant Garamond', serif;
  font-size: clamp(1.6rem,3vw,2.4rem); font-style: italic; color: var(--gold-lt); line-height: 1.4;
}

/* ─── STEPS ─── */
.fsp-steps { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 3rem; }
.fsp-sc {
  padding: 3rem; background: var(--black3);
  border: 1px solid rgba(212,168,67,0.08); transition: border-color 0.3s;
}
.fsp-sc:hover { border-color: rgba(212,168,67,0.3); }
.fsp-sc-dark { background: var(--black2); border-color: var(--black2); }
.fsp-sc-dark:hover { border-color: rgba(212,168,67,0.3); }
.fsp-sn {
  font-family: 'Cormorant Garamond', serif;
  font-size: 7rem; font-weight: 300; line-height: 0.9;
  letter-spacing: -0.04em; color: rgba(212,168,67,0.15); margin-bottom: 1.2rem;
}
.fsp-sc-dark .fsp-sn { color: rgba(212,168,67,0.2); }
.fsp-st {
  font-size: 1.02rem; font-weight: 600; color: #F5F5FA; margin-bottom: 0.75rem; line-height: 1.4;
}
.fsp-sc-dark .fsp-st { color: var(--gold-lt); }
.fsp-sb { font-size: 0.93rem; line-height: 1.95; color: var(--gray-lt); font-weight: 400; }
.fsp-sc-dark .fsp-sb { color: var(--gray-lt); }

/* Forte Category Graph */
.fsp-forte-graph { margin-top: 1.8rem; }
.fsp-fg-row {
  display: grid; grid-template-columns: 96px 1fr 32px;
  align-items: center; gap: 0.7rem; padding: 0.45rem 0;
}
.fsp-fg-lbl {
  font-family: 'Lato', sans-serif; font-size: 0.62rem;
  letter-spacing: 0.05em; color: var(--gray-lt); white-space: nowrap;
}
.fsp-fg-bar-bg {
  height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;
}
.fsp-fg-bar {
  height: 100%; border-radius: 3px;
  background: linear-gradient(to right, var(--gold-dk), var(--gold-lt));
}
.fsp-fg-val {
  font-family: 'Lato', sans-serif; font-size: 1rem; font-weight: 700;
  color: var(--gold); text-align: right; line-height: 1;
}
.fsp-fg-note {
  margin-top: 1rem; font-family: 'Lato', sans-serif; font-size: 0.6rem;
  letter-spacing: 0.1em; color: rgba(212,168,67,0.5); text-transform: uppercase;
}

/* ─── 5 WALLS ─── */
.fsp-walls-intro {
  background: var(--black2); padding: 3rem; margin-bottom: 0;
  border-left: 3px solid var(--gold);
}
.fsp-walls-intro p {
  font-family: 'Cormorant Garamond', serif; font-size: 1.3rem;
  font-style: italic; color: var(--cream); line-height: 1.65;
}
.fsp-walls-intro p strong { color: var(--gold-lt); font-style: normal; }
.fsp-issue-list { list-style: none; margin-top: 2rem; }
.fsp-iss {
  display: flex; gap: 1rem; align-items: flex-start;
  padding: 1.1rem 0; border-bottom: 1px solid rgba(212,168,67,0.08);
}
.fsp-iss:last-child { border-bottom: none; }
.fsp-iss-ic {
  width: 26px; height: 26px; border-radius: 50%;
  background: rgba(212,168,67,0.08); border: 1px solid rgba(212,168,67,0.25);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 0.1rem;
  font-family: 'Lato', sans-serif; font-size: 0.6rem; color: var(--gold-dk);
}
.fsp-iss-t {
  font-size: 0.93rem; line-height: 1.85; color: var(--gray-lt); font-weight: 400;
}
.fsp-iss-t strong { color: var(--cream); font-weight: 500; display: block; margin-bottom: 0.2rem; }

/* ─── BRIDGE BAND ─── */
.fsp-bridge-band {
  background: var(--black); padding: 7rem 3rem; text-align: center;
  border-top: 1px solid rgba(212,168,67,0.1);
  border-bottom: 1px solid rgba(212,168,67,0.1);
}
.fsp-bridge-pre {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.3em; color: var(--gray); text-transform: uppercase; margin-bottom: 1.5rem;
}
.fsp-bridge-main {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(1.6rem,3.5vw,3rem); font-weight: 300; color: #F0F0F5; line-height: 1.5;
  max-width: 700px; margin: 0 auto;
}
.fsp-bridge-main em { font-style: italic; color: var(--gold-lt); }
.fsp-bridge-main strong { font-weight: 600; color: var(--gold); }
.fsp-bridge-cta-line {
  margin-top: 2rem; font-size: 0.95rem; line-height: 1.8; color: #CCCCDD; font-weight: 400;
}

/* ─── COMPARISON ─── */
.fsp-comp {
  width: 100%; border-collapse: collapse; margin-top: 3rem;
  background: var(--black2); border: 1px solid rgba(212,168,67,0.1);
}
.fsp-comp th {
  padding: 0.9rem 1.4rem; font-family: 'Lato', sans-serif;
  font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase;
  border-bottom: 2px solid rgba(26,26,46,0.1); text-align: left;
}
.fsp-comp th:nth-child(2), .fsp-comp th:nth-child(3) { color: var(--gray); }
.fsp-comp th:nth-child(4) { color: var(--gold-dk); background: rgba(212,168,67,0.05); }
.fsp-comp td {
  padding: 1rem 1.4rem; font-size: 0.92rem; line-height: 1.65;
  border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle;
}
.fsp-comp td:first-child { font-weight: 500; color: var(--cream); width: 22%; }
.fsp-comp td:nth-child(2), .fsp-comp td:nth-child(3) { color: var(--gray-lt); }
.fsp-comp td:nth-child(4) {
  color: var(--cream); font-weight: 500;
  background: rgba(212,168,67,0.06); border-left: 2px solid var(--gold);
}
.fsp-comp tr:hover td:nth-child(4) { background: rgba(212,168,67,0.1); }
.fsp-comp-note {
  margin-top: 1.2rem; font-size: 0.78rem; line-height: 1.8; color: var(--gray); font-style: italic;
}

/* ─── BEYOND ─── */
.fsp-beyond-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 3rem; }
.fsp-bc { padding: 2.5rem; border: 1px solid rgba(26,26,46,0.07); }
.fsp-bc-before { background: var(--black2); border-color: rgba(255,255,255,0.05); }
.fsp-bc-after { background: var(--black2); border-color: var(--black2); }
.fsp-bc-lbl {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 1.5rem;
}
.fsp-bc-before .fsp-bc-lbl { color: var(--gray); }
.fsp-bc-after .fsp-bc-lbl { color: var(--gold-dk); }
.fsp-bc-item {
  font-size: 0.93rem; line-height: 1.85; padding: 0.72rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--gray-lt);
}
.fsp-bc-after .fsp-bc-item { color: var(--cream); border-bottom-color: rgba(255,255,255,0.06); }
.fsp-bc-item:last-child { border-bottom: none; }
.fsp-beyond-q {
  margin-top: 3rem; padding-left: 1.5rem; border-left: 3px solid var(--gold);
  font-family: 'Cormorant Garamond', serif; font-size: 1.7rem;
  font-style: italic; color: var(--gold-lt); line-height: 1.5;
}

/* ─── FLOW ─── */
.fsp-flow-steps {
  display: flex; justify-content: center; align-items: flex-start; gap: 0;
  flex-wrap: wrap; max-width: 960px; margin: 3.5rem auto 0;
}
.fsp-fs {
  display: flex; flex-direction: column; align-items: center;
  padding: 1.5rem 2rem; text-align: center; flex: 1; min-width: 160px;
}
.fsp-fs-n {
  font-family: 'Lato', sans-serif; font-size: 0.62rem;
  letter-spacing: 0.25em; color: var(--gold); margin-bottom: 0.7rem; font-weight: 700;
}
.fsp-fs-t {
  font-size: 0.84rem; line-height: 1.65; color: var(--gray-lt); font-weight: 400;
  max-width: 130px; font-family: 'Noto Serif JP', serif;
}
.fsp-fa {
  color: rgba(212,168,67,0.4); font-size: 1.5rem; padding-top: 2rem; flex-shrink: 0;
}

/* ─── PRICING ─── */
.fsp-price-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px; margin-top: 3rem; }
.fsp-pc {
  padding: 3rem 2rem; border: 1px solid rgba(212,168,67,0.1); background: var(--black3);
}
.fsp-pc-feat { background: var(--black2); border-color: var(--black2); }
.fsp-pc-lbl {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--gray); margin-bottom: 1.5rem;
}
.fsp-pc-feat .fsp-pc-lbl { color: var(--gold-dk); }
.fsp-pc-num {
  font-family: 'Lato', sans-serif; font-size: 4rem; font-weight: 700;
  line-height: 1; letter-spacing: -0.02em; color: var(--cream);
}
.fsp-pc-feat .fsp-pc-num { color: var(--gold); }
.fsp-pc-unit {
  font-family: 'Lato', sans-serif; font-size: 0.7rem;
  color: var(--gray); letter-spacing: 0.1em; margin-top: 0.5rem;
}
.fsp-pc-desc {
  margin-top: 1.5rem; font-size: 0.92rem; line-height: 1.95;
  color: var(--gray-lt); font-weight: 400;
}
.fsp-pc-feat .fsp-pc-desc { color: #CCCCDD; }

/* MVP */
.fsp-mvp {
  margin-top: 3rem; padding: 2.5rem 3rem;
  background: var(--black2); border: 1px solid rgba(212,168,67,0.25);
  position: relative; overflow: hidden;
}
.fsp-mvp::before {
  content: ''; position: absolute; top: 0; left: 0;
  width: 4px; height: 100%;
  background: linear-gradient(to bottom, var(--gold), var(--gold-dk));
}
.fsp-mvp-badge {
  display: inline-block; font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.2em; background: var(--gold); color: var(--black);
  padding: 0.3rem 0.9rem; text-transform: uppercase; margin-bottom: 1.5rem;
}
.fsp-mvp-title {
  font-family: 'Noto Serif JP', serif; font-size: clamp(1.4rem,2.5vw,2rem);
  font-weight: 400; color: var(--cream); line-height: 1.5; margin-bottom: 1.2rem;
}
.fsp-mvp-title strong { color: var(--gold); font-weight: 600; }
.fsp-mvp-list {
  list-style: none; display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1.5rem;
}
.fsp-mvp-list li {
  font-size: 0.93rem; line-height: 2; color: #CCCCDD; font-weight: 400;
  padding-left: 1.6rem; position: relative; font-family: 'Noto Serif JP', serif;
}
.fsp-mvp-list li::before {
  content: '→'; position: absolute; left: 0; color: var(--gold);
  font-family: 'Lato', sans-serif; font-size: 0.7rem;
}
.fsp-mvp-note { font-size: 0.78rem; color: var(--gray); font-style: italic; }

/* ─── CTA ─── */
.fsp-cta-sec {
  padding: 7rem 3rem; background: var(--black2); text-align: center;
  border-top: 1px solid rgba(212,168,67,0.12);
}
.fsp-cta-q {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(2.4rem,5vw,5.2rem); font-weight: 300; line-height: 1.2;
  color: var(--cream); max-width: 720px; margin: 0 auto 1.5rem;
}
.fsp-cta-q em { font-style: italic; color: var(--gold-lt); }
.fsp-cta-sub {
  font-size: 1rem; line-height: 2; color: #CCCCDD; font-weight: 400;
  max-width: 460px; margin: 0 auto 3rem;
}
.fsp-cta-btn {
  display: inline-block; padding: 1.2rem 3.5rem;
  background: var(--gold); color: var(--black);
  font-family: 'Lato', sans-serif; font-size: 0.75rem; letter-spacing: 0.25em;
  text-decoration: none; transition: all 0.3s; border: 1px solid var(--gold); font-weight: 700;
}
.fsp-cta-btn:hover { background: transparent; color: var(--gold); }
.fsp-cta-note {
  margin-top: 1.5rem; font-family: 'Lato', sans-serif; font-size: 0.68rem;
  letter-spacing: 0.06em; color: var(--gray);
}

/* ─── FOOTER ─── */
.fsp-footer {
  padding: 2rem 3rem; background: var(--black); display: flex;
  justify-content: space-between; align-items: center;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.fsp-footer .fsp-fl {
  font-family: 'Lato', sans-serif; font-size: 0.78rem;
  letter-spacing: 0.4em; color: var(--gold); font-weight: 700;
}
.fsp-footer .fsp-fc {
  font-family: 'Lato', sans-serif; font-size: 0.65rem;
  letter-spacing: 0.05em; color: var(--gray);
}

/* ─── ANIM ─── */
@keyframes fspFadeUp {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fsp-rev {
  opacity: 0; transform: translateY(26px);
  transition: opacity 0.85s ease, transform 0.85s ease;
}
.fsp-rev.fsp-on { opacity: 1; transform: translateY(0); }
.fsp-d1 { transition-delay: 0.1s; }
.fsp-d2 { transition-delay: 0.2s; }
.fsp-d3 { transition-delay: 0.3s; }
.fsp-d4 { transition-delay: 0.4s; }

@media(max-width:768px) {
  .fsp-nav { padding: 1rem 1.5rem; }
  .fsp-hero { grid-template-columns: 1fr; padding: 7rem 1.5rem 4rem; gap: 3rem; }
  .fsp-wrap { padding: 0 1.5rem; }
  .fsp-two, .fsp-steps, .fsp-beyond-grid { grid-template-columns: 1fr; }
  .fsp-price-grid { grid-template-columns: 1fr; }
  .fsp-flow-steps { flex-direction: column; align-items: center; }
  .fsp-fa { transform: rotate(90deg); }
  .fsp-footer { flex-direction: column; gap: 1rem; text-align: center; }
  .fsp-root [style*='grid-template-columns:repeat(4'] { grid-template-columns: 1fr 1fr !important; }
}
      `}</style>

      <div className="fsp-root">
        {/* NAV */}
        <nav className="fsp-nav">
          <a href="#" className="fsp-nav-logo">REALPROOF</a>
          <a href="mailto:bodydiscoverystudio@gmail.com?subject=REALPROOF%20店舗プランについて" className="fsp-nav-pill">今すぐお問い合わせ</a>
        </nav>

        {/* ═══ HERO (dark) ═══ */}
        <div className="fsp-hero-wrap">
          <div className="fsp-hero-bg-glow"></div>
          <div className="fsp-hero">
            <div>
              <p className="fsp-hero-eyebrow">証明されたものだけが、資産になる。</p>
              <h1 className="fsp-hero-title">
                スターチームが<br />
                <em>勝手に育つ</em><br />
                仕組み。
              </h1>
              <p className="fsp-hero-tagline">
                &ldquo;スタッフが本気でスキルを磨くのは、<br />
                それが自分の資産になるときだけです。&rdquo;
              </p>
              <p className="fsp-hero-body">
                スタッフが辞める理由は、人の問題ではありません。<br />
                頑張りが自分に蓄積されない「構造」の問題です。<br />
                REALPROOFは、その構造を根本から変えます。
              </p>
              <a href="mailto:bodydiscoverystudio@gmail.com?subject=REALPROOF%20店舗プランについて" className="fsp-hero-cta">今すぐお問い合わせ →</a>
            </div>
            <div className="fsp-hero-right">
              <div className="fsp-dash">
                <div className="fsp-dash-top">
                  <div className="fsp-d-dot fsp-d-dot-r"></div>
                  <div className="fsp-d-dot fsp-d-dot-y"></div>
                  <div className="fsp-d-dot fsp-d-dot-g"></div>
                  <span className="fsp-d-ttl">REALPROOF — Store Dashboard</span>
                </div>
                <div className="fsp-dash-body">
                  <p className="fsp-d-lbl">スタッフ別 強み分布</p>

                  {/* Category header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(4,1fr)', gap: '4px', marginBottom: '0.6rem', padding: '0 0.2rem' }}>
                    <div></div>
                    <div style={{ textAlign: 'center', padding: '0.35rem 0.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '3px' }}>
                      <div style={{ fontSize: '0.9rem', marginBottom: '1px' }}>🩹</div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.62rem', color: 'var(--gray-lt)', lineHeight: 1.3, fontWeight: 400 }}>痛み<br />不調改善</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.35rem 0.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '3px' }}>
                      <div style={{ fontSize: '0.9rem', marginBottom: '1px' }}>🧍</div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.62rem', color: 'var(--gray-lt)', lineHeight: 1.3, fontWeight: 400 }}>姿勢<br />動作改善</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.35rem 0.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '3px' }}>
                      <div style={{ fontSize: '0.9rem', marginBottom: '1px' }}>🌿</div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.62rem', color: 'var(--gray-lt)', lineHeight: 1.3, fontWeight: 400 }}>リラク<br />ゼーション</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: '0.35rem 0.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '3px' }}>
                      <div style={{ fontSize: '0.9rem', marginBottom: '1px' }}>⚡</div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.62rem', color: 'var(--gray-lt)', lineHeight: 1.3, fontWeight: 400 }}>パフォーマンス<br />向上</p>
                    </div>
                  </div>

                  {/* Staff rows */}
                  {/* 田中さくら: NO.1 痛み */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(4,1fr)', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ padding: '0.5rem 0.6rem', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem' }}>👑</span>
                        <span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700 }}>田中 さくら</span>
                      </div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.6rem', color: 'var(--gold-dk)', letterSpacing: '0.05em' }}><span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.65rem', fontWeight: 700 }}>No.1</span> 痛み改善</p>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>92</p>
                      <div style={{ height: '3px', background: 'var(--gold)', borderRadius: '2px', marginTop: '4px' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>61</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '66%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>44</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '48%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>38</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '41%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                  </div>

                  {/* 鈴木はるか: NO.1 姿勢 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(4,1fr)', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ padding: '0.5rem 0.6rem', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem' }}>👑</span>
                        <span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700 }}>鈴木 はるか</span>
                      </div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.6rem', color: 'var(--gold-dk)', letterSpacing: '0.05em' }}><span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.65rem', fontWeight: 700 }}>No.1</span> 姿勢改善</p>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>55</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '60%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>88</p>
                      <div style={{ height: '3px', background: 'var(--gold)', borderRadius: '2px', marginTop: '4px' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>42</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '46%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>31</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '34%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                  </div>

                  {/* 佐藤みなみ: NO.1 リラクゼ */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(4,1fr)', gap: '4px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ padding: '0.5rem 0.6rem', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem' }}>👑</span>
                        <span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700 }}>佐藤 みなみ</span>
                      </div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.6rem', color: 'var(--gold-dk)', letterSpacing: '0.05em' }}><span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.65rem', fontWeight: 700 }}>No.1</span> リラクゼ</p>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>48</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '52%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>52</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '57%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>91</p>
                      <div style={{ height: '3px', background: 'var(--gold)', borderRadius: '2px', marginTop: '4px' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>39</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '42%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                  </div>

                  {/* 山田あおい: NO.1 パフォーマンス */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(4,1fr)', gap: '4px', alignItems: 'center' }}>
                    <div style={{ padding: '0.5rem 0.6rem', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem' }}>👑</span>
                        <span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700 }}>山田 あおい</span>
                      </div>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.6rem', color: 'var(--gold-dk)', letterSpacing: '0.05em' }}><span style={{ fontFamily: "'Lato',sans-serif", fontSize: '0.65rem', fontWeight: 700 }}>No.1</span> パフォーマンス</p>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>44</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '48%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>36</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '39%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 300, color: 'var(--gray)', lineHeight: 1 }}>29</p>
                      <div style={{ height: '3px', background: 'rgba(212,168,67,0.2)', borderRadius: '2px', marginTop: '4px', width: '32%', marginLeft: 'auto', marginRight: 'auto' }}></div>
                    </div>
                    <div style={{ padding: '0.5rem 0.4rem', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', textAlign: 'center' }}>
                      <p style={{ fontFamily: "'Lato',sans-serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>85</p>
                      <div style={{ height: '3px', background: 'var(--gold)', borderRadius: '2px', marginTop: '4px' }}></div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ REFRAME ═══ */}
        <div className="fsp-reframe">
          <p className="fsp-reframe-ey fsp-rev">The Real Problem</p>
          <h2 className="fsp-reframe-h fsp-rev fsp-d1">
            売れているスタッフは、<em>出ていく。</em><br />
            育たないスタッフは、<strong>残る。</strong>
          </h2>
          <div className="fsp-reframe-rule fsp-rev fsp-d2"></div>
          <p className="fsp-reframe-body fsp-rev fsp-d2">
            お客さまは気づいています。誰が本当に実力があるかを。<br />
            問題は、その人が正しく認められないまま、独立していくことです。<br />
            蓄積されない評価が、優秀な人を外へ追い出しています。
          </p>
          <p className="fsp-reframe-punch fsp-rev fsp-d3">&ldquo;さあ、どうしますか？&rdquo;</p>
        </div>

        {/* ═══ ROOT CAUSE ═══ */}
        <section style={{ background: 'var(--black4)', padding: '6rem 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 70% at 80% 50%,rgba(212,168,67,0.05) 0%,transparent 60%)', pointerEvents: 'none' }}></div>
          <div className="fsp-wrap" style={{ position: 'relative', zIndex: 1 }}>
            <p className="fsp-ey fsp-rev">Root Cause</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6rem', marginTop: '3rem', alignItems: 'center' }}>
              <div className="fsp-rev fsp-d1">
                <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(3rem,6vw,5.5rem)', fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.025em', color: 'var(--cream)' }}>
                  頑張りが、<br />
                  <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>自分に残らない。</em>
                </h2>
                <p style={{ marginTop: '2rem', fontFamily: "'Cormorant Garamond',serif", fontSize: '1.3rem', fontStyle: 'italic', color: 'var(--gray-lt)', lineHeight: 1.6, borderLeft: '2px solid var(--gold)', paddingLeft: '1.2rem' }}>
                  &ldquo;それが本当の問題です。&rdquo;
                </p>
                <p style={{ marginTop: '1.5rem', fontSize: '1rem', lineHeight: 2, color: '#BBBBCC', fontWeight: 400, maxWidth: '400px' }}>
                  どれだけ成果を出しても、その証明はスタッフ自身に残りません。これがやる気を奪い、優秀な人から順に辞めさせている構造です。
                </p>
              </div>
              <div className="fsp-rev fsp-d2">
                <div style={{ position: 'relative' }}>
                  {/* vertical gold line */}
                  <div style={{ position: 'absolute', left: '12px', top: '16px', bottom: '16px', width: '1px', background: 'linear-gradient(to bottom,var(--gold),rgba(212,168,67,0.05))' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', paddingBottom: '2rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--gold)', background: 'var(--black4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold)' }}></div>
                      </div>
                      <p style={{ fontSize: '0.92rem', color: 'var(--cream)', fontWeight: 500, paddingTop: '0.3rem' }}>スキルを磨き、成果を出す</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', paddingBottom: '2rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(212,168,67,0.3)', background: 'var(--black4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(212,168,67,0.4)' }}></div>
                      </div>
                      <p style={{ fontSize: '0.95rem', color: '#CCCCDD', fontWeight: 400, paddingTop: '0.3rem' }}>その成果は「店の売上・指名数」になる</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', paddingBottom: '2rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(212,168,67,0.3)', background: 'var(--black4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(212,168,67,0.4)' }}></div>
                      </div>
                      <p style={{ fontSize: '0.95rem', color: '#CCCCDD', fontWeight: 400, paddingTop: '0.3rem' }}>スタッフに残るのは歩合だけ</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', paddingBottom: '2rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(212,168,67,0.2)', background: 'var(--black4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(212,168,67,0.3)' }}></div>
                      </div>
                      <p style={{ fontSize: '0.95rem', color: '#BBBBCC', fontWeight: 400, paddingTop: '0.3rem' }}>上司の主観でしか評価されない</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', paddingBottom: '2rem' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(212,168,67,0.15)', background: 'var(--black4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(212,168,67,0.2)' }}></div>
                      </div>
                      <p style={{ fontSize: '0.95rem', color: '#BBBBCC', fontWeight: 400, paddingTop: '0.3rem' }}>「正しく認められないなら独立」と判断する</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #CC5555', background: 'rgba(204,85,85,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#CC5555' }}></div>
                      </div>
                      <p style={{ fontSize: '0.9rem', color: '#DD7777', fontWeight: 500, paddingTop: '0.3rem' }}>育てたコストが、近隣の競合に変わる</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section className="fsp-sec-white">
          <div className="fsp-wrap">
            <p className="fsp-ey fsp-rev">How It Works</p>
            <h2 className="fsp-h2 fsp-rev fsp-d1">プルーフが、スタッフを<em>育てます。</em></h2>
            <p className="fsp-bt fsp-rev fsp-d2">客観的な実績が個人に蓄積されることで、スキルを磨く動機が根本から変わります。</p>
            <div className="fsp-steps">
              <div className="fsp-sc fsp-rev">
                <p className="fsp-sn">01</p>
                <h3 className="fsp-st">お客さまの声が、個人の実績になります</h3>
                <p className="fsp-sb">施術後、リピーターのお客さまにQRコードを提示するだけ。30秒のタップで「痛みが取れた」「動きが変わった」という声が、スタッフ個人のプルーフとして蓄積されます。上司ではなく、クライアントが証明します。</p>
              </div>
              <div className="fsp-sc fsp-rev fsp-d1">
                <p className="fsp-sn">02</p>
                <h3 className="fsp-st">スキルを磨くほど、自分の資産が増えます</h3>
                <p className="fsp-sb">歩合は今月だけですが、プルーフは一生残ります。技術を磨く理由が、初めてスタッフ自身のものになります。「成果を出すことが自分のキャリアになる」という仕組みが生まれます。</p>
              </div>
              <div className="fsp-sc fsp-rev fsp-d2">
                <p className="fsp-sn">03</p>
                <h3 className="fsp-st">「この店にいると貯まる」理由ができます</h3>
                <p className="fsp-sb">辞めたらプルーフの蓄積が止まります。それがスタッフ自身にとって明確な損失になります。ケージで縛るのではなく、成長できる場所に居続けたいと思わせる。それが本当の定着です。</p>
              </div>
              <div className="fsp-sc fsp-sc-dark fsp-rev fsp-d3">
                <p className="fsp-sn">04</p>
                <h3 className="fsp-st">強みが多角的に可視化されます。</h3>
                <p className="fsp-sb">プルーフはカテゴリ別に蓄積されます。「誰がどんな強みを持つか」がデータとして浮かび上がり、スタッフの配置・育成・採用のすべてが変わります。</p>
                <div className="fsp-forte-graph">
                  <div className="fsp-fg-row">
                    <span className="fsp-fg-lbl">痛み・不調改善</span>
                    <div className="fsp-fg-bar-bg"><div className="fsp-fg-bar" style={{ width: '91%' }}></div></div>
                    <span className="fsp-fg-val">91</span>
                  </div>
                  <div className="fsp-fg-row">
                    <span className="fsp-fg-lbl">姿勢・動作改善</span>
                    <div className="fsp-fg-bar-bg"><div className="fsp-fg-bar" style={{ width: '74%' }}></div></div>
                    <span className="fsp-fg-val">74</span>
                  </div>
                  <div className="fsp-fg-row">
                    <span className="fsp-fg-lbl">リラクゼーション</span>
                    <div className="fsp-fg-bar-bg"><div className="fsp-fg-bar" style={{ width: '58%' }}></div></div>
                    <span className="fsp-fg-val">58</span>
                  </div>
                  <div className="fsp-fg-row">
                    <span className="fsp-fg-lbl">パフォーマンス向上</span>
                    <div className="fsp-fg-bar-bg"><div className="fsp-fg-bar" style={{ width: '45%' }}></div></div>
                    <span className="fsp-fg-val">45</span>
                  </div>
                  <p className="fsp-fg-note">田中 さくら のFORTEプロフィール</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 5 WALLS ═══ */}
        <section className="fsp-sec-cream2">
          <div className="fsp-wrap">
            <p className="fsp-ey fsp-rev">5 Structural Walls</p>
            <div className="fsp-two" style={{ gap: '4rem' }}>
              <div className="fsp-rev fsp-d1">
                <h2 className="fsp-h2">多くの店が<br />伸び悩む、<br /><em>5つの壁。</em></h2>
                <p className="fsp-bt" style={{ marginTop: '1.2rem' }}>これらは個別の問題ではありません。すべては同じ根っこから生まれています。</p>
                <div className="fsp-walls-intro" style={{ marginTop: '2rem' }}>
                  <p>評価基準が<strong>「上司の主観」</strong>だけのとき、<br />構造全体が逆回転を始めます。</p>
                </div>
              </div>
              <ul className="fsp-issue-list fsp-rev fsp-d2">
                <li className="fsp-iss"><div className="fsp-iss-ic">01</div><p className="fsp-iss-t"><strong>スタッフのやる気が続かない</strong>成果を出しても出さなくても評価が変わらないため、本気になる理由が生まれません。</p></li>
                <li className="fsp-iss"><div className="fsp-iss-ic">02</div><p className="fsp-iss-t"><strong>優秀な人ほど辞めていく</strong>実力があるからこそ「正しく認められないなら独立」という判断をします。</p></li>
                <li className="fsp-iss"><div className="fsp-iss-ic">03</div><p className="fsp-iss-t"><strong>スタッフの強みがわからない</strong>誰が何に強いか把握できず、配置が経験と勘で決まっています。</p></li>
                <li className="fsp-iss"><div className="fsp-iss-ic">04</div><p className="fsp-iss-t"><strong>スタッフの実力を採用に活かせない</strong>個人の実績を可視化できないため、採用コミュニケーションに使えていません。</p></li>
                <li className="fsp-iss"><div className="fsp-iss-ic">05</div><p className="fsp-iss-t"><strong>育成コストが回収できない</strong>時間とお金をかけて育てても辞められてしまい、近隣に競合が増えるだけです。</p></li>
              </ul>
            </div>
          </div>
        </section>

        {/* ═══ BRIDGE BAND ═══ */}
        <div className="fsp-bridge-band">
          <p className="fsp-bridge-pre fsp-rev">The Shift</p>
          <p className="fsp-bridge-main fsp-rev fsp-d1">
            これまで、<em>証明の仕組み</em>がなかっただけです。<br />
            資格でも口コミでもなく、<br />
            クライアントが直接証明する<strong>プルーフ</strong>という選択肢が、<br />
            今、初めて存在します。
          </p>
          <p className="fsp-bridge-cta-line fsp-rev fsp-d2">★で選ぶ時代は、終わりました。</p>
        </div>

        {/* ═══ COMPARISON ═══ */}
        <section className="fsp-sec-white">
          <div className="fsp-wrap">
            <p className="fsp-ey fsp-rev">Comparison</p>
            <h2 className="fsp-h2 fsp-rev fsp-d1">「証明」の手段を、<br /><em>比べてみてください。</em></h2>
            <p className="fsp-bt fsp-rev fsp-d2">これまでプロが自分の実力を証明する手段は、資格か口コミしかありませんでした。どちらも、本当の実力を映していません。</p>
            <div className="fsp-rev fsp-d3">
              <table className="fsp-comp">
                <thead>
                  <tr><th></th><th>資格・認定証</th><th>口コミ・SNS</th><th>REALPROOF</th></tr>
                </thead>
                <tbody>
                  <tr><td>何を証明するか</td><td>知識の習得</td><td>印象・満足感</td><td>実際の施術体験</td></tr>
                  <tr><td>誰が証明するか</td><td>団体・学校</td><td>匿名の誰か</td><td>認証済みクライアント</td></tr>
                  <tr><td>実績の紐付け先</td><td>個人</td><td>店舗が多い</td><td>個人（ポータブル）</td></tr>
                  <tr><td>退職後はどうなるか</td><td>残る</td><td>消える</td><td>個人に残り続ける</td></tr>
                  <tr><td>カテゴリ別の強み</td><td>不可</td><td>不可</td><td>多次元で可視化</td></tr>
                  <tr><td>継続的な蓄積</td><td>試験のみ</td><td>書いた時だけ</td><td>施術のたびに増える</td></tr>
                </tbody>
              </table>
              <p className="fsp-comp-note">※ REALPROOFの絶対原則：プルーフは常に個人のもの。店舗が閲覧できるのは集約データのみ。だからこそスタッフは安心して本気で使います。</p>
            </div>
          </div>
        </section>

        {/* ═══ BEYOND SALARY ═══ */}
        <section className="fsp-sec-cream">
          <div className="fsp-wrap">
            <p className="fsp-ey fsp-rev">Beyond Salary</p>
            <h2 className="fsp-h2 fsp-rev fsp-d1">給料以上の価値を、<br /><em>スタッフに渡せます。</em></h2>
            <p className="fsp-bt fsp-rev fsp-d2">人が本当に求めているのは、報酬だけではありません。「自分の仕事が、正しく認められること」。REALPROOFは、その承認を客観的な形にします。</p>
            <div className="fsp-beyond-grid fsp-rev fsp-d3">
              <div className="fsp-bc fsp-bc-before">
                <p className="fsp-bc-lbl">給料・歩合だけの職場</p>
                <div className="fsp-bc-item">増やし続けなければ維持できない</div>
                <div className="fsp-bc-item">他店が上回れば条件負けする</div>
                <div className="fsp-bc-item">「認められた実感」が数字では伝わらない</div>
                <div className="fsp-bc-item">何も持ち出せないため、むしろ不満が残りやすい</div>
              </div>
              <div className="fsp-bc fsp-bc-after">
                <p className="fsp-bc-lbl">プルーフがある職場</p>
                <div className="fsp-bc-item">客観的な証明として個人に永続的に蓄積される</div>
                <div className="fsp-bc-item">他店には真似できない、唯一の価値</div>
                <div className="fsp-bc-item">貯まるほど価値が増える（複利効果）</div>
                <div className="fsp-bc-item">「ここにいることが自分の資産になる」という実感</div>
              </div>
            </div>
            <p className="fsp-beyond-q fsp-rev fsp-d4">&ldquo;承認は、給料より深く人を動かします。&rdquo;</p>
          </div>
        </section>

        {/* ═══ GETTING STARTED ═══ */}
        <section className="fsp-sec-cream2">
          <div className="fsp-wrap">
            <p className="fsp-ey fsp-rev" style={{ textAlign: 'center' }}>Getting Started</p>
            <h2 className="fsp-h2 fsp-rev fsp-d1" style={{ textAlign: 'center' }}>オーナー<span style={{ fontFamily: "'Lato',sans-serif", fontStyle: 'normal' }}>1</span>人の導入で、<br /><em>店舗全体が動き出します。</em></h2>
            <p className="fsp-bt fsp-rev fsp-d2" style={{ maxWidth: '480px', margin: '1rem auto 0', textAlign: 'center' }}>難しい設定は不要です。スタッフへの招待メールを送るだけで、全員がREALPROOFプロとしてアクティベートされます。</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2px', marginTop: '3.5rem' }} className="fsp-rev fsp-d3">
              <div style={{ background: 'var(--black2)', border: '1px solid rgba(212,168,67,0.12)', padding: '2.5rem 2rem', position: 'relative', transition: 'border-color 0.3s' }}>
                <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '4rem', fontWeight: 300, lineHeight: 1, color: 'rgba(212,168,67,0.15)', letterSpacing: '-0.04em', marginBottom: '1.2rem' }}>01</p>
                <div style={{ width: '32px', height: '1px', background: 'var(--gold)', marginBottom: '1.2rem' }}></div>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--cream)', marginBottom: '0.7rem', lineHeight: 1.4 }}>招待</h3>
                <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: 'var(--gray-lt)', fontWeight: 300 }}>オーナーがスタッフをメールで招待します。アカウント作成は不要です。</p>
              </div>

              <div style={{ background: 'var(--black2)', border: '1px solid rgba(212,168,67,0.12)', padding: '2.5rem 2rem', position: 'relative', transition: 'border-color 0.3s' }}>
                <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '4rem', fontWeight: 300, lineHeight: 1, color: 'rgba(212,168,67,0.15)', letterSpacing: '-0.04em', marginBottom: '1.2rem' }}>02</p>
                <div style={{ width: '32px', height: '1px', background: 'var(--gold)', marginBottom: '1.2rem' }}></div>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--cream)', marginBottom: '0.7rem', lineHeight: 1.4 }}>アクティベート</h3>
                <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: 'var(--gray-lt)', fontWeight: 300 }}>スタッフが招待を承認。マイページが即日開設され、プルーフの蓄積が始まります。</p>
              </div>

              <div style={{ background: 'var(--black2)', border: '1px solid rgba(212,168,67,0.12)', padding: '2.5rem 2rem', position: 'relative', transition: 'border-color 0.3s' }}>
                <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '4rem', fontWeight: 300, lineHeight: 1, color: 'rgba(212,168,67,0.15)', letterSpacing: '-0.04em', marginBottom: '1.2rem' }}>03</p>
                <div style={{ width: '32px', height: '1px', background: 'var(--gold)', marginBottom: '1.2rem' }}></div>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--cream)', marginBottom: '0.7rem', lineHeight: 1.4 }}>プルーフを集める</h3>
                <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: 'var(--gray-lt)', fontWeight: 300 }}>施術後にQRコードを提示するだけ。お客さまの30秒タップで実績が蓄積されます。</p>
              </div>

              <div style={{ background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.25)', padding: '2.5rem 2rem', position: 'relative', transition: 'border-color 0.3s' }}>
                <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '4rem', fontWeight: 300, lineHeight: 1, color: 'rgba(212,168,67,0.25)', letterSpacing: '-0.04em', marginBottom: '1.2rem' }}>04</p>
                <div style={{ width: '32px', height: '1px', background: 'var(--gold)', marginBottom: '1.2rem' }}></div>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--gold-lt)', marginBottom: '0.7rem', lineHeight: 1.4 }}>チームが変わる</h3>
                <p style={{ fontSize: '0.82rem', lineHeight: 1.8, color: 'var(--gray-lt)', fontWeight: 300 }}>ダッシュボードでスタッフ別の強みを一覧。チームの実力が、数字で見えてきます。</p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PRICING ═══ */}
        <section className="fsp-sec-cream">
          <div className="fsp-wrap">
            <p className="fsp-ey fsp-rev">Pricing</p>
            <h2 className="fsp-h2 fsp-rev fsp-d1">個人プロは<em>永久無料。</em><br />店舗・団体向けSaaSのみ有料です。</h2>
            <div className="fsp-price-grid fsp-rev fsp-d2">
              <div className="fsp-pc">
                <p className="fsp-pc-lbl">個人プロ</p>
                <p className="fsp-pc-num">無料</p>
                <p className="fsp-pc-unit">永久無料</p>
                <p className="fsp-pc-desc">個人のプルーフ蓄積・マイページ公開・QRコード発行。店舗に所属していても、プルーフは個人のものです。</p>
              </div>
              <div className="fsp-pc fsp-pc-feat">
                <p className="fsp-pc-lbl">店舗プラン</p>
                <p className="fsp-pc-num">¥9,800</p>
                <p className="fsp-pc-unit">月額（税込）</p>
                <p className="fsp-pc-desc">スタッフ人数無制限。ダッシュボード、スタッフ別プルーフ管理、カテゴリ別強み集計、NFCカード対応。</p>
              </div>
              <div className="fsp-pc fsp-pc-feat">
                <p className="fsp-pc-lbl">団体プラン</p>
                <p className="fsp-pc-num">¥29,800</p>
                <p className="fsp-pc-unit">月額（税込）</p>
                <p className="fsp-pc-desc">複数店舗・所属プロの横断管理。団体ダッシュボード、所属プロ別プルーフ分布、認定ティア連携。</p>
              </div>
            </div>

            {/* MVP */}
            <div className="fsp-mvp fsp-rev fsp-d3">
              <span className="fsp-mvp-badge">MVP Early Access — 今だけ</span>
              <h3 className="fsp-mvp-title">MVP参加で、<strong><span style={{ fontFamily: "'Lato',sans-serif" }}>1</span>年間無料</strong>＋NFCカードプレゼント。</h3>
              <ul className="fsp-mvp-list">
                <li>店舗プラン（¥9,800/月）が<strong><span style={{ fontFamily: "'Lato',sans-serif" }}>1</span>年間無料</strong>でご利用いただけます</li>
                <li>スタッフ<strong>15名まで</strong>のNFCカードを<strong>無料でプレゼント</strong>（¥9,800相当）</li>
                <li>カードお届けにはスタッフ名の事前申告が必要です</li>
                <li>機能改善へのフィードバックにご協力いただけるオーナー様限定のご案内です</li>
              </ul>
              <p className="fsp-mvp-note">※ MVP参加枠には限りがございます。お早めにお問い合わせください。</p>
            </div>
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section className="fsp-cta-sec" id="cta">
          <div className="fsp-wrap">
            <h2 className="fsp-cta-q fsp-rev">
              スタッフの実績が、<br />
              <em>資産に変わる。</em>
            </h2>
            <p className="fsp-cta-sub fsp-rev fsp-d1">
              REALPROOFは、スタッフの証明された実績を<br />
              個人の資産にする、最初の仕組みです。<br />
              まずお気軽にご相談ください。
            </p>
            <a href="mailto:bodydiscoverystudio@gmail.com?subject=REALPROOF%20店舗プランについて" className="fsp-cta-btn fsp-rev fsp-d2">今すぐお問い合わせ</a>
            <p className="fsp-cta-note fsp-rev fsp-d3">MVP参加のご相談もこちらから　|　返信は通常2営業日以内</p>
          </div>
        </section>

        <footer className="fsp-footer">
          <span className="fsp-fl">REALPROOF</span>
          <span className="fsp-fc">© 2026 株式会社 Legrand chariot　|　CONFIDENTIAL</span>
        </footer>
      </div>
    </>
  )
}

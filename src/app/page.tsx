'use client'
import { useState, useEffect, useRef } from 'react'

// ─── Horizontal Swipe ───
function SwipeSlider({ children, darkDots = false }: { children: React.ReactNode[]; darkDots?: boolean }) {
  const [current, setCurrent] = useState(0);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);
  const total = children.length;
  const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEnd.current = e.touches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && current < total - 1) setCurrent(c => c + 1);
      if (diff < 0 && current > 0) setCurrent(c => c - 1);
    }
  };
  return (
    <div className="relative">
      <div className="overflow-hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${current * 100}%)` }}>
          {children.map((child, i) => (<div key={i} className="w-full flex-shrink-0 px-2">{child}</div>))}
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-6">
        {Array.from({ length: total }).map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} className="w-2 h-2 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i === current ? '#C4A35A' : darkDots ? '#444' : '#ccc' }} />
        ))}
      </div>
      {current > 0 && (
        <button onClick={() => setCurrent(c => c - 1)}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 -left-5 w-10 h-10 rounded-full items-center justify-center text-lg"
          style={{ backgroundColor: 'rgba(196,163,90,0.12)', color: '#C4A35A' }}>‹</button>
      )}
      {current < total - 1 && (
        <button onClick={() => setCurrent(c => c + 1)}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 -right-5 w-10 h-10 rounded-full items-center justify-center text-lg"
          style={{ backgroundColor: 'rgba(196,163,90,0.12)', color: '#C4A35A' }}>›</button>
      )}
    </div>
  );
}

// ─── Scroll Reveal ───
function useScrollReveal(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}
function Reveal({ children, className = "", style = {}, delay = 0 }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; delay?: number }) {
  const [ref, visible] = useScrollReveal();
  return (
    <div ref={ref} className={className} style={{ ...style, opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(14px)',
      transition: `opacity 0.7s ease-out ${delay}s, transform 0.7s ease-out ${delay}s` }}>{children}</div>
  );
}

// ─── Bar Chart ───
function BarChart({ animated }: { animated: boolean }) {
  const items = [
    { label: '技術力', value: 92 },
    { label: '共感力', value: 72 },
    { label: '専門性', value: 85 },
    { label: '信頼性', value: 88 },
    { label: '受容力', value: 65 },
    { label: '発信力', value: 58 },
  ];
  return (
    <div className="space-y-5 w-full max-w-sm mx-auto">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between mb-1.5">
            <span style={{ color: '#FAFAF7', fontSize: '13px', fontWeight: 500 }}>{item.label}</span>
            <span style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>{animated ? item.value : 0}</span>
          </div>
          <div className="w-full rounded overflow-hidden" style={{ height: '24px', backgroundColor: '#2A2A3E' }}>
            <div className="h-full rounded" style={{
              width: animated ? `${item.value}%` : '0%',
              backgroundColor: '#C4A35A',
              transition: `width 1.2s ease-out ${0.15 * i}s`,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}


// ─── Pillar Icons (Gold line-art SVGs) ───
const PillarIcons: Record<string, React.ReactNode> = {
  permanent: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 6L6 14v10c0 7.2 5.8 13.6 14 16 8.2-2.4 14-8.8 14-16V14L20 6z"
        stroke="#C4A35A" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
      <path d="M14 20l4 4 8-8" stroke="#C4A35A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  multidim: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="22" width="6" height="12" rx="1.5" stroke="#C4A35A" strokeWidth="1.5"/>
      <rect x="13" y="14" width="6" height="20" rx="1.5" stroke="#C4A35A" strokeWidth="1.5"/>
      <rect x="22" y="8" width="6" height="26" rx="1.5" stroke="#C4A35A" strokeWidth="1.5"/>
      <rect x="31" y="18" width="6" height="16" rx="1.5" stroke="#C4A35A" strokeWidth="1.5"/>
    </svg>
  ),
  tamperproof: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="11" y="17" width="18" height="16" rx="3" stroke="#C4A35A" strokeWidth="1.5"/>
      <path d="M15 17v-4a5 5 0 0 1 10 0v4" stroke="#C4A35A" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="20" cy="25" r="2" fill="#C4A35A"/>
      <path d="M20 27v2" stroke="#C4A35A" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

// ─── Benefit Icon SVGs ───
const BenefitIcons: Record<string, React.ReactNode> = {
  eye: (<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#C4A35A" strokeWidth="1.5"><ellipse cx="24" cy="24" rx="16" ry="10"/><circle cx="24" cy="24" r="5"/></svg>),
  loop: (<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#C4A35A" strokeWidth="1.5"><path d="M32 16c4 3 6 7 6 8s-2 5-6 8M16 32c-4-3-6-7-6-8s2-5 6-8"/><path d="M30 12l4 4-4 4M18 36l-4-4 4-4"/></svg>),
  share: (<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#C4A35A" strokeWidth="1.5"><path d="M24 34V14m0 0l-7 7m7-7l7 7"/><rect x="10" y="28" width="28" height="10" rx="2"/></svg>),
};

// ════════════════════════════════════════════
//  MAIN — v5 (Design Spec v13-2)
// ════════════════════════════════════════════
export default function Home() {
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [chartRef, chartVisible] = useScrollReveal();

  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 200);
    return () => clearTimeout(t);
  }, []);

  const sectionPad: React.CSSProperties = { padding: '80px 24px' };
  const inner = "max-w-2xl mx-auto";

  return (
    <div style={{ fontFamily: "'Noto Sans JP', sans-serif", lineHeight: 1.8, overflowX: 'hidden', margin: '-2rem -1rem 0' }}>
      <style>{`
        @keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(196,163,90,0)} 50%{box-shadow:0 0 24px 4px rgba(196,163,90,0.2)} }
        @keyframes fadeOutBubble { 0%,60%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-10px)} }
        .bubble-anim{animation:fadeOutBubble 3.5s ease-in-out infinite} .bubble-anim-2{animation-delay:.4s} .bubble-anim-3{animation-delay:.8s}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}} .scroll-bounce{animation:bounce 2s ease-in-out infinite}
        *{box-sizing:border-box}
        body > footer { display: none !important; }
      `}</style>

      {/* ═══ S1: HERO ═══ */}
      <section className="min-h-screen flex flex-col justify-center relative"
        style={{ background: 'linear-gradient(180deg, #1A1A2E 0%, #0F0F1E 100%)', padding: '5px 24px 48px' }}>
        <div className="max-w-5xl mx-auto w-full">
          <div className="md:flex md:items-center md:gap-16">
            <div className="md:flex-1 text-center md:text-left">
              <div style={{ opacity: heroLoaded?1:0, transform: heroLoaded?'translateY(0)':'translateY(12px)',
                transition: 'all 0.6s ease-out 0.1s', color: '#C4A35A', fontSize: '16px', letterSpacing: '1.5px', fontWeight: 500, marginBottom: '24px' }}>
                クライアントの信頼が資産に変わるデジタル名刺
              </div>

              <div className="md:hidden mb-8" style={{ opacity: heroLoaded?1:0, transform: heroLoaded?'translateY(0)':'translateY(24px)', transition: 'all 0.7s ease-out 0.3s' }}>
                <img
                  src="/images/hero_sp.png"
                  alt="REALPROOFカードを持つ手"
                  className="rounded-xl w-full"
                  style={{ maxWidth: '360px', margin: '0 auto', display: 'block' }}
                />
              </div>

              <h1 style={{ opacity: heroLoaded?1:0, transform: heroLoaded?'translateY(0)':'translateY(16px)', transition: 'all 0.6s ease-out 0.6s',
                color: '#FAFAF7', fontSize: 'clamp(24px, 6vw, 34px)', fontWeight: 700, lineHeight: 1.5, marginBottom: '36px' }}>
                「あなたに出会えてよかった」<br />
                <span style={{ fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 400, opacity: 0.85 }}>
                  ——でもその言葉、誰も知らない。
                </span>
              </h1>

              <div className="flex flex-col items-center md:items-start">
                <button style={{ opacity: heroLoaded?1:0, transition: 'opacity 0.6s ease-out 0.9s',
                  backgroundColor: '#C4A35A', color: '#1A1A2E', fontWeight: 700, fontSize: '18px',
                  padding: '16px 5px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  width: '100%', maxWidth: '340px', fontFamily: "'Noto Sans JP', sans-serif",
                  animation: heroLoaded ? 'pulseGlow 3s ease-in-out infinite' : 'none',
                  lineHeight: 1.2 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, letterSpacing: 0 }}>
                    <span>信頼を</span><span style={{ margin: '0 -2px' }}>&quot;</span><span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', margin: 0, padding: 0, lineHeight: 1 }}><span>証明</span><span style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px', lineHeight: 1, marginTop: '4px', opacity: 0.65 }}>プルーフ</span></span><span style={{ margin: '0 -2px' }}>&quot;</span><span>に変える →</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="hidden md:block md:flex-1" style={{ opacity: heroLoaded?1:0, transform: heroLoaded?'translateY(0) rotate(-2deg)':'translateY(30px) rotate(-2deg)', transition: 'all 0.8s ease-out 0.5s' }}>
              <img
                src="/images/hero_pc.png"
                alt="REALPROOFカードを持つ手"
                className="rounded-xl w-full"
              />
            </div>
          </div>
        </div>
        <div className="scroll-bounce absolute bottom-8 left-1/2 -translate-x-1/2"
          style={{ opacity: heroLoaded?0.35:0, transition: 'opacity 1s ease-out 1.5s' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
        </div>
      </section>

      {/* ═══ S2: PAIN ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#FAFAF7' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <h2 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>
                積み上げた信頼こそがあなたの財産。<br />
                「あなたはそれを蔑ろにしている」
              </h2>
              <p style={{ color: '#1A1A2E', fontSize: '15px', marginBottom: '8px' }}>
                セッションのたびに届く感謝の言葉。<br />
                紹介してくれるクライアント。信頼のサイン。
              </p>
              <p style={{ color: '#1A1A2E', fontSize: '15px', fontWeight: 700 }}>
                今、それは空気中に消えている。
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="hidden md:grid md:grid-cols-2 md:gap-6">
              <PainCard type="vanish" /><PainCard type="save" />
            </div>
            <div className="md:hidden">
              <SwipeSlider><PainCard type="vanish" /><PainCard type="save" /></SwipeSlider>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ S3: HOW IT WORKS ═══ */}
      <section style={{ backgroundColor: '#FAFAF7', padding: '0 24px 80px' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <div style={{ color: '#C4A35A', fontSize: '12px', letterSpacing: '3px', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginBottom: '12px' }}>HOW IT WORKS</div>
              <h2 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700 }}>
                かざすだけ。30秒で、信頼が形に変わる。
              </h2>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="hidden md:grid md:grid-cols-3 md:gap-6">
              {howItWorksSteps.map((s, i) => <StepCard key={i} step={s} />)}
            </div>
            <div className="md:hidden">
              <SwipeSlider>{howItWorksSteps.map((s, i) => <StepCard key={i} step={s} />)}</SwipeSlider>
            </div>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="text-center" style={{ color: '#9A9A9A', fontSize: '13px', marginTop: '28px' }}>
              ログイン不要。アプリのダウンロードも不要。<br />
              クライアントはメールアドレスだけで記録できる。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ S4: 多次元の強み ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#1A1A2E' }}>
        <div className={inner} ref={chartRef}>
          <Reveal>
            <div className="text-center mb-10">
              <h2 style={{ color: '#FAFAF7', fontSize: '22px', fontWeight: 700 }}>
                クライアントはあなたの強みを信頼している。<br />
                磨く強みは、人それぞれ。
              </h2>
            </div>
          </Reveal>

          <div className="mb-10"><BarChart animated={chartVisible} /></div>

          <Reveal delay={0.3}>
            <div className="md:flex md:gap-12 md:justify-center text-center md:text-left">
              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: '#FAFAF7', fontSize: '15px', fontWeight: 700 }}>技術的強み</div>
                <div style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>Result Proofs</div>
                <div style={{ color: '#9A9A9A', fontSize: '14px' }}>クライアントが実感した具体的な成果</div>
              </div>
              <div style={{ marginBottom: '28px' }}>
                <div style={{ color: '#FAFAF7', fontSize: '15px', fontWeight: 700 }}>人間的強み</div>
                <div style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>Humanity Proofs</div>
                <div style={{ color: '#9A9A9A', fontSize: '14px' }}>信頼、共感、安心感</div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.4}>
            <p className="text-center" style={{ color: '#C4A35A', fontSize: '16px', fontWeight: 700 }}>
              REALPROOFには★の数も批判も存在しない。<br />
              あるのは「あなたの強みへの記録」だけ。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ S5: 3本柱 ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#FAFAF7' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <div style={{ color: '#C4A35A', fontSize: '12px', letterSpacing: '3px', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginBottom: '12px' }}>WHY REALPROOF</div>
              <h2 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700 }}>プルーフが信頼に変わる、3つの理由。</h2>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="hidden md:grid md:grid-cols-3 md:gap-6">
              {pillars.map((p, i) => <PillarCard key={i} pillar={p} />)}
            </div>
            <div className="md:hidden">
              <SwipeSlider>{pillars.map((p, i) => <PillarCard key={i} pillar={p} />)}</SwipeSlider>
            </div>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="text-center" style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 700, marginTop: '32px' }}>
              1つのREALPROOF ＞ 100のいいね
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ S6: ベネフィット ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#1A1A2E' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-4">
              <h2 style={{ color: '#FAFAF7', fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>
                信頼が貯まると、何が変わるか。
              </h2>
              <p style={{ color: '#9A9A9A', fontSize: '15px' }}>
                あなた自身も。あなたの店舗も。あなたの団体も。<br />
                「強み」で差別化され、<br />
                本当に届けたい人に、届くようになる。
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="hidden md:grid md:grid-cols-3 md:gap-6 mt-8">
              {benefits.map((b, i) => <BenefitCard key={i} benefit={b} />)}
            </div>
            <div className="md:hidden mt-8">
              <SwipeSlider darkDots>{benefits.map((b, i) => <BenefitCard key={i} benefit={b} />)}</SwipeSlider>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ S7: VOICES ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#1A1A2E' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <h2 style={{ color: '#FAFAF7', fontSize: '22px', fontWeight: 700 }}>
                この悩み、あなただけじゃない。
              </h2>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="hidden md:grid md:grid-cols-3 md:gap-6">
              {voices.map((v, i) => <VoiceCard key={i} voice={v} />)}
            </div>
            <div className="md:hidden">
              <SwipeSlider darkDots>{voices.map((v, i) => <VoiceCard key={i} voice={v} />)}</SwipeSlider>
            </div>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="text-center" style={{ color: '#FAFAF7', fontSize: '15px', marginTop: '32px' }}>
              REALPROOFは、この問題を解決するために生まれました。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ S8: FOUNDER'S NOTE ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#FAFAF7' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center">
              <div style={{ color: '#C4A35A', fontSize: '12px', letterSpacing: '3px', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginBottom: '24px' }}>
                FOUNDER&apos;S NOTE
              </div>
              <div className="mx-auto mb-5" style={{ width: '72px', height: '72px', borderRadius: '50%', border: '1px solid #C4A35A', overflow: 'hidden',
                background: 'linear-gradient(135deg, #2a2a3e, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src="/images/founder.png"
                  alt="宮崎ほくと"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const el = e.currentTarget;
                    el.style.display = 'none';
                    if (el.parentElement) el.parentElement.innerHTML = '<span style="color:#C4A35A;font-size:24px;font-weight:700">宮</span>';
                  }}
                />
              </div>

              <h3 style={{ color: '#1A1A2E', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
                「強みを磨く人」が<br />輝く世界をつくる。
              </h3>

              <p style={{ color: '#1A1A2E', fontSize: '15px', marginBottom: '20px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                15年間、騎手として、トレーナーとして、治療家として<br />
                技術の現場に立ち続けてきました。<br />
                気づいたことがある。<br />
                真摯にスキルを磨く職人よりも、<br />
                SNS、営業、マーケティングに精を出した人ばかりが目立つ。<br />
                故に、努力の方向性を間違えている人が多い。
              </p>
              <p style={{ color: '#1A1A2E', fontSize: '15px', marginBottom: '20px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                この現実を変えたくて、REALPROOFを作りました。
              </p>

              <div style={{ color: '#1A1A2E', fontSize: '13px', marginBottom: '20px', opacity: 0.5 }}>
                宮崎 ほくと<br />
                株式会社 Legrand chariot 代表取締役
              </div>
              <a href="#" style={{ color: '#C4A35A', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}>
                ストーリーを見る →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ S9: CTA ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#1A1A2E', textAlign: 'center' }}>
        <div className="max-w-md mx-auto">
          <Reveal>
            <h2 style={{ color: '#FAFAF7', fontSize: '22px', fontWeight: 700, marginBottom: '32px' }}>
              REALPROOFは、<br />今日から誰でも使えます。
            </h2>
            <button style={{ backgroundColor: '#C4A35A', color: '#1A1A2E', fontWeight: 700, fontSize: '16px',
              padding: '18px 32px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              width: '100%', fontFamily: "'Noto Sans JP', sans-serif" }}>
              プロとして登録する →
            </button>
          </Reveal>
        </div>
      </section>

      {/* ═══ S10: FOUNDING MEMBER ═══ */}
      <section style={{ background: 'linear-gradient(180deg, #1A1A2E 0%, #1f1f35 100%)', padding: '80px 24px' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center">
              <div style={{ color: '#C4A35A', fontSize: '12px', letterSpacing: '3px', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginBottom: '12px' }}>FOUNDING MEMBER</div>
              <h2 style={{ color: '#FAFAF7', fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>
                最初の仲間だけの特権。<br />ただし、条件がある。
              </h2>
              <p style={{ color: '#FAFAF7', fontSize: '15px', marginBottom: '28px' }}>
                クライアントから5票以上を集めた人だけが、<br className="hidden md:inline" />
                Founding Memberになれる。
              </p>
            </div>

            <div className="max-w-sm mx-auto mb-8">
              {['永久にFounding Memberバッジが表示される', 'プラットフォーム改善に直接関われる', '一緒にREALPROOFの文化を作る'].map((item, i) => (
                <div key={i} className="flex items-start gap-3 mb-3">
                  <span style={{ color: '#C4A35A', fontSize: '14px', marginTop: '2px', flexShrink: 0 }}>✦</span>
                  <span style={{ color: '#FAFAF7', fontSize: '15px' }}>{item}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <button style={{ backgroundColor: 'transparent', color: '#C4A35A', fontWeight: 700, fontSize: '16px',
                padding: '16px 32px', borderRadius: '8px', border: '1.5px solid #C4A35A', cursor: 'pointer',
                width: '100%', maxWidth: '340px', fontFamily: "'Noto Sans JP', sans-serif" }}>
                Founding Memberに挑戦する →
              </button>
            </div>

            <p className="text-center" style={{ color: '#9A9A9A', fontSize: '11px', marginTop: '16px' }}>
              現在プロ登録するとFounding Memberには自動で登録されます。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="text-center" style={{ backgroundColor: '#0F0F1E', padding: '48px 24px 32px' }}>
        <div style={{ color: '#C4A35A', fontSize: '16px', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '3px', marginBottom: '24px' }}>REALPROOF</div>
        <div className="flex justify-center gap-6 mb-6 flex-wrap" style={{ fontSize: '13px' }}>
          <a href="/legal" style={{ color: '#9A9A9A', textDecoration: 'none' }}>特定商取引法に基づく表記</a>
          <a href="/privacy" style={{ color: '#9A9A9A', textDecoration: 'none' }}>プライバシーポリシー</a>
        </div>
        <div style={{ color: '#9A9A9A', fontSize: '11px' }}>© 2026 REALPROOF / 株式会社 Legrand chariot</div>
      </footer>
    </div>
  );
}

// ─── Data ───
const howItWorksSteps = [
  { num: '01', title: 'Tap', desc: 'セッションの後に\nカードをかざす', sub: '（またはQRを見せる）', icon: 'nfc', mockup: '/images/nfc_tap.png' },
  { num: '02', title: 'Record', desc: 'クライアントが\n「何が良かったか」を選ぶ', sub: '', icon: 'check', mockup: null },
  { num: '03', title: 'Save', desc: 'あなたの信頼として\n蓄積される', sub: '', icon: 'chart', mockup: null },
];

const pillars = [
  {
    title: '一生、消えない。',
    desc: '積み上げた信頼は、あなたのものとしてずっと残り続ける。1年目も、10年目も。消えない信頼が、あなたのキャリアを支える。',
    iconKey: 'permanent',
  },
  {
    title: '★じゃ、わからない。',
    desc: '★1つで何がわかる？ REALPROOFは「この人の何が良いか」を多次元で可視化する。',
    iconKey: 'multidim',
  },
  {
    title: '嘘が、つけない。',
    desc: '対面限定。本人認証。1人1回。実際に会った人しか記録できない設計。',
    iconKey: 'tamperproof',
  },
];

const benefits = [
  { icon: 'eye', title: '自分の強みが、見える。', desc: '「あなたの何が良いですか？」と聞かれて、すぐ答えられるか。信頼の記録が貯まると、クライアントの目を通して「自分が何で選ばれているか」が見えてくる。自己紹介が変わる。現場の自信が変わる。' },
  { icon: 'loop', title: '紹介の輪が、回り出す。', desc: 'クライアントも、プロ同士も、あなたの「強み」をシェアし合える。広告費¥0。営業トーク不要。あなたを本当に必要としている人だけが、あなたに出会える。' },
  { icon: 'share', title: 'どこにでも、貼れる。', desc: 'Instagram、ホームページ、LINE、名刺。あなたが今使っているチャネルに、信頼の証拠をそのまま載せられる。REALPROOFの中だけで完結しない。あなたの武器になる。' },
];

const voices = [
  { role: '整体師', text: '「技術には自信があるのに、うまく伝えられない。SNSが得意な人ばかり目立っている気がする。」' },
  { role: 'ヨガインストラクター', text: '「生徒さんは来てくれる。でも、自分の何が良いのか、正直よくわからない。」' },
  { role: 'パーソナルトレーナー', text: '「結果を出しても、それが自分の実績として残らない。店の看板で終わる。」' },
];

// ─── Sub Components ───
function PainCard({ type }: { type: string }) {
  if (type === 'vanish') {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#f0f0ec', minHeight: '220px' }}>
        <div style={{ fontSize: '12px', color: '#9A9A9A', marginBottom: '20px', letterSpacing: '1px' }}>今のあなた</div>
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {['「楽になった」', '「また来ます」', '「紹介したい」'].map((t, i) => (
            <span key={i} className={`bubble-anim ${i===1?'bubble-anim-2':i===2?'bubble-anim-3':''}`}
              style={{ display: 'inline-block', padding: '8px 14px', borderRadius: '20px', backgroundColor: 'white',
                fontSize: '13px', color: '#1A1A2E', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>{t}</span>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: '#9A9A9A' }}>↑ 空気中に消えていく…</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#1A1A2E', minHeight: '220px' }}>
      <div style={{ fontSize: '12px', color: '#9A9A9A', marginBottom: '16px', letterSpacing: '1px' }}>REALPROOFがある未来</div>
      <div className="max-w-xs mx-auto space-y-2 text-left">
        {[{ l: '技術力', v: 85 }, { l: '共感力', v: 70 }, { l: '信頼性', v: 60 }].map((item, i) => (
          <div key={i}>
            <div style={{ fontSize: '11px', color: '#9A9A9A', marginBottom: '2px' }}>{item.l}</div>
            <div className="rounded overflow-hidden" style={{ height: '18px', backgroundColor: '#2A2A3E' }}>
              <div className="h-full rounded" style={{ width: `${item.v}%`, backgroundColor: '#C4A35A', transition: 'width 1s ease-out' }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: '#C4A35A', marginTop: '12px' }}>信頼が、貯まっていく</div>
    </div>
  );
}

function StepCard({ step }: { step: typeof howItWorksSteps[number] }) {
  const icons: Record<string, React.ReactNode> = {
    nfc: (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 12a3 3 0 0 1 3-3m-1.5 3a1.5 1.5 0 0 1 1.5-1.5"/></svg>),
    check: (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>),
    chart: (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>),
  };
  return (
    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: 'white', boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
      <div style={{ color: '#C4A35A', fontFamily: "'Inter', sans-serif", fontSize: '28px', fontWeight: 600, marginBottom: '8px' }}>{step.num}</div>
      <div className="flex justify-center mb-3">{icons[step.icon]}</div>
      {step.mockup && (
        <div className="mb-3 mx-auto" style={{ maxWidth: '200px' }}>
          <img
            src={step.mockup}
            alt={step.title}
            className="rounded-lg w-full"
          />
        </div>
      )}
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '17px', fontWeight: 600, color: '#1A1A2E', marginBottom: '8px' }}>{step.title}</div>
      <div style={{ fontSize: '14px', color: '#1A1A2E', whiteSpace: 'pre-line' }}>{step.desc}</div>
      {step.sub && <div style={{ fontSize: '12px', color: '#9A9A9A', marginTop: '4px' }}>{step.sub}</div>}
    </div>
  );
}

function PillarCard({ pillar }: { pillar: typeof pillars[number] }) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: 'white', boxShadow: '0 2px 20px rgba(0,0,0,0.04)', minHeight: '200px' }}>
      <div style={{ marginBottom: '12px' }}>{PillarIcons[pillar.iconKey]}</div>
      <h3 style={{ color: '#1A1A2E', fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>{pillar.title}</h3>
      <p style={{ color: '#1A1A2E', fontSize: '14px', lineHeight: 1.8 }}>{pillar.desc}</p>
    </div>
  );
}

function BenefitCard({ benefit }: { benefit: typeof benefits[number] }) {
  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: '#222240', minHeight: '220px' }}>
      <div className="mb-3">{BenefitIcons[benefit.icon]}</div>
      <h3 style={{ color: '#C4A35A', fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>{benefit.title}</h3>
      <p style={{ color: '#FAFAF7', fontSize: '14px', lineHeight: 1.8, opacity: 0.85 }}>{benefit.desc}</p>
    </div>
  );
}

function VoiceCard({ voice }: { voice: typeof voices[number] }) {
  return (
    <div className="rounded-2xl p-6 relative" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(196,163,90,0.12)', minHeight: '180px' }}>
      <div style={{ color: '#C4A35A', fontSize: '32px', lineHeight: 1, fontFamily: 'Georgia, serif', opacity: 0.3, marginBottom: '4px' }}>&quot;</div>
      <div style={{ color: '#C4A35A', fontSize: '12px', fontWeight: 500, marginBottom: '12px', letterSpacing: '1px' }}>{voice.role}</div>
      <p style={{ color: '#FAFAF7', fontSize: '14px', lineHeight: 1.8 }}>{voice.text}</p>
    </div>
  );
}

'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

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
  const resultItems = [
    { label: '痛みを取る技術がある', value: 12 },
    { label: '動きを変える技術がある', value: 9 },
    { label: '根本原因にアプローチできる', value: 8 },
    { label: '身体の変化を実感させてくれる', value: 6 },
    { label: '結果を出すのが早い', value: 5 },
  ];
  const humanityItems = [
    { label: '信頼できる人柄', value: 14 },
  ];
  const allItems = [...resultItems, ...humanityItems];
  const maxValue = Math.max(...allItems.map(item => item.value));
  return (
    <div className="w-full max-w-md mx-auto">
      {/* トッププルーフ */}
      <div className="text-center mb-6">
        <div style={{ display: 'inline-block', backgroundColor: '#1A1A2E', border: '1px solid rgba(196,163,90,0.3)', padding: '8px 16px', borderRadius: '8px' }}>
          <span style={{ color: '#C4A35A', fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '2px' }}>TOP PROOF</span>
          <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 500, marginLeft: '12px' }}>信頼できる人柄</span>
        </div>
      </div>

      {/* 技術的強み */}
      <div style={{ color: '#C4A35A', fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '1px', marginBottom: '12px' }}>Result Proofs</div>
      <div className="space-y-3 mb-6">
        {resultItems.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#FAFAF7', fontSize: '13px', fontWeight: 500 }}>{item.label}</span>
              <span style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>{animated ? item.value : 0}</span>
            </div>
            <div className="w-full rounded overflow-hidden" style={{ height: '22px', backgroundColor: '#2A2A3E' }}>
              <div className="h-full rounded" style={{
                width: animated ? `${(item.value / maxValue) * 100}%` : '0%',
                backgroundColor: '#C4A35A',
                transition: `width 1.2s ease-out ${0.15 * i}s`,
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* 人間的強み */}
      <div style={{ color: '#C4A35A', fontSize: '11px', fontFamily: "'Inter', sans-serif", fontWeight: 500, letterSpacing: '1px', marginBottom: '12px' }}>Humanity Proofs</div>
      <div className="space-y-3">
        {humanityItems.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#FAFAF7', fontSize: '13px', fontWeight: 500 }}>{item.label}</span>
              <span style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif" }}>{animated ? item.value : 0}</span>
            </div>
            <div className="w-full rounded overflow-hidden" style={{ height: '22px', backgroundColor: '#2A2A3E' }}>
              <div className="h-full rounded" style={{
                width: animated ? `${(item.value / maxValue) * 100}%` : '0%',
                backgroundColor: '#C4A35A',
                transition: `width 1.2s ease-out ${0.15 * (resultItems.length + i)}s`,
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* 注釈 */}
      <p className="text-center" style={{ color: '#999999', fontSize: '12px', marginTop: '20px' }}>
        ※ 投票項目はプロが自分で選べます（70項目から最大8つ）
      </p>
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
  star: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#C4A35A" strokeWidth="1.5">
      <path d="M24 8l4.5 9 10 1.5-7.25 7 1.7 10L24 31l-8.95 4.7 1.7-10L9.5 18.5l10-1.5z" strokeLinejoin="round"/>
    </svg>
  ),
  connect: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#C4A35A" strokeWidth="1.5">
      <circle cx="16" cy="24" r="6"/><circle cx="32" cy="24" r="6"/><path d="M22 24h4"/>
      <path d="M10 24c0-8 6-14 14-14M38 24c0 8-6 14-14 14" strokeDasharray="3 3"/>
    </svg>
  ),
};

// ════════════════════════════════════════════
//  MAIN — v5 (Design Spec v13-2)
// ════════════════════════════════════════════
export default function Home() {
  const { isSignedIn } = useAuth()
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [chartRef, chartVisible] = useScrollReveal();

  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 200);
    return () => clearTimeout(t);
  }, []);

  const sectionPad: React.CSSProperties = { padding: '80px 24px' };
  const inner = "max-w-2xl mx-auto";

  return (
    <div className="lp-root" style={{ fontFamily: "'Noto Sans JP', sans-serif", lineHeight: 1.8, overflowX: 'hidden' }}>

      {/* ═══ S1: HERO ═══ */}
      <section className="min-h-[calc(100vw*16/9)] md:min-h-screen flex flex-col justify-end relative"
        style={{ padding: '0', overflow: 'hidden' }}>

        {/* ── PC: フル幅背景画像 ── */}
        <div className="hidden md:block absolute inset-0" style={{ zIndex: 0 }}>
          <img
            src="/images/hero_pc.png"
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
            }}
          />
          {/* 左側にグラデーションオーバーレイ（テキスト可読性確保） */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(26,26,46,0.92) 0%, rgba(26,26,46,0.75) 40%, rgba(26,26,46,0.15) 70%, transparent 100%)',
          }} />
        </div>

        {/* ── SP: 背景画像（縮尺維持、横幅ぴったり） ── */}
        <div className="md:hidden absolute inset-0" style={{ zIndex: 0, overflow: 'hidden' }}>
          <img
            src="/images/hero_sp.png"
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center top',
              background: '#1A1A2E',
            }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(26,26,46,0.3) 0%, transparent 15%, transparent 40%, rgba(26,26,46,0.75) 60%, rgba(26,26,46,0.98) 78%)',
          }} />
        </div>

        {/* ── PC コンテンツ（左寄せ、垂直中央） ── */}
        <div className="hidden md:flex items-center absolute inset-0" style={{ zIndex: 1, padding: '0 24px' }}>
          <div className="max-w-5xl mx-auto w-full">
            {/* ラベル */}
            <div style={{
              opacity: heroLoaded ? 1 : 0,
              transform: heroLoaded ? 'translateY(0)' : 'translateY(12px)',
              transition: 'all 0.6s ease-out 0.1s',
              color: '#C4A35A',
              fontSize: '16px',
              letterSpacing: '1.5px',
              fontWeight: 500,
              marginBottom: '24px',
            }}>
              信頼を資産に変える、ただ一つの証明。
            </div>

            {/* ヒーローコピー */}
            <h1 style={{
              opacity: heroLoaded ? 1 : 0,
              transform: heroLoaded ? 'translateY(0)' : 'translateY(16px)',
              transition: 'all 0.6s ease-out 0.6s',
              color: '#FAFAF7',
              fontSize: 'clamp(28px, 4vw, 38px)',
              fontWeight: 700,
              lineHeight: 1.5,
              marginBottom: '36px',
              maxWidth: '520px',
            }}>
              「あなたに出会えてよかった」<br />
              <span style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 400, opacity: 0.85 }}>
                ——でもその言葉、誰も知らない。
              </span>
            </h1>

            {/* CTA */}
            <div>
              <button onClick={() => { window.location.href = isSignedIn ? '/auth-redirect' : '/sign-in'; }} style={{
                opacity: heroLoaded ? 1 : 0,
                transition: 'opacity 0.6s ease-out 0.9s',
                backgroundColor: '#C4A35A',
                color: '#1A1A2E',
                fontWeight: 700,
                fontSize: '18px',
                padding: '16px 32px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                maxWidth: '340px',
                fontFamily: "'Noto Sans JP', sans-serif",
                animation: heroLoaded ? 'pulseGlow 3s ease-in-out infinite' : 'none',
                lineHeight: 1.2,
              }}>
                今すぐ無料で登録 →
              </button>
              <p style={{
                marginTop: '10px',
                fontSize: '12px',
                color: 'rgba(250,250,247,0.5)',
                letterSpacing: '0.03em',
              }}>
                通常 <span style={{ textDecoration: 'line-through' }}>¥2,980/月</span> が、今は無料。
                <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
                クレジットカード不要。
              </p>
            </div>
          </div>
        </div>

        {/* ── SP コンテンツ ── */}
        <div className="md:hidden absolute inset-0"
          style={{ zIndex: 1 }}>
          {/* ゴールドラベル（上部固定） */}
          <div style={{
            position: 'absolute',
            top: '16px',
            left: 0,
            right: 0,
            textAlign: 'center',
            opacity: heroLoaded ? 1 : 0,
            transform: heroLoaded ? 'translateY(0)' : 'translateY(12px)',
            transition: 'all 0.6s ease-out 0.1s',
            color: '#C4A35A',
            fontSize: '13px',
            letterSpacing: '1.5px',
            fontWeight: 500,
          }}>
            信頼を資産に変える、ただ一つの証明。
          </div>
          {/* コピー + CTA（画像の下半分に重なる位置） */}
          <div style={{
            position: 'absolute',
            bottom: '140px',
            left: '24px',
            right: '24px',
            textAlign: 'center',
          }}>
            <h1 style={{
              opacity: heroLoaded ? 1 : 0,
              transform: heroLoaded ? 'translateY(0)' : 'translateY(16px)',
              transition: 'all 0.6s ease-out 0.6s',
              color: '#FAFAF7',
              fontSize: 'clamp(22px, 6vw, 30px)',
              fontWeight: 700,
              lineHeight: 1.5,
              marginBottom: '20px',
            }}>
              「あなたに出会えてよかった」<br />
              <span style={{ fontSize: 'clamp(17px, 4.5vw, 24px)', fontWeight: 400, opacity: 0.85 }}>
                ——でもその言葉、誰も知らない。
              </span>
            </h1>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => { window.location.href = isSignedIn ? '/auth-redirect' : '/sign-in'; }} style={{
                opacity: heroLoaded ? 1 : 0,
                transition: 'opacity 0.6s ease-out 0.9s',
                backgroundColor: '#C4A35A',
                color: '#1A1A2E',
                fontWeight: 700,
                fontSize: '17px',
                padding: '14px 32px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                maxWidth: '300px',
                fontFamily: "'Noto Sans JP', sans-serif",
                animation: heroLoaded ? 'pulseGlow 3s ease-in-out infinite' : 'none',
              }}>
                今すぐ無料で登録 →
              </button>
            </div>
            <p style={{
              marginTop: '8px',
              fontSize: '11px',
              color: 'rgba(250,250,247,0.45)',
              textAlign: 'center',
            }}>
              通常 <span style={{ textDecoration: 'line-through' }}>¥2,980/月</span> が、今は無料。
              <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
              クレジットカード不要。
            </p>
            <div className="scroll-bounce" style={{ marginTop: '16px', opacity: heroLoaded ? 0.5 : 0, transition: 'opacity 1s ease-out 1.5s', display: 'flex', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5">
                <path d="M12 5v14M5 12l7 7 7-7"/>
              </svg>
            </div>
          </div>
        </div>

        {/* スクロールインジケーター */}
        <div className="scroll-bounce absolute bottom-2 md:bottom-8 left-1/2 -translate-x-1/2"
          style={{ opacity: heroLoaded ? 0.35 : 0, transition: 'opacity 1s ease-out 1.5s', zIndex: 1 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" strokeWidth="1.5">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </div>
      </section>

      {/* ═══ S2: PAIN ═══ */}
      <section className="relative" style={{ ...sectionPad, backgroundColor: '#FAFAF7', marginTop: '-80px', zIndex: 2, borderRadius: '24px 24px 0 0' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <h2 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>
                積み上げた信頼こそがあなたの資産。
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
                かざすだけ。30秒で、信頼が資産に変わる。
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

      {/* ═══ S4.5: 口コミ比較 ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#E8E3D8' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <h2 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>
                誰でも書ける口コミに、信頼はない。
              </h2>
              <div style={{ color: '#1A1A2E', fontSize: '15px', lineHeight: 1.8, marginBottom: '8px' }}>
                口コミサイトのレビューは、<br />
                行ったことがない人でも書ける。<br />
                星の数は操作できる。<br />
                だから、プロも消費者も疑っている。
              </div>
              <div style={{ color: '#1A1A2E', fontSize: '15px', lineHeight: 1.8 }}>
                REALPROOFの記録は、<br />
                対面でカードをかざした人だけ。<br />
                1人1回。30分に1プルーフまで。<br />
                操作できない。だから信頼になる。
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '14px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: '#9A9A9A', fontWeight: 500, fontSize: '13px', borderBottom: '1px solid #E8E4DC' }}></th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', color: '#9A9A9A', fontWeight: 500, fontSize: '13px', borderBottom: '1px solid #E8E4DC' }}>口コミサイト</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', color: '#C4A35A', fontWeight: 700, fontSize: '13px', borderBottom: '2px solid #C4A35A', backgroundColor: 'rgba(196,163,90,0.06)', borderRadius: '8px 8px 0 0' }}>REALPROOF</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['誰が書ける？', '誰でも', '対面クライアントだけ'],
                    ['回数制限', '何回でも', '1人1回'],
                    ['匿名投稿', 'できる', 'できない'],
                    ['操作・自作', '可能', '不可能'],
                    ['蓄積先', 'プラットフォーム', 'プロ個人に紐づく'],
                    ['退会したら', '消える', '一生消えない'],
                  ].map(([label, review, rp], i) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 16px', color: '#1A1A2E', fontWeight: 500, borderBottom: '1px solid #F0EDE6', fontSize: '13px' }}>{label}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9A9A9A', borderBottom: '1px solid #F0EDE6' }}>{review}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#1A1A2E', fontWeight: 600, borderBottom: '1px solid #F0EDE6', backgroundColor: 'rgba(196,163,90,0.06)' }}>{rp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ S5: 3本柱 ═══ */}
      <section style={{ ...sectionPad, backgroundColor: '#FAFAF7' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center mb-10">
              <div style={{ color: '#C4A35A', fontSize: '12px', letterSpacing: '3px', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginBottom: '12px' }}>WHY REALPROOF</div>
              <h2 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700 }}>プルーフが信頼を資産に変える、3つの理由。</h2>
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
      <section className="benefit-bg" style={{
        ...sectionPad,
        backgroundColor: '#1A1A2E',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
      }}>
        {/* オーバーレイ */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 0,
        }} />
        <div className={inner} style={{ position: 'relative', zIndex: 1 }}>
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
            {/* PC・SP共通: 2×2グリッド */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              marginTop: '32px',
            }} className="benefit-grid">
              {benefits.map((b, i) => <BenefitCardWide key={i} benefit={b} />)}
            </div>

            <style>{`
              .benefit-bg {
                background-image: url(/images/therapy.png);
              }
              @media (max-width: 640px) {
                .benefit-bg {
                  background-image: url(/images/therapy_sp.png);
                  background-position: center top;
                }
                .benefit-grid {
                  grid-template-columns: 1fr !important;
                  gap: 12px !important;
                }
              }
            `}</style>
          </Reveal>
        </div>
      </section>

      {/* ═══ S6.5: 集め続けると、こうなる。 ═══ */}
      <section style={{
        background: '#FAFAF7',
        padding: '96px 24px',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>

          {/* ── ヘッダー ── */}
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '72px' }}>
              <div style={{
                width: '48px',
                height: '2px',
                background: '#C4A35A',
                margin: '0 auto 24px',
              }} />
              <h2 style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: 'clamp(26px, 5vw, 38px)',
                fontWeight: 700,
                color: '#1A1A2E',
                letterSpacing: '-0.02em',
                lineHeight: 1.3,
                marginBottom: '16px',
              }}>
                集め続けると、こうなる。
              </h2>
              <p style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: '15px',
                color: '#6B6B7B',
                letterSpacing: '0.02em',
                lineHeight: 1.8,
              }}>
                プルーフが積み上がるほど、あなたの証明は本物になる。
              </p>
            </div>
          </Reveal>

          {/* ── グラフ（S4から移動） ── */}
          <div ref={chartRef} style={{ marginBottom: '80px' }}>
            <Reveal>
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h2 style={{
                  color: '#1A1A2E',
                  fontSize: 'clamp(20px, 4vw, 26px)',
                  fontWeight: 700,
                  lineHeight: 1.5,
                  marginBottom: '12px',
                }}>
                  あなたの強みに人が集まる。<br />
                  磨いた強みがキャリアになる。
                </h2>
                <p style={{ color: '#6B6B7B', fontSize: '14px' }}>
                  クライアントはあなたの何を評価しているのか、数字で見える。
                </p>
              </div>
            </Reveal>

            {/* グラフ（ダークカード内に入れてコントラストを維持） */}
            <div style={{
              backgroundColor: '#1A1A2E',
              borderRadius: '16px',
              padding: '40px 32px',
              marginBottom: '32px',
              boxShadow: '0 8px 32px rgba(26,26,46,0.10)',
            }}>
              <BarChart animated={chartVisible} />
            </div>

            {/* 凡例 */}
            <Reveal delay={0.3}>
              <div className="md:flex md:gap-12 md:justify-center text-center md:text-left">
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#1A1A2E', fontSize: '15px', fontWeight: 700 }}>技術的強み</div>
                  <div style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>Result Proofs</div>
                  <div style={{ color: '#6B6B7B', fontSize: '14px' }}>クライアントが実感した具体的な成果</div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#1A1A2E', fontSize: '15px', fontWeight: 700 }}>人間的強み</div>
                  <div style={{ color: '#C4A35A', fontSize: '12px', fontFamily: "'Inter', sans-serif", marginBottom: '4px' }}>Humanity Proofs</div>
                  <div style={{ color: '#6B6B7B', fontSize: '14px' }}>信頼、共感、安心感</div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.4}>
              <p style={{
                textAlign: 'center',
                color: '#1A1A2E',
                fontSize: '15px',
                fontWeight: 700,
                marginTop: '8px',
                paddingTop: '24px',
                borderTop: '1px solid rgba(26,26,46,0.08)',
              }}>
                REALPROOFには★の数も批判も存在しない。<br />
                あるのは「あなたの強みへの記録」だけ。
              </p>
            </Reveal>
          </div>

          {/* ── 3枚カード ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '32px',
            alignItems: 'end',
          }}
          className="grid-cards-proof"
          >

            {/* ── カード1: Lv.1 PROVEN ── */}
            <Reveal delay={0}>
              <div style={{
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                gap: '24px',
              }}>
                <div style={{
                  width: '100%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 32px rgba(26,26,46,0.10)',
                  transform: 'rotate(-1.5deg)',
                  transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'rotate(0deg) scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(196,163,90,0.20)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'rotate(-1.5deg)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(26,26,46,0.10)';
                }}
                >
                  <img
                    src="/card-level-1.png"
                    alt="REALPROOF PROVEN NFCカードとアプリ画面"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#C4A35A',
                      letterSpacing: '2px',
                      textTransform: 'uppercase' as const,
                    }}>15 Proofs</span>
                    <span style={{
                      width: '1px',
                      height: '12px',
                      background: '#C4A35A',
                      opacity: 0.4,
                    }} />
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#C4A35A',
                      letterSpacing: '2.5px',
                      textTransform: 'uppercase' as const,
                    }}>Lv.1</span>
                  </div>
                  <p style={{
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#1A1A2E',
                    marginBottom: '8px',
                    letterSpacing: '-0.01em',
                  }}>
                    PROVEN
                  </p>
                  <p style={{
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: '13px',
                    color: '#6B6B7B',
                    lineHeight: 1.7,
                  }}>
                    バーがゴールドに光る。<br />
                    証明済み。
                  </p>
                </div>
              </div>
            </Reveal>

            {/* ── カード2: Lv.2 SPECIALIST ── */}
            <Reveal delay={0.15}>
              <div style={{
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                gap: '24px',
              }}>
                <div style={{
                  width: '100%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 16px 48px rgba(196,163,90,0.18)',
                  transform: 'rotate(0deg) scale(1.04)',
                  transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'rotate(0deg) scale(1.08)';
                  e.currentTarget.style.boxShadow = '0 24px 64px rgba(196,163,90,0.30)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'rotate(0deg) scale(1.04)';
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(196,163,90,0.18)';
                }}
                >
                  <img
                    src="/card-level-2.png"
                    alt="REALPROOF SPECIALIST 認定証と黒カード"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#C4A35A',
                      letterSpacing: '2px',
                      textTransform: 'uppercase' as const,
                    }}>30 Proofs</span>
                    <span style={{
                      width: '1px',
                      height: '12px',
                      background: '#C4A35A',
                      opacity: 0.4,
                    }} />
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#C4A35A',
                      letterSpacing: '2.5px',
                      textTransform: 'uppercase' as const,
                    }}>Lv.2</span>
                  </div>
                  <p style={{
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#1A1A2E',
                    marginBottom: '8px',
                    letterSpacing: '-0.01em',
                  }}>
                    SPECIALIST
                  </p>
                  <p style={{
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: '13px',
                    color: '#6B6B7B',
                    lineHeight: 1.7,
                  }}>
                    認定証と、あなたの名前が<br />
                    刻まれた黒カードが届く。
                  </p>
                </div>
              </div>
            </Reveal>

            {/* ── カード3: Lv.3 MASTER ── */}
            <Reveal delay={0.3}>
              <div style={{
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                gap: '24px',
              }}>
                <div style={{
                  width: '100%',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: '0 20px 64px rgba(26,26,46,0.18)',
                  transform: 'rotate(1.5deg)',
                  transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'rotate(0deg) scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 24px 72px rgba(26,26,46,0.28)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'rotate(1.5deg)';
                  e.currentTarget.style.boxShadow = '0 20px 64px rgba(26,26,46,0.18)';
                }}
                >
                  <img
                    src="/card-level-3.png"
                    alt="REALPROOF MASTER ブラックメタルカード ゴールド刻印"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#C4A35A',
                      letterSpacing: '2px',
                      textTransform: 'uppercase' as const,
                    }}>50 Proofs</span>
                    <span style={{
                      width: '1px',
                      height: '12px',
                      background: '#C4A35A',
                      opacity: 0.4,
                    }} />
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#C4A35A',
                      letterSpacing: '2.5px',
                      textTransform: 'uppercase' as const,
                    }}>Lv.3</span>
                  </div>
                  <p style={{
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#1A1A2E',
                    marginBottom: '8px',
                    letterSpacing: '-0.01em',
                  }}>
                    MASTER
                  </p>
                  <p style={{
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: '13px',
                    color: '#6B6B7B',
                    lineHeight: 1.7,
                  }}>
                    ブラックメタルカード。<br />
                    あなたの強みは、もう誰にも疑えない。
                  </p>
                </div>
              </div>
            </Reveal>

          </div>

          {/* ── モバイル用スタイル ── */}
          <style>{`
            @media (max-width: 640px) {
              .grid-cards-proof {
                grid-template-columns: 1fr !important;
                gap: 48px !important;
                align-items: center !important;
              }
            }
            @media (min-width: 641px) and (max-width: 900px) {
              .grid-cards-proof {
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 16px !important;
              }
            }
          `}</style>

          {/* ── ボトムコピー ── */}
          <Reveal delay={0.4}>
            <div style={{
              textAlign: 'center',
              marginTop: '64px',
              paddingTop: '48px',
              borderTop: '1px solid rgba(26,26,46,0.08)',
            }}>
              <p style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: '14px',
                color: '#6B6B7B',
                lineHeight: 1.9,
                letterSpacing: '0.03em',
              }}>
                広告費をかけたプロではない。<br />
                積み上げたプロが、見つかる。
              </p>
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
            <div className="hidden md:flex md:flex-wrap md:justify-center md:gap-6">
              {voices.map((v, i) => <div key={i} style={{ width: 'calc(33.333% - 16px)' }}><VoiceCard voice={v} /></div>)}
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
                「強みを磨く人」が<br />一番輝く世界をつくる。
              </h3>

              <p style={{ color: '#1A1A2E', fontSize: '15px', marginBottom: '20px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                15年間、騎手として、トレーナーとして、治療家として<br />
                技術の現場に立ち続けて気づいたことがある。<br />
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
              <a href="/about" style={{ color: '#C4A35A', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}>
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
            <button onClick={() => { window.location.href = isSignedIn ? '/auth-redirect' : '/sign-in'; }} style={{ backgroundColor: '#C4A35A', color: '#1A1A2E', fontWeight: 700, fontSize: '16px',
              padding: '18px 32px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              width: '100%', fontFamily: "'Noto Sans JP', sans-serif" }}>
              プロとして登録する →
            </button>

            {/* 価格アンカー */}
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              {/* 取り消し線 */}
              <p style={{ fontSize: '14px', color: '#9A9A9A', marginBottom: '4px' }}>
                <span style={{ textDecoration: 'line-through' }}>¥2,980/月</span>
                <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
                <span style={{ textDecoration: 'line-through' }}>NFCカード ¥9,890</span>
              </p>

              {/* 区切り線 */}
              <div style={{ width: '40px', margin: '12px auto', borderTop: '1px solid rgba(255,255,255,0.12)' }} />

              {/* 完全無料（ゴールド強調） */}
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#C4A35A', marginBottom: '6px' }}>
                MVP期間中：完全無料
              </p>

              {/* CC不要 */}
              <p style={{ fontSize: '12px', color: '#9A9A9A' }}>
                クレジットカード不要
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ S10: FOUNDING MEMBER ═══ */}
      <section style={{ backgroundColor: '#1A1A2E', padding: '80px 24px' }}>
        <div className={inner}>
          <Reveal>
            <div className="text-center">
              <div style={{ color: '#C4A35A', fontSize: '12px', letterSpacing: '3px', fontFamily: "'Inter', sans-serif", fontWeight: 500, marginBottom: '12px' }}>FOUNDING MEMBER</div>
              <h2 style={{ color: '#FAFAF7', fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>
                最初の仲間だけの特権。<br />35,000人のネットワークに参加。<br />ただし、条件がある。
              </h2>
              <p style={{ color: '#FAFAF7', fontSize: '15px', marginBottom: '28px' }}>
                クライアントから5票以上を集めた人だけが、<br className="hidden md:inline" />
                Founding Memberになれる。
              </p>
            </div>

            <div className="max-w-sm mx-auto mb-8">
              {['35,000人のメルマガでREALPROOFの思想とFoundingメンバーを拡散', '新しい時代の始まりを肌で体感', '一緒にREALPROOFの文化を作る', 'プラットフォーム改善に直接関われる', '永久にFounding Memberバッジが表示される'].map((item, i) => (
                <div key={i} className="flex items-start gap-3 mb-3">
                  <span style={{ color: '#C4A35A', fontSize: '14px', marginTop: '2px', flexShrink: 0 }}>✦</span>
                  <span style={{ color: '#FAFAF7', fontSize: '15px' }}>{item}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <button onClick={() => { window.location.href = isSignedIn ? '/auth-redirect' : '/sign-in'; }} style={{ backgroundColor: 'transparent', color: '#C4A35A', fontWeight: 700, fontSize: '16px',
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

      {/* ═══ FOR STORES LINK ═══ */}
      <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#1A1A2E' }}>
        <a
          href="/for-stores"
          style={{ fontSize: '13px', color: '#9A9A9A', textDecoration: 'none', letterSpacing: '0.05em' }}
        >
          店舗・団体のオーナーの方はこちら →
        </a>
      </div>

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
  { num: '02', title: 'Record', desc: 'クライアントが\n「何が良かったか」を選ぶ', sub: '', icon: 'check', mockup: '/images/record.png' },
  { num: '03', title: 'Save', desc: 'あなたの信頼として\n蓄積される', sub: '', icon: 'chart', mockup: '/images/save.png' },
];

const pillars = [
  {
    title: '強みに、投票する。',
    desc: '★じゃない。「この人の何が良いか」を言葉と数字で記録する。',
    iconKey: 'multidim',
  },
  {
    title: 'あなた個人に、紐づく。',
    desc: '店舗じゃなく、あなたに積み上がる。どこに移っても、ゼロに戻らない。',
    iconKey: 'permanent',
  },
  {
    title: '会った人しか、押せない。',
    desc: 'NFC/QRで本人認証。対面限定。買えない、頼めない、作れない記録。',
    iconKey: 'tamperproof',
  },
];

const benefits = [
  {
    icon: 'connect',
    title: '技術を届けたい人が、あなたを見つける。',
    desc: '広告も、営業も、いらない。信頼の記録が、代わりに語りかける。',
  },
  {
    icon: 'loop',
    title: '「ありがとう」が、消えなくなる',
    desc: '感謝はいつも、その場で終わっていた。初めて、積み上がるようになる。',
  },
  {
    icon: 'share',
    title: '初対面の3秒で、信頼が伝わる',
    desc: '自己紹介より先に、クライアントの声が語りかける。',
  },
  {
    icon: 'eye',
    title: '技術に、値段がつけられる',
    desc: '積み上げてきたものが、初めて「見える価値」になる。',
  },
];

const voices = [
  { role: '整体師', text: '「ゴッドハンドに憧れたはずが、気づけばSNSとチラシ作りに追われている。こんなハズじゃなかった。」' },
  { role: 'ピラティスインストラクター', text: '「生徒さんは来てくれる。でも自分の何が求められているのか、正直わからない。」' },
  { role: 'パーソナルトレーナー', text: '「結果を出しても、ポジションは変わらない。実績が残らないから、技術を磨く気力も薄れていく。」' },
  { role: 'ボディワーカー', text: '「本質的な身体改善を学び続けている。クライアントには伝わるけど、世間の認知度はゼロ。SNSではキャッチーなものしか届かない。」' },
  { role: 'エステオーナー', text: '「新しい技術を導入しても、結局ホットペッパーの広告費と立地で判断される。技術の価値が届いていない。」' },
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

function BenefitCardWide({ benefit }: { benefit: typeof benefits[number] }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '20px',
      backgroundColor: '#222240',
      borderRadius: '16px',
      padding: '24px',
    }}>
      {/* アイコン（左） */}
      <div style={{ flexShrink: 0, marginTop: '2px' }}>
        {BenefitIcons[benefit.icon]}
      </div>
      {/* テキスト（右） */}
      <div>
        <h3 style={{
          color: '#C4A35A',
          fontSize: '16px',
          fontWeight: 700,
          marginBottom: '8px',
          lineHeight: 1.4,
        }}>{benefit.title}</h3>
        <p style={{
          color: '#FAFAF7',
          fontSize: '14px',
          lineHeight: 1.8,
          opacity: 0.85,
        }}>{benefit.desc}</p>
      </div>
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

'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Home() {
  const revealRefs = useRef<HTMLElement[]>([])
  const [fmRemaining, setFmRemaining] = useState<number | null>(null)
  const [fmTotalCap, setFmTotalCap] = useState<number>(50)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    document.querySelectorAll('.scroll-fade').forEach((el) => {
      observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    async function loadFmCount() {
      const supabase = createClient()
      const { data: config } = await (supabase as any)
        .from('founding_member_config')
        .select('total_cap')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const cap = config?.total_cap || 50
      setFmTotalCap(cap)

      const { count } = await supabase
        .from('professionals')
        .select('*', { count: 'exact', head: true })
        .eq('founding_member_status' as any, 'achieved') as any
      const achieved = count || 0
      setFmRemaining(Math.max(0, cap - achieved))
    }
    loadFmCount()
  }, [])

  return (
    <div style={{ margin: '-2rem -1rem 0', fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>
      <style>{`
        /* ═══ Fade-up animation (HERO stagger) ═══ */
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fade-up {
          animation: fadeUp 0.8s ease-out forwards;
          opacity: 0;
        }
        .fade-up-1 { animation-delay: 0s; }
        .fade-up-2 { animation-delay: 0.12s; }
        .fade-up-3 { animation-delay: 0.24s; }
        .fade-up-4 { animation-delay: 0.36s; }
        .fade-up-5 { animation-delay: 0.48s; }
        .fade-up-6 { animation-delay: 0.60s; }
        .fade-up-7 { animation-delay: 0.72s; }

        /* ═══ Scroll-fade (IntersectionObserver) ═══ */
        .scroll-fade {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.7s ease-out, transform 0.7s ease-out;
        }
        .scroll-fade.animate-in {
          opacity: 1;
          transform: translateY(0);
        }

        /* ═══ Hover effects ═══ */
        .pillar-card-item {
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pillar-card-item:hover {
          border-color: #C4A35A !important;
          box-shadow: 0 12px 40px rgba(196,163,90,0.12);
          transform: translateY(-4px);
        }
        .btn-gold-hover {
          transition: all 0.3s;
        }
        .btn-gold-hover:hover {
          background: #b5963f !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(196,163,90,0.3);
        }
        .btn-dark-hover {
          transition: all 0.3s;
        }
        .btn-dark-hover:hover {
          background: #2A2A3E !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(26,26,46,0.2);
        }
        .founder-link:hover {
          text-decoration: underline !important;
        }

        /* ═══ Layout grids ═══ */
        .how-it-works-grid {
          display: flex;
          gap: 32px;
          justify-content: center;
          text-align: center;
        }
        .how-it-works-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: rgba(196,163,90,0.4);
          min-width: 28px;
          flex-shrink: 0;
        }
        .pillars-grid {
          display: flex;
          gap: 24px;
          justify-content: center;
        }
        .voices-grid {
          display: flex;
          gap: 24px;
          justify-content: center;
          margin-bottom: 40px;
        }
        .founder-grid {
          display: flex;
          gap: 40px;
          align-items: center;
          text-align: left;
          justify-content: center;
        }
        .founder-photo {
          width: 280px;
          min-width: 280px;
        }
        .founder-text {
          flex: 1;
          min-width: 280px;
        }
        .comparison-table {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 8px;
        }
        .top-section {
          padding: clamp(60px, 10vw, 100px) 20px;
        }

        /* ═══ Mobile responsive ═══ */
        @media (max-width: 768px) {
          .top-section {
            padding: 48px 20px;
          }
          .how-it-works-grid {
            flex-direction: column;
            align-items: center;
            gap: 24px;
          }
          .how-it-works-arrow {
            display: none !important;
          }
          .pillars-grid {
            flex-direction: column;
          }
          .pillar-card-item {
            padding: 24px 20px !important;
          }
          .voices-grid {
            flex-direction: column;
          }
          .founder-grid {
            flex-direction: column;
            text-align: center;
            align-items: center;
          }
          .founder-photo {
            width: 200px;
            min-width: auto;
          }
          .founder-text {
            text-align: center;
            min-width: auto;
          }
          .fm-box {
            padding: 28px 20px !important;
          }
        }
      `}</style>

      {/* ================================ */}
      {/* SECTION 1: HERO                  */}
      {/* ================================ */}
      <section
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '120px 20px 60px',
          background: '#FAFAF7',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* REAL PROOF logo */}
          <div
            className="fade-up fade-up-1"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(24px, 5vw, 36px)',
              fontWeight: 900,
              letterSpacing: 6,
              color: '#1A1A2E',
              marginBottom: 8,
            }}
          >
            REAL PROOF
          </div>

          {/* Tagline */}
          <div
            className="fade-up fade-up-2"
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: '#C4A35A',
              letterSpacing: 4,
              marginBottom: 'clamp(28px, 6vw, 52px)',
            }}
          >
            本物が輝く社会へ。
          </div>

          {/* Main heading */}
          <h1
            className="fade-up fade-up-3"
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 'clamp(22px, 5vw, 32px)',
              fontWeight: 900,
              lineHeight: 1.9,
              color: '#1A1A2E',
              marginBottom: 'clamp(16px, 4vw, 28px)',
            }}
          >
            あなたの強みを一番知っているのは、<br />
            <span style={{ color: '#C4A35A' }}>あなたのクライアントだ。</span>
          </h1>

          {/* Conflict text */}
          <p
            className="fade-up fade-up-4"
            style={{
              fontSize: 'clamp(13px, 2.8vw, 15px)',
              fontWeight: 500,
              lineHeight: 2.0,
              color: '#666666',
              maxWidth: 600,
              margin: '0 auto',
              marginBottom: 'clamp(12px, 3vw, 20px)',
              padding: '0 8px',
            }}
          >
            なのに、選ばれる基準は★の数、フォロワー数、広告費。<br />
            どれも、あなたの本当の強みを映していない。
          </p>

          {/* Solution text */}
          <p
            className="fade-up fade-up-5"
            style={{
              fontSize: 'clamp(13px, 2.8vw, 15px)',
              fontWeight: 500,
              lineHeight: 2.0,
              color: '#444444',
              maxWidth: 600,
              margin: '0 auto',
              marginBottom: 'clamp(24px, 5vw, 40px)',
              padding: '0 8px',
            }}
          >
            REAL PROOFは、実際にあなたのセッションを受けたクライアントだけが<br />
            「何が強いか」を投票で証明するプラットフォーム。
          </p>

          {/* CTA button */}
          <div
            className="fade-up fade-up-6"
            style={{ marginBottom: 40 }}
          >
            <Link
              href="/login?role=pro"
              className="btn-gold-hover"
              style={{
                display: 'inline-block',
                padding: '18px 56px',
                background: '#C4A35A',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 1,
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                maxWidth: 320,
                textAlign: 'center',
              }}
            >
              強みを証明する →
            </Link>
          </div>

          {/* Footer text */}
          <p
            className="fade-up fade-up-7"
            style={{
              fontSize: 'clamp(11px, 2.2vw, 13px)',
              fontWeight: 500,
              lineHeight: 1.9,
              color: '#999999',
              marginTop: 'clamp(20px, 4vw, 32px)',
              padding: '0 8px',
            }}
          >
            集客に困っていなくても。SNSが苦手でも。実績がゼロでも。<br />
            クライアントの声が、あなたの最強の武器になる。
          </p>
        </div>
      </section>

      {/* ================================ */}
      {/* SECTION 2: HOW IT WORKS          */}
      {/* ================================ */}
      <section
        className="scroll-fade top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 5,
              color: '#C4A35A',
              textTransform: 'uppercase' as const,
              marginBottom: 16,
            }}
          >
            How It Works
          </div>
          <h2
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 'clamp(18px, 4vw, 24px)',
              fontWeight: 800,
              color: '#1A1A2E',
              lineHeight: 1.6,
              marginBottom: 48,
            }}
          >
            強みを集める。強みで選ぶ。強みを育てる。
          </h2>

          <div className="how-it-works-grid">
            {/* Step 1 */}
            <div style={{ flex: 1, minWidth: 220, maxWidth: 280 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  border: '1.5px solid #C4A35A',
                  borderRadius: '50%',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  color: '#C4A35A',
                  margin: '0 auto 20px',
                }}
              >
                1
              </div>
              <div style={{ fontSize: 'clamp(16px, 3.5vw, 18px)', fontWeight: 800, color: '#1A1A2E', marginBottom: 6 }}>
                強みを集める
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#C4A35A', letterSpacing: 2, marginBottom: 12 }}>
                — プロが主語
              </div>
              <p style={{ fontSize: 'clamp(13px, 2.8vw, 14px)', fontWeight: 500, lineHeight: 2.0, color: '#555555' }}>
                セッション後、クライアントがQRコードかNFCカードから投票。「結果を出してくれた」「説明がわかりやすかった」「空間が心地よかった」── あなたの強みを、クライアントの本音が教えてくれる。
              </p>
            </div>

            {/* Arrow */}
            <div className="how-it-works-arrow">→</div>

            {/* Step 2 */}
            <div style={{ flex: 1, minWidth: 220, maxWidth: 280 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  border: '1.5px solid #C4A35A',
                  borderRadius: '50%',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  color: '#C4A35A',
                  margin: '0 auto 20px',
                }}
              >
                2
              </div>
              <div style={{ fontSize: 'clamp(16px, 3.5vw, 18px)', fontWeight: 800, color: '#1A1A2E', marginBottom: 6 }}>
                強みで選ぶ
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#C4A35A', letterSpacing: 2, marginBottom: 12 }}>
                — クライアントが主語
              </div>
              <p style={{ fontSize: 'clamp(13px, 2.8vw, 14px)', fontWeight: 500, lineHeight: 2.0, color: '#555555' }}>
                「姿勢改善が得意な人」「メンタルケアに強い人」── クライアントは★ではなく、強みでプロを選ぶ。広告費を払う必要はない。あなたの強みが、集客になる。
              </p>
            </div>

            {/* Arrow */}
            <div className="how-it-works-arrow">→</div>

            {/* Step 3 */}
            <div style={{ flex: 1, minWidth: 220, maxWidth: 280 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  border: '1.5px solid #C4A35A',
                  borderRadius: '50%',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  color: '#C4A35A',
                  margin: '0 auto 20px',
                }}
              >
                3
              </div>
              <div style={{ fontSize: 'clamp(16px, 3.5vw, 18px)', fontWeight: 800, color: '#1A1A2E', marginBottom: 6 }}>
                強みを育てる
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#C4A35A', letterSpacing: 2, marginBottom: 12 }}>
                — プロが主語
              </div>
              <p style={{ fontSize: 'clamp(13px, 2.8vw, 14px)', fontWeight: 500, lineHeight: 2.0, color: '#555555' }}>
                投票は蓄積される。辞めても、独立しても、消えない。続けるほどあなただけの「強みの証明」が育っていく。資格では見えない成長が、クライアントの声で見える。最初の1票から始まる。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================ */}
      {/* SECTION 3: COMPARISON TABLE      */}
      {/* ================================ */}
      <section
        className="scroll-fade top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 'clamp(18px, 4vw, 24px)',
            fontWeight: 800,
            color: '#1A1A2E',
            lineHeight: 1.6,
            marginBottom: 40,
          }}>
            ★で選ぶ時代は終わった。
          </h2>
          <div className="comparison-table">
            <table
              style={{
                width: '100%',
                minWidth: 580,
                maxWidth: 960,
                margin: '0 auto',
                borderCollapse: 'separate' as const,
                borderSpacing: 0,
                borderRadius: 14,
                overflow: 'hidden',
                border: '1px solid #E8E4DC',
                fontSize: 'clamp(12px, 2.5vw, 14px)',
              }}
            >
              <thead>
                <tr>
                  <th style={{ padding: '16px 20px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E8E4DC', fontSize: 13, color: '#1A1A2E', background: '#FAFAF7' }}></th>
                  <th style={{ padding: '16px 20px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E8E4DC', fontSize: 13, color: '#1A1A2E', background: '#FAFAF7' }}>ホットペッパー</th>
                  <th style={{ padding: '16px 20px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #E8E4DC', fontSize: 13, color: '#1A1A2E', background: '#FAFAF7' }}>Google</th>
                  <th style={{ padding: '16px 20px', fontWeight: 800, textAlign: 'center', borderBottom: '2px solid #C4A35A', fontSize: 13, color: '#C4A35A', background: '#FAFAF7' }}>REAL PROOF</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['誰が評価', '匿名の誰か', '匿名の誰か', '認証済みクライアント'],
                  ['紐づき', '店舗のみ', '店舗のみ', '個人＋店舗'],
                  ['評価の軸', '★5（一次元）', '★5（一次元）', '多次元（結果×人柄）'],
                  ['検索順', '広告費順', 'アルゴリズム', '強み順'],
                  ['不正対策', 'なし', 'なし', '対面認証（QR+NFC）'],
                  ['独立時', 'リセット', 'リセット', '持ち運べる'],
                ].map(([label, hp, google, rp], i, arr) => (
                  <tr key={label}>
                    <td style={{ padding: '14px 20px', textAlign: 'left', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #F0EDE6', fontWeight: 600, color: '#666666', fontSize: 'clamp(12px, 2.5vw, 14px)', width: 120 }}>{label}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #F0EDE6', color: '#444444', fontWeight: 500 }}>{hp}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #F0EDE6', color: '#444444', fontWeight: 500 }}>{google}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #F0EDE6', color: '#1A1A2E', fontWeight: 700, background: 'rgba(196,163,90,0.05)' }}>{rp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ================================ */}
      {/* SECTION 4: 3 PILLARS             */}
      {/* ================================ */}
      <section
        className="scroll-fade top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 'clamp(18px, 4vw, 24px)',
            fontWeight: 800,
            color: '#1A1A2E',
            lineHeight: 1.6,
            marginBottom: 48,
          }}>
            REAL PROOFが他と違う、3つの理由。
          </h2>
          <div className="pillars-grid">
            {[
              {
                label: '蓄積',
                heading: '辞めても、消えない。',
                desc: 'あなたの実績は店ではなく個人に紐づく。独立しても、転職しても、あなたの強みの証明は一生あなたのもの。',
              },
              {
                label: '多次元',
                heading: '★じゃ、わからない。',
                desc: '「★4.5」で何がわかる？ REAL PROOFは「痛み改善が得意」「メンタルに強い」── 本当の強みが見える。',
              },
              {
                label: '信頼性',
                heading: '嘘が、つけない。',
                desc: '投票できるのは対面でサービスを受けた人だけ。匿名だから忖度もない。届くのは本音だけ。',
              },
            ].map((pillar) => (
              <div
                key={pillar.label}
                className="pillar-card-item"
                style={{
                  flex: 1,
                  minWidth: 220,
                  textAlign: 'center',
                  padding: '32px 28px',
                  border: '1px solid #E8E4DC',
                  borderRadius: 14,
                  background: '#FFFFFF',
                }}
              >
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 4,
                  color: '#C4A35A',
                  textTransform: 'uppercase' as const,
                  marginBottom: 14,
                }}>
                  {pillar.label}
                </div>
                <div style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontSize: 'clamp(16px, 3.5vw, 19px)',
                  fontWeight: 800,
                  color: '#1A1A2E',
                  lineHeight: 1.6,
                  marginBottom: 12,
                }}>
                  {pillar.heading}
                </div>
                <p style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontSize: 'clamp(13px, 2.8vw, 14px)',
                  fontWeight: 500,
                  lineHeight: 2.0,
                  color: '#555555',
                }}>
                  {pillar.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================ */}
      {/* SECTION 5: VOICES                */}
      {/* ================================ */}
      <section
        className="scroll-fade top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 'clamp(18px, 4vw, 24px)',
            fontWeight: 800,
            color: '#1A1A2E',
            lineHeight: 1.6,
            marginBottom: 40,
          }}>
            この悩み、あなただけじゃない。
          </h2>

          <div className="voices-grid">
            {[
              { role: '整体師', quote: '「技術には自信がある。でも新規のお客さんに、それをどう伝えればいいかわからない。」' },
              { role: 'ヨガインストラクター', quote: '「SNSを頑張っても、本当に届いてほしい人に届かない。」' },
              { role: 'パーソナルトレーナー', quote: '「ホットペッパーの★は広告費で決まる。実力で選ばれたい。」' },
            ].map((v) => (
              <div
                key={v.role}
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: 28,
                  border: '1px solid #E8E4DC',
                  borderRadius: 14,
                  background: '#FFFFFF',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#C4A35A', letterSpacing: 2, marginBottom: 12 }}>
                  {v.role}
                </div>
                <p style={{ fontSize: 'clamp(14px, 3vw, 15px)', fontWeight: 500, lineHeight: 2.0, color: '#444444', fontStyle: 'normal' }}>
                  {v.quote}
                </p>
              </div>
            ))}
          </div>

          <p style={{
            fontSize: 'clamp(13px, 2.8vw, 15px)',
            fontWeight: 600,
            color: '#1A1A2E',
            marginTop: 40,
            textAlign: 'center',
          }}>
            REAL PROOFは、この問題を解決するために生まれました。
          </p>

          <div style={{ marginTop: 48 }}>
            <p style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 18,
              fontWeight: 700,
              color: '#1A1A2E',
              marginBottom: 24,
              textAlign: 'center',
            }}>
              あなたに届く投票は、こんな感じ。
            </p>
            <div
              style={{
                maxWidth: 400,
                margin: '0 auto 24px',
                height: 300,
                background: '#F5F2ED',
                borderRadius: 14,
                border: '1px dashed #D0CCC4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999999',
                fontSize: 13,
              }}
            >
              投票UIモック（後日差し替え）
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#555555', textAlign: 'center' }}>
              1つひとつの投票が、あなたの強みを形にする。
            </p>
          </div>
        </div>
      </section>

      {/* ================================ */}
      {/* SECTION 6: FOUNDER'S NOTE        */}
      {/* ================================ */}
      <section
        className="scroll-fade top-section"
        style={{ background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="founder-grid">
            {/* Photo placeholder */}
            <div
              className="founder-photo"
              style={{
                aspectRatio: '1',
                background: '#F0EDE6',
                border: '1px solid #E8E4DC',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#888888',
                fontSize: 11,
              }}
            >
              [ 創業者写真 ]
            </div>

            {/* Text */}
            <div className="founder-text">
              <div
                style={{
                  fontStyle: 'italic',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#999999',
                  marginBottom: 20,
                }}
              >
                ── Founder&apos;s Note
              </div>
              <h2 style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: 'clamp(18px, 4vw, 22px)',
                fontWeight: 800,
                lineHeight: 1.8,
                color: '#1A1A2E',
                marginBottom: 16,
              }}>
                「マーケティングで選ばれる時代は、<br />もう終わりにしたい。」
              </h2>
              <p style={{ fontSize: 14, fontWeight: 500, lineHeight: 2.0, color: '#555555', marginBottom: 20 }}>
                15年間、技術職の現場に立ち続けてきた創業者が、<br />
                なぜ「強みの証明」にこだわるのか。
              </p>
              <Link
                href="/about"
                className="founder-link"
                style={{
                  fontSize: 14,
                  color: '#C4A35A',
                  textDecoration: 'none',
                  fontWeight: 700,
                  transition: 'opacity 0.3s',
                }}
              >
                ストーリーを読む →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================ */}
      {/* SECTION 7: FOUNDING MEMBER + CTA */}
      {/* ================================ */}
      <section
        className="scroll-fade top-section"
        style={{ background: '#FAFAF7', paddingBottom: 60 }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          {/* Everyone CTA */}
          <div style={{ marginBottom: 48 }}>
            <h2 style={{
              fontSize: 'clamp(14px, 3vw, 16px)',
              fontWeight: 600,
              color: '#1A1A2E',
              marginBottom: 24,
            }}>
              REAL PROOFは、今日から誰でも使えます。
            </h2>
            <Link
              href="/login?role=pro"
              className="btn-dark-hover"
              style={{
                display: 'inline-block',
                padding: '18px 56px',
                background: '#1A1A2E',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 1,
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              プロとして登録する →
            </Link>
          </div>

          {/* Founding Member Box */}
          <div
            className="fm-box"
            style={{
              maxWidth: 680,
              margin: '0 auto',
              padding: 'clamp(28px, 5vw, 48px)',
              background: '#FFFFFF',
              border: '1px solid #C4A35A',
              borderRadius: 16,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 4,
                color: '#C4A35A',
                textTransform: 'uppercase' as const,
                marginBottom: 20,
              }}
            >
              Founding Member
            </div>
            <h3 style={{
              fontSize: 'clamp(16px, 3.5vw, 20px)',
              fontWeight: 800,
              color: '#1A1A2E',
              lineHeight: 1.8,
              marginBottom: 16,
            }}>
              最初の50名だけの特権。ただし、条件がある。
            </h3>
            <p style={{
              fontSize: 'clamp(13px, 2.8vw, 15px)',
              fontWeight: 500,
              lineHeight: 2.0,
              color: '#555555',
              marginBottom: 24,
            }}>
              30日以内に、クライアントから5票以上を集めること。<br />
              使った人だけが、Founding Memberになれる。
            </p>
            <ul
              style={{
                listStyle: 'none',
                marginBottom: 28,
                textAlign: 'left',
                maxWidth: 400,
                margin: '0 auto 28px',
                padding: 0,
              }}
            >
              {[
                '永久の Founding Member バッジ',
                'プラットフォームの進化に直接関与',
                '月1回のフィードバックで、一緒にREAL PROOFを作る',
              ].map((perk) => (
                <li
                  key={perk}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#1A1A2E',
                    lineHeight: 2.2,
                    paddingLeft: 20,
                    position: 'relative',
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, color: '#C4A35A', fontSize: 10 }}>◆</span>
                  {perk}
                </li>
              ))}
            </ul>
            <div>
              <Link
                href="/login?role=pro"
                className="btn-gold-hover"
                style={{
                  display: 'inline-block',
                  padding: '18px 48px',
                  background: '#C4A35A',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: 1,
                  textDecoration: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: 360,
                  textAlign: 'center',
                }}
              >
                Founding Memberに挑戦する →
              </Link>
            </div>
            <span style={{
              display: 'block',
              marginTop: 12,
              fontSize: 13,
              fontWeight: fmRemaining !== null && fmRemaining > 0 && fmRemaining <= 10 ? 700 : 600,
              color: fmRemaining !== null && fmRemaining > 0 && fmRemaining <= 10 ? '#C4A35A' : '#888888',
            }}>
              {fmRemaining === null
                ? '読み込み中...'
                : fmRemaining > 10
                  ? `残り${fmRemaining}名`
                  : fmRemaining > 0
                    ? `残りわずか${fmRemaining}名`
                    : fmTotalCap >= 100
                      ? 'Founding Memberの募集は終了しました'
                      : '満席 — 追加枠を準備中'}
            </span>
          </div>
        </div>
      </section>

      {/* Footer — layout.tsx has the shared footer, but top page shows its own divider */}
    </div>
  )
}

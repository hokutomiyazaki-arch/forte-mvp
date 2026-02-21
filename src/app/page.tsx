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
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.12 }
    )
    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el)
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

  const addRevealRef = (el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el)
    }
  }

  return (
    <div style={{ margin: '-2rem -1rem 0', fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .reveal-section {
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.6s ease;
        }
        .reveal-section.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .pillar-card-item {
          transition: all 0.3s;
        }
        .pillar-card-item:hover {
          border-color: #C4A35A !important;
          box-shadow: 0 4px 20px rgba(196,163,90,0.1);
          transform: translateY(-3px);
        }
        .btn-gold-hover:hover {
          background: #b5963f !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(196,163,90,0.25);
        }
        .btn-dark-hover:hover {
          background: #2a2a4a !important;
          transform: translateY(-1px);
        }
        .btn-outline-hover:hover {
          border-color: #C4A35A !important;
          color: #C4A35A !important;
        }
        /* ── Mobile responsive ── */
        .how-it-works-grid {
          display: flex;
          gap: 24px;
          justify-content: center;
          flex-wrap: wrap;
          text-align: center;
        }
        .how-it-works-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          color: #C4A35A;
          min-width: 32px;
          padding-top: 20px;
        }
        .pillars-grid {
          display: flex;
          gap: 28px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .voices-grid {
          display: flex;
          gap: 20px;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 48px;
        }
        .founder-grid {
          display: flex;
          gap: 48px;
          align-items: flex-start;
          text-align: left;
          flex-wrap: wrap;
          justify-content: center;
        }
        .founder-photo {
          width: 160px;
          min-width: 160px;
        }
        .founder-text {
          flex: 1;
          min-width: 280px;
        }
        .fm-box {
          max-width: 600px;
          margin: 0 auto;
          padding: 48px 40px;
          border: 1px solid rgba(196,163,90,0.25);
          background: #FFFFFF;
          text-align: center;
        }
        .top-section {
          padding: 100px 24px;
        }
        .comparison-table {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 8px;
        }
        @media (max-width: 768px) {
          .top-section {
            padding: 48px 20px;
          }
          .how-it-works-grid {
            flex-direction: column;
            align-items: center;
          }
          .how-it-works-arrow {
            transform: rotate(90deg);
            padding-top: 0;
            min-width: auto;
          }
          .pillars-grid {
            flex-direction: column;
          }
          .pillar-card-item {
            padding: 20px !important;
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
            padding: 24px 20px;
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
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(20px, 5vw, 42px)',
              fontWeight: 800,
              letterSpacing: 4,
              color: '#1A1A2E',
              marginBottom: 8,
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.1s',
            }}
          >
            REAL PROOF
          </div>
          <div
            style={{
              fontSize: 'clamp(12px, 2.5vw, 14px)',
              fontWeight: 600,
              color: '#C4A35A',
              letterSpacing: 3,
              marginBottom: 'clamp(28px, 6vw, 52px)',
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.25s',
            }}
          >
            本物が輝く社会へ。
          </div>

          <h1
            style={{
              fontSize: 'clamp(18px, 4.5vw, 26px)',
              fontWeight: 800,
              lineHeight: 1.8,
              color: '#1A1A2E',
              marginBottom: 'clamp(16px, 4vw, 28px)',
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.4s',
            }}
          >
            あなたの強みを一番知っているのは、<br />
            <span style={{ color: '#C4A35A' }}>あなたのクライアントだ。</span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(13px, 2.8vw, 15px)',
              fontWeight: 500,
              lineHeight: 2,
              color: '#444444',
              maxWidth: 600,
              margin: '0 auto',
              marginBottom: 'clamp(12px, 3vw, 20px)',
              padding: '0 8px',
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.55s',
            }}
          >
            なのに、選ばれる基準は★の数、フォロワー数、広告費。<br />
            どれも、あなたの本当の強みを映していない。
          </p>

          <p
            style={{
              fontSize: 'clamp(13px, 2.8vw, 15px)',
              fontWeight: 500,
              lineHeight: 2,
              color: '#444444',
              maxWidth: 600,
              margin: '0 auto',
              marginBottom: 'clamp(24px, 5vw, 40px)',
              padding: '0 8px',
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.65s',
            }}
          >
            REAL PROOFは、実際にあなたのセッションを受けたクライアントだけが<br />
            「何が強いか」を投票で証明するプラットフォーム。
          </p>

          <div
            style={{
              marginBottom: 40,
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.75s',
            }}
          >
            <Link
              href="/login?role=pro"
              className="btn-gold-hover"
              style={{
                display: 'inline-block',
                padding: '16px 48px',
                background: '#C4A35A',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 1,
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s',
                width: '100%',
                maxWidth: 320,
                textAlign: 'center',
              }}
            >
              強みを証明する →
            </Link>
          </div>

          <p
            style={{
              fontSize: 'clamp(11px, 2.2vw, 13px)',
              fontWeight: 500,
              lineHeight: 1.9,
              color: '#888888',
              marginTop: 'clamp(20px, 4vw, 32px)',
              padding: '0 8px',
              opacity: 0,
              animation: 'fadeUp 0.7s ease forwards 0.85s',
            }}
          >
            集客に困っていなくても。SNSが苦手でも。実績がゼロでも。<br />
            クライアントの声が、あなたの最強の武器になる。
          </p>
        </div>
      </section>

      {/* Divider (gold) */}
      <div style={{ width: 48, height: 1, background: 'rgba(196,163,90,0.25)', margin: '0 auto 100px' }} />

      {/* ================================ */}
      {/* SECTION 2: HOW IT WORKS          */}
      {/* ================================ */}
      <section
        ref={addRevealRef}
        className="reveal-section top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 4,
              color: '#C4A35A',
              textTransform: 'uppercase' as const,
              marginBottom: 16,
            }}
          >
            How It Works
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#1A1A2E',
              lineHeight: 1.6,
              marginBottom: 56,
            }}
          >
            強みを集める。強みで選ぶ。強みを育てる。
          </h2>

          <div className="how-it-works-grid">
            {/* Step 1 */}
            <div style={{ flex: 1, minWidth: 220, maxWidth: 260 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  border: '1.5px solid #C4A35A',
                  borderRadius: '50%',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#C4A35A',
                  marginBottom: 18,
                }}
              >
                1
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>
                強みを集める
              </div>
              <div style={{ fontSize: 11, color: '#C4A35A', letterSpacing: 1, marginBottom: 14, fontWeight: 500 }}>
                — プロが主語
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444' }}>
                セッション後、クライアントがQRコードかNFCカードから投票。「結果を出してくれた」「説明がわかりやすかった」「空間が心地よかった」── あなたの強みを、クライアントの本音が教えてくれる。
              </p>
            </div>

            {/* Arrow */}
            <div className="how-it-works-arrow">→</div>

            {/* Step 2 */}
            <div style={{ flex: 1, minWidth: 220, maxWidth: 260 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  border: '1.5px solid #C4A35A',
                  borderRadius: '50%',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#C4A35A',
                  marginBottom: 18,
                }}
              >
                2
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>
                強みで選ぶ
              </div>
              <div style={{ fontSize: 11, color: '#C4A35A', letterSpacing: 1, marginBottom: 14, fontWeight: 500 }}>
                — クライアントが主語
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444' }}>
                「姿勢改善が得意な人」「メンタルケアに強い人」── クライアントは★ではなく、強みでプロを選ぶ。広告費を払う必要はない。あなたの強みが、集客になる。
              </p>
            </div>

            {/* Arrow */}
            <div className="how-it-works-arrow">→</div>

            {/* Step 3 */}
            <div style={{ flex: 1, minWidth: 220, maxWidth: 260 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  border: '1.5px solid #C4A35A',
                  borderRadius: '50%',
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: '#C4A35A',
                  marginBottom: 18,
                }}
              >
                3
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E', marginBottom: 6 }}>
                強みを育てる
              </div>
              <div style={{ fontSize: 11, color: '#C4A35A', letterSpacing: 1, marginBottom: 14, fontWeight: 500 }}>
                — プロが主語
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444' }}>
                投票は蓄積される。辞めても、独立しても、消えない。続けるほどあなただけの「強みの証明」が育っていく。資格では見えない成長が、クライアントの声で見える。最初の1票から始まる。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ width: 48, height: 1, background: '#E8E4DC', margin: '0 auto 100px' }} />

      {/* ================================ */}
      {/* SECTION 3: COMPARISON TABLE      */}
      {/* ================================ */}
      <section
        ref={addRevealRef}
        className="reveal-section top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.6, marginBottom: 56 }}>
            ★で選ぶ時代は終わった。
          </h2>
          <div className="comparison-table">
            <table
              style={{
                width: '100%',
                minWidth: 600,
                maxWidth: 720,
                margin: '0 auto',
                borderCollapse: 'collapse',
                fontSize: 'clamp(11px, 2.5vw, 14px)',
              }}
            >
              <thead>
                <tr>
                  <th style={{ padding: '16px 10px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #ddd', fontSize: 13, color: '#1A1A2E' }}></th>
                  <th style={{ padding: '16px 10px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #ddd', fontSize: 13, color: '#1A1A2E' }}>ホットペッパー</th>
                  <th style={{ padding: '16px 10px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #ddd', fontSize: 13, color: '#1A1A2E' }}>Google</th>
                  <th style={{ padding: '16px 10px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #C4A35A', fontSize: 13, color: '#C4A35A' }}>REAL PROOF</th>
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
                    <td style={{ padding: '13px 10px', textAlign: 'left', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #eee', fontWeight: 600, color: '#1A1A2E', fontSize: 12 }}>{label}</td>
                    <td style={{ padding: '13px 10px', textAlign: 'center', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #eee', color: '#444444' }}>{hp}</td>
                    <td style={{ padding: '13px 10px', textAlign: 'center', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #eee', color: '#444444' }}>{google}</td>
                    <td style={{ padding: '13px 10px', textAlign: 'center', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #eee', color: '#1A1A2E', fontWeight: 600, background: 'rgba(196,163,90,0.08)' }}>{rp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ width: 48, height: 1, background: '#E8E4DC', margin: '0 auto 100px' }} />

      {/* ================================ */}
      {/* SECTION 4: 3 PILLARS             */}
      {/* ================================ */}
      <section
        ref={addRevealRef}
        className="reveal-section top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.6, marginBottom: 56 }}>
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
                  maxWidth: 260,
                  textAlign: 'center',
                  padding: '36px 24px',
                  border: '1px solid #E8E4DC',
                  background: '#FFFFFF',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: '#C4A35A', marginBottom: 14 }}>
                  {pillar.label}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E', marginBottom: 14 }}>
                  {pillar.heading}
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444' }}>
                  {pillar.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ width: 48, height: 1, background: '#E8E4DC', margin: '0 auto 100px' }} />

      {/* ================================ */}
      {/* SECTION 5: VOICES                */}
      {/* ================================ */}
      <section
        ref={addRevealRef}
        className="reveal-section top-section"
        style={{ textAlign: 'center', background: '#FAFAF7' }}
      >
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.6, marginBottom: 48 }}>
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
                  maxWidth: 260,
                  padding: '28px 22px',
                  border: '1px solid #E8E4DC',
                  background: '#FFFFFF',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 11, color: '#C4A35A', letterSpacing: 1, marginBottom: 12, fontWeight: 500 }}>
                  {v.role}
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444' }}>
                  {v.quote}
                </p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 14, color: '#1A1A2E', fontWeight: 500, marginBottom: 56 }}>
            REAL PROOFは、この問題を解決するために生まれました。
          </p>

          <div style={{ marginTop: 48 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 24 }}>
              あなたに届く投票は、こんな感じ。
            </p>
            <div
              style={{
                maxWidth: 480,
                margin: '0 auto 24px',
                padding: '48px 24px',
                border: '2px dashed #E8E4DC',
                background: '#FFFFFF',
                color: '#888888',
                fontSize: 13,
              }}
            >
              [ 投票UIモック画像 ]
            </div>
            <p style={{ fontSize: 14, color: '#444444' }}>
              1つひとつの投票が、あなたの強みを形にする。
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div style={{ width: 48, height: 1, background: '#E8E4DC', margin: '0 auto 100px' }} />

      {/* ================================ */}
      {/* SECTION 6: FOUNDER'S NOTE        */}
      {/* ================================ */}
      <section
        ref={addRevealRef}
        className="reveal-section top-section"
        style={{ background: '#FAFAF7', borderTop: '1px solid #E8E4DC' }}
      >
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="founder-grid">
            {/* Photo placeholder */}
            <div
              className="founder-photo"
              style={{
                height: 200,
                background: '#FFFFFF',
                border: '1px solid #E8E4DC',
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
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontStyle: 'italic',
                  color: '#888888',
                  marginBottom: 16,
                }}
              >
                ── Founder&apos;s Note
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.7, color: '#1A1A2E', marginBottom: 20 }}>
                「マーケティングで選ばれる時代は、<br />もう終わりにしたい。」
              </h2>
              <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444', marginBottom: 20 }}>
                15年間、技術職の現場に立ち続けてきた創業者が、<br />
                なぜ「強みの証明」にこだわるのか。
              </p>
              <Link
                href="/about"
                style={{
                  fontSize: 13,
                  color: '#C4A35A',
                  textDecoration: 'none',
                  letterSpacing: 0.5,
                  fontWeight: 500,
                  transition: 'opacity 0.3s',
                }}
              >
                ストーリーを読む →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Divider (gold) */}
      <div style={{ width: 48, height: 1, background: 'rgba(196,163,90,0.25)', margin: '0 auto 100px' }} />

      {/* ================================ */}
      {/* SECTION 7: FOUNDING MEMBER + CTA */}
      {/* ================================ */}
      <section
        ref={addRevealRef}
        className="reveal-section top-section"
        style={{ background: '#FAFAF7', paddingBottom: 60 }}
      >
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {/* Everyone CTA */}
          <div style={{ marginBottom: 80, textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', marginBottom: 24 }}>
              REAL PROOFは、今日から誰でも使えます。
            </h2>
            <Link
              href="/login?role=pro"
              className="btn-dark-hover"
              style={{
                display: 'inline-block',
                padding: '16px 48px',
                background: '#1A1A2E',
                color: '#FAFAF7',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 1,
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
            >
              プロとして登録する →
            </Link>
          </div>

          {/* Founding Member Box */}
          <div className="fm-box">
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 4,
                color: '#C4A35A',
                textTransform: 'uppercase' as const,
                marginBottom: 12,
              }}
            >
              Founding Member
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', marginBottom: 20 }}>
              最初の50名だけの特権。ただし、条件がある。
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.9, color: '#444444', marginBottom: 28 }}>
              30日以内に、クライアントから5票以上を集めること。<br />
              使った人だけが、Founding Memberになれる。
            </p>
            <ul
              style={{
                listStyle: 'none',
                marginBottom: 32,
                textAlign: 'left',
                display: 'inline-block',
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
                    fontSize: 13,
                    color: '#444444',
                    lineHeight: 2,
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
                  padding: '16px 48px',
                  background: '#C4A35A',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: 1,
                  textDecoration: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                }}
              >
                Founding Memberに挑戦する →
              </Link>
            </div>
            <span style={{ display: 'block', marginTop: 16, fontSize: 12, color: fmRemaining !== null && fmRemaining > 0 && fmRemaining <= 10 ? '#C4A35A' : '#888888', fontWeight: fmRemaining !== null && fmRemaining > 0 && fmRemaining <= 10 ? 700 : 400 }}>
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

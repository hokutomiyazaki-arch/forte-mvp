/**
 * /trust — 信頼担保構造の解説ページ（静的・SSR）
 *
 * 一般客が「他の口コミサイトと何が違うのか」を理解するための解説ページ。
 * プレスリリース等の着地点としても使うため、DBアクセスなしで完全なHTMLを返す
 * （Server Component・'use client' なし = SSRで本文がHTMLに含まれる）。
 *
 * 掲載コピーは trust-block-instructions.md の確定文言（一字一句変更禁止）。
 * デザインは既存カードページのトーン（Dark #1A1A2E / Gold #C4A35A / Cream #FAFAF7）に準拠。
 */

import type { Metadata } from 'next'
import { COLORS, FONTS } from '@/lib/design-tokens'

const T = { ...COLORS, font: FONTS.main, fontSerif: FONTS.serif }

export const metadata: Metadata = {
  title: 'REALPROOFの仕組み ｜ なぜこの声は信じられるのか',
  description:
    'REALPROOFに並ぶのは★の数ではなく、実際にセッションを受けた本人がその場でしか記録できない「声」の積み重ねです。書き換えられず、お金で順位も変わらない——信頼の記録の仕組みを解説します。',
}

// 4つの担保構造。見出し + 本文（確定文言）。
const SECTIONS: { heading: string; lines: string[] }[] = [
  {
    heading: 'ネット上から誰でも書ける仕組みではありません',
    lines: [
      '声を記録できるのは、実際にセッションを受けた本人だけ。',
      'その場で提示されたQRコードからのみ、記録できます。',
      '会ったことのない誰かが、書き込むことはできません。',
    ],
  },
  {
    heading: '同じ人が連続して記録することはできません',
    lines: [
      '一人が短期間に何度も記録することはできない仕組みです。',
      '数を水増しすることはできません。',
    ],
  },
  {
    heading: 'あとから書き換えることはできません',
    lines: [
      '記録された声は、暗号技術(暗号ハッシュチェーン)によって守られています。',
      '一度記録された声は、本人にも、プロにも、運営にも書き換えられません。',
    ],
  },
  {
    heading: 'お金で順位は変わりません',
    lines: [
      'REALPROOFに広告枠はありません。',
      '表示される順番を、お金で買うことはできません。',
    ],
  },
]

export default function TrustPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: T.font }}>
      {/* ヒーロー（ダーク） */}
      <section
        style={{
          background: T.dark,
          borderRadius: 20,
          padding: '40px 28px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 3,
            color: T.gold,
            marginBottom: 16,
          }}
        >
          REALPROOF
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: '#FAFAF7',
            lineHeight: 1.5,
            margin: 0,
            fontFamily: T.fontSerif,
          }}
        >
          この声は、その場でしか生まれません。
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'rgba(250,250,247,0.75)',
            lineHeight: 1.9,
            marginTop: 20,
            marginBottom: 0,
          }}
        >
          REALPROOFに並ぶのは、★の数ではありません。
          <br />
          実際にセッションを受けた本人が残した「声」の積み重ねです。
        </p>
      </section>

      {/* 4つの担保構造 */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SECTIONS.map((sec) => (
          <section
            key={sec.heading}
            style={{
              background: T.cardBg,
              border: `1px solid ${T.cardBorder}`,
              borderLeft: `3px solid ${T.gold}`,
              borderRadius: 14,
              padding: '20px 22px',
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: T.dark,
                lineHeight: 1.5,
                margin: 0,
                marginBottom: 10,
              }}
            >
              {sec.heading}
            </h2>
            {sec.lines.map((line, i) => (
              <p
                key={i}
                style={{
                  fontSize: 14,
                  color: T.textSub,
                  lineHeight: 1.9,
                  margin: 0,
                }}
              >
                {line}
              </p>
            ))}
          </section>
        ))}
      </div>

      {/* 結び（ダーク） */}
      <section
        style={{
          background: T.dark,
          borderRadius: 20,
          padding: '36px 28px',
          textAlign: 'center',
          marginTop: 24,
        }}
      >
        <p
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: T.gold,
            lineHeight: 1.6,
            margin: 0,
            fontFamily: T.fontSerif,
          }}
        >
          だから、信じられる。
        </p>
        <p
          style={{
            fontSize: 14,
            color: 'rgba(250,250,247,0.75)',
            lineHeight: 1.9,
            marginTop: 18,
            marginBottom: 0,
          }}
        >
          REALPROOFは、口コミサイトではありません。
          <br />
          実際に会った人の声だけが積み重なる、信頼の記録です。
        </p>

        {/* CTA */}
        <a
          href="/search"
          style={{
            display: 'inline-block',
            marginTop: 28,
            padding: '12px 32px',
            borderRadius: 99,
            background: T.gold,
            color: T.dark,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          プロを探す →
        </a>
      </section>
    </div>
  )
}

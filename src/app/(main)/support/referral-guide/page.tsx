import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '紹介のしくみガイド | REAL PROOF',
  description:
    'REAL PROOFの紹介予約(紹介リスト)のしくみ・予約金・お金の流れ・キャンセル・日時変更・自動完了について解説します。',
  // 追加(2026-08-05・CC判断): リフェラルは先行公開中のため検索エンジンに拾わせない。
  // 全体公開(§2-2完了)時にこのrobots指定を外すこと。
  robots: { index: false, follow: false },
}

const GOLD = '#C4A35A'
const DARK = '#1A1A2E'
const GOLD_DARK = '#9A7B3A'
const BORDER = '#E8E2D5'

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 20,
        fontWeight: 700,
        color: DARK,
        lineHeight: 1.6,
        marginTop: 48,
        marginBottom: 16,
      }}
    >
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 15, color: '#444444', lineHeight: 1.9, marginBottom: 18 }}>
      {children}
    </p>
  )
}

const liStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#444444',
  lineHeight: 1.9,
  marginBottom: 10,
}

const noteBoxStyle: React.CSSProperties = {
  fontSize: 14,
  color: GOLD_DARK,
  fontWeight: 600,
  lineHeight: 1.8,
  background: '#FFFFFF',
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: '14px 18px',
  marginBottom: 18,
}

/**
 * 追加(2026-08-05・CEO指示): AI生成イラスト(public/referral-guide/・1200px幅PNG・文字なし)を
 * 各セクションに挿入する。max-width:100%・height:autoでページ幅に収める(横スクロール厳禁)。
 * 既存パターン(badge-guideページの図解画像)と同じ素のimg要素を使う(next/imageは本アプリ未導入)。
 */
function GuideImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 12,
        marginBottom: 20,
      }}
    />
  )
}

export default function ReferralGuidePage() {
  return (
    <div
      style={{
        margin: '-2rem -1rem 0',
        fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        background: '#FAFAF7',
      }}
    >
      <article style={{ maxWidth: 680, margin: '0 auto', padding: '120px 24px 80px' }}>
        {/* Header */}
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 4,
            color: GOLD,
            textTransform: 'uppercase',
            marginBottom: 20,
          }}
        >
          Support
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.6,
            color: DARK,
            marginBottom: 24,
          }}
        >
          紹介のしくみガイド
        </h1>

        <P>
          REAL PROOFの「紹介リスト」から生まれる紹介予約(お客さまの紹介)のしくみ・お金の流れ・
          キャンセル・日時変更・自動完了について、この1ページでまとめてご案内します。
        </P>

        {/* ① 紹介のしくみ */}
        <H2>紹介のしくみ</H2>
        <GuideImage src="/referral-guide/guide-flow.png" alt="紹介の流れ: 送り手が受け手を紹介し、クライアントが予約リクエストを送るイラスト" />
        <ol style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>あなた(送り手)が紹介リストで別の先生(受け手)を紹介する</li>
          <li style={liStyle}>クライアントがリストから受け手を選び、希望日時を入れて相談リクエストを送る</li>
          <li style={liStyle}>受け手が48時間以内に日時を確定する(別日時の提案も可能)</li>
          <li style={liStyle}>確定すると予約金のお支払いご案内がメールで届き、決済が完了すると紹介予約が成立する</li>
        </ol>
        {/* 軽微(2026-08-05): タブ対応の1行案内 */}
        <div style={noteBoxStyle}>
          送り手(紹介した側)はダッシュボードの「紹介」＞「紹介した案件」、受け手(紹介された側)は
          「予約」で、それぞれの進捗を確認できます。
        </div>

        {/* CEO指示(2026-08-08): この仕組みの独自価値の明文化。知り合い同士の紹介に限る
            使い方に読まれないよう、「つながりが無くても記録を根拠に紹介できる」を推奨として書く。 */}
        <H2>知り合いでない先生こそ、紹介できます</H2>
        <P>
          これまで「紹介」は、お互いをよく知っている先生同士でしか成立しませんでした。
          REAL PROOFでは、クライアントの記録(プルーフ)がその先生の実績としてそのまま残っています。
          だから、<strong>直接お会いしたことのない先生でも、記録を根拠に信頼して紹介できます</strong>。
          ここがこの仕組みのいちばんの強みです。
        </P>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>
            専門外のご相談が来たら、「プロを探す」でその分野の先生の記録を見てみてください
          </li>
          <li style={liStyle}>
            記録を見て良いと思った先生をリストに載せれば、それがあなたのクライアントへの答えになります
          </li>
          <li style={liStyle}>
            リストに載せると相手の先生に通知が届きます。紹介されたくない先生は受付をオフにできるので、
            載せる側が気を遣いすぎる必要はありません
          </li>
        </ul>

        {/* ② 予約金とは */}
        <H2>予約金とは</H2>
        <GuideImage src="/referral-guide/guide-fee.png" alt="予約金のイメージ: セッション料金のうち一部をオンライン決済で事前に受け取るイラスト" />
        <P>
          紹介予約が確定すると、クライアントはセッション料金の<strong>30%＋Stripeの決済実費(3.6%)</strong>
          にあたる<strong>予約金(合計33.6%)</strong>を、オンラインでその場でお支払いいただきます。
        </P>
        <div style={noteBoxStyle}>
          クライアントの<strong>総額は変わりません</strong>。当日は、セッション料金から予約金を引いた
          <strong>残額のみ</strong>を直接受領していただく形です。
        </div>
        {/* CEO決定(2026-08-05): 受け手向け画面表記(紹介フィー)への橋渡し1行 */}
        <div style={noteBoxStyle}>
          ※プロ向け画面では、この金額を「紹介フィー」と表記します(紹介元の報酬と決済実費にあてられる分のため)。
        </div>

        {/* ③ 受け手プロのお金の流れ */}
        <H2>受け手プロのお金の流れ</H2>
        <P>
          当日、クライアントから直接受け取るのは<strong>残額(セッション料金の66.4%)</strong>です。
          予約金(33.6%)は事前にオンライン決済で回収済みのため、当日窓口で受け取る必要はありません。
        </P>
        <div style={noteBoxStyle}>
          例: セッション料金 <strong>10,000円</strong> の場合 →
          当日クライアントから受け取る金額は <strong>6,640円</strong>(予約金3,360円は事前決済済み)。
        </div>

        {/* ④ 送り手プロの紹介報酬 */}
        <H2>送り手プロの紹介報酬</H2>
        <GuideImage src="/referral-guide/guide-payout.png" alt="紹介報酬の自動送金イメージ: セッション完了後に報酬がお受け取り口座へ送金されるイラスト" />
        <P>
          紹介した案件のセッションが完了すると、<strong>セッション価格の30%</strong>が紹介報酬として確定し、
          お受け取り口座へ<strong>自動で送金</strong>されます。送金には事前の口座登録(Stripe Express)が必要です。
        </P>
        <P>
          予約金のうち、セッション価格の30%が紹介した先生への報酬になります。残り(価格の3.6%分)は
          決済手数料などの実費にあてられます。
        </P>

        {/* ⑤ キャンセルと返金 */}
        <H2>キャンセルと返金</H2>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>
            <strong>プロ都合のキャンセル</strong>: 予約金は全額返金されます
          </li>
          <li style={liStyle}>
            <strong>クライアント都合のキャンセル</strong>:
            セッション開始の<strong>72時間前まで</strong>は全額返金、それ以降は返金いたしかねます
          </li>
          <li style={liStyle}>
            <strong>予約金の未払い</strong>: 確定から<strong>24時間</strong>お支払いが確認できない場合、
            紹介予約は自動的にキャンセルされます
          </li>
        </ul>

        {/* ⑥ 日時変更のしくみ */}
        <H2>日時変更のしくみ</H2>
        <GuideImage src="/referral-guide/guide-schedule.png" alt="日時変更のイメージ: 確定後に新しい候補日時を選び直すイラスト" />
        <P>
          確定後にどうしても都合がつかなくなった場合、受け手プロから「日時変更のお願い」を送れます。
          クライアントは提示された候補から新しい日時を選ぶか、候補が合わない場合は
          「現在の日時のまま」を希望として伝えることもできます。
        </P>

        {/* ⑦ 自動完了 */}
        <H2>自動完了</H2>
        <P>
          確定した日時から<strong>24時間が経過</strong>すると、紹介セッションは自動的に「完了」として記録され、
          送り手プロの紹介報酬もこの時点で確定します(手動で「完了する」を押しても同じタイミングで確定します)。
        </P>

        {/* Footer */}
        <div
          style={{
            marginTop: 64,
            paddingTop: 32,
            borderTop: `1px solid ${BORDER}`,
            textAlign: 'center',
            fontSize: 13,
            letterSpacing: 2,
            color: GOLD_DARK,
            fontWeight: 600,
          }}
        >
          REAL PROOF — 強みが、あなたを定義する。
        </div>
      </article>
    </div>
  )
}

import type { Metadata } from 'next'
import MarkFeatureSeen from '@/components/MarkFeatureSeen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '予約と相談のしくみガイド | REAL PROOF',
  description:
    'REAL PROOFの予約フォームと相談チャットのしくみ・使うメリット・設定方法を解説します。予約サイトがなくても、カードから今日から予約を受けられます。',
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
 * CEO指示(2026-08-08): 線画イラストを各セクションに付ける。
 * このセッションでは画像生成APIキーが使えないため、referral-guide のAI画像と同じ
 * ビジュアル言語(紺#1A1A2E線画・金#C4A35Aアクセント・白背景・文字なし)のインラインSVGで描く。
 * viewBox比率は既存ガイド画像(1536x1024)に合わせた3:2。
 */
function IllustrationFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        marginBottom: 20,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {children}
    </div>
  )
}

/** カードに「予約する」「相談する」の2ボタンが付いたスマホ */
function HeroArt() {
  return (
    <IllustrationFrame label="カードに予約と相談のボタンが付いたスマートフォンの線画イラスト">
      <svg viewBox="0 0 900 600" width="100%" height="auto" style={{ display: 'block' }}>
        <rect width="900" height="600" fill="#fff" />
        {/* スマホ本体 */}
        <rect x="330" y="70" width="240" height="460" rx="28" fill="#fff" stroke={DARK} strokeWidth="5" />
        <line x1="410" y1="100" x2="490" y2="100" stroke={DARK} strokeWidth="5" strokeLinecap="round" />
        {/* プロフィール */}
        <circle cx="450" cy="185" r="42" fill="#fff" stroke={DARK} strokeWidth="5" />
        <circle cx="450" cy="172" r="14" fill={DARK} />
        <path d="M422 210 q28 -24 56 0" fill={DARK} />
        <line x1="385" y1="255" x2="515" y2="255" stroke={DARK} strokeWidth="5" strokeLinecap="round" />
        <line x1="405" y1="278" x2="495" y2="278" stroke="#B9B2A3" strokeWidth="4" strokeLinecap="round" />
        {/* 2つのボタン */}
        <rect x="370" y="315" width="160" height="52" rx="26" fill={GOLD} />
        <circle cx="400" cy="341" r="10" fill="#fff" />
        <rect x="424" y="336" width="80" height="10" rx="5" fill="#fff" />
        <rect x="370" y="385" width="160" height="52" rx="26" fill="#fff" stroke={GOLD} strokeWidth="4" />
        <circle cx="400" cy="411" r="10" fill={GOLD} />
        <rect x="424" y="406" width="80" height="10" rx="5" fill={GOLD} />
        {/* きらめき */}
        <path d="M250 160 l10 24 24 10 -24 10 -10 24 -10 -24 -24 -10 24 -10 z" fill={GOLD} />
        <path d="M655 380 l8 19 19 8 -19 8 -8 19 -8 -19 -19 -8 19 -8 z" fill={GOLD} />
        <circle cx="240" cy="420" r="8" fill="none" stroke={DARK} strokeWidth="4" />
        <circle cx="670" cy="180" r="8" fill="none" stroke={DARK} strokeWidth="4" />
      </svg>
    </IllustrationFrame>
  )
}

/** カレンダーとチェックマーク(予約確定) */
function BookingArt() {
  return (
    <IllustrationFrame label="希望日時から選んで確定するカレンダーの線画イラスト">
      <svg viewBox="0 0 900 600" width="100%" height="auto" style={{ display: 'block' }}>
        <rect width="900" height="600" fill="#fff" />
        {/* カレンダー */}
        <rect x="230" y="130" width="440" height="360" rx="20" fill="#fff" stroke={DARK} strokeWidth="6" />
        <rect x="230" y="130" width="440" height="80" rx="20" fill={DARK} />
        <rect x="230" y="185" width="440" height="25" fill={DARK} />
        <rect x="310" y="95" width="16" height="70" rx="8" fill={DARK} />
        <rect x="574" y="95" width="16" height="70" rx="8" fill={DARK} />
        {/* 日付マス */}
        {[0, 1, 2].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={270 + col * 95}
              y={245 + row * 80}
              width="70"
              height="56"
              rx="10"
              fill="#fff"
              stroke="#B9B2A3"
              strokeWidth="3"
            />
          ))
        )}
        {/* 選ばれた日 */}
        <rect x="460" y="325" width="70" height="56" rx="10" fill={GOLD} />
        {/* 大きなチェック */}
        <circle cx="640" cy="440" r="72" fill="#fff" stroke={GOLD} strokeWidth="8" />
        <path d="M605 442 l25 26 48 -52" fill="none" stroke={GOLD} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IllustrationFrame>
  )
}

/** チャットの吹き出し(相談) */
function ConsultArt() {
  return (
    <IllustrationFrame label="相談チャットのやりとりの線画イラスト">
      <svg viewBox="0 0 900 600" width="100%" height="auto" style={{ display: 'block' }}>
        <rect width="900" height="600" fill="#fff" />
        {/* 相手(クライアント)の吹き出し */}
        <rect x="150" y="120" width="380" height="120" rx="24" fill="#fff" stroke={DARK} strokeWidth="6" />
        <path d="M190 240 l-18 42 52 -30 z" fill="#fff" stroke={DARK} strokeWidth="6" strokeLinejoin="round" />
        <line x1="190" y1="160" x2="470" y2="160" stroke="#B9B2A3" strokeWidth="6" strokeLinecap="round" />
        <line x1="190" y1="190" x2="430" y2="190" stroke="#B9B2A3" strokeWidth="6" strokeLinecap="round" />
        <circle cx="105" cy="150" r="34" fill="#fff" stroke={DARK} strokeWidth="5" />
        <circle cx="105" cy="140" r="11" fill={DARK} />
        <path d="M83 170 q22 -18 44 0" fill={DARK} />
        {/* 自分(プロ)の吹き出し */}
        <rect x="370" y="320" width="380" height="120" rx="24" fill={GOLD} />
        <path d="M710 440 l18 42 -52 -30 z" fill={GOLD} />
        <line x1="410" y1="360" x2="690" y2="360" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        <line x1="410" y1="390" x2="640" y2="390" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        <circle cx="795" cy="350" r="34" fill="#fff" stroke={DARK} strokeWidth="5" />
        <circle cx="795" cy="340" r="11" fill={DARK} />
        <path d="M773 370 q22 -18 44 0" fill={DARK} />
        {/* 封筒(メールで届く) */}
        <rect x="180" y="430" width="120" height="84" rx="12" fill="#fff" stroke={DARK} strokeWidth="6" />
        <path d="M180 442 l60 46 60 -46" fill="none" stroke={DARK} strokeWidth="6" strokeLinejoin="round" />
        <path d="M330 455 h48 m-12 -12 l12 12 -12 12" fill="none" stroke={GOLD} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IllustrationFrame>
  )
}

/** チャットから予約へつながる橋渡し */
function BridgeArt() {
  return (
    <IllustrationFrame label="相談チャットから予約へつながる流れの線画イラスト">
      <svg viewBox="0 0 900 600" width="100%" height="auto" style={{ display: 'block' }}>
        <rect width="900" height="600" fill="#fff" />
        {/* 左: チャット */}
        <rect x="110" y="200" width="240" height="160" rx="24" fill="#fff" stroke={DARK} strokeWidth="6" />
        <path d="M150 360 l-16 38 48 -28 z" fill="#fff" stroke={DARK} strokeWidth="6" strokeLinejoin="round" />
        <line x1="145" y1="245" x2="315" y2="245" stroke="#B9B2A3" strokeWidth="6" strokeLinecap="round" />
        <line x1="145" y1="278" x2="285" y2="278" stroke="#B9B2A3" strokeWidth="6" strokeLinecap="round" />
        {/* 提案ピル */}
        <rect x="145" y="308" width="130" height="34" rx="17" fill={GOLD} />
        {/* 矢印 */}
        <path d="M395 280 h120 m-30 -30 l30 30 -30 30" fill="none" stroke={GOLD} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        {/* 右: 確定カレンダー */}
        <rect x="565" y="170" width="230" height="220" rx="18" fill="#fff" stroke={DARK} strokeWidth="6" />
        <rect x="565" y="170" width="230" height="52" rx="18" fill={DARK} />
        <rect x="565" y="205" width="230" height="17" fill={DARK} />
        <rect x="608" y="148" width="13" height="44" rx="6" fill={DARK} />
        <rect x="739" y="148" width="13" height="44" rx="6" fill={DARK} />
        <circle cx="680" cy="310" r="46" fill={GOLD} />
        <path d="M658 312 l16 17 30 -33" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        {/* きらめき */}
        <path d="M470 150 l9 21 21 9 -21 9 -9 21 -9 -21 -21 -9 21 -9 z" fill={GOLD} />
        <circle cx="440" cy="430" r="8" fill="none" stroke={DARK} strokeWidth="4" />
      </svg>
    </IllustrationFrame>
  )
}

/**
 * 予約と相談のしくみガイド（CEO指示 2026-08-08）
 *
 * 対象: プロ。告知メール/LINEの着地先として使う(告知はリンク+短い解説、詳細はこのページ)。
 * トーンは告知メールと同じ「使うメリットを先に」。操作手順は後。
 * ⚠️ §17-24の線引き: 未公開機能(予約金・紹介リスト・紹介報酬)の用語は書かない。
 * 全体公開後に紹介まわりを足した改訂版を出す。
 */
export default function BookingConsultationGuidePage() {
  return (
    <div style={{ background: '#FDFCF9', minHeight: '100vh' }}>
      {/* New マーク消し込み(CEO恒久ルール 2026-08-08): このページを一度開いたらメニューの New を消す */}
      <MarkFeatureSeen id="booking-consultation-guide" />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: GOLD_DARK, letterSpacing: 1, marginBottom: 8 }}>
          REAL PROOF サポート
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: DARK, lineHeight: 1.5, marginBottom: 20 }}>
          予約と相談のしくみガイド
        </h1>
        <P>
          あなたのカードに「<strong>予約する</strong>」と「<strong>相談する</strong>」が付きました。
          予約サイトをお持ちでなくても、<strong>今日からカードで予約を受けられます</strong>。
          このページでは、2つのしくみで何ができるか・どう得かをまとめています。
        </P>

        <HeroArt />

        <H2>予約：予約サイトが無くても、今日から受けられます</H2>
        <P>
          これまでは、予約導線をお持ちの先生しかカードから予約を受けられませんでした。
          REAL PROOFの予約フォームを使えば、<strong>準備ゼロで今日から</strong>受けられます。
        </P>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>
            お客さまは希望日時を選んで送るだけ。<strong>会員登録は不要</strong>なので、途中で離脱されにくい形です
          </li>
          <li style={liStyle}>
            届いた予約はダッシュボードの「予約」タブへ。希望日時から1つ選ぶと確定し、お客さまへ自動でお知らせが届きます
          </li>
          <li style={liStyle}>
            <strong>メニューからも直接予約できます。</strong>料金が見えた状態で進むので、あとから聞き直す手間がありません
          </li>
          <li style={liStyle}>
            ご自分の予約サイトをお持ちの先生は、<strong>どちらを使うか選べます</strong>（今の運用は変わりません）
          </li>
        </ul>

        <BookingArt />

        <H2>日時のやりとりも、フォームの中で完結します</H2>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>希望日時が合わないときは、<strong>別の日時を提案</strong>できます。お客さまはボタン1つで選べます</li>
          <li style={liStyle}>確定後の<strong>日時変更のお願い</strong>も送れます。電話やDMの往復はいりません</li>
          <li style={liStyle}>お客さまへの確認・リマインドのご連絡は、REAL PROOFが自動でお送りします</li>
        </ul>

        <H2>メールが届かないお客さまも、取りこぼしません</H2>
        <P>
          予約でいちばん怖いのは「お知らせが届いていなかった」です。REAL PROOFは、
          お客さまのメールアドレスが間違っていた場合に<strong>その場で気づける</strong>ようにしています。
        </P>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>届かない予約にはカードに<strong>赤い印と電話番号</strong>が出ます。電話で日時を決めて、そのままプロ側から確定できます</li>
          <li style={liStyle}>電話で確認した正しいアドレスに直して、ご案内を<strong>送り直す</strong>こともできます</li>
        </ul>

        <H2>相談：予約の一歩手前のお客さまを、取りこぼさない</H2>
        <P>
          「気になるけれど、いきなり予約するのは…」というお客さまは、これまでそのまま離れていました。
          相談チャットは、その方たちの受け皿です。実際に多いのは
          「自分の症状でも大丈夫ですか」「どのメニューが合いますか」という質問です。
        </P>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>届いた相談は「相談」タブへ。<strong>返信を書くとお客さまにメールで届きます</strong></li>
          <li style={liStyle}>お客さまはアカウント登録なしで、メールのリンクから続けて返信できます</li>
          <li style={liStyle}>相談には<strong>未対応・対応中・対応済み</strong>のラベルが付き、未対応から順に上に並びます。返し忘れがひと目で分かります</li>
        </ul>

        <ConsultArt />

        <H2>相談から予約へ、そのままつながります</H2>
        <P>
          話がまとまったら、チャットから<strong>メニューを提案</strong>できます。
          お客さまは<strong>ボタン1つで予約フォームへ</strong>進めます。ここがいちばん効くところです。
          料金も一緒に伝わるので、金額の説明をやり直す必要がありません。
        </P>

        <BridgeArt />

        <H2>受けたくない時期は、別々にオフにできます</H2>
        <P>
          予約と相談は<strong>別々のスイッチ</strong>です。「予約は受けたいが、相談は今は受けない」という
          設定もできます。スイッチは「予約」タブの上部にあります。
        </P>

        <div style={noteBoxStyle}>
          やりとりの中身を、REAL PROOFが日常的に閲覧することはありません。
          通報があった場合のみ、対応のために確認します。
        </div>

        <H2>使いはじめるには</H2>
        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>予約・相談の受付スイッチ: ダッシュボード「予約」タブ・「相談」タブの上部</li>
          <li style={liStyle}>メニューと料金の登録: 「サービス設定」から（メニューがあると料金つきで予約が入ります）</li>
        </ul>

        <a
          href="/dashboard?tab=bookings"
          style={{
            display: 'block',
            textAlign: 'center',
            background: GOLD,
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 12,
            padding: '14px 20px',
            textDecoration: 'none',
            marginTop: 28,
          }}
        >
          予約タブを開いて設定する
        </a>
      </div>
    </div>
  )
}

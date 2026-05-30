import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '認定バッジの使い方 | REAL PROOF',
  description:
    'REAL PROOFの認定バッジを、ホームページ・ブログ・SNS・メルマガに掲載する方法を解説します。',
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

export default function BadgeGuidePage() {
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
          認定バッジの使い方
        </h1>

        <P>
          REAL PROOFで一定数の「証明」が集まると、あなたの強みを示す
          <strong>認定バッジ</strong>
          が発行されます。ホームページ・ブログ・SNS・メルマガなど、どこにでも掲載でき、お客さまにあなたの実績を一目で伝えられます。
        </P>

        <div
          style={{
            fontSize: 14,
            color: GOLD_DARK,
            fontWeight: 600,
            lineHeight: 1.8,
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 8,
          }}
        >
          ※バッジの配布は <strong>SPECIALIST（30人の証明）以上</strong>{' '}
          のプルーフでご利用いただけます。
        </div>

        {/* バッジは3種類 */}
        <H2>バッジは3種類。用途で使い分け</H2>

        <div
          style={{
            overflowX: 'auto',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            background: '#FFFFFF',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#FAFAF7' }}>
                <th style={thStyle}>種類</th>
                <th style={thStyle}>こんな時に</th>
                <th style={{ ...thStyle, borderRight: 'none' }}>形式</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>縦長画像（PNG）</td>
                <td style={tdStyle}>Instagram / Facebook のストーリー・投稿</td>
                <td style={{ ...tdStyle, borderRight: 'none' }}>画像</td>
              </tr>
              <tr>
                <td style={tdStyle}>横長画像（PNG）</td>
                <td style={tdStyle}>
                  ブログのアイキャッチ、X（旧Twitter）、リンクのサムネイル
                </td>
                <td style={{ ...tdStyle, borderRight: 'none' }}>画像</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, borderBottom: 'none' }}>HTMLメダル</td>
                <td style={{ ...tdStyle, borderBottom: 'none' }}>
                  ホームページ・ブログへの埋め込み、メルマガ
                </td>
                <td style={{ ...tdStyle, borderRight: 'none', borderBottom: 'none' }}>
                  コード（HTML）
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <P>
          <span style={{ display: 'inline-block', marginTop: 18 }} />
          迷ったら：<strong>SNSは画像、自分のサイトやメルマガはHTMLメダル</strong>{' '}
          と覚えてください。
        </P>

        {/* ① HTMLメダルの貼り方 */}
        <H2>① HTMLメダルの貼り方（サイト・ブログ・メルマガ向け）</H2>

        <P>タップするとあなたの公開ページに飛ぶ、メダル付きバッジを埋め込めます。</P>

        <ol style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>
            ダッシュボードの「獲得バッジ」から、貼りたいプルーフの{' '}
            <strong>「HTMLをコピー」</strong> ボタンを押します。→
            コードが自動でコピーされます。
          </li>
          <li style={liStyle}>
            サイト/ブログ/メルマガの編集画面で、
            <strong>「HTML編集」モード</strong>
            （カスタムHTML・コード編集など）を開きます。
          </li>
          <li style={liStyle}>
            貼り付けて保存。メダル付きバッジが表示され、訪問者がタップするとあなたの公開カードページが開きます。
          </li>
        </ol>

        <blockquote style={quoteStyle}>
          WordPressなら「カスタムHTML」ブロック、メルマガ（Kit等）なら「HTMLを貼り付け」欄に貼ってください。
        </blockquote>

        {/* 画像スロット（北斗提供スクショを後日差し込み） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 180,
            border: `1px dashed ${BORDER}`,
            borderRadius: 12,
            background: '#FFFFFF',
            color: '#9CA3AF',
            fontSize: 13,
            margin: '24px 0',
          }}
        >
          〔ここに貼り付け後の表示例スクリーンショット〕
        </div>

        <div
          style={{
            fontSize: 14,
            color: DARK,
            fontWeight: 600,
            lineHeight: 1.8,
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 8,
          }}
        >
          ✅ <strong>バッジは画像なので、第三者が数字を書き換えることはできません。</strong>{' '}
          証明数は常に最新の状態で表示され、貼り替えも不要です。
        </div>

        {/* ② 画像の保存方法 */}
        <H2>② 画像（PNG）の保存方法</H2>

        <P>
          「縦長画像」「横長画像」ボタンを押すと、画像が
          <strong>新しいタブで開きます</strong>。そこから保存してください。
        </P>

        <ul style={{ paddingLeft: 22, marginBottom: 18 }}>
          <li style={liStyle}>
            <strong>パソコン</strong>：画像を右クリック →「画像を保存」
          </li>
          <li style={liStyle}>
            <strong>iPhone（Safari）</strong>：画像を長押し →「&quot;写真&quot;に追加」
          </li>
          <li style={liStyle}>
            <strong>Android</strong>：画像を長押し →「画像をダウンロード」
          </li>
        </ul>

        <P>
          保存した画像を、SNSの投稿やストーリーにアップロードすれば完了です。
        </P>

        {/* よくある質問 */}
        <H2>よくある質問</H2>

        <P>
          <strong>Q. Instagramのストーリーに載せたい。</strong>
          <br />→
          「縦長画像（PNG）」を保存して、画像として投稿してください。HTMLメダルはサイト・メルマガ用なので、SNSには直接貼れません。
        </P>

        <P>
          <strong>Q. バッジをタップすると何が見えますか？</strong>
          <br />→
          あなたの公開カードページが開き、お客さまからの証明の一覧が表示されます。
        </P>

        <P>
          <strong>Q. 票数は自動で増えますか？</strong>
          <br />→
          はい。HTMLメダルの画像は常に最新の証明数を表示します。貼り替えは不要です。
        </P>

        <P>
          <strong>Q. 複数のプルーフでバッジをもらえますか？</strong>
          <br />→
          はい。SPECIALIST以上になったプルーフごとに発行され、それぞれ配布できます。
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

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 700,
  color: DARK,
  padding: '12px 16px',
  borderBottom: `1px solid ${BORDER}`,
  borderRight: `1px solid ${BORDER}`,
}

const tdStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#444444',
  lineHeight: 1.7,
  padding: '12px 16px',
  borderBottom: `1px solid ${BORDER}`,
  borderRight: `1px solid ${BORDER}`,
  verticalAlign: 'top',
}

const liStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#444444',
  lineHeight: 1.9,
  marginBottom: 10,
}

const quoteStyle: React.CSSProperties = {
  margin: '0 0 18px',
  padding: '12px 18px',
  borderLeft: `3px solid ${GOLD}`,
  background: '#FFFFFF',
  fontSize: 14,
  color: '#555555',
  lineHeight: 1.8,
  borderRadius: '0 8px 8px 0',
}

/**
 * NFCカード購入者向け メールシーケンス(3通)の文面モジュール
 *
 * - ① 購入直後・即時(webhooks/card-order で送信)
 * - ② 購入5日後(日次Cronで送信)
 * - ③ 購入7日後(日次Cronで送信)
 *
 * 各ビルダーは { name }(= card_orders.customer_name)を受け取り
 * { subject, html, text } を返す。name が空なら呼びかけを自然に省略する。
 *
 * 本文テキストは指示書「確定コピー」を一字一句反映(text が正)。
 * html は同一文言を pre-wrap で表示 + 主要URLをクリック可能にした表現。
 * 全メールのフッターに配信停止リンク(mailto)を設置。
 */

export interface CardOrderEmail {
  subject: string
  html: string
  text: string
}

interface CardOrderEmailArgs {
  name?: string | null
}

const SIGN_UP_URL = 'https://realproof.jp/sign-up'
const DASHBOARD_URL = 'https://realproof.jp/dashboard'
const CARD_SETUP_URL = 'https://realproof.jp/dashboard?tab=card'
const UNSUBSCRIBE_MAILTO = 'mailto:info@legrandchariot.com?subject=配信停止'
const UNSUBSCRIBE_TEXT = '配信停止をご希望の場合: info@legrandchariot.com(件名: 配信停止)'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 本文中の http(s) URL をクリック可能なリンクに変換(全角スペース・改行では区切る)
function linkify(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s　]+)/g,
    '<a href="$1" style="color:#C4A35A;word-break:break-all;">$1</a>'
  )
}

// 共通のHTMLシェル(ヘッダ・本文・配信停止フッター)。既存メールと同一トーン。
function renderHtml(params: {
  greeting: string | null
  bodyText: string
  extraButtonHtml?: string
}): string {
  const greetingHtml = params.greeting
    ? `<p style="margin:0 0 16px;">${escapeHtml(params.greeting)}</p>`
    : ''
  const bodyHtml = linkify(escapeHtml(params.bodyText))
  const buttonHtml = params.extraButtonHtml ?? ''

  return `
    <div style="max-width:520px;margin:0 auto;font-family:sans-serif;">
      <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#C4A35A;font-size:16px;margin:0;letter-spacing:0.08em;">REAL PROOF</h1>
      </div>
      <div style="padding:28px 24px;background:#fff;border:1px solid #eee;color:#333;font-size:14px;line-height:1.9;">
        ${greetingHtml}
        <div style="white-space:pre-wrap;">${bodyHtml}</div>
        ${buttonHtml}
      </div>
      <div style="padding:16px 24px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
        <p style="color:#aaa;font-size:11px;margin:0 0 6px;">REAL PROOF — 強みで証明されたプロに出会う</p>
        <p style="color:#bbb;font-size:11px;margin:0;">配信を停止する場合は <a href="${UNSUBSCRIBE_MAILTO}" style="color:#999;">こちら</a></p>
      </div>
    </div>
  `
}

// name が空なら呼びかけ行を省略する(自然に)
function makeGreeting(name?: string | null): string | null {
  const trimmed = (name ?? '').trim()
  return trimmed ? `${trimmed} 様` : null
}

// text 版を組み立て(greeting + body + 配信停止フッター)
function renderText(greeting: string | null, bodyText: string): string {
  const head = greeting ? `${greeting}\n\n` : ''
  return `${head}${bodyText}\n\n──\n${UNSUBSCRIBE_TEXT}`
}

// ============================================================
// ① 購入直後・即時
// ============================================================
export function buildSeq1Email(args: CardOrderEmailArgs): CardOrderEmail {
  const greeting = makeGreeting(args.name)
  const subject = '【REALPROOF】ご注文ありがとうございます'
  const bodyText = `REALPROOF NFCカードのご注文、ありがとうございます。

あなたのカードは、5営業日以内に発送します。
到着まで、もう少しだけお待ちください。

──

このカードが届いたら、あなたのプロとしての信頼が、
1枚ずつ「かたち」になって積み上がっていきます。

セッションのあと、お客様のスマホにかざしてもらうだけ。
その一回ごとに、あなたの証明が記録されていきます。

届いたその日から始められるよう、
使い方はカードに同梱していますので、ご安心ください。

──

※まだREALPROOFのアカウントをお持ちでない方は、
　先に無料登録を済ませておくと、到着後すぐに使い始められます。
　▶ 無料登録はこちら ${SIGN_UP_URL}

REALPROOF Certification Office`

  // 既存サンクスメールにあった有用な導線(NFC設定ボタン)は体験向上のため残す
  const extraButtonHtml = `
    <div style="text-align:center;margin:24px 0;">
      <a href="${CARD_SETUP_URL}" style="display:inline-block;background:#C4A35A;color:#1A1A2E;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:9999px;font-size:14px;">NFCカードを設定する →</a>
    </div>`

  return {
    subject,
    html: renderHtml({ greeting, bodyText, extraButtonHtml }),
    text: renderText(greeting, bodyText),
  }
}

// ============================================================
// ② 購入5日後
// ============================================================
export function buildSeq2Email(args: CardOrderEmailArgs): CardOrderEmail {
  const greeting = makeGreeting(args.name)
  const subject = 'カードは届きましたか?まずは30秒で登録を'
  const bodyText = `REALPROOF NFCカードは、お手元に届きましたでしょうか。

届いたら、最初にひとつだけ。
カードを「あなた専用」にする登録を済ませてください。
かかる時間は、30秒ほどです。

──

【登録のしかた】
① ダッシュボードにログイン
② 「設定」を開く
③ カード裏面の番号を入力

これで完了です。あなたのカードになります。

▶ ダッシュボードを開く ${DASHBOARD_URL}

──

※まだアカウントがない方は、先に無料登録を。
　登録後、同じ手順で番号を入力すれば使い始められます。

うまくいかないときは、このメールにご返信ください。

REALPROOF Certification Office`

  return {
    subject,
    html: renderHtml({ greeting, bodyText }),
    text: renderText(greeting, bodyText),
  }
}

// ============================================================
// ③ 購入7日後
// ============================================================
export function buildSeq3Email(args: CardOrderEmailArgs): CardOrderEmail {
  const greeting = makeGreeting(args.name)
  const subject = '最初のプルーフは、身近な一人から'
  const bodyText = `カードの準備は整いましたか。

「最初の一件、誰にお願いしよう」
そう迷っているなら、まずはいちばん身近なお客様ひとりから。

特別な準備はいりません。
セッションのあと、「よかったら、記録させてもらえますか?」
その一言と、カードをかざしてもらうだけ。

──

最初の一件が記録された瞬間、
あなたの信頼は「積み上がるもの」に変わります。

ある実践者は、この一件目から始めて、
今では200件を超える証明を積み上げています。

まずは、あなたの一件目を。

▶ ダッシュボードを開く ${DASHBOARD_URL}

REALPROOF Certification Office`

  return {
    subject,
    html: renderHtml({ greeting, bodyText }),
    text: renderText(greeting, bodyText),
  }
}

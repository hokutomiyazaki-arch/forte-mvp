/**
 * §17-14(CEO指示 2026-08-06): 相談チャット・紹介チャットで URL をリンクとして送れるようにする。
 *
 * 方針（安全側の線引き）:
 *   - **http / https だけ**をリンクにする。`javascript:` `data:` `file:` は一切拾わない
 *     （拾えばそのままクリック可能なXSS/ローカル参照になる）。正規表現の時点で
 *     スキームを固定しているので、後段で href を組み立て直す余地を作らない。
 *   - 画面側は dangerouslySetInnerHTML を使わず、**文字列と <a> の配列**に分解して返す。
 *     Reactが自動エスケープするため、本文がHTMLとして解釈される経路が存在しない。
 *   - メール側は既存の escapeHtml を**呼び出し側から渡してもらう**（このファイルは
 *     import を持たない = APIルートのチャンクグラフに何も足さない・CLAUDE.md §G）。
 *
 * このファイルは import ゼロ・副作用ゼロの純関数のみ。サーバ/クライアント両方から使う。
 */

/**
 * URL の切り出し。終端は「空白・山括弧・引用符・全角の記号類」まで。
 *
 * 全角の括弧と句読点を最初から除外しているのは、日本語では
 * 「かっこ内（https://example.com）です」のように**URLの直後に閉じ括弧が続く**書き方が普通で、
 * 後段の末尾トリムだけでは（後ろに文が続くため）落とせず、URLが文ごと飲み込まれるため。
 * 全角記号がURLに含まれる実用ケースは無いので、ここで切って問題ない。
 */
const URL_RE = /https?:\/\/[^\s<>"'`　、。，．！？…（）［］｛｝「」『』【】〈〉《》〔〕]+/gi

/**
 * 文末の句読点・閉じ括弧はURLに含めない。
 * 「詳しくはこちら https://example.com/a。」の「。」までリンクにすると、リンクが壊れる。
 */
const TRAILING_PUNCTUATION = new Set(
  Array.from('.,;:!?)]}>"\'`。、，．！？…）］｝」』】〉》〕'),
)

function trimTrailingPunctuation(url: string): string {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]
    if (!TRAILING_PUNCTUATION.has(ch)) break
    if (ch === ')') {
      // Wikipedia 等、URL自体が括弧を含むケース。対応が取れているなら削らない。
      const slice = url.slice(0, end)
      const opens = (slice.match(/\(/g) || []).length
      const closes = (slice.match(/\)/g) || []).length
      if (opens >= closes) break
    }
    end -= 1
  }
  return url.slice(0, end)
}

export interface LinkedTextPart {
  type: 'text' | 'link'
  value: string
}

/**
 * 本文を「ただの文字列」と「リンク」に分解する。表示側はこれをそのまま並べるだけでよい。
 * リンクが1つも無ければ [{type:'text', value: text}] を返す（呼び出し側で分岐しなくてよい）。
 */
export function splitLinkedText(text: string): LinkedTextPart[] {
  if (!text) return [{ type: 'text', value: '' }]

  const parts: LinkedTextPart[] = []
  let lastIndex = 0
  // exec を回すので lastIndex を持つ正規表現を毎回作り直す（グローバル正規表現の状態共有バグ回避）
  const re = new RegExp(URL_RE.source, 'gi')
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const raw = match[0]
    const url = trimTrailingPunctuation(raw)
    if (!url) continue

    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'link', value: url })
    lastIndex = match.index + url.length
    // 句読点を削った分だけ次の走査位置を戻す（削った文字はテキストとして残す）
    re.lastIndex = lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return parts.length > 0 ? parts : [{ type: 'text', value: text }]
}

/** 本文にリンクが含まれるか（「リンクを送りました」等の表示分岐用）。 */
export function containsLink(text: string): boolean {
  return splitLinkedText(text).some((p) => p.type === 'link')
}

/**
 * メールHTML用。URL部分だけ <a> にして、それ以外は escapeHtml に通す。
 * escapeHtml を引数で受けるのは、このファイルに import を持たせないため
 * （consultation-notify / referral-notify がそれぞれ自前の escapeHtml を持っている）。
 * href に入る文字列も必ずエスケープしてから埋める（" で属性を抜けさせない）。
 */
export function linkifyToHtml(text: string, escapeHtml: (value: string) => string): string {
  return splitLinkedText(text)
    .map((part) => {
      if (part.type === 'text') return escapeHtml(part.value)
      const safe = escapeHtml(part.value)
      return `<a href="${safe}" style="color:#C4A35A;text-decoration:underline;word-break:break-all;">${safe}</a>`
    })
    .join('')
}

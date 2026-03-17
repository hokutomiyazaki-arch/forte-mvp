/**
 * Weekly Proof Report — メールHTMLテンプレート
 *
 * 3パターン分岐: normal（1票以上）/ starting（0票）/ stalled（止まってる）
 * インラインCSS + テーブルレイアウト（メールクライアント互換）
 */

import { WeeklyProData, WeeklyReportContent } from '@/lib/weekly-report'
import { PROVEN_THRESHOLD, SPECIALIST_THRESHOLD } from '@/lib/constants'

const MASTER_THRESHOLD = 50

// ── ブランドカラー ──
const DARK = '#1A1A2E'
const GOLD = '#C4A35A'
const GOLD_LIGHT = '#D4A843'
const CREAM = '#FAFAF7'
const GRAY = '#8A8A9A'
const GRAY_DARK = '#4A4A5A'
const BAR_BG = '#2A2A3E'
const GREEN = '#22C55E'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

// ============================================================
// メイン分岐
// ============================================================

export function generateEmailHTML(data: WeeklyProData, content: WeeklyReportContent | null): string {
  if (data.praise_pattern === 'starting') {
    return generateStartingEmailHTML(data, content)
  }
  if (data.praise_pattern === 'stalled') {
    return generateStalledEmailHTML(data, content)
  }
  return generateNormalEmailHTML(data, content)
}

// ============================================================
// 共通パーツ
// ============================================================

function emailWrapper(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${DARK};font-family:'Helvetica Neue',Arial,'Noto Sans JP',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DARK};">
<tr><td align="center" style="padding:20px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${DARK};">
${bodyContent}
</table>
</td></tr>
</table>
</body>
</html>`
}

function headerBlock(): string {
  return `<tr><td style="padding:28px 32px 12px;text-align:center;">
  <div style="color:${GOLD};font-size:11px;font-weight:600;letter-spacing:0.15em;">REALPROOF</div>
  <div style="color:${CREAM};font-size:18px;font-weight:700;margin-top:4px;">Weekly Proof Report</div>
  <div style="color:${GRAY};font-size:11px;margin-top:4px;">${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</td></tr>`
}

function ctaBlock(): string {
  return `<tr><td style="padding:28px 32px;text-align:center;">
  <a href="${APP_URL}/dashboard" style="display:inline-block;background:${GOLD};color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
    ダッシュボードを見る
  </a>
</td></tr>`
}

function footerBlock(): string {
  return `<tr><td style="padding:20px 32px 28px;text-align:center;border-top:1px solid ${GRAY_DARK};">
  <div style="color:${GRAY};font-size:11px;">REALPROOF | 強みが、あなたを定義する。</div>
  <div style="color:${GRAY_DARK};font-size:10px;margin-top:4px;">このメールはREALPROOFに登録されたプロフェッショナルの方にお送りしています。</div>
</td></tr>`
}

function sectionHeader(text: string): string {
  return `<div style="color:${GOLD};font-size:11px;font-weight:600;letter-spacing:0.12em;margin-bottom:10px;">${text}</div>`
}

function highlightTipsBlock(content: WeeklyReportContent | null): string {
  if (!content) return ''
  let html = ''
  if (content.highlight_text) {
    html += `<tr><td style="padding:16px 32px 8px;">
    ${sectionHeader("TODAY'S HIGHLIGHT")}
    <div style="color:${CREAM};font-size:13px;line-height:1.7;background:${BAR_BG};border-radius:8px;padding:16px;border-left:3px solid ${GOLD};">
      ${escapeHtml(content.highlight_text)}
    </div>
  </td></tr>`
  }
  if (content.tips_text) {
    html += `<tr><td style="padding:16px 32px 8px;">
    ${sectionHeader('TIPS')}
    <div style="color:${CREAM};font-size:13px;line-height:1.7;background:${BAR_BG};border-radius:8px;padding:16px;">
      ${escapeHtml(content.tips_text)}
    </div>
  </td></tr>`
  }
  return html
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function progressBar(current: number, milestone: number): string {
  const pct = Math.min(Math.round((current / milestone) * 100), 100)
  const isComplete = current >= milestone
  const barColor = isComplete ? GOLD : GOLD_LIGHT
  return `<div style="background:${BAR_BG};border-radius:4px;height:8px;width:100%;overflow:hidden;">
    <div style="background:${barColor};height:8px;width:${pct}%;border-radius:4px;"></div>
  </div>`
}

// ============================================================
// 通常メール（1票以上、starting/stalled 以外）
// ============================================================

function generateNormalEmailHTML(data: WeeklyProData, content: WeeklyReportContent | null): string {
  // 数値カード 2×2
  const metricsBlock = `<tr><td style="padding:16px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="48%" style="background:${BAR_BG};border-radius:8px;padding:14px 16px;text-align:center;">
        <div style="color:${GRAY};font-size:10px;">今週の新規プルーフ</div>
        <div style="color:${data.new_proofs_this_week > 0 ? GREEN : CREAM};font-size:28px;font-weight:700;">+${data.new_proofs_this_week}</div>
      </td>
      <td width="4%"></td>
      <td width="48%" style="background:${BAR_BG};border-radius:8px;padding:14px 16px;text-align:center;">
        <div style="color:${GRAY};font-size:10px;">累計プルーフ</div>
        <div style="color:${CREAM};font-size:28px;font-weight:700;">${data.total_proofs}</div>
      </td>
    </tr>
    <tr><td colspan="3" height="8"></td></tr>
    <tr>
      <td width="48%" style="background:${BAR_BG};border-radius:8px;padding:14px 16px;text-align:center;">
        <div style="color:${GRAY};font-size:10px;">最も選ばれた強み</div>
        <div style="color:${GOLD};font-size:16px;font-weight:700;margin-top:2px;">${escapeHtml(data.top_strength_label)}</div>
      </td>
      <td width="4%"></td>
      <td width="48%" style="background:${BAR_BG};border-radius:8px;padding:14px 16px;text-align:center;">
        <div style="color:${GRAY};font-size:10px;">PROVEN達成</div>
        <div style="color:${data.proven_count > 0 ? GOLD : CREAM};font-size:28px;font-weight:700;">${data.proven_count}<span style="font-size:14px;color:${GRAY};"> / ${data.total_selected_items}項目</span></div>
      </td>
    </tr>
    </table>
  </td></tr>`

  // YOUR HIGHLIGHT（褒めメッセージ）
  const praiseBlock = `<tr><td style="padding:16px 32px;">
    ${sectionHeader('YOUR HIGHLIGHT')}
    <div style="color:${CREAM};font-size:14px;line-height:1.8;background:${BAR_BG};border-radius:8px;padding:18px;border-left:3px solid ${GOLD};">
      ${escapeHtml(data.praise_message)}
    </div>
  </td></tr>`

  // PROVEN PROGRESS
  let progressRows = ''
  data.proof_progress.forEach(item => {
    const milestoneLabel = item.is_proven
      ? (item.current_votes >= SPECIALIST_THRESHOLD
        ? `SPECIALIST達成 ✦ 次の目標: MASTER（${MASTER_THRESHOLD}票）`
        : `PROVEN達成 ✦ 次の目標: SPECIALIST（${SPECIALIST_THRESHOLD}票）`)
      : `あと${item.remaining}票でPROVEN達成`
    progressRows += `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="color:${CREAM};font-size:12px;font-weight:600;">${escapeHtml(item.strength_label)}</span>
          <span style="color:${item.is_proven ? GOLD : GRAY};font-size:12px;">${item.current_votes}票</span>
        </div>
        ${progressBar(item.current_votes, item.next_milestone)}
        <div style="color:${item.is_proven ? GOLD : GRAY};font-size:10px;margin-top:3px;">${milestoneLabel}</div>
      </div>`
  })
  const provenProgressBlock = data.proof_progress.length > 0
    ? `<tr><td style="padding:16px 32px;">
        ${sectionHeader('PROVEN PROGRESS')}
        ${progressRows}
      </td></tr>`
    : ''

  // CATEGORY INSIGHT
  let categoryBlock = ''
  if (data.top_category_stat && data.top_category_stat.pro_votes > 0) {
    const s = data.top_category_stat
    categoryBlock = `<tr><td style="padding:16px 32px;">
      ${sectionHeader('CATEGORY INSIGHT')}
      <div style="color:${CREAM};font-size:13px;line-height:1.7;background:${BAR_BG};border-radius:8px;padding:16px;">
        「${escapeHtml(s.strength_label)}」はREALPROOF全体で<span style="color:${GOLD};font-weight:600;">${s.total_platform_votes}票</span>の記録。<br>
        あなたはそのうち<span style="color:${GOLD};font-weight:600;">${s.pro_votes}票（${s.percent}%）</span>を獲得しています。
      </div>
    </td></tr>`
  }

  // 今週届いた声
  let commentBlock = ''
  if (data.latest_comment) {
    commentBlock = `<tr><td style="padding:16px 32px;">
      ${sectionHeader('今週届いた声')}
      <div style="color:${CREAM};font-size:13px;line-height:1.7;background:${BAR_BG};border-radius:8px;padding:16px;border-left:3px solid ${GRAY_DARK};font-style:italic;">
        「${escapeHtml(data.latest_comment)}」
      </div>
    </td></tr>`
  }

  const body = [
    headerBlock(),
    `<tr><td style="padding:20px 32px 8px;">
      <div style="color:${CREAM};font-size:15px;">${escapeHtml(data.name)}さん、今週のレポートです。</div>
    </td></tr>`,
    metricsBlock,
    praiseBlock,
    provenProgressBlock,
    categoryBlock,
    commentBlock,
    highlightTipsBlock(content),
    ctaBlock(),
    footerBlock(),
  ].join('')

  return emailWrapper(body)
}

// ============================================================
// 0票専用メール（starting）
// ============================================================

function generateStartingEmailHTML(data: WeeklyProData, content: WeeklyReportContent | null): string {
  // ① 挨拶 + 励まし
  const greetBlock = `<tr><td style="padding:20px 32px;">
    <div style="color:${CREAM};font-size:15px;margin-bottom:12px;">${escapeHtml(data.name)}さん、REALPROOFへようこそ。</div>
    <div style="color:${CREAM};font-size:14px;line-height:1.8;background:${BAR_BG};border-radius:8px;padding:18px;border-left:3px solid ${GOLD};">
      ${escapeHtml(data.praise_message)}
    </div>
  </td></tr>`

  // ② セットアップ完了メッセージ
  const setupBlock = `<tr><td style="padding:16px 32px;">
    ${sectionHeader('YOUR CARD IS READY')}
    <div style="color:${CREAM};font-size:13px;line-height:1.9;">
      セットアップは完了しています。<br>
      ダッシュボードを見る必要はありません。<br>
      やることは1つだけ——<br>
      <span style="color:${GOLD};font-weight:600;">セッション後にカードをクライアントにタップしてもらうだけ。</span><br>
      30秒で、あなたの強みが記録されます。
    </div>
  </td></tr>`

  // ③ 集めるメリット3つ
  const benefitsBlock = `<tr><td style="padding:16px 32px;">
    ${sectionHeader('WHY COLLECT PROOFS?')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:${BAR_BG};border-radius:8px;padding:14px 16px;margin-bottom:8px;">
        <div style="font-size:16px;margin-bottom:4px;">&#128202;</div>
        <div style="color:${CREAM};font-size:13px;font-weight:600;margin-bottom:4px;">自分の「本当の強み」がデータで見える</div>
        <div style="color:${GRAY};font-size:12px;line-height:1.6;">クライアントが選んだ強みがチャートで可視化。自分では気づかなかった強みが見つかることも。</div>
      </td></tr>
      <tr><td height="8"></td></tr>
      <tr><td style="background:${BAR_BG};border-radius:8px;padding:14px 16px;">
        <div style="font-size:16px;margin-bottom:4px;">&#127942;</div>
        <div style="color:${CREAM};font-size:13px;font-weight:600;margin-bottom:4px;">15票でPROVEN認定</div>
        <div style="color:${GRAY};font-size:12px;line-height:1.6;">プロフィールのバーがゴールドに輝きます。30票でSPECIALIST、50票でMASTER。</div>
      </td></tr>
      <tr><td height="8"></td></tr>
      <tr><td style="background:${BAR_BG};border-radius:8px;padding:14px 16px;">
        <div style="font-size:16px;margin-bottom:4px;">&#128279;</div>
        <div style="color:${CREAM};font-size:13px;font-weight:600;margin-bottom:4px;">一生消えない、ポータブルな実力の証明</div>
        <div style="color:${GRAY};font-size:12px;line-height:1.6;">店舗を変えても、独立しても、あなたのプルーフはついてきます。SNSのいいねと違い、対面の1票は本物の重み。</div>
      </td></tr>
    </table>
  </td></tr>`

  // ④ はじめの一歩Tips
  const firstStepBlock = `<tr><td style="padding:16px 32px;">
    ${sectionHeader('FIRST STEP')}
    <div style="color:${CREAM};font-size:13px;line-height:1.8;background:${BAR_BG};border-radius:8px;padding:16px;">
      次のセッション後、お客様にこう伝えてください：<br>
      <span style="color:${GOLD};font-weight:600;">「感想を記録してもらえませんか？30秒で終わります」</span><br>
      そしてカードをスマホにかざしてもらうだけ。それだけです。
    </div>
  </td></tr>`

  const body = [
    headerBlock(),
    greetBlock,
    setupBlock,
    benefitsBlock,
    firstStepBlock,
    highlightTipsBlock(content),
    ctaBlock(),
    footerBlock(),
  ].join('')

  return emailWrapper(body)
}

// ============================================================
// 止まってる人専用メール（stalled）
// ============================================================

function generateStalledEmailHTML(data: WeeklyProData, content: WeeklyReportContent | null): string {
  // ① 現在の実績リマインド
  const statsBlock = `<tr><td style="padding:20px 32px;">
    <div style="color:${CREAM};font-size:15px;margin-bottom:12px;">${escapeHtml(data.name)}さん、あなたの記録です。</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="48%" style="background:${BAR_BG};border-radius:8px;padding:14px 16px;text-align:center;">
        <div style="color:${GRAY};font-size:10px;">累計プルーフ</div>
        <div style="color:${GOLD};font-size:28px;font-weight:700;">${data.total_proofs}<span style="font-size:14px;color:${GRAY};">件</span></div>
      </td>
      <td width="4%"></td>
      <td width="48%" style="background:${BAR_BG};border-radius:8px;padding:14px 16px;text-align:center;">
        <div style="color:${GRAY};font-size:10px;">最も選ばれた強み</div>
        <div style="color:${GOLD};font-size:16px;font-weight:700;margin-top:2px;">${escapeHtml(data.top_strength_label)}</div>
      </td>
    </tr>
    </table>
  </td></tr>`

  // ② 励まし + テンプレート
  const praiseBlock = `<tr><td style="padding:16px 32px;">
    <div style="color:${CREAM};font-size:14px;line-height:1.8;background:${BAR_BG};border-radius:8px;padding:18px;border-left:3px solid ${GOLD};">
      ${escapeHtml(data.praise_message)}
    </div>
  </td></tr>`

  // ③ 再開のコツ
  const restartBlock = `<tr><td style="padding:16px 32px;">
    ${sectionHeader('RESTART TIP')}
    <div style="color:${CREAM};font-size:13px;line-height:1.8;background:${BAR_BG};border-radius:8px;padding:16px;">
      常連のお客様から始めるのが一番自然です。<br>
      <span style="color:${GOLD};font-weight:600;">「前回のセッションどうでしたか？感想を記録してもらえると嬉しいです」</span><br>
      信頼関係があるからこそ、自然にお願いできます。<br>
      もちろんカードをタップしてもらうだけ。30秒です。
    </div>
  </td></tr>`

  // ④ PROVEN進捗
  let progressRows = ''
  data.proof_progress.forEach(item => {
    const milestoneLabel = item.is_proven
      ? `PROVEN達成 ✦`
      : `あと${item.remaining}票でPROVEN達成`
    progressRows += `
      <div style="margin-bottom:12px;">
        <div style="margin-bottom:4px;">
          <span style="color:${CREAM};font-size:12px;font-weight:600;">${escapeHtml(item.strength_label)}</span>
          <span style="color:${item.is_proven ? GOLD : GRAY};font-size:12px;float:right;">${item.current_votes}票</span>
        </div>
        ${progressBar(item.current_votes, item.next_milestone)}
        <div style="color:${item.is_proven ? GOLD : GRAY};font-size:10px;margin-top:3px;">${milestoneLabel}</div>
      </div>`
  })
  const provenProgressBlock = data.proof_progress.length > 0
    ? `<tr><td style="padding:16px 32px;">
        ${sectionHeader('PROVEN PROGRESS')}
        ${progressRows}
      </td></tr>`
    : ''

  const body = [
    headerBlock(),
    statsBlock,
    praiseBlock,
    restartBlock,
    provenProgressBlock,
    highlightTipsBlock(content),
    ctaBlock(),
    footerBlock(),
  ].join('')

  return emailWrapper(body)
}

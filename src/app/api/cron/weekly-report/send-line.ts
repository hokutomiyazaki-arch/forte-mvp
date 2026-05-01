/**
 * Weekly Proof Report — LINE Messaging API Push Message
 *
 * 3パターン分岐: normal / starting / stalled
 * LINE Flex Message（Bubble）で送信
 */

import { WeeklyProData, WeeklyReportContent } from '@/lib/weekly-report'
import { PROVEN_THRESHOLD, SPECIALIST_THRESHOLD } from '@/lib/constants'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

// ── ブランドカラー ──
const DARK = '#1A1A2E'
const GOLD = '#C4A35A'
const CREAM = '#FAFAF7'
const GRAY = '#888888'
const BAR_BG = '#2A2A3E'
const GREEN = '#22C55E'

// ============================================================
// 送信関数
// ============================================================

export async function sendWeeklyLineMessage(
  lineUserId: string,
  data: WeeklyProData,
  content: WeeklyReportContent | null,
): Promise<{ success: boolean; error?: string }> {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
  if (!accessToken) {
    return { success: false, error: 'LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not set' }
  }

  const message = buildLineFlexMessage(data, content)

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [message],
      }),
    })

    if (res.ok) {
      return { success: true }
    }

    const errBody = await res.text()
    console.error(`[weekly-report-line] Push error for ${lineUserId}:`, res.status, errBody)
    return { success: false, error: `LINE ${res.status}: ${errBody}` }
  } catch (err: any) {
    console.error(`[weekly-report-line] Send error for ${lineUserId}:`, err)
    return { success: false, error: err.message || 'Network error' }
  }
}

// ============================================================
// Flex Message 構築 — メイン分岐
// ============================================================

function buildLineFlexMessage(data: WeeklyProData, content: WeeklyReportContent | null): any {
  if (data.praise_pattern === 'starting') {
    return buildStartingFlex(data, content)
  }
  if (data.praise_pattern === 'stalled') {
    return buildStalledFlex(data, content)
  }
  return buildNormalFlex(data, content)
}

// ============================================================
// 共通パーツ
// ============================================================

function headerContents(): any[] {
  return [
    { type: 'text', text: 'REALPROOF', size: 'xxs', color: GOLD, weight: 'bold' },
    { type: 'text', text: 'Weekly Proof Report', size: 'md', color: CREAM, weight: 'bold', margin: 'xs' },
  ]
}

function ctaFooter(): any {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'button',
        action: { type: 'uri', label: 'ダッシュボードを見る', uri: `${APP_URL}/dashboard` },
        style: 'primary',
        color: GOLD,
        height: 'sm',
      },
    ],
    paddingAll: 'lg',
  }
}

function separator(): any {
  return { type: 'separator', color: '#333355', margin: 'lg' }
}

function progressBarBox(current: number, milestone: number): any {
  const pct = Math.min(Math.round((current / milestone) * 100), 100)
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'filler' }],
        width: `${pct}%`,
        height: '6px',
        backgroundColor: GOLD,
        cornerRadius: '3px',
      },
    ],
    width: '100%',
    height: '6px',
    backgroundColor: BAR_BG,
    cornerRadius: '3px',
    margin: 'xs',
  }
}

// ============================================================
// 通常メッセージ（1票以上）
// ============================================================

function buildNormalFlex(data: WeeklyProData, content: WeeklyReportContent | null): any {
  const bodyContents: any[] = [
    // 挨拶
    { type: 'text', text: `${data.name}さん、今週のレポートです。`, size: 'sm', color: CREAM, wrap: true },
    separator(),
    // 数値
    {
      type: 'box', layout: 'horizontal', margin: 'lg',
      contents: [
        metricBox('今週の新規', `+${data.new_proofs_this_week}`, data.new_proofs_this_week > 0 ? GREEN : CREAM),
        metricBox('累計', `${data.total_proofs}`, CREAM),
        metricBox('PROVEN', `${data.proven_count}/${data.total_selected_items}`, data.proven_count > 0 ? GOLD : CREAM),
      ],
    },
    separator(),
    // 褒めメッセージ
    { type: 'text', text: 'YOUR HIGHLIGHT', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' },
    {
      type: 'box', layout: 'vertical', margin: 'sm',
      paddingAll: 'md',
      backgroundColor: BAR_BG,
      cornerRadius: 'md',
      contents: [
        { type: 'text', text: data.praise_message, size: 'sm', color: CREAM, wrap: true },
      ],
    },
  ]

  // PROVEN進捗
  if (data.proof_progress.length > 0) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: 'PROVEN PROGRESS', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    data.proof_progress.forEach(item => {
      const label = item.is_proven
        ? `${item.strength_label} ✦ PROVEN`
        : `${item.strength_label} — あと${item.remaining}票`
      bodyContents.push({
        type: 'box', layout: 'vertical', margin: 'sm',
        contents: [
          { type: 'text', text: label, size: 'xxs', color: item.is_proven ? GOLD : GRAY },
          progressBarBox(item.current_votes, item.next_milestone),
        ],
      })
    })
  }

  // コメント
  if (data.latest_comment) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: '今週届いた声', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'sm',
      paddingAll: 'md', backgroundColor: BAR_BG, cornerRadius: 'md',
      contents: [
        { type: 'text', text: `「${data.latest_comment}」`, size: 'xs', color: CREAM, wrap: true, style: 'italic' },
      ],
    })
  }

  // HIGHLIGHT / TIPS
  if (content?.highlight_text) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: "TODAY'S HIGHLIGHT", size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    bodyContents.push({ type: 'text', text: content.highlight_text, size: 'xs', color: CREAM, wrap: true, margin: 'sm' })
  }
  if (content?.tips_text) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: 'TIPS', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    bodyContents.push({ type: 'text', text: content.tips_text, size: 'xs', color: CREAM, wrap: true, margin: 'sm' })
  }

  return {
    type: 'flex',
    altText: `${data.name}さん、今週のプルーフレポート`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', contents: headerContents(),
        paddingAll: 'lg', backgroundColor: DARK,
      },
      body: {
        type: 'box', layout: 'vertical', contents: bodyContents,
        paddingAll: 'lg', backgroundColor: DARK,
      },
      footer: ctaFooter(),
      styles: {
        header: { backgroundColor: DARK },
        body: { backgroundColor: DARK },
        footer: { backgroundColor: DARK },
      },
    },
  }
}

// ============================================================
// 0票専用メッセージ（starting）
// ============================================================

function buildStartingFlex(data: WeeklyProData, content: WeeklyReportContent | null): any {
  const bodyContents: any[] = [
    // 挨拶
    { type: 'text', text: `${data.name}さん、REALPROOFへようこそ。`, size: 'sm', color: CREAM, wrap: true },
    // 褒め
    {
      type: 'box', layout: 'vertical', margin: 'md',
      paddingAll: 'md', backgroundColor: BAR_BG, cornerRadius: 'md',
      contents: [
        { type: 'text', text: data.praise_message, size: 'sm', color: CREAM, wrap: true },
      ],
    },
    separator(),
    // カード準備完了
    { type: 'text', text: 'YOUR CARD IS READY', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' },
    { type: 'text', text: 'セットアップは完了しています。', size: 'sm', color: CREAM, wrap: true, margin: 'sm' },
    { type: 'text', text: 'やることは1つ——カードをクライアントにタップしてもらうだけ。3分で強みが記録されます。', size: 'xs', color: GRAY, wrap: true, margin: 'sm' },
    separator(),
    // メリット
    { type: 'text', text: 'WHY COLLECT PROOFS?', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' },
    benefitItem('自分の「本当の強み」がデータで見える'),
    benefitItem('15票でPROVEN・30票でSPECIALIST・50票でMASTER・100票でLEGEND認定。'),
    benefitItem('一生消えない、ポータブルな実力の証明'),
    separator(),
    // はじめの一歩
    { type: 'text', text: 'FIRST STEP', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' },
    { type: 'text', text: '次のセッション後、お客様にこう伝えてください：', size: 'xs', color: CREAM, wrap: true, margin: 'sm' },
    { type: 'text', text: '「感想を記録してもらえませんか？3分で終わります」', size: 'sm', color: GOLD, wrap: true, margin: 'sm', weight: 'bold' },
  ]

  // HIGHLIGHT
  if (content?.highlight_text) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: "TODAY'S HIGHLIGHT", size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    bodyContents.push({ type: 'text', text: content.highlight_text, size: 'xs', color: CREAM, wrap: true, margin: 'sm' })
  }

  return {
    type: 'flex',
    altText: `${data.name}さん、REALPROOFへようこそ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', contents: headerContents(),
        paddingAll: 'lg', backgroundColor: DARK,
      },
      body: {
        type: 'box', layout: 'vertical', contents: bodyContents,
        paddingAll: 'lg', backgroundColor: DARK,
      },
      footer: ctaFooter(),
      styles: {
        header: { backgroundColor: DARK },
        body: { backgroundColor: DARK },
        footer: { backgroundColor: DARK },
      },
    },
  }
}

// ============================================================
// 止まってる人専用メッセージ（stalled）
// ============================================================

function buildStalledFlex(data: WeeklyProData, content: WeeklyReportContent | null): any {
  const bodyContents: any[] = [
    // 実績リマインド
    { type: 'text', text: `${data.name}さん、あなたの記録です。`, size: 'sm', color: CREAM, wrap: true },
    {
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        metricBox('累計プルーフ', `${data.total_proofs}`, GOLD),
        metricBox('最も選ばれた強み', data.top_strength_label, GOLD),
      ],
    },
    separator(),
    // 褒め
    {
      type: 'box', layout: 'vertical', margin: 'lg',
      paddingAll: 'md', backgroundColor: BAR_BG, cornerRadius: 'md',
      contents: [
        { type: 'text', text: data.praise_message, size: 'sm', color: CREAM, wrap: true },
      ],
    },
    separator(),
    // 再開のコツ
    { type: 'text', text: 'RESTART TIP', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' },
    { type: 'text', text: '常連のお客様から始めるのが一番自然です。', size: 'xs', color: CREAM, wrap: true, margin: 'sm' },
    { type: 'text', text: '「前回のセッションどうでしたか？感想を記録してもらえると嬉しいです」', size: 'xs', color: GOLD, wrap: true, margin: 'sm', weight: 'bold' },
    { type: 'text', text: 'カードをタップしてもらうだけ。3分です。', size: 'xs', color: GRAY, wrap: true, margin: 'sm' },
  ]

  // PROVEN進捗
  if (data.proof_progress.length > 0) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: 'PROVEN PROGRESS', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    data.proof_progress.forEach(item => {
      const label = item.is_proven
        ? `${item.strength_label} ✦ PROVEN`
        : `${item.strength_label} — あと${item.remaining}票`
      bodyContents.push({
        type: 'box', layout: 'vertical', margin: 'sm',
        contents: [
          { type: 'text', text: label, size: 'xxs', color: item.is_proven ? GOLD : GRAY },
          progressBarBox(item.current_votes, item.next_milestone),
        ],
      })
    })
  }

  // HIGHLIGHT / TIPS
  if (content?.highlight_text) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: "TODAY'S HIGHLIGHT", size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    bodyContents.push({ type: 'text', text: content.highlight_text, size: 'xs', color: CREAM, wrap: true, margin: 'sm' })
  }
  if (content?.tips_text) {
    bodyContents.push(separator())
    bodyContents.push({ type: 'text', text: 'TIPS', size: 'xxs', color: GOLD, weight: 'bold', margin: 'lg' })
    bodyContents.push({ type: 'text', text: content.tips_text, size: 'xs', color: CREAM, wrap: true, margin: 'sm' })
  }

  return {
    type: 'flex',
    altText: `${data.name}さん、あなたのプルーフは今も輝いています`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', contents: headerContents(),
        paddingAll: 'lg', backgroundColor: DARK,
      },
      body: {
        type: 'box', layout: 'vertical', contents: bodyContents,
        paddingAll: 'lg', backgroundColor: DARK,
      },
      footer: ctaFooter(),
      styles: {
        header: { backgroundColor: DARK },
        body: { backgroundColor: DARK },
        footer: { backgroundColor: DARK },
      },
    },
  }
}

// ============================================================
// ヘルパー
// ============================================================

function metricBox(label: string, value: string, valueColor: string): any {
  return {
    type: 'box', layout: 'vertical', flex: 1,
    contents: [
      { type: 'text', text: label, size: 'xxs', color: GRAY, align: 'center' },
      { type: 'text', text: value, size: 'lg', color: valueColor, weight: 'bold', align: 'center', margin: 'xs' },
    ],
  }
}

function benefitItem(text: string): any {
  return {
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: '•', size: 'xs', color: GOLD, flex: 0 },
      { type: 'text', text, size: 'xs', color: CREAM, wrap: true, margin: 'sm', flex: 5 },
    ],
  }
}

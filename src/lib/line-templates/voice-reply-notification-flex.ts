/**
 * Phase 3 Step 2: Voice 返信通知 LINE Flex Message テンプレート
 *
 * プロが返信を保存した直後、LINE 認証で投票したクライアントへ Flex Message を Push 送信。
 *
 * 設計方針:
 *   - 返信本文は載せない (サイト誘導が目的)
 *   - REALPROOF Dark + Gold のブランド配色 (cron/weekly-report/send-line.ts と統一)
 *   - altText は LINE 通知欄 / プレビューに表示される短文
 */

// ── ブランドカラー (cron/weekly-report/send-line.ts と統一) ──
const DARK = '#1A1A2E'
const GOLD = '#C4A35A'
const CREAM = '#FAFAF7'
const GRAY = '#888888'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildVoiceReplyFlexMessage(params: {
  professionalName: string
  deepLinkUrl: string
}): any {
  return {
    type: 'flex',
    altText: `${params.professionalName}さんが、あなたの声に返信しました`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: DARK,
        contents: [
          {
            type: 'text',
            text: 'REALPROOF',
            size: 'xxs',
            color: GOLD,
            weight: 'bold',
          },
          {
            type: 'text',
            text: 'あなたの声に返信が届きました',
            size: 'md',
            color: CREAM,
            weight: 'bold',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: `${params.professionalName}さんから`,
            size: 'sm',
            color: GRAY,
            margin: 'sm',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        backgroundColor: DARK,
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: GOLD,
            height: 'sm',
            action: {
              type: 'uri',
              label: '返信を見る',
              uri: params.deepLinkUrl,
            },
          },
        ],
      },
      styles: {
        body: { backgroundColor: DARK },
        footer: { backgroundColor: DARK },
      },
    },
  }
}

'use client'

/**
 * ダッシュボード Voices タブ専用カード
 *
 * 公開ページ用 VoiceCommentCard とは別物:
 *   - display_mode の同意設定は無視
 *   - auth_method ベースで「対面の相手」としてリッチに表示
 *   - data source: /api/dashboard/voices の voices[i]
 *
 * このコンポーネントはコメント本文 + クライアント情報ヘッダー + プロからの返信表示
 * までを担当。「返信を書く」「シェア」「検索カードに設定」等のボタンは呼び出し元
 * (dashboard/page.tsx) 側で本コンポーネントの後ろに配置する。
 */

export interface DashboardVoiceClient {
  type: 'rich' | 'auth_only'
  name?: string
  photoUrl?: string | null
  providerLabel?: string
  label?: string
  icon?: 'email' | 'sms' | 'default'
}

export interface DashboardVoiceReply {
  id: string
  reply_text: string
  created_at: string
  updated_at: string
  delivered_at: string | null
  delivered_via: 'line' | 'email' | null
}

export interface DashboardVoice {
  id: string
  comment: string
  created_at: string
  // VoiceReplyModal 互換のため保持 (UI 判定では使わない)
  auth_display_name: string | null
  client_photo_url: string | null
  display_mode: string | null
  reply: DashboardVoiceReply | null
  client: DashboardVoiceClient
}

interface Props {
  voice: DashboardVoice
  professionalName: string
}

function ClientHeader({ client }: { client: DashboardVoiceClient }) {
  if (client.type === 'rich') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {client.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.photoUrl}
            alt={client.name || ''}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#1A1A2E',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {client.name?.charAt(0) || '?'}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
            {client.name}
          </div>
          <div style={{ fontSize: 11, color: '#C4A35A', marginTop: 2 }}>
            {client.providerLabel}
          </div>
        </div>
      </div>
    )
  }

  // auth_only: アイコン + ラベルのみ
  const iconChar =
    client.icon === 'email' ? '✉' : client.icon === 'sms' ? '📱' : '👤'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#E8E8E0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          color: '#888888',
          flexShrink: 0,
        }}
      >
        {iconChar}
      </div>
      <div style={{ fontSize: 13, color: '#666666' }}>{client.label}</div>
    </div>
  )
}

export default function DashboardVoiceCard({ voice, professionalName }: Props) {
  return (
    <div
      style={{
        padding: 16,
        background: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
        border: '1px solid #E8E4DC',
        borderRadius: 14,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <ClientHeader client={voice.client} />
      </div>

      {/* 引用符 + コメント本文 */}
      <div
        style={{
          fontSize: 32,
          color: 'rgba(196, 163, 90, 0.3)',
          fontFamily: 'Georgia, serif',
          lineHeight: 1,
        }}
      >
        &ldquo;
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#1A1A2E',
          lineHeight: 1.8,
          margin: '4px 0 10px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {voice.comment}
      </div>

      {/* 日付 */}
      <div style={{ fontSize: 11, color: '#888888', fontFamily: "'Inter', monospace" }}>
        {new Date(voice.created_at).toLocaleDateString('ja-JP')}
      </div>

      {/* プロからの返信 (API 側で is_deleted=false フィルタ済) */}
      {voice.reply && (
        <div
          style={{
            marginTop: 14,
            paddingLeft: 12,
            borderLeft: '2px solid rgba(196, 163, 90, 0.4)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: '#C4A35A',
              fontWeight: 700,
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            {professionalName} からの返信
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(26, 26, 46, 0.9)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {voice.reply.reply_text}
          </div>
        </div>
      )}
    </div>
  )
}

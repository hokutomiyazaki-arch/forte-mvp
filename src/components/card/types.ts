/**
 * Card 関連コンポーネントで共有する型定義。
 *
 * 重要: このファイルには 'use client' を付けない。
 * 'use client' モジュールから interface を再エクスポートすると、
 * Server Action のシリアライズ処理 (encodeReply) でクライアント参照と
 * 誤検知され「Client Functions cannot be passed directly to Server Functions」
 * エラーになるため、純粋な型ファイルとして分離している。
 */

export interface VoiceReply {
  id: string
  reply_text: string
  created_at: string
  updated_at: string
  delivered_at: string | null
  delivered_via: 'line' | 'email' | null
}

export interface VoiceComment {
  id: string
  comment: string
  created_at: string
  display_mode: string | null
  client_photo_url: string | null
  auth_display_name: string | null
  voter_pro: {
    id: string
    name: string
    title: string | null
    photo_url: string | null
  } | null
  voter_vote_count: number
  /** Phase 3: プロからの返信。is_deleted=false のもののみ。未返信なら null。 */
  reply: VoiceReply | null
  /** Phase 3 (事実タグ): この記録で本人が選んだ強みの本文（proof_items.label＝長い方・最大3件・重複排除）。無ければ空配列。 */
  proofTags: string[]
}

export interface Supporter {
  vote_id: string
  photo_url: string
  display_name: string
  is_pro: boolean
  created_at: string
  // pro_link 票のみ: 投票者プロのカード '/card/{voter_professional_id}'。
  // クライアント顔(photo)票では undefined（クリックで Voices タブにスクロールする従来挙動）。
  linkHref?: string
}

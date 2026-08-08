'use client'

/**
 * §2-6広域適用レビュー修正(2026-08-08): voice/[hash]のサーバーコンポーネント化で
 * view_count加算がHTTPリクエスト単位になり、LINE/X/Slack等のOGPクローラのGETでも
 * カウントが増えてしまう(旧実装はブラウザでJSが走った時のみ加算=共有指標の定義)。
 * 加算だけを旧実装と同じクライアント側に戻す(本文の取得・表示はサーバー側のまま=原文非露出は維持)。
 */
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ViewCountPing({ shareId, viewCount }: { shareId: string; viewCount: number }) {
  useEffect(() => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('voice_shares')
      .update({ view_count: viewCount + 1 })
      .eq('id', shareId)
      .then(() => {})
  }, [shareId, viewCount])

  return null
}

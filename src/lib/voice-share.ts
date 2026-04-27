'use client'

import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'
import { trackPageView } from '@/lib/tracking'

/**
 * Voice シェア共通ロジック
 *
 * 用途:
 *   ダッシュボード Voicesタブの「この声をシェアする」ボタン (VoiceShareCard) と、
 *   v1.2 §12 のシェア促進ポップアップ (VoiceSuggestionPopup) で同一のシェア処理を再利用するため、
 *   VoiceShareCard.tsx 内に閉じていた handleShare を抽出した。
 *
 * 振る舞い（既存挙動を完全に再現）:
 *   1. html2canvas で対象要素を画像化
 *      - exportMode='stories': 1080px 幅に scale up、角丸マスクなし
 *      - exportMode='feed':    680px 幅に scale up、半径 36*scale/2 で角丸マスク
 *   2. PNG Blob → File 化
 *   3. Web Share API (navigator.share) を試行
 *      - 成功: tracking + voice_shares INSERT して return
 *      - AbortError (ユーザーキャンセル): 何もせずに return（既存挙動）
 *      - それ以外のエラー: フォールバック（ダウンロード）に継続
 *   4. フォールバック: anchor タグの download でローカル保存
 *      - 完了: tracking + voice_shares INSERT
 *
 * tracking event:
 *   呼び出し元を区別するため source パラメータで pageType を切り替え:
 *     - 'dashboard' → 'share_voice'        （既存と同じ）
 *     - 'popup'     → 'share_voice_popup'  （Phase C 新規）
 *
 * 注意:
 *   voice_shares テーブルには source カラムが存在しないため、INSERT 内容は変更しない。
 *   呼び出し元の区別は tracking event 名でのみ行う。
 */

export type VoiceShareSource = 'dashboard' | 'popup'
export type VoiceShareExportMode = 'stories' | 'feed'

export interface VoiceShareParams {
  /** html2canvas で画像化する DOM 要素（呼び出し元が用意） */
  cardElement: HTMLElement
  /** 出力モード: stories=9:16 / feed=4:5 */
  exportMode: VoiceShareExportMode
  /** シェア対象 vote の ID */
  voteId: string
  /** プロの ID */
  professionalId: string
  /** 感謝フレーズ ID */
  phraseId: number
  /** showProInfo 相当（プロ情報を含めるか） */
  includeProfile: boolean
  /** 呼び出し元（tracking 区別用） */
  source: VoiceShareSource
}

export interface VoiceShareResult {
  /** 関数全体が想定通り完了したか（=例外で落ちなかったか） */
  success: boolean
  /** 実際にシェア／ダウンロードが行われたか（ユーザーキャンセル時は false） */
  shared: boolean
  /** success=false の時のエラー */
  error?: Error
}

/**
 * Voice シェアを実行する。
 * UI 状態（saving フラグ等）は呼び出し元が管理する。
 */
export async function executeVoiceShare(
  params: VoiceShareParams
): Promise<VoiceShareResult> {
  try {
    // ── 1. html2canvas で画像化 ──
    const targetWidth = params.exportMode === 'stories' ? 1080 : 680
    const scale = targetWidth / params.cardElement.offsetWidth

    const canvas = await html2canvas(params.cardElement, {
      scale,
      backgroundColor: null,
      useCORS: true,
      width: params.cardElement.offsetWidth,
      height: params.cardElement.offsetHeight,
    })

    // ── 2. feed モードのみ角丸マスク適用 ──
    let finalCanvas = canvas
    if (params.exportMode === 'feed') {
      finalCanvas = document.createElement('canvas')
      finalCanvas.width = canvas.width
      finalCanvas.height = canvas.height
      const ctx = finalCanvas.getContext('2d')
      if (ctx) {
        const radius = 36 * (scale / 2)
        ctx.beginPath()
        ctx.moveTo(radius, 0)
        ctx.lineTo(canvas.width - radius, 0)
        ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius)
        ctx.lineTo(canvas.width, canvas.height - radius)
        ctx.quadraticCurveTo(
          canvas.width,
          canvas.height,
          canvas.width - radius,
          canvas.height
        )
        ctx.lineTo(radius, canvas.height)
        ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius)
        ctx.lineTo(0, radius)
        ctx.quadraticCurveTo(0, 0, radius, 0)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(canvas, 0, 0)
      }
    }

    // ── 3. Blob → File 化 ──
    const blob = await new Promise<Blob>(resolve => {
      finalCanvas.toBlob(b => resolve(b!), 'image/png')
    })
    const file = new File(
      [blob],
      `realproof-voice-${params.exportMode}.png`,
      { type: 'image/png' }
    )

    // ── 4. tracking event 名 + voice_shares INSERT ヘルパー ──
    const trackingPageType =
      params.source === 'popup' ? 'share_voice_popup' : 'share_voice'
    const supabase = createClient()
    const recordShare = async () => {
      trackPageView(trackingPageType, params.professionalId, params.voteId)
      const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      await (supabase as any).from('voice_shares').insert({
        vote_id: params.voteId,
        professional_id: params.professionalId,
        phrase_id: params.phraseId,
        include_profile: params.includeProfile,
        hash,
      })
    }

    // ── 5. Web Share API ──
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'REALPROOF',
          text: '強みが、あなたを定義する。',
        })
        await recordShare()
        return { success: true, shared: true }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // ユーザーキャンセル — 既存挙動: tracking/INSERT せずに return
          return { success: true, shared: false }
        }
        // それ以外のエラーはフォールバック（ダウンロード）に継続（既存挙動）
      }
    }

    // ── 6. フォールバック: ダウンロード ──
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `realproof-voice-${params.exportMode}.png`
    a.click()
    URL.revokeObjectURL(url)
    await recordShare()
    return { success: true, shared: true }
  } catch (error) {
    return { success: false, shared: false, error: error as Error }
  }
}

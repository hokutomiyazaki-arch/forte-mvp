'use client'

import { useState } from 'react'
import NoticeBannerShell, { noticeActionStyle, type NoticeBannerType } from './NoticeBannerShell'

/**
 * アプリが自分で出すお知らせ（CEO指示 2026-08-06）。
 *
 * CEO報告:
 *   「この上の通知、一度タップした後に消えないし、なにも出来ない。反応しない。
 *    消すボタンをつけて欲しいのと、通知方法は admin dashboard で使っている
 *    バナー通知に統一して。」
 *   「バナーの出し方が admin dashboard と違う。差分を検証して、そのとおりにして。」
 *
 * 見た目は NoticeBannerShell に寄せてある（admin から配信するお知らせと同一。
 * 余白・文字サイズ・角丸を2箇所に持たない）。このファイルが持つのは
 *   ① 何を出すか（title/body/CTA）
 *   ② 閉じたことを覚える方法（localStorage）
 * の2つだけ。
 *
 * ⚠️ CTA を「同じページへの Link」にしてはいけない（今回の「反応しない」の真因）:
 *   ダッシュボード内のバナーが `/dashboard?tab=profile&edit=true` へリンクしていたが、
 *   受け側の useEffect は「マウント後1回だけ」開く作りで、しかも開いた直後に
 *   window.history.replaceState で edit を消していた。replaceState は Next の
 *   router に伝わらないため useSearchParams が更新されず、2回目以降のタップは
 *   同じ状態のまま何も起きない。同一ページ内の操作は URL を経由せず、
 *   onAction で直接やらせる。
 */

const LS_KEY = 'dismissed_inline_notices'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export interface InlineNoticeBannerProps {
  /** 閉じた状態を覚えるためのキー（バナーごとに固定の文字列） */
  id: string
  title: string
  body?: string
  type?: NoticeBannerType
  actionLabel?: string
  /** 同じページ内で完結する操作（推奨） */
  onAction?: () => void
  /** 別ページへ移動する場合だけ使う */
  href?: string
  /**
   * §17-23(CEO指摘 2026-08-07「バナーを出す位置がちがう」):
   * レイアウト直下（Navbarのすぐ下・<main>の外）に敷くときは true。
   * admin配信のお知らせ(AnnouncementBanner)と同じく、余白を持たない全幅の帯になる。
   * ページの中に置くときは false（既定）で、下だけ空ける。
   */
  flush?: boolean
}

export default function InlineNoticeBanner({
  id,
  title,
  body,
  type = 'info',
  actionLabel,
  onAction,
  href,
  flush = false,
}: InlineNoticeBannerProps) {
  // 初期値の計算で localStorage を読む（描画後にチラッと出てから消えるのを防ぐ）。
  // SSR では window が無いので false 相当（= 表示）になり、クライアントで再評価される。
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return readDismissed().includes(id)
  })

  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    try {
      const list = readDismissed()
      if (!list.includes(id)) {
        list.push(id)
        localStorage.setItem(LS_KEY, JSON.stringify(list))
      }
    } catch {
      // localStorage が使えなくても、この画面では閉じたままにする
    }
  }

  const action =
    actionLabel && (onAction || href) ? (
      onAction ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onAction() }} style={noticeActionStyle}>
          {actionLabel} →
        </button>
      ) : (
        <a href={href} onClick={(e) => e.stopPropagation()} style={noticeActionStyle}>
          {actionLabel} →
        </a>
      )
    ) : null

  // 配信お知らせは画面上端に敷かれるため余白を持たない。ページの中に置く場合だけ下を空ける
  // （見た目そのものは同じ帯）。flush=true はレイアウト直下＝配信お知らせと完全に同じ扱い。
  const shell = (
    <NoticeBannerShell type={type} title={title} body={body} onDismiss={handleDismiss} action={action} />
  )
  return flush ? shell : <div style={{ marginBottom: 16 }}>{shell}</div>
}

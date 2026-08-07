'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useSharedData } from '@/contexts/SharedDataContext'
import NoticeBannerShell, { noticeActionStyle, type NoticeBannerType } from './NoticeBannerShell'

/**
 * admin ＞ お知らせ管理 から配信するバナー。
 *
 * 2026-08-06(CEO指示「バナーの出し方が admin dashboard と違う。差分を検証して、そのとおりにして」):
 * 見た目は NoticeBannerShell に切り出し、アプリ内バナー(InlineNoticeBanner)と共有する。
 * このファイルが持つのは「どのお知らせを出すか」と「閉じたことをどこに保存するか」だけ。
 */

const LS_KEY = 'dismissed_announcements'

interface Announcement {
  id: string
  title: string
  body: string | null
  link_url: string | null
  link_label: string | null
  banner_type: string
  starts_at: string
}

export default function AnnouncementBanner() {
  const pathname = usePathname()
  const { userId } = useAuth()
  const { latestBanner } = useSharedData()
  const [banner, setBanner] = useState<Announcement | null>(null)
  const [visible, setVisible] = useState(true)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    if (!latestBanner) return
    // 未ログイン → localStorageでdismiss済みをフィルタ
    if (!userId) {
      try {
        const dismissed: string[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
        if (dismissed.includes(latestBanner.id)) return
      } catch {
        // localStorage使えない場合はそのまま表示
      }
    }
    setBanner(latestBanner)
  }, [latestBanner, userId])

  const isVotePage = pathname?.startsWith('/vote/')
  // トップページ・プロを探すページはバナー非表示
  const isBannerHiddenPage = pathname === '/' || pathname === '/search'

  if (!banner || !visible || isVotePage || isBannerHiddenPage) return null

  const type: NoticeBannerType =
    banner.banner_type === 'success' ? 'success' : banner.banner_type === 'warning' ? 'warning' : 'info'

  async function handleDismiss() {
    setDismissing(true)
    if (userId) {
      // ログイン済み → API経由でDB保存
      try {
        await fetch('/api/announcements/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ announcement_id: banner!.id }),
        })
      } catch {
        // dismiss失敗でもUIは閉じる
      }
    } else {
      // 未ログイン → localStorageに保存（API呼ばない）
      try {
        const dismissed: string[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
        if (!dismissed.includes(banner!.id)) {
          dismissed.push(banner!.id)
          localStorage.setItem(LS_KEY, JSON.stringify(dismissed))
        }
      } catch {
        // localStorage使えない場合は何もしない
      }
    }
    setVisible(false)
  }

  const action = banner.link_url ? (
    <a
      href={banner.link_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={noticeActionStyle}
    >
      {banner.link_label || '詳しく見る'} →
    </a>
  ) : null

  return (
    <NoticeBannerShell
      type={type}
      title={banner.title}
      body={banner.body}
      onDismiss={handleDismiss}
      dismissing={dismissing}
      action={action}
    />
  )
}

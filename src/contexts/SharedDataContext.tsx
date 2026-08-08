'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useUser } from '@clerk/nextjs'
import type { CertifiableTier } from '@/lib/constants'

interface Announcement {
  id: string
  title: string
  body: string | null
  link_url: string | null
  link_label: string | null
  banner_type: string
  starts_at: string
}

interface SharedData {
  // announcements
  announcements: Announcement[]
  latestBanner: Announcement | null
  unreadCount: number
  announcementsLoaded: boolean
  // nav-context
  ownedOrg: { id: string; name?: string; type?: string } | null
  hasOrgMembership: boolean
  /** SPECIALIST(30+)/MASTER(50+)/LEGEND(100+) の最高未申請ティア。Navbar 認定申請メニュー表示用 */
  eligibleCertificationTier: CertifiableTier | null
  /** FEATURE_REFERRAL_LISTS のアローリスト判定。Navbar「処方箋リスト」メニュー表示用 */
  referralEnabled: boolean
  isFoundingMember: boolean
  navContextLoaded: boolean
}

const SharedDataContext = createContext<SharedData>({
  announcements: [],
  latestBanner: null,
  unreadCount: 0,
  announcementsLoaded: false,
  ownedOrg: null,
  hasOrgMembership: false,
  eligibleCertificationTier: null,
  referralEnabled: false,
  isFoundingMember: false,
  navContextLoaded: false,
})

export function SharedDataProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser()

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [latestBanner, setLatestBanner] = useState<Announcement | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false)

  const [ownedOrg, setOwnedOrg] = useState<{ id: string; name?: string; type?: string } | null>(null)
  const [hasOrgMembership, setHasOrgMembership] = useState(false)
  const [eligibleCertificationTier, setEligibleCertificationTier] = useState<CertifiableTier | null>(null)
  const [referralEnabled, setReferralEnabled] = useState(false)
  // ファウンダーバッジをヘッダー（ロゴ横）に出すため（CEO指示 2026-08-06）
  const [isFoundingMember, setIsFoundingMember] = useState(false)
  const [navContextLoaded, setNavContextLoaded] = useState(false)

  // announcements: 1回だけfetch
  useEffect(() => {
    fetch('/api/announcements')
      .then(res => res.json())
      .then(data => {
        if (data.announcements) setAnnouncements(data.announcements)
        if (data.latest) setLatestBanner(data.latest)
        if (data.unread_count) setUnreadCount(data.unread_count)
        setAnnouncementsLoaded(true)
      })
      .catch(() => setAnnouncementsLoaded(true))
  }, [])

  // nav-context: ログイン済みの場合1回だけfetch
  const signedIn = isLoaded && isSignedIn
  useEffect(() => {
    if (!signedIn) {
      setNavContextLoaded(true)
      return
    }
    fetch('/api/nav-context', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.ownedOrg) setOwnedOrg(data.ownedOrg)
        if (data.hasOrgMembership) setHasOrgMembership(true)
        if (data.eligibleCertificationTier) {
          setEligibleCertificationTier(data.eligibleCertificationTier)
        }
        if (data.referralEnabled) setReferralEnabled(true)
        if (data.isFoundingMember) setIsFoundingMember(true)
        setNavContextLoaded(true)
      })
      .catch(() => setNavContextLoaded(true))
  }, [signedIn])

  return (
    <SharedDataContext.Provider value={{
      announcements,
      latestBanner,
      unreadCount,
      announcementsLoaded,
      ownedOrg,
      hasOrgMembership,
      eligibleCertificationTier,
      referralEnabled,
      isFoundingMember,
      navContextLoaded,
    }}>
      {children}
    </SharedDataContext.Provider>
  )
}

export function useSharedData() {
  return useContext(SharedDataContext)
}

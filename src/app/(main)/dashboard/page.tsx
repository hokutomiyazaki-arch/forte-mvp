'use client'
import { useEffect, useState } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { db, uploadFile } from '@/lib/db'
import { calcQrTokenExpiry } from '@/lib/qr-token'
import { Professional, VoteSummary, CustomForte, getResultForteLabel, REWARD_TYPES, getRewardType, FNT_NEURO_APPS } from '@/lib/types'
import { resolveProofLabels, resolvePersonalityLabels } from '@/lib/proof-labels'
import ForteChart from '@/components/ForteChart'
import { PROVEN_THRESHOLD, SPECIALIST_THRESHOLD, PROVEN_GOLD, PROVEN_GRADIENT, TAB_ORDER, TAB_DISPLAY_NAMES } from '@/lib/constants'
import VoiceShareModal from '@/components/VoiceShareCard'
import { VoiceCommentCard } from '@/components/card/VoiceCommentCard'
import VoiceSuggestionPopup, { type SuggestedTheme } from '@/components/voice/VoiceSuggestionPopup'
import type { VoiceComment } from '@/components/card/types'
import CertificationModal from '@/components/CertificationModal'
import ImageCropper from '@/components/ImageCropper'
import CardModeSwitch from '@/components/CardModeSwitch'
import InstallPrompt from '@/components/InstallPrompt'
import { PREFECTURES } from '@/lib/prefectures'
import XDayCountdown from '@/components/XDayCountdown'
import { isPersonalityV2 } from '@/lib/personality'
import { validateBookingUrl } from '@/lib/validation'

// バッジ階層: FNTはBDCの上位資格。同レベルのFNTを持っていたらBDCは非表示
const BADGE_ORDER: Record<string, number> = {
  'bdc-elite': 1, 'fnt-basic': 2,
  'bdc-pro': 3, 'fnt-advance': 4,
  'bdc-legend': 5, 'fnt-master': 6,
}
const BDC_TO_FNT_UPGRADE: Record<string, string> = {
  'bdc-elite': 'fnt-basic', 'bdc-pro': 'fnt-advance', 'bdc-legend': 'fnt-master',
}
function filterAndSortBadges(badges: { id: string; label: string; image_url: string }[]) {
  if (!badges || badges.length === 0) return []
  const ids = new Set(badges.map(b => b.id))
  const filtered = badges.filter(b => {
    const upgradeId = BDC_TO_FNT_UPGRADE[b.id]
    if (upgradeId && ids.has(upgradeId)) return false
    return true
  })
  filtered.sort((a, b) => (BADGE_ORDER[a.id] || 99) - (BADGE_ORDER[b.id] || 99))
  return filtered
}

// プルーフ項目の型
interface ProofItem {
  id: string
  tab: string
  label: string
  strength_label: string
  sort_order: number
}

interface CustomProof {
  id: string
  label: string
}

const CATEGORY_LABELS = TAB_DISPLAY_NAMES
const CATEGORY_KEYS = TAB_ORDER

export default function DashboardPage() {
  const { signOut } = useClerk()
  const [user, setUser] = useState<any>(null)
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [personalityVotes, setPersonalityVotes] = useState<{category: string, vote_count: number}[]>([])
  const [archivedPersonality, setArchivedPersonality] = useState<{ label: string; personality_label: string; votes: number }[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [firstTimerCount, setFirstTimerCount] = useState(0)
  const [repeaterCount, setRepeaterCount] = useState(0)
  const [regularCount, setRegularCount] = useState(0)
  const [qrUrl, setQrUrl] = useState('')
  const [qrRefreshed, setQrRefreshed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // LINE連携バナー状態
  const [lineBannerState, setLineBannerState] = useState<'hidden' | 'show_banner' | 'show_code_input' | 'linked'>('hidden')
  const [linkCode, setLinkCode] = useState('')
  const [codeInput, setCodeInput] = useState(['', '', '', ''])
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [weeklyEmailEnabled, setWeeklyEmailEnabled] = useState(true)
  const [emailToggleSaving, setEmailToggleSaving] = useState(false)
  // プロフィール編集内LINE連携状態
  const [profileLineState, setProfileLineState] = useState<'unlinked' | 'code_input' | 'linked'>('unlinked')
  const [profileCodeInput, setProfileCodeInput] = useState(['', '', '', ''])
  const [profileCodeError, setProfileCodeError] = useState('')
  const [profileCodeLoading, setProfileCodeLoading] = useState(false)

  const [form, setForm] = useState({
    name: '', last_name: '', first_name: '', store_name: '',
    title: '', prefecture: '', area_description: '',
    is_online_available: false,
    bio: '', booking_url: '', photo_url: '', contact_email: '',
  })
  const [customResultFortes, setCustomResultFortes] = useState<CustomForte[]>([])
  const [customPersonalityFortes, setCustomPersonalityFortes] = useState<CustomForte[]>([])
  const [rewards, setRewards] = useState<{ id?: string; reward_type: string; title: string; content: string; url?: string }[]>([])
  const [showRewardPicker, setShowRewardPicker] = useState(false)
  const [rewardSaving, setRewardSaving] = useState(false)
  const [rewardSaved, setRewardSaved] = useState(false)
  const [rewardError, setRewardError] = useState('')
  const [availableApps, setAvailableApps] = useState<any[]>([])
  const [availableAppsLoaded, setAvailableAppsLoaded] = useState(false)
  const [showOrgAppPicker, setShowOrgAppPicker] = useState(false)
  const [confirmingDeregister, setConfirmingDeregister] = useState(false)
  const [deregistering, setDeregistering] = useState(false)
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [formError, setFormError] = useState('')
  // Phase 2: booking_url バリデーション専用のフィールドエラー (入力欄直下に表示)
  const [bookingUrlError, setBookingUrlError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [hasEmailIdentity, setHasEmailIdentity] = useState(false)
  const [saving, setSaving] = useState(false)
  const isLineUser = user?.email?.startsWith('line_') && user?.email?.endsWith('@line.realproof.jp')

  // プルーフ選択用 state
  const [proofItems, setProofItems] = useState<ProofItem[]>([])
  const [selectedProofIds, setSelectedProofIds] = useState<Set<string>>(new Set())
  const [customProofs, setCustomProofs] = useState<CustomProof[]>([])
  const [activeTab, setActiveTab] = useState('healing')
  const [dashboardTab, setDashboardTab] = useState<'profile' | 'proofs' | 'rewards' | 'voices' | 'card' | 'org' | 'myorgs' | 'guide'>('profile')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  // userRole removed: /api/dashboard の role レスポンスで判定
  const [proofSaving, setProofSaving] = useState(false)
  const [proofSaved, setProofSaved] = useState(false)
  const [proofError, setProofError] = useState('')
  const [customProofVoteCounts, setCustomProofVoteCounts] = useState<Map<string, number>>(new Map())
  const [showKakegoe, setShowKakegoe] = useState(false)
  const [featuredProofId, setFeaturedProofId] = useState<string | null>(null)
  const [featuredProofSaving, setFeaturedProofSaving] = useState(false)
  const [featuredVoiceId, setFeaturedVoiceId] = useState<string | null>(null)
  const [featuredVoiceSaving, setFeaturedVoiceSaving] = useState(false)

  // Voices用 state
  // v1.2 §11.4-2: API は display_mode / client_photo_url / auth_display_name /
  // voter_pro / voter_vote_count を返す（Phase B 完了済み）。VoiceCommentCard が
  // これらを消費するため VoiceComment 型に拡張。
  const [voiceComments, setVoiceComments] = useState<VoiceComment[]>([])
  const [voicePhrases, setVoicePhrases] = useState<{ id: number; text: string; is_default: boolean; sort_order: number }[]>([])
  const [expandedVoice, setExpandedVoice] = useState<string | null>(null)
  const [phraseSelecting, setPhraseSelecting] = useState<string | null>(null)
  const [selectedPhrases, setSelectedPhrases] = useState<Record<string, number>>({})
  const [shareModalVoice, setShareModalVoice] = useState<{ id: string; comment: string; created_at: string } | null>(null)

  // Voice カードテーマ: DB生データをそのまま保持（モーダル内で解決）
  const [savedVoiceThemeData, setSavedVoiceThemeData] = useState<any>(null)

  // ── シェア促進ポップアップ (v1.2.1 §12) ──
  // popup-suggestion API のレスポンス（should_show:true 時のみセット）
  type PopupSuggestionData = {
    popup_type: 'first' | 'random' | 'milestone'
    badge_event: 'PROVEN' | 'SPECIALIST' | 'MASTER' | null
    vote: VoiceComment
    suggested_theme: SuggestedTheme
    suggested_phrase_id: number | null
  }
  const [popupSuggestion, setPopupSuggestion] = useState<PopupSuggestionData | null>(null)
  // 「デザインを編集する」で popup から VoiceShareModal に theme を引き継ぐための一時 override
  // （案A: SuggestedTheme を savedThemeData 形式に合成して渡す。VoiceShareModal は無改修）
  const [savedVoiceThemeDataOverride, setSavedVoiceThemeDataOverride] = useState<any>(null)

  // NFC カード管理 state
  const [nfcCard, setNfcCard] = useState<{ id: string; card_uid: string; status: string; linked_at: string | null } | null>(null)
  const [nfcInput, setNfcInput] = useState('')
  const [nfcLoading, setNfcLoading] = useState(false)
  const [nfcError, setNfcError] = useState('')
  const [nfcSuccess, setNfcSuccess] = useState('')
  const [nfcUnlinkedCard, setNfcUnlinkedCard] = useState<string | null>(null) // 解除したカードUID

  // 団体招待 state
  const [pendingInvites, setPendingInvites] = useState<{id: string; organization_id: string; org_name: string; org_type: string; invited_at: string}[]>([])
  const [inviteProcessing, setInviteProcessing] = useState<string | null>(null)
  const [inviteAccepted, setInviteAccepted] = useState<string | null>(null) // 承認完了メッセージ用

  // 所属・認定 state
  const [activeOrgs, setActiveOrgs] = useState<{id: string; member_id: string; org_name: string; org_type: string; logo_url?: string; accepted_at: string}[]>([])
  // leavingOrg removed: 所属・認定はorg_membersベースに変更
  const [credentialBadges, setCredentialBadges] = useState<{id: string; name: string; description: string | null; image_url: string | null; org_name: string; org_id: string}[]>([])

  // 団体オーナー state
  const [ownedOrg, setOwnedOrg] = useState<{id: string; name: string; type: string} | null>(null)

  // メンバー用: 所属団体のリソース state
  const [memberOrgs, setMemberOrgs] = useState<{id: string; name: string; description: string | null; logo_url: string | null}[]>([])
  const [selectedMemberOrgId, setSelectedMemberOrgId] = useState<string | null>(null)
  const [memberResources, setMemberResources] = useState<any[]>([])
  const [memberResourcesLoading, setMemberResourcesLoading] = useState(false)
  const [hasOrgMembership, setHasOrgMembership] = useState(false)
  const [memberAccordionOpen, setMemberAccordionOpen] = useState<Record<string, boolean>>({})

  // 認定申請 state
  const [certApplications, setCertApplications] = useState<{category_slug: string; status: string}[]>([])
  const [certModal, setCertModal] = useState<{slug: string; name: string; count: number} | null>(null)
  const [dismissedCerts, setDismissedCerts] = useState<string[]>([])

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const searchParams = useSearchParams()

  // URLパラメータによるタブ切替
  const tabParam = searchParams.get('tab')
  useEffect(() => {
    if (!tabParam || loading) return
    const validTabs = ['profile', 'proofs', 'rewards', 'voices', 'card', 'myorgs', 'org', 'guide']
    if (validTabs.includes(tabParam)) {
      setDashboardTab(tabParam as any)
      if (tabParam === 'myorgs' && selectedMemberOrgId) {
        loadMemberResources(selectedMemberOrgId)
      }
    }
  }, [tabParam, loading])

  // ハッシュスクロール（バッジクリックからの遷移用）
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash && dashboardTab === 'myorgs') {
      setTimeout(() => {
        const el = document.getElementById(hash)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 300)
    }
  }, [dashboardTab, memberResources])

  // プロフィール編集直接オープン
  const editParam = searchParams.get('edit')
  useEffect(() => {
    if (editParam === 'true' && !loading && pro) {
      setEditing(true)
    }
  }, [editParam, loading, pro])

  useEffect(() => {
    if (!authLoaded) return
    if (!clerkUser) { window.location.href = '/sign-in'; return }

    async function load() {
      const u = { id: clerkUser!.id, email: clerkUser!.primaryEmailAddress?.emailAddress || '' }
      setUser(u)
      setHasEmailIdentity(true)

      try {
        // 専用APIで1リクエスト（サーバー側Promise.all並列 + role判定込み）
        const res = await fetch('/api/dashboard')
        if (!res.ok) {
          console.error('[dashboard] API error:', res.status)
          setLoading(false)
          return
        }
        const data = await res.json()

        // ロールチェック: /api/dashboard のレスポンスから判定
        if (data.role === null) {
          window.location.href = '/onboarding'
          return
        }
        if (data.role === 'client' && tabParam !== 'myorgs') {
          window.location.href = '/mycard'
          return
        }

        // セットアップ未完了のプロは /setup へリダイレクト
        if (data.role === 'professional' && data.setupCompleted === false) {
          window.location.href = '/setup'
          return
        }

        // マスターデータ
        if (data.proofItems) setProofItems(data.proofItems)

        const proData = data.professional
        if (!proData && tabParam !== 'myorgs') {
          setLoading(false)
          return
        }

        if (proData) {
        setPro(proData)
        setFeaturedProofId(proData.featured_proof_id || null)
        setFeaturedVoiceId(proData.featured_vote_id || null)

        // LINE バナー表示判定
        if (proData.line_messaging_user_id) {
          setLineBannerState('hidden')
        } else if (document.cookie.includes('hide_line_banner_permanent=true')) {
          setLineBannerState('hidden')
        } else if (document.cookie.includes('hide_line_banner_dismiss=')) {
          setLineBannerState('hidden')
        } else {
          setLineBannerState('show_banner')
        }

        // プロフィール編集内LINE状態
        setProfileLineState(proData.line_messaging_user_id ? 'linked' : 'unlinked')
        // メール通知状態
        setWeeklyEmailEnabled(!proData.weekly_report_unsubscribed)

        setForm({
          name: proData.name || '',
          last_name: proData.last_name || '',
          first_name: proData.first_name || '',
          store_name: proData.store_name || '',
          title: proData.title || '',
          prefecture: proData.prefecture || '',
          area_description: proData.area_description || '',
          is_online_available: proData.is_online_available || false,
          bio: proData.bio || '', booking_url: proData.booking_url || '',
          photo_url: proData.photo_url || '',
          contact_email: proData.contact_email || '',
        })
        setCustomResultFortes(proData.custom_result_fortes || [])
        setCustomPersonalityFortes(proData.custom_personality_fortes || [])

        // リワード
        if (data.rewards) setRewards(data.rewards)

        // 利用可能な団体リワードを取得
        fetch('/api/professional/available-apps')
          .then(r => r.ok ? r.json() : null)
          .then(appData => {
            if (appData?.availableApps) {
              setAvailableApps(appData.availableApps)
            }
            setAvailableAppsLoaded(true)
          })
          .catch(() => setAvailableAppsLoaded(true))

        // vote_summary: proof_id → ラベル変換
        if (data.voteSummary && data.proofItems) {
          const labeledVotes = resolveProofLabels(data.voteSummary, data.proofItems, proData.custom_proofs || [])
          setVotes(labeledVotes)

          const customVoteCounts = new Map<string, number>()
          for (const v of data.voteSummary) {
            if (typeof v.proof_id === 'string' && v.proof_id.startsWith('custom_')) {
              customVoteCounts.set(v.proof_id, v.vote_count || 0)
            }
          }
          setCustomProofVoteCounts(customVoteCounts)
        }

        // personality_summary
        if (data.personalitySummary && data.personalityItems) {
          const labeledPers = resolvePersonalityLabels(data.personalitySummary, data.personalityItems)
          setPersonalityVotes(labeledPers)

          // アーカイブ集計（is_active=false かつ過去票がある項目）
          const voteCountMap = new Map<string, number>()
          for (const v of data.personalitySummary as Array<{ personality_id: string; vote_count: number }>) {
            voteCountMap.set(v.personality_id, v.vote_count)
          }
          const archived = (data.personalityItems as Array<{
            id: string
            label: string
            personality_label: string | null
            is_active: boolean | null
          }>)
            .filter(item => item.is_active === false)
            .map(item => ({
              label: item.label,
              personality_label: item.personality_label || item.label,
              votes: voteCountMap.get(item.id) || 0,
            }))
            .filter(item => item.votes > 0)
            .sort((a, b) => b.votes - a.votes)
          setArchivedPersonality(archived)
        }

        setTotalVotes(data.totalVotes || 0)
        setBookmarkCount(data.bookmarkCount || 0)
        setFirstTimerCount(data.firstTimerCount || 0)
        setRepeaterCount(data.repeaterCount || 0)
        setRegularCount(data.regularCount || 0)
        // bookmarks removed (now in /mycard only)

        // プルーフ選択状態を復元
        if (data.proofItems) {
          const validIds = new Set(data.proofItems.map((p: ProofItem) => p.id))
          const customIds = new Set((proData.custom_proofs || []).map((c: CustomProof) => c.id))
          const savedProofs: string[] = proData.selected_proofs || []
          setSelectedProofIds(new Set(savedProofs.filter((id: string) => validIds.has(id) || customIds.has(id))))
          setCustomProofs(proData.custom_proofs || [])
        }

        // Voice カードテーマ
        setSavedVoiceThemeData(proData.voice_card_theme || null)

        // Voices
        if (data.voiceComments) setVoiceComments(data.voiceComments)
        if (data.gratitudePhrases) setVoicePhrases(data.gratitudePhrases)

        // NFCカード
        if (data.nfcCard) setNfcCard(data.nfcCard)

        } // end if (proData)

        // 団体関連（proData不要）
        if (data.pendingInvites) setPendingInvites(data.pendingInvites)
        if (data.activeOrgs) setActiveOrgs(data.activeOrgs)
        if (data.credentialBadges) setCredentialBadges(data.credentialBadges)
        if (data.ownedOrg) setOwnedOrg(data.ownedOrg)

        // メンバー用: 所属団体一覧を取得
        try {
          const orgsRes = await fetch('/api/my/organizations')
          if (orgsRes.ok) {
            const orgsData = await orgsRes.json()
            if (Array.isArray(orgsData) && orgsData.length > 0) {
              setMemberOrgs(orgsData)
              setHasOrgMembership(true)
              setSelectedMemberOrgId(orgsData[0].id)
              if (tabParam === 'myorgs') loadMemberResources(orgsData[0].id)
            }
          }
        } catch (err) {
          console.error('[dashboard] member orgs load error:', err)
        }

        // myProofQrToken removed (now in /mycard only)
        if (data.certApplications) setCertApplications(data.certApplications)
        // receivedRewards removed (now in /mycard only)
      } catch (err) {
        console.error('[dashboard] load error:', err)
      }

      setLoading(false)
    }
    load()
  }, [authLoaded, clerkUser])

  // ────────────────────────────────────────
  // シェア促進ポップアップ: ダッシュボード読み込み時に1回 fetch
  // 依存は pro?.id（プリミティブ）のみ。pro オブジェクトを依存に入れない
  // ────────────────────────────────────────
  useEffect(() => {
    const proId = pro?.id
    if (!proId) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/dashboard/popup-suggestion')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data && data.should_show === true) {
          setPopupSuggestion({
            popup_type: data.popup_type,
            badge_event: data.badge_event ?? null,
            vote: data.vote,
            suggested_theme: data.suggested_theme,
            suggested_phrase_id: data.suggested_phrase_id ?? null,
          })
        }
      } catch {
        // popup は optional UX。失敗しても何もしない
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pro?.id])

  // VoiceShareModal が閉じられたら override をクリア
  // （依存はプリミティブ shareModalVoice?.id のみ）
  const shareModalVoiceId = shareModalVoice?.id ?? null
  useEffect(() => {
    if (shareModalVoiceId === null && savedVoiceThemeDataOverride !== null) {
      setSavedVoiceThemeDataOverride(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareModalVoiceId])

  // ────────────────────────────────────────
  // ポップアップ 3 アクションのハンドラ
  // ────────────────────────────────────────

  // [シェアする] 成功時: popup-action(shared) は VoiceSuggestionPopup 内部で
  // POST 済み。ここでは popup state を閉じるのみ（連続表示は当面単発運用）。
  const handlePopupShare = () => {
    setPopupSuggestion(null)
  }

  // [デザインを編集する]: popup-action(edited) を POST してから popup を閉じ、
  // 既存 VoiceShareModal を popup の Voice + テーマ + フレーズで開く（案A）。
  //
  // 注意: VoiceShareModal は Voicesタブ条件下にのみレンダリングされる既存制約があるため、
  // 本ハンドラの最初で必ず dashboardTab を 'voices' に切り替える必要がある。
  // popup の z-index が高くタブ UI を直接タップできないため、ここで自動切替する。
  const handlePopupEdit = async () => {
    if (!popupSuggestion || !pro) return
    // ★ Voicesタブに切替（VoiceShareModal レンダリングのため必須）
    setDashboardTab('voices')

    const current = popupSuggestion

    // popup-action(edited) ─ 失敗してもユーザー体験を阻害しない
    try {
      await fetch('/api/dashboard/popup-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vote_id: current.vote.id,
          popup_type: current.popup_type,
          badge_event: current.badge_event,
          user_action: 'edited',
        }),
      })
    } catch {}

    // 案A: SuggestedTheme を savedThemeData 形式に合成
    let synthetic: any = null
    if (current.suggested_theme.type === 'preset' && current.suggested_theme.preset) {
      synthetic = {
        type: 'preset',
        preset: current.suggested_theme.preset,
        showProof: true,
        showProInfo: true,
      }
    } else if (current.suggested_theme.type === 'custom' && current.suggested_theme.custom) {
      synthetic = {
        type: 'custom',
        bg: current.suggested_theme.custom.bg,
        text: current.suggested_theme.custom.text,
        accent: current.suggested_theme.custom.accent,
        showProof: current.suggested_theme.custom.showProof,
        showProInfo: current.suggested_theme.custom.showProInfo,
      }
    }

    // popup の suggested_phrase_id を VoiceShareModal にも引き継ぐ
    // （selectedPhrases[vote.id] 経由で phraseId prop に流れる）
    if (current.suggested_phrase_id != null) {
      const phraseId = current.suggested_phrase_id
      setSelectedPhrases(prev => ({ ...prev, [current.vote.id]: phraseId }))
    }

    // popup を閉じて VoiceShareModal を開く
    setSavedVoiceThemeDataOverride(synthetic)
    setShareModalVoice({
      id: current.vote.id,
      comment: current.vote.comment,
      created_at: current.vote.created_at,
    })
    setPopupSuggestion(null)
  }

  // [後で] / ESC / 背景タップ: popup-action(dismissed) を POST して popup を閉じる
  const handlePopupDismiss = async () => {
    const current = popupSuggestion
    if (!current) return

    try {
      await fetch('/api/dashboard/popup-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vote_id: current.vote.id,
          popup_type: current.popup_type,
          badge_event: current.badge_event,
          user_action: 'dismissed',
        }),
      })
    } catch {}

    setPopupSuggestion(null)
  }

  // メンバー用: 所属団体のリソース取得
  async function loadMemberResources(orgId: string) {
    setMemberResourcesLoading(true)
    try {
      const res = await fetch(`/api/my/organizations/${orgId}/resources`)
      if (res.ok) {
        const data = await res.json()
        setMemberResources(data)
        // 全アコーディオンをデフォルト開く
        const openState: Record<string, boolean> = {}
        const keys = new Set<string>()
        for (const r of data) {
          keys.add(r.credential_level_id || '__all__')
        }
        keys.forEach(k => { openState[k] = true })
        setMemberAccordionOpen(openState)
      } else {
        setMemberResources([])
      }
    } catch (err) {
      console.error('[dashboard] member resources load error:', err)
      setMemberResources([])
    } finally {
      setMemberResourcesLoading(false)
    }
  }

  // メンバー用: リソースをバッジ別グループに変換
  function getMemberResourceGroups() {
    const grouped = new Map<string, any[]>()
    for (const r of memberResources) {
      const key = r.credential_level_id || '__all__'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }
    const groups: { key: string; badgeName: string; resources: any[] }[] = []
    // 「全メンバー向け」を先頭
    if (grouped.has('__all__')) {
      groups.push({ key: '__all__', badgeName: '全メンバー向け', resources: grouped.get('__all__')! })
    }
    grouped.forEach((resources, key) => {
      if (key !== '__all__') {
        const badgeName = resources[0]?.credential_level_name || 'バッジ'
        groups.push({ key, badgeName: `${badgeName} 専用`, resources })
      }
    })
    return groups
  }

  function handleMyOrgsTab() {
    setDashboardTab('myorgs')
    if (selectedMemberOrgId) {
      loadMemberResources(selectedMemberOrgId)
    }
  }

  function handleMemberOrgChange(orgId: string) {
    setSelectedMemberOrgId(orgId)
    loadMemberResources(orgId)
  }

  function addCustomForte(type: 'result' | 'personality') {
    const prefix = type === 'result' ? 'cr_' : 'cp_'
    const newForte: CustomForte = { id: `${prefix}${Date.now()}`, label: '', description: '' }
    if (type === 'result') {
      if (customResultFortes.length >= 3) return
      setCustomResultFortes([...customResultFortes, newForte])
    } else {
      if (customPersonalityFortes.length >= 3) return
      setCustomPersonalityFortes([...customPersonalityFortes, newForte])
    }
  }

  function updateCustomForte(type: 'result' | 'personality', idx: number, field: 'label' | 'description', value: string) {
    if (type === 'result') {
      const updated = [...customResultFortes]
      updated[idx] = { ...updated[idx], [field]: value }
      setCustomResultFortes(updated)
    } else {
      const updated = [...customPersonalityFortes]
      updated[idx] = { ...updated[idx], [field]: value }
      setCustomPersonalityFortes(updated)
    }
  }

  function removeCustomForte(type: 'result' | 'personality', idx: number) {
    if (type === 'result') {
      setCustomResultFortes(customResultFortes.filter((_, i) => i !== idx))
    } else {
      setCustomPersonalityFortes(customPersonalityFortes.filter((_, i) => i !== idx))
    }
  }

  function dismissLineBanner() {
    // カウント取得
    const countMatch = document.cookie.match(/hide_line_banner_count=(\d+)/)
    const count = countMatch ? parseInt(countMatch[1], 10) + 1 : 1
    // カウント更新（無期限）
    document.cookie = `hide_line_banner_count=${count}; path=/; max-age=31536000`
    // 7日間非表示
    document.cookie = 'hide_line_banner_dismiss=1; path=/; max-age=604800'
    // 2回以上なら永久非表示
    if (count >= 2) {
      document.cookie = 'hide_line_banner_permanent=true; path=/; max-age=31536000'
    }
    setLineBannerState('hidden')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    setBookingUrlError('')
    if (!user) { setSaving(false); return }

    // Phase 2: 予約・連絡先 URL バリデーション (空 OK / http(s):// 必須 / URL parse)
    const bookingValidation = validateBookingUrl(form.booking_url || '')
    if (!bookingValidation.valid) {
      setBookingUrlError(bookingValidation.error)
      setSaving(false)
      return
    }

    const urlPattern = /https?:\/\/|www\./i
    if (!form.last_name.trim() || !form.first_name.trim()) {
      setFormError('姓と名を入力してください')
      setSaving(false)
      return
    }
    if (form.last_name.trim().length > 20 || form.first_name.trim().length > 20) {
      setFormError('姓名は各20文字以内で入力してください')
      setSaving(false)
      return
    }
    if (urlPattern.test(form.last_name) || urlPattern.test(form.first_name)) {
      setFormError('名前にURLを含めることはできません')
      setSaving(false)
      return
    }
    if (form.store_name.trim().length > 50) {
      setFormError('店舗名は50文字以内で入力してください')
      setSaving(false)
      return
    }
    if (urlPattern.test(form.contact_email)) {
      setFormError('正しいメールアドレスを入力してください')
      setSaving(false)
      return
    }

    // パスワードはClerkで管理

    const validResultFortes = customResultFortes.filter(f => f.label.trim())
    const validPersonalityFortes = customPersonalityFortes.filter(f => f.label.trim())

    const record: any = {
      user_id: user.id,
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      store_name: form.store_name.trim() || null,
      name: `${form.last_name.trim()} ${form.first_name.trim()}`,
      title: form.title,
      prefecture: form.prefecture || null,
      area_description: form.area_description || null,
      is_online_available: form.is_online_available,
      bio: form.bio || null, booking_url: form.booking_url || null,
      contact_email: form.contact_email || null,
      photo_url: form.photo_url || null,
      custom_result_fortes: validResultFortes,
      custom_personality_fortes: validPersonalityFortes,
    }

    const isNew = !pro

    const upsertRecord = pro ? { ...record, id: pro.id } : record
    console.log('[handleSave] user.id:', user.id)
    console.log('[handleSave] pro:', pro)
    console.log('[handleSave] upsertRecord:', JSON.stringify(upsertRecord))
    const { data: savedData, error: saveError } = await db.upsert(
      'professionals', upsertRecord, { onConflict: 'user_id' },
      { select: '*', maybeSingle: true }
    )

    if (saveError) {
      console.error('[handleSave] upsert pro error:', saveError.message, 'code:', (saveError as any).code, 'details:', (saveError as any).details)
      setFormError('プロフィールの保存に失敗しました。もう一度お試しください。')
      setSaving(false)
      return
    }

    let professionalId = pro?.id
    if (savedData) {
      setPro(savedData)
      professionalId = savedData.id
      if (isNew) console.log('[handleSave] new pro created, id:', savedData.id)
    }

    // パスワードはClerkで管理するため、ここでは何もしない

    // === clients テーブルへの同期（プロ側をマスターとする） ===
    const syncData: Record<string, any> = {
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      nickname: `${form.last_name.trim()} ${form.first_name.trim()}`,
    }
    if (form.photo_url) {
      syncData.photo_url = form.photo_url
    }
    db.update('clients', syncData, { user_id: user.id })
      .then(({ error: syncError }) => {
        if (syncError) {
          console.error('Client sync error (non-fatal):', syncError.message)
        }
      })

    setSaving(false)
    setEditing(false)
  }

  async function generateQR() {
    if (!pro) return
    // 既存トークンを削除
    await db.delete('qr_tokens', { professional_id: pro.id })
    const token = crypto.randomUUID()
    const expiresAt = calcQrTokenExpiry()
    await db.insert('qr_tokens', { professional_id: pro.id, token, expires_at: expiresAt })
    const voteUrl = `${window.location.origin}/vote/${pro.id}?token=${token}&channel=dashboard`
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(voteUrl)}`)
  }

  // NFC カード登録
  async function linkNfcCard() {
    if (!pro) return
    const cardUid = nfcInput.trim().toUpperCase()
    if (!cardUid) { setNfcError('カードIDを入力してください。'); return }

    setNfcLoading(true)
    setNfcError('')
    setNfcSuccess('')

    try {
      // 1. card_uid が存在し、unlinked 状態であることを確認
      const { data: card } = await db.select('nfc_cards', {
        select: 'id, status, user_id, professional_id', eq: { card_uid: cardUid }, maybeSingle: true
      })

      if (!card) { setNfcError('カードIDが見つかりません。カード裏面に印字されたIDを確認してください。'); setNfcLoading(false); return }
      if (card.status !== 'unlinked' && (card.user_id || card.professional_id)) { setNfcError('このカードは既に使用されています。'); setNfcLoading(false); return }

      // 2. 既存のアクティブカードがないことを確認（user_idベース）
      const { data: existing } = await db.select('nfc_cards', {
        select: 'id, card_uid', eq: { user_id: user!.id, status: 'active' }, maybeSingle: true
      })

      if (existing) { setNfcError(`既にカード（${existing.card_uid}）が登録されています。先に紐付けを解除してください。`); setNfcLoading(false); return }

      // 3. カードをアクティブ化（user_id + professional_id 両方セット）
      const { error } = await db.update('nfc_cards', {
        user_id: user!.id,
        professional_id: pro.id,
        status: 'active',
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { id: card.id })

      if (error) { setNfcError('カードの登録に失敗しました。'); setNfcLoading(false); return }

      // 成功 → state更新
      setNfcCard({ id: card.id, card_uid: cardUid, status: 'active', linked_at: new Date().toISOString() })
      setNfcInput('')
      setNfcSuccess('カードが登録されました ✓')
      setNfcUnlinkedCard(null)
      setTimeout(() => setNfcSuccess(''), 3000)
    } catch {
      setNfcError('エラーが発生しました。')
    }
    setNfcLoading(false)
  }

  // NFC カード紐付け解除
  async function unlinkNfcCard() {
    if (!pro || !nfcCard) return
    setNfcLoading(true)
    setNfcError('')

    try {
      const { error } = await db.update('nfc_cards', {
        professional_id: null,
        user_id: null,
        status: 'unlinked',
        updated_at: new Date().toISOString(),
      }, { user_id: user!.id, status: 'active' })

      if (error) { setNfcError('解除に失敗しました。'); setNfcLoading(false); return }

      setNfcUnlinkedCard(nfcCard.card_uid)
      setNfcCard(null)
    } catch {
      setNfcError('エラーが発生しました。')
    }
    setNfcLoading(false)
  }

  // 登録日数を計算
  function getDaysSinceRegistration(): number {
    if (!pro?.created_at) return 0
    const created = new Date(pro.created_at)
    const now = new Date()
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  }

  async function handleDeregister() {
    if (!pro || !user) return
    setDeregistering(true)
    try {
      // FK制約のある関連テーブルを先に削除
      const tables = ['voice_shares', 'client_rewards', 'bookmarks', 'votes'] as const
      for (const t of tables) {
        const { error } = await db.delete(t, { professional_id: pro.id })
        if (error) throw new Error(`${t}: ${error.message}`)
      }
      const { error } = await db.delete('professionals', { id: pro.id })
      if (error) throw new Error(`professionals: ${error.message}`)
      window.location.href = '/mycard'
    } catch (e: any) {
      console.error('[handleDeregister] error:', e.message)
      alert('解除に失敗しました')
      setDeregistering(false)
    }
  }

  // 団体招待の承認/拒否（APIルート経由）
  async function handleAcceptInvite(memberId: string, orgId: string) {
    setInviteProcessing(memberId)
    try {
      const res = await fetch('/api/org-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          action: 'accept',
          userId: user?.id,
          userEmail: user?.email,
          orgId,
        }),
      })

      if (res.ok) {
        const accepted = pendingInvites.find(i => i.id === memberId)
        setPendingInvites(prev => prev.filter(i => i.id !== memberId))

        if (accepted) {
          setActiveOrgs(prev => [...prev, {
            id: accepted.organization_id,
            member_id: memberId,
            org_name: accepted.org_name,
            org_type: accepted.org_type,
            accepted_at: new Date().toISOString(),
          }])

          const confirmLabels: Record<string, string> = {
            store: '所属が確認されました',
            credential: '認定が付与されました',
            education: '修了が認定されました',
          }
          setInviteAccepted(confirmLabels[accepted.org_type] || '承認されました')
          setTimeout(() => setInviteAccepted(null), 3000)
        }
      } else {
        const data = await res.json()
        console.error('[handleAcceptInvite] API error:', data.error)
      }
    } catch (err) {
      console.error('[handleAcceptInvite] fetch error:', err)
    }
    setInviteProcessing(null)
  }

  async function handleDeclineInvite(memberId: string) {
    setInviteProcessing(memberId)
    try {
      const res = await fetch('/api/org-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          action: 'decline',
          userId: user?.id,
        }),
      })

      if (res.ok) {
        setPendingInvites(prev => prev.filter(i => i.id !== memberId))
      } else {
        const data = await res.json()
        console.error('[handleDeclineInvite] API error:', data.error)
      }
    } catch (err) {
      console.error('[handleDeclineInvite] fetch error:', err)
    }
    setInviteProcessing(null)
  }

  // 団体離脱は削除: 所属・認定はorg_membersベースに変更

  // プルーフ選択ロジック
  const totalSelected = selectedProofIds.size
  const isMaxSelected = totalSelected >= 9
  const isExactNine = totalSelected === 9
  const remaining = 9 - totalSelected

  function toggleProofId(id: string) {
    setSelectedProofIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (totalSelected >= 9) return prev
        next.add(id)
      }
      return next
    })
  }

  function addCustomProof() {
    if (customProofs.length >= 3 || isMaxSelected) return
    setCustomProofs([...customProofs, { id: `custom_${Date.now()}`, label: '' }])
  }

  function updateCustomProofLabel(idx: number, label: string) {
    const updated = [...customProofs]
    updated[idx] = { ...updated[idx], label }
    setCustomProofs(updated)
  }

  // removeCustomProof は deleteCustomProof に統合済み

  async function handleSaveProofs() {
    if (!pro) return
    setProofSaving(true)
    setProofError('')

    const filteredCustom = customProofs.filter(c => c.label.trim())

    // selectedProofIds には regular + custom 両方の ID が含まれる
    const { error } = await db.update('professionals', {
      selected_proofs: Array.from(selectedProofIds),
      custom_proofs: filteredCustom,
    }, { id: pro.id })

    if (error) {
      setProofError('保存に失敗しました。もう一度お試しください。')
      console.error('[handleSaveProofs] error:', error.message)
    } else {
      setProofSaved(true)
      setTimeout(() => setProofSaved(false), 2500)
    }
    setProofSaving(false)
  }

  async function handleSaveRewards() {
    if (!pro) return
    setRewardSaving(true)
    setRewardError('')

    // ① バリデーション（DELETE前に実行！）
    const fntWithoutApp = rewards.find(r => r.reward_type === 'fnt_neuro_app' && !r.content.trim())
    if (fntWithoutApp) {
      setRewardError('FNT神経科学リワードを選択してください。')
      setRewardSaving(false)
      return
    }

    // ② 有効なリワードを事前に準備（org_appはurl必須、content任意）
    const validRewards = rewards.filter(r => {
      if (r.reward_type === 'org_app') return r.url?.trim()
      return r.reward_type && r.content.trim()
    })

    // ③ 空contentのリワードがある場合に警告（データ消失防止）
    const emptyRewards = rewards.filter(r => r.reward_type && !r.content.trim())
    if (emptyRewards.length > 0 && validRewards.length === 0) {
      setRewardError('リワードの内容を入力してください。')
      setRewardSaving(false)
      return
    }

    // ④ 既存リワードを削除
    const { error: delError } = await db.delete('rewards', { professional_id: pro.id })
    if (delError) {
      console.error('[handleSaveRewards] delete error:', delError.message)
      setRewardError('保存に失敗しました。もう一度お試しください。')
      setRewardSaving(false)
      return
    }

    // ⑤ 有効なリワードをINSERT
    if (validRewards.length > 0) {
      const { error: insertError } = await db.insert('rewards',
        validRewards.map((r, idx) => ({
          professional_id: pro.id,
          reward_type: r.reward_type,
          title: r.title.trim() || '',
          content: r.content.trim(),
          url: r.reward_type === 'org_app' ? (r.url || null) : null,
          sort_order: idx,
        }))
      )
      if (insertError) {
        console.error('[handleSaveRewards] insert error:', insertError.message)
        setRewardError('保存に失敗しました。もう一度お試しください。')
        setRewardSaving(false)
        return
      }
    }

    setRewardSaved(true)
    setTimeout(() => setRewardSaved(false), 2500)
    setRewardSaving(false)
  }

  // カテゴリごとの選択数を算出
  function getCategorySelectedCount(tab: string): number {
    return proofItems.filter(p => p.tab === tab && selectedProofIds.has(p.id)).length
  }

  // カスタムプルーフのチェックボックスON/OFF
  function toggleCustomProofSelection(id: string) {
    setSelectedProofIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (totalSelected >= 9) return prev
        next.add(id)
      }
      return next
    })
  }

  // カスタムプルーフ削除（投票データクリーンアップ含む）
  async function deleteCustomProof(idx: number) {
    const cp = customProofs[idx]
    if (!cp || !pro) return

    const voteCount = customProofVoteCounts.get(cp.id) || 0

    if (voteCount > 0) {
      const confirmed = confirm(
        `この項目には${voteCount}票の投票があります。削除すると投票データからもこの項目が除去されます。本当に削除しますか？`
      )
      if (!confirmed) return
    }

    // votes テーブルから該当 proof_id を除去（常に実行）
    const { data: affectedVotes } = await db.select('votes', {
      select: 'id, selected_proof_ids',
      eq: { professional_id: pro.id },
      contains: { selected_proof_ids: [cp.id] }
    })

    if (affectedVotes && affectedVotes.length > 0) {
      for (const vote of affectedVotes) {
        const updatedIds = (vote.selected_proof_ids || []).filter((id: string) => id !== cp.id)
        const { error: voteError } = await db.update('votes',
          { selected_proof_ids: updatedIds }, { id: vote.id }
        )
        if (voteError) console.error('votes update error:', voteError)
      }
    }

    // ローカルの票数マップからも削除
    setCustomProofVoteCounts(prev => {
      const next = new Map(prev)
      next.delete(cp.id)
      return next
    })

    // selectedProofIds からも除去
    setSelectedProofIds(prev => {
      const next = new Set(prev)
      next.delete(cp.id)
      return next
    })

    // customProofs 配列から除去
    const updatedCustomProofs = customProofs.filter((_, i) => i !== idx)
    const updatedSelectedIds = Array.from(selectedProofIds).filter(id => id !== cp.id)
    setCustomProofs(updatedCustomProofs)

    // professionals テーブルに即座に永続化
    const { error } = await db.update('professionals', {
      custom_proofs: updatedCustomProofs.filter(c => c.label.trim()),
      selected_proofs: updatedSelectedIds,
    }, { id: pro.id })

    if (error) {
      alert('削除の保存に失敗しました。もう一度お試しください。')
      console.error(error)
      return
    }
  }

  // クロッパー確定後：トリミング済み画像をSupabase Storageにアップロード
  async function handleCropComplete(croppedBlob: Blob) {
    setCropImageSrc(null)
    if (!user) return
    setUploading(true)
    try {
      const file = new File([croppedBlob], `profile-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const path = `${user.id}/avatar.jpg`
      const result = await uploadFile('avatars', path, file, { upsert: true })
      if (result.publicUrl) {
        setForm(prev => ({...prev, photo_url: result.publicUrl + '?t=' + Date.now()}))
      } else {
        console.error('Upload error:', result.error)
        alert('アップロードに失敗しました')
      }
    } catch (e) {
      console.error('Upload error:', e)
      alert('アップロードに失敗しました')
    }
    setUploading(false)
  }

  // プロ登録解除 → /mycard にリダイレクト
  async function handleDeactivate() {
    setDeactivating(true)
    try {
      const res = await fetch('/api/professional/deactivate', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '解除に失敗しました')
        setDeactivating(false)
        return
      }
      setShowDeactivateModal(false)
      window.location.href = '/mycard'
    } catch (e) {
      console.error('[handleDeactivate] error:', e)
      alert('解除に失敗しました')
      setDeactivating(false)
    }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* プロフィールスケルトン */}
      <div className="flex items-center space-x-4 mb-8">
        <div className="w-20 h-20 bg-gray-200 rounded-full animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
          <div className="h-3 bg-gray-100 rounded w-2/3 animate-pulse" />
        </div>
      </div>
      {/* タブスケルトン */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-4 w-16 bg-gray-200 rounded animate-pulse mb-3" />
        ))}
      </div>
      {/* カードスケルトン */}
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-full bg-gray-100 rounded mb-3" />
            <div className="h-4 w-2/3 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )

  if (editing) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">
          {pro ? 'プロフィール編集' : 'プロフィール作成'}
        </h1>
        <form onSubmit={handleSave} className="space-y-4">
          {/* プロフ写真 */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {form.photo_url ? (
                <img src={form.photo_url} alt="" loading="lazy" className={`w-24 h-24 rounded-full object-cover mb-2 ${uploading ? 'opacity-40' : ''}`} />
              ) : (
                <div className={`w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm mb-2 ${uploading ? 'opacity-40' : ''}`}>写真</div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center mb-2">
                  <div className="w-8 h-8 border-3 border-[#C4A35A] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <label className={`text-sm text-[#C4A35A] hover:underline ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
              {uploading ? 'アップロード中...' : '写真を変更'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 5 * 1024 * 1024) {
                  alert('画像サイズは5MB以下にしてください')
                  return
                }
                if (!file.type.startsWith('image/')) {
                  alert('画像ファイルを選択してください')
                  return
                }
                const reader = new FileReader()
                reader.onload = () => setCropImageSrc(reader.result as string)
                reader.readAsDataURL(file)
                e.target.value = ''
              }} />
            </label>
          </div>

          {/* 登録メールアドレス（読み取り専用） */}
          {user?.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">登録メールアドレス</label>
              {user.email.startsWith('line_') && user.email.endsWith('@line.realproof.jp') ? (
                <p className="px-4 py-2 text-sm text-green-600 font-medium">LINE連携済み</p>
              ) : (
                <input value={user.email} readOnly disabled
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed truncate" />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓 *（20文字以内）</label>
              <input required maxLength={20} value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})}
                placeholder="山田"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名 *（20文字以内）</label>
              <input required maxLength={20} value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})}
                placeholder="太郎"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">店舗名・所属（50文字以内）</label>
            <input maxLength={50} value={form.store_name} onChange={e => setForm({...form, store_name: e.target.value})}
              placeholder="〇〇整体院 / フリーランス"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">肩書き</label>
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
              placeholder="パーソナルトレーナー / 整体師 など" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">都道府県 *</label>
            <select required value={form.prefecture} onChange={e => setForm({...form, prefecture: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none">
              <option value="">選択してください</option>
              {PREFECTURES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">活動エリア</label>
            <input value={form.area_description} onChange={e => setForm({...form, area_description: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
              placeholder="渋谷・恵比寿エリア / 出張対応：関東全域 など" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_online_available}
              onChange={e => setForm({...form, is_online_available: e.target.checked})}
              className="w-4 h-4 rounded border-gray-300 text-[#C4A35A] focus:ring-[#C4A35A]" />
            <label className="text-sm font-medium text-gray-700">オンライン対応可</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">自己紹介</label>
            <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              予約・連絡先URL
              <span className="text-xs font-normal text-gray-400 ml-2">(任意)</span>
            </label>
            <p className="text-xs text-gray-500 mb-2 leading-relaxed">
              応援してくれたお客さんが、次にあなたへ連絡する手段です。
              <br />
              公式LINE・予約サイト・お問い合わせフォームなど、なんでもOK。
            </p>
            <input
              type="url"
              value={form.booking_url}
              onChange={e => {
                setForm({ ...form, booking_url: e.target.value })
                if (bookingUrlError) setBookingUrlError('')
              }}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none ${bookingUrlError ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="https://lin.ee/example または https://example.com"
            />
            {bookingUrlError && (
              <p className="text-red-500 text-xs mt-1">{bookingUrlError}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">連絡先メールアドレス</label>
            <input type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" placeholder="you@example.com" />
            <p className="text-xs text-gray-400 mt-1">カードページに「このプロに相談する」ボタンが表示されます（ログインメールとは別に設定できます）</p>
          </div>
          {/* パスワードはClerkで管理 */}

          {/* ── 通知設定 ── */}
          {pro && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">通知設定</h3>

              {/* LINE通知設定 */}
              <div className="bg-gray-50 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">LINE通知</span>
                  {profileLineState === 'linked' ? (
                    <span className="text-xs text-green-600 font-medium">✓ 連携済み</span>
                  ) : (
                    <span className="text-xs text-gray-400">未連携</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-2">毎週月曜に週次レポートをLINEでお届けします</p>

                {profileLineState === 'unlinked' && process.env.NEXT_PUBLIC_LINE_FRIEND_URL && (
                  <button
                    type="button"
                    onClick={async () => {
                      setProfileCodeLoading(true)
                      // iOS Safari: window.openをawait前に呼ばないとポップアップブロックされる
                      window.open(process.env.NEXT_PUBLIC_LINE_FRIEND_URL, '_blank')
                      try {
                        const res = await fetch('/api/line/link/generate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ professionalId: pro.id }),
                        })
                        const data = await res.json()
                        if (data.code) {
                          setProfileLineState('code_input')
                        }
                      } catch (err) {
                        console.error('[profile-line] Generate error:', err)
                      } finally {
                        setProfileCodeLoading(false)
                      }
                    }}
                    disabled={profileCodeLoading}
                    className="text-sm font-medium text-white px-4 py-2 rounded-md"
                    style={{ background: '#06C755', opacity: profileCodeLoading ? 0.6 : 1 }}
                  >
                    {profileCodeLoading ? '処理中...' : 'LINEで受け取る'}
                  </button>
                )}

                {profileLineState === 'code_input' && (
                  <div>
                    <p className="text-xs text-gray-600 mb-2">LINEに届いた4桁コードを入力</p>
                    <div className="flex items-center gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <input
                          key={i}
                          id={`profile-code-${i}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={profileCodeInput[i]}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '')
                            const next = [...profileCodeInput]
                            next[i] = val
                            setProfileCodeInput(next)
                            setProfileCodeError('')
                            if (val && i < 3) document.getElementById(`profile-code-${i + 1}`)?.focus()
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace' && !profileCodeInput[i] && i > 0)
                              document.getElementById(`profile-code-${i - 1}`)?.focus()
                          }}
                          className="w-10 h-12 text-center text-lg font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
                        />
                      ))}
                      <button
                        type="button"
                        onClick={async () => {
                          const code = profileCodeInput.join('')
                          if (code.length !== 4) { setProfileCodeError('4桁入力してください'); return }
                          setProfileCodeLoading(true)
                          setProfileCodeError('')
                          try {
                            const res = await fetch('/api/line/link/verify', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ professionalId: pro.id, code }),
                            })
                            const result = await res.json()
                            if (result.success) {
                              setProfileLineState('linked')
                              setLineBannerState('hidden')
                            } else if (result.error === 'not_yet_added') {
                              setProfileCodeError('「コード再発行」を押してください。LINEに新しいコードが届きます。')
                            } else if (result.error === 'expired') {
                              setProfileCodeError('期限切れ。再発行してください')
                            } else {
                              setProfileCodeError('コードが正しくありません')
                            }
                          } catch { setProfileCodeError('エラーが発生しました') }
                          finally { setProfileCodeLoading(false) }
                        }}
                        disabled={profileCodeLoading}
                        className="text-sm font-medium text-white px-3 py-2 rounded-md"
                        style={{ background: '#06C755', opacity: profileCodeLoading ? 0.6 : 1 }}
                      >
                        確認
                      </button>
                    </div>
                    {profileCodeError && <p className="text-red-500 text-xs mt-1">{profileCodeError}</p>}
                    <button
                      type="button"
                      onClick={async () => {
                        setProfileCodeLoading(true)
                        setProfileCodeInput(['', '', '', ''])
                        setProfileCodeError('')
                        try {
                          const res = await fetch('/api/line/link/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ professionalId: pro.id }),
                          })
                          const data = await res.json()
                          if (data.pushed) {
                            setProfileCodeError('✅ LINEに新しいコードを送信しました')
                          } else if (data.code) {
                            setProfileCodeError('LINE公式アカウントにメッセージを送ってください')
                          }
                        } catch {}
                        finally { setProfileCodeLoading(false) }
                      }}
                      className="text-xs text-gray-400 underline mt-2"
                    >
                      コード再発行
                    </button>
                  </div>
                )}

                {profileLineState === 'linked' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('LINE連携を解除しますか？週次レポートがメールに切り替わります。')) return
                      await db.update('professionals', { line_messaging_user_id: null }, { id: pro.id })
                      setProfileLineState('unlinked')
                    }}
                    className="text-xs text-gray-400 underline"
                  >
                    連携を解除
                  </button>
                )}
              </div>

              {/* メール通知設定 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">メール週次レポート</span>
                    <p className="text-xs text-gray-400">LINE未連携の場合、メールでレポートを配信</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setEmailToggleSaving(true)
                      const newVal = !weeklyEmailEnabled
                      try {
                        await db.update('professionals', { weekly_report_unsubscribed: !newVal }, { id: pro.id })
                        setWeeklyEmailEnabled(newVal)
                      } catch (err) {
                        console.error('[email-toggle] error:', err)
                      } finally {
                        setEmailToggleSaving(false)
                      }
                    }}
                    disabled={emailToggleSaving}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    style={{ background: weeklyEmailEnabled ? '#06C755' : '#D1D5DB', opacity: emailToggleSaving ? 0.5 : 1 }}
                  >
                    <span
                      className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
                      style={{ transform: weeklyEmailEnabled ? 'translateX(24px)' : 'translateX(4px)' }}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {formError && <p className="text-red-500 text-sm">{formError}</p>}
          <button type="submit" disabled={uploading || saving}
            className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span className="animate-spin" style={{
                  width: 16, height: 16,
                  border: '2px solid #fff', borderTopColor: 'transparent',
                  borderRadius: '50%', display: 'inline-block'
                }} />
                保存中...
              </span>
            ) : '保存する'}
          </button>
        </form>

        {/* プロ登録解除リンク */}
        {pro && !pro.deactivated_at && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={() => setShowDeactivateModal(true)}
              className="text-red-500 text-sm hover:text-red-700 underline"
            >
              プロ登録を解除する
            </button>
          </div>
        )}

        {/* 解除確認モーダル */}
        {showDeactivateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-4">プロ登録を解除しますか？</h3>
              <ul className="text-sm text-gray-600 space-y-2 mb-6">
                <li>・あなたのプロフィールページは非公開になります</li>
                <li>・集めたプルーフデータは保持されます</li>
                <li>・再度プロとして登録することで復活できます</li>
              </ul>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowDeactivateModal(false)}
                  className="px-4 py-2 text-sm border rounded">
                  キャンセル
                </button>
                <button onClick={handleDeactivate} disabled={deactivating}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50">
                  {deactivating ? '解除中...' : '解除する'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* プロフィール写真クロッパー */}
        {cropImageSrc && (
          <ImageCropper
            imageSrc={cropImageSrc}
            onCropComplete={handleCropComplete}
            onCancel={() => setCropImageSrc(null)}
            cropShape="round"
            aspectRatio={1}
          />
        )}
      </div>
    )
  }

  const topForte = votes.length > 0 ?
    getResultForteLabel(votes.sort((a,b) => b.vote_count - a.vote_count)[0]?.category, pro) : '-'

  const daysSinceRegistration = getDaysSinceRegistration()

  const isSettingsTab = ['proofs', 'rewards', 'card', 'myorgs', 'org', 'guide'].includes(dashboardTab)

  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* LINE 週次レポートバナー */}
      {!isSettingsTab && lineBannerState === 'show_banner' && process.env.NEXT_PUBLIC_LINE_FRIEND_URL && (
        <div style={{
          background: '#1A1A2E',
          border: '0.5px solid rgba(196,163,90,0.3)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 16,
          position: 'relative',
        }}>
          <button
            onClick={dismissLineBanner}
            style={{
              position: 'absolute', top: 12, right: 14,
              background: 'none', border: 'none',
              color: 'rgba(250,250,247,0.3)', fontSize: 18,
              cursor: 'pointer', lineHeight: 1,
            }}
            aria-label="閉じる"
          >×</button>
          <div style={{ color: '#C4A35A', fontSize: 12, fontWeight: 500, letterSpacing: 0.5, marginBottom: 8 }}>
            WEEKLY REPORT
          </div>
          <div style={{ color: '#FAFAF7', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            毎週月曜、あなたの成績レポートが届きます
          </div>
          <div style={{ color: 'rgba(250,250,247,0.5)', fontSize: 12, marginBottom: 12 }}>
            投票数・PROVEN進捗・クライアントの声をLINEでお届け
          </div>
          <button
            onClick={async () => {
              if (!pro) return
              setCodeLoading(true)
              // iOS Safari: window.openをawait前に呼ばないとポップアップブロックされる
              window.open(process.env.NEXT_PUBLIC_LINE_FRIEND_URL, '_blank')
              try {
                const res = await fetch('/api/line/link/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ professionalId: pro.id }),
                })
                const data = await res.json()
                if (data.code) {
                  setLinkCode(data.code)
                  setLineBannerState('show_code_input')
                }
              } catch (err) {
                console.error('[line-banner] Generate error:', err)
              } finally {
                setCodeLoading(false)
              }
            }}
            disabled={codeLoading}
            style={{
              display: 'inline-block',
              background: '#06C755',
              color: 'white',
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              cursor: codeLoading ? 'wait' : 'pointer',
              opacity: codeLoading ? 0.6 : 1,
            }}
          >
            {codeLoading ? '処理中...' : 'LINEで受け取る'}
          </button>
        </div>
      )}

      {/* LINE連携: コード入力 */}
      {!isSettingsTab && lineBannerState === 'show_code_input' && (
        <div style={{
          background: '#1A1A2E',
          border: '0.5px solid rgba(196,163,90,0.3)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 16,
          position: 'relative',
        }}>
          <button
            onClick={dismissLineBanner}
            style={{
              position: 'absolute', top: 12, right: 14,
              background: 'none', border: 'none',
              color: 'rgba(250,250,247,0.3)', fontSize: 18,
              cursor: 'pointer', lineHeight: 1,
            }}
            aria-label="閉じる"
          >×</button>
          <div style={{ color: '#C4A35A', fontSize: 12, fontWeight: 500, letterSpacing: 0.5, marginBottom: 8 }}>
            LINE連携
          </div>
          <div style={{ color: '#FAFAF7', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
            LINEに届いた4桁のコードを入力してください
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                id={`code-input-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={codeInput[i]}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  const next = [...codeInput]
                  next[i] = val
                  setCodeInput(next)
                  setCodeError('')
                  if (val && i < 3) {
                    document.getElementById(`code-input-${i + 1}`)?.focus()
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !codeInput[i] && i > 0) {
                    document.getElementById(`code-input-${i - 1}`)?.focus()
                  }
                }}
                style={{
                  width: 40, height: 48,
                  background: 'rgba(250,250,247,0.1)',
                  border: '1px solid rgba(196,163,90,0.3)',
                  borderRadius: 8,
                  color: '#FAFAF7',
                  fontSize: 20, fontWeight: 700,
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ))}
            <button
              onClick={async () => {
                const code = codeInput.join('')
                if (code.length !== 4) { setCodeError('4桁のコードを入力してください'); return }
                if (!pro) return
                setCodeLoading(true)
                setCodeError('')
                try {
                  const res = await fetch('/api/line/link/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ professionalId: pro.id, code }),
                  })
                  const result = await res.json()
                  if (result.success) {
                    setLineBannerState('linked')
                    setTimeout(() => setLineBannerState('hidden'), 3000)
                  } else if (result.error === 'not_yet_added') {
                    setCodeError('「コードを再送する」を押してください。LINEに新しいコードが届きます。')
                  } else if (result.error === 'expired') {
                    setCodeError('コードが期限切れです。再発行してください')
                  } else {
                    setCodeError('コードが正しくありません')
                  }
                } catch (err) {
                  setCodeError('エラーが発生しました')
                } finally {
                  setCodeLoading(false)
                }
              }}
              disabled={codeLoading}
              style={{
                background: '#06C755',
                color: 'white',
                fontSize: 13, fontWeight: 500,
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                cursor: codeLoading ? 'wait' : 'pointer',
                opacity: codeLoading ? 0.6 : 1,
              }}
            >
              {codeLoading ? '確認中...' : '確認'}
            </button>
          </div>
          {codeError && (
            <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 4 }}>{codeError}</div>
          )}
          <button
            onClick={async () => {
              if (!pro) return
              setCodeLoading(true)
              setCodeInput(['', '', '', ''])
              setCodeError('')
              try {
                const res = await fetch('/api/line/link/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ professionalId: pro.id }),
                })
                const data = await res.json()
                if (data.code) {
                  setLinkCode(data.code)
                  if (data.pushed) {
                    setCodeError('')
                    setCodeInput(['', '', '', ''])
                    // pushed成功のフィードバック（エラー表示エリアを流用）
                    setCodeError('✅ LINEに新しいコードを送信しました')
                  } else {
                    setCodeError('LINE公式アカウントにメッセージを送ってください')
                  }
                }
              } catch (err) {
                console.error('[line-banner] Regenerate error:', err)
              } finally {
                setCodeLoading(false)
              }
            }}
            style={{
              background: 'none', border: 'none',
              color: 'rgba(250,250,247,0.5)', fontSize: 12,
              cursor: 'pointer', textDecoration: 'underline',
              padding: 0,
            }}
          >
            コードを再送する
          </button>
        </div>
      )}

      {/* LINE連携: 完了 */}
      {!isSettingsTab && lineBannerState === 'linked' && (
        <div style={{
          background: '#1A1A2E',
          border: '0.5px solid rgba(6,199,85,0.5)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ color: '#06C755', fontSize: 20 }}>✓</span>
          <div>
            <div style={{ color: '#FAFAF7', fontSize: 14, fontWeight: 500 }}>LINE連携が完了しました</div>
            <div style={{ color: 'rgba(250,250,247,0.5)', fontSize: 12 }}>毎週月曜にレポートをお届けします</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="text-2xl font-bold text-[#1A1A2E]">ダッシュボード</h1>
            {(pro as any)?.founding_member_status === 'achieved' && (
              <a
                href="https://line.me/R/ti/g/2C5JXJyc68"
                target="_blank"
                rel="noopener noreferrer"
                title="Founding Memberグループに参加"
              >
                <img
                  src="/images/founding-member-badge.png"
                  alt="Founding Member"
                  style={{ width: 40, height: 40, objectFit: 'contain' }}
                />
              </a>
            )}
          </div>
          {user?.email && (
            <p className="text-sm text-gray-400 mt-1 truncate max-w-[260px]">
              {user.email.startsWith('line_') && user.email.endsWith('@line.realproof.jp') ? 'LINE連携済み' : user.email}
            </p>
          )}
        </div>
      </div>

      {/* 姓名未設定バナー */}
      {pro && !pro.first_name?.trim() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-2">
            姓名が未設定です。プロフィールを更新してください。
          </p>
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-bold text-[#C4A35A] hover:underline"
          >
            プロフィール編集へ →
          </button>
        </div>
      )}

      {/* QRコード（タブの上に配置） */}
      {!isSettingsTab && (
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6 text-center">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">24時間限定 プルーフ用QRコード</h2>
        {(() => {
          const proofsReady = selectedProofIds.size === 9

          if (!proofsReady) {
            return (
              <div className="py-4">
                <p className="text-sm text-[#9CA3AF] mb-3">
                  QRコードを発行するには、強み設定を完了してください：
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="text-red-400">✗</span>
                    <span className="text-[#1A1A2E]">強み設定（{selectedProofIds.size} / 9 選択中）</span>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <>
              <p className="text-sm text-gray-500 mb-4">クライアントに見せてプルーフを贈ってもらいましょう</p>
              {qrUrl ? (
                <>
                  <img src={qrUrl} alt="QR Code" className="mx-auto mb-4" />
                  <button
                    onClick={async () => {
                      await generateQR()
                      setQrRefreshed(true)
                      setTimeout(() => setQrRefreshed(false), 2000)
                    }}
                    className="text-sm text-[#9CA3AF] hover:text-[#C4A35A] transition-colors"
                  >
                    {qrRefreshed ? '更新しました ✓' : 'QRコードを更新する'}
                  </button>
                </>
              ) : (
                <button onClick={generateQR} className="px-6 py-3 bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] transition">
                  24時間限定QRコードを発行する
                </button>
              )}
            </>
          )
        })()}
      </div>
      )}


      {/* ← ホームに戻る（設定モード時） */}
      {isSettingsTab && (
        <button
          onClick={() => {
            if (!pro) {
              window.location.href = '/mycard'
            } else {
              setDashboardTab('profile')
              window.history.replaceState(null, '', '/dashboard')
            }
          }}
          className="flex items-center gap-2 text-sm text-[#C4A35A] hover:text-[#b3923f] mb-4 transition-colors"
        >
          ← ホームに戻る
        </button>
      )}

      {/* ダッシュボードタブ */}
      {!isSettingsTab && (
      <div style={{ display: 'flex', overflowX: 'auto', gap: 0, marginBottom: 24, borderBottom: '1px solid #E5E7EB', scrollbarWidth: 'none' as any }}>
        {([
          { key: 'profile' as const, label: 'ホーム' },
          { key: 'voices' as const, label: 'Voices' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setDashboardTab(tab.key)}
            style={{
              flex: '0 0 auto',
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: dashboardTab === tab.key ? 700 : 600,
              color: dashboardTab === tab.key ? '#1A1A2E' : '#9CA3AF',
              background: 'transparent',
              border: 'none',
              borderBottom: dashboardTab === tab.key
                ? '2px solid #C4A35A'
                : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
              transition: 'color 0.2s, border-color 0.2s, background 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {/* ═══ Tab: プロフィール ═══ */}
      {dashboardTab === 'profile' && (<>

      {/* Xデーカウントダウン */}
      {(() => {
        // strength_label ごとに vote_count を合算
        const strengthCounts: Record<string, number> = {}
        for (const v of votes) {
          const sl = v.strength_label
          if (sl) {
            strengthCounts[sl] = (strengthCounts[sl] || 0) + v.vote_count
          }
        }
        const entries = Object.entries(strengthCounts)
        const totalProofVotes = entries.reduce((sum, [, c]) => sum + c, 0)
        let topLabel: string | null = null
        let topVotes = 0
        for (const [label, count] of entries) {
          if (count > topVotes) {
            topLabel = label
            topVotes = count
          }
        }
        return (
          <XDayCountdown
            proofVoteCount={totalProofVotes}
            topStrengthLabel={topLabel}
            topStrengthVotes={topVotes}
          />
        )
      })()}

      {/* 承認完了メッセージ */}
      {inviteAccepted && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-center">
          <p className="text-sm font-medium text-green-700">{inviteAccepted}</p>
        </div>
      )}

      {/* 団体からの招待 */}
      {pendingInvites.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6 border-l-4 border-[#C4A35A]">
          <div className="space-y-3">
            {pendingInvites.map(inv => {
              const proSideLabels: Record<string, string> = {
                store: `${inv.org_name}があなたの所属を確認しています`,
                credential: `${inv.org_name}からの認定が届いています`,
                education: `${inv.org_name}からの修了認定が届いています`,
              }
              return (
                <div key={inv.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium text-[#1A1A2E]">
                      {proSideLabels[inv.org_type] || `${inv.org_name}からの招待`}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(inv.invited_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptInvite(inv.id, inv.organization_id)}
                      disabled={inviteProcessing === inv.id}
                      className="px-3 py-1.5 bg-[#1A1A2E] text-white text-xs font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50"
                    >
                      {inviteProcessing === inv.id ? '...' : '承認する'}
                    </button>
                    <button
                      onClick={() => handleDeclineInvite(inv.id)}
                      disabled={inviteProcessing === inv.id}
                      className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                    >
                      拒否
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 所属・認定（org_membersベース） */}
      {activeOrgs.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3">所属・認定</h3>
          <div className="space-y-3">
            {activeOrgs.map(o => {
              const typeIcon = o.org_type === 'store' ? '🏪' : o.org_type === 'credential' ? '🎓' : '📚'
              const typeTag = o.org_type === 'store' ? '所属' : o.org_type === 'education' ? '修了' : '認定'
              const tagBg = o.org_type === 'store' ? '#E8F4FD' : '#FFF8E7'
              const tagColor = o.org_type === 'store' ? '#2B6CB0' : '#C4A35A'
              return (
                <div key={o.id} className="flex items-center py-2">
                  <a
                    href={`/org/${o.id}`}
                    className="flex items-center gap-3 hover:opacity-70 transition"
                  >
                    {o.logo_url ? (
                      <img src={o.logo_url} alt={o.org_name} loading="lazy" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span className="text-lg">{typeIcon}</span>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1A1A2E]">{o.org_name}</span>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: tagBg, color: tagColor, fontWeight: 600 }}>
                          {typeTag}
                        </span>
                      </div>
                      {o.accepted_at && (
                        <div className="text-xs text-gray-400">
                          {new Date(o.accepted_at).toLocaleDateString('ja-JP')} {o.org_type === 'credential' ? 'から認定' : o.org_type === 'education' ? 'から修了' : 'から所属'}
                        </div>
                      )}
                    </div>
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Founding Member Challenge */}
      {(pro as any)?.founding_member_status !== 'achieved' &&
       (pro as any)?.founding_member_status !== 'expired' &&
       pro?.created_at && (() => {
        const createdAt = new Date(pro.created_at)
        const now = new Date()
        const daysSince = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
        const daysLeft = Math.max(0, 30 - daysSince)
        const neededVotes = Math.max(0, 5 - totalVotes)
        if (daysLeft <= 0) return null
        return (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: 14,
            padding: 20,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', marginBottom: 12 }}>
              Founding Member チャレンジ
            </div>
            <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
              あと{neededVotes}票（残り{daysLeft}日）
            </div>
            <div style={{ height: 8, background: '#F0EDE6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, (totalVotes / 5) * 100)}%`,
                height: '100%',
                background: '#C4A35A',
                borderRadius: 4,
                transition: 'width 0.8s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
              30日以内に5票集めるとFounding Memberバッジを獲得！
            </div>
          </div>
        )
      })()}

      {/* Badges */}
      {(() => {
        const displayBadges = filterAndSortBadges(pro?.badges || [])
        const hasBadges = displayBadges.length > 0 || credentialBadges.length > 0
        return hasBadges ? (
          <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">取得バッジ</h2>
            <div className="flex flex-wrap justify-center gap-6">
              {/* credential_levels経由のバッジ（新方式） */}
              {credentialBadges.map((badge) => (
                <a key={badge.id} href={`/dashboard?tab=myorgs#${badge.id}`} className="flex flex-col items-center hover:opacity-70 transition">
                  {badge.image_url ? (
                    <img src={badge.image_url} alt={badge.name} loading="lazy" className="w-16 h-16 rounded-xl object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white text-lg font-bold">
                      {badge.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-[10px] text-gray-400 mt-1">{badge.name}</span>
                </a>
              ))}
              {/* pro.badges経由のバッジ（旧方式） */}
              {displayBadges.map((badge, i) => (
                <div key={i} className="flex flex-col items-center">
                  <img src={badge.image_url} alt={badge.label} loading="lazy" className="w-16 h-16" />
                  <span className="text-[10px] text-gray-400 mt-1">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null
      })()}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#C4A35A]">{totalVotes}</div>
          <div className="text-xs text-gray-500">総プルーフ数</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#1A1A2E]">{daysSinceRegistration}</div>
          <div className="text-xs text-gray-500">登録日数</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center" style={{ background: bookmarkCount > 0 ? 'rgba(196,163,90,0.06)' : undefined, border: bookmarkCount > 0 ? '1px solid rgba(196,163,90,0.2)' : undefined }}>
          <div style={{ fontSize: 14, marginBottom: 2 }}>♡</div>
          <div className="text-2xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'Inter', sans-serif" }}>{bookmarkCount}</div>
          <div className="text-xs text-gray-500">ブックマーク</div>
        </div>
      </div>

      {/* クライアント構成バー */}
      {(() => {
        const total = firstTimerCount + repeaterCount + regularCount
        if (total === 0) return null
        const pFirst = Math.round((firstTimerCount / total) * 100)
        const pRepeat = Math.round((repeaterCount / total) * 100)
        const pRegular = 100 - pFirst - pRepeat
        const segments = [
          { key: 'first', label: '初回', count: firstTimerCount, pct: pFirst, bg: '#E8E4D9', color: '#444441' },
          { key: 'repeat', label: 'リピーター', count: repeaterCount, pct: pRepeat, bg: '#C4A35A', color: '#412402' },
          { key: 'regular', label: '常連', count: regularCount, pct: pRegular, bg: '#1A1A2E', color: '#C4A35A' },
        ]
        return (
          <div style={{ marginBottom: 16, padding: '16px', background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 10 }}>クライアント構成</div>
            <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden' }}>
              {segments.map(s => s.pct > 0 ? (
                <div key={s.key} style={{ width: `${s.pct}%`, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.pct >= 10 && <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.pct}%</span>}
                </div>
              ) : null)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {segments.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B7280' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.bg, display: 'inline-block', border: s.key === 'first' ? '1px solid #ccc' : 'none' }} />
                  {s.label} <span style={{ fontWeight: 700, color: '#1F2937' }}>{s.count}人</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* トッププルーフ — 背景は15票以上でグラデーション */}
      {topForte !== '-' && (() => {
        const topVoteCount = votes.length > 0 ? votes.sort((a, b) => b.vote_count - a.vote_count)[0]?.vote_count : 0
        const topIsProven = topVoteCount >= PROVEN_THRESHOLD
        return (
          <div className="rounded-xl p-4 mb-8 flex items-center justify-between gap-3" style={{ background: topIsProven ? PROVEN_GRADIENT : '#1A1A2E' }}>
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#9CA3AF', fontFamily: "'Inter', sans-serif" }}>TOP PROOF</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: '#FFFFFF' }}>{topForte}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: '#C4A35A', fontFamily: "'Inter', sans-serif" }}>
                {topVoteCount}
              </div>
              <div className="text-[10px]" style={{ color: '#9CA3AF' }}>votes</div>
            </div>
          </div>
        )
      })()}
      {topForte === '-' && <div className="mb-8" />}

      {/* ★ 認定申請バナー — 30票以上 & 未申請のカテゴリごとに表示 */}
      {(() => {
        const appliedSlugs = certApplications.map(app => app.category_slug)
        const eligibleCategories = votes
          .filter(v => {
            const slug = v.proof_id || v.category
            return v.vote_count >= SPECIALIST_THRESHOLD && !appliedSlugs.includes(slug)
          })
          .map(v => {
            const slug = v.proof_id || v.category
            return {
              proof_id: slug,
              label: v.category,
              vote_count: v.vote_count,
              topPersonality: personalityVotes.length > 0
                ? [...personalityVotes].sort((a, b) => b.vote_count - a.vote_count)[0].category
                : null,
            }
          })

        return eligibleCategories
          .filter(cat => !dismissedCerts.includes(cat.proof_id))
          .map(cat => (
            <div
              key={cat.proof_id}
              style={{
                background: 'linear-gradient(135deg, #1A1A2E 0%, #2A1F0A 100%)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '16px',
                border: '1px solid rgba(212, 168, 67, 0.3)',
                position: 'relative' as const,
              }}
            >
              <button
                onClick={() => setDismissedCerts(prev => [...prev, cat.proof_id])}
                style={{
                  position: 'absolute' as const,
                  top: '12px',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(250, 250, 247, 0.5)',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label="閉じる"
              >
                ✕
              </button>
              <div style={{ fontSize: '14px', marginBottom: '12px' }}>
                <span style={{ fontSize: '24px', marginRight: '8px' }}>🏆</span>
                <span style={{ color: PROVEN_GOLD, fontSize: '16px', fontWeight: 'bold' }}>
                  REALPROOF認定に到達しました！
                </span>
              </div>
              <p style={{ color: '#FAFAF7', fontSize: '14px', lineHeight: '1.7', margin: '0 0 20px 0' }}>
                「<strong style={{ color: PROVEN_GOLD }}>{cat.label}</strong>」が{cat.vote_count}プルーフを突破。
                <br />
                あなたの実力が証明されました。
                <br />
                認定証と名前入りプルーフカードを無料でお届けします。
              </p>
              <button
                onClick={() => setCertModal({ slug: cat.proof_id, name: cat.label, count: cat.vote_count })}
                style={{
                  background: PROVEN_GOLD,
                  color: '#1A1A2E',
                  padding: '14px 24px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '15px',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                認定を申請する →
              </button>
            </div>
          ))
      })()}

      {/* Proof Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">プルーフチャート</h2>
        <ForteChart
          votes={votes}
          personalityVotes={personalityVotes}
          professional={pro}
          certApplications={certApplications}
        />
      </div>

      {/* アーカイブ（旧パーソナリティで過去票がある項目） */}
      {isPersonalityV2() && archivedPersonality.length > 0 && (() => {
        const archMax = Math.max(...archivedPersonality.map(a => a.votes), 1)
        return (
          <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">📂 アーカイブ</h2>
            <p className="text-xs text-[#9CA3AF] mb-4">
              フォーマット刷新前の評価記録です。集計には含まれませんが大切な投票として残しています。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {archivedPersonality.map(item => {
                const pct = Math.round((item.votes / archMax) * 100)
                return (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: '#1A1A2E', fontWeight: 600 }}>
                        {item.personality_label}
                        <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                          {item.label}
                        </span>
                      </span>
                      <span style={{ color: '#9CA3AF' }}>{item.votes}票</span>
                    </div>
                    <div style={{ width: '100%', height: 4, background: '#F0EDE6', borderRadius: 99 }}>
                      <div style={{ width: `${pct}%`, height: 4, background: '#9CA3AF', borderRadius: 99 }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-[#9CA3AF] mt-4 leading-relaxed">
              2026年4月以降、パーソナリティのフォーマットを刷新しました。過去の評価は大切な記録として残しています。
            </p>
          </div>
        )
      })()}

      </>)}

      {/* ═══ Tab: カード管理 ═══ */}
      {dashboardTab === 'card' && (<>
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">プルーフカード</h2>
        <p className="text-sm text-[#9CA3AF] mb-4">
          カード裏面のIDを入力すると、お客さんがカードにスマホをかざすだけで投票ページに飛べるようになります。
        </p>

        {nfcCard ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(196,163,90,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                📇
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                  カードID: {nfcCard.card_uid}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  ステータス: 使用中 ✅
                  {nfcCard.linked_at && (
                    <span style={{ marginLeft: 12 }}>
                      登録日: {new Date(nfcCard.linked_at).toLocaleDateString('ja-JP')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={unlinkNfcCard}
              disabled={nfcLoading}
              style={{
                fontSize: 13, fontWeight: 600,
                color: '#666', background: 'transparent',
                border: '1px solid #D1D5DB', borderRadius: 8,
                padding: '8px 16px', cursor: 'pointer',
                opacity: nfcLoading ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {nfcLoading ? '処理中...' : '紐付けを解除する'}
            </button>
          </div>
        ) : (
          <div>
            {nfcUnlinkedCard && (
              <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                前のカード（{nfcUnlinkedCard}）の紐付けを解除しました。
              </p>
            )}
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              カード裏面記載のRから始まる番号を入力してください
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <input
                type="text"
                value={nfcInput}
                onChange={(e) => { setNfcInput(e.target.value); setNfcError('') }}
                placeholder="XXXXX"
                style={{
                  padding: '10px 14px', fontSize: 14, fontWeight: 600,
                  border: '1px solid #E5E7EB', borderRadius: 8,
                  width: 160, fontFamily: "'Inter', sans-serif",
                  letterSpacing: 1,
                }}
              />
              <button
                onClick={linkNfcCard}
                disabled={nfcLoading || !nfcInput.trim()}
                style={{
                  padding: '10px 20px', fontSize: 14, fontWeight: 700,
                  background: '#C4A35A', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  opacity: (nfcLoading || !nfcInput.trim()) ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {nfcLoading ? '登録中...' : '登録する'}
              </button>
            </div>
          </div>
        )}

        {nfcError && (
          <p style={{ fontSize: 13, color: '#EF4444', marginTop: 12 }}>{nfcError}</p>
        )}
        {nfcSuccess && (
          <p style={{ fontSize: 13, color: '#22C55E', marginTop: 12 }}>{nfcSuccess}</p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        {pro && <CardModeSwitch professionalId={pro.id} initialCardMode={pro.card_mode || 'pro'} />}
      </div>
      </>)}

      {/* ═══ Tab: 強み設定 ═══ */}
      {dashboardTab === 'proofs' && (<>

      {/* 強み設定 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">強み設定</h2>
        <p className="text-sm text-[#9CA3AF] mb-4">
          お客さんがあなたに投票する時に表示される項目です。9つ選んでください。
        </p>

        {proofItems.length === 0 ? (
          <p className="text-sm text-red-500">項目を読み込めませんでした</p>
        ) : (
          <>
            {/* プログレスバー */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[#1A1A2E]">{totalSelected} / 9 選択中</span>
                {isExactNine && <span className="text-xs text-[#C4A35A] font-medium">✓ 選択完了</span>}
                {remaining > 0 && <span className="text-xs text-[#9CA3AF] font-medium">あと{remaining}個選んでください</span>}
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isMaxSelected
                      ? 'bg-gradient-to-r from-[#C4A35A] to-[#d4b86a]'
                      : 'bg-gradient-to-r from-[#1A1A2E] to-[#2a2a4e]'
                  }`}
                  style={{ width: `${(totalSelected / 9) * 100}%` }}
                />
              </div>
            </div>

            {/* カテゴリタブ */}
            <div className="flex overflow-x-auto gap-1 mb-4 pb-1 -mx-1 px-1">
              {CATEGORY_KEYS.map(key => {
                const count = getCategorySelectedCount(key)
                const isActive = activeTab === key
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-shrink-0 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      isActive
                        ? 'text-[#1A1A2E] font-bold border-[#C4A35A]'
                        : 'text-[#9CA3AF] border-transparent hover:text-[#6B7280]'
                    }`}
                  >
                    {CATEGORY_LABELS[key]}
                    {count > 0 && (
                      <span className={`ml-1 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full ${
                        isActive ? 'bg-[#C4A35A] text-white' : 'bg-gray-200 text-[#6B7280]'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 項目リスト */}
              <div className="space-y-2 mb-6">
                {proofItems
                  .filter(p => p.tab === activeTab)
                  .map(item => {
                    const isChecked = selectedProofIds.has(item.id)
                    const isDisabled = !isChecked && isMaxSelected
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#FAFAF7]'
                        } ${isChecked ? 'bg-[#FAFAF7]' : ''}`}
                      >
                        <div className="relative flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => toggleProofId(item.id)}
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-[#C4A35A] border-[#C4A35A]'
                              : 'bg-white border-[#E5E7EB]'
                          }`}>
                            {isChecked && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-[#1A1A2E]">{item.strength_label}</span>
                          <span className="text-xs text-[#9CA3AF] ml-2">{item.label}</span>
                        </div>
                      </label>
                    )
                  })}
              </div>

            {/* 注記 */}
            <p className="text-xs text-[#9CA3AF] mb-4">
              ※ 「期待できそう！」はすべてのプロに自動で表示されます
            </p>

            {/* 保存ボタン */}
            {proofError && <p className="text-red-500 text-sm mb-2">{proofError}</p>}
            <button
              onClick={handleSaveProofs}
              disabled={proofSaving || !isExactNine}
              className={`w-full py-3 rounded-xl text-sm font-medium tracking-wider transition-colors ${
                proofSaved
                  ? 'bg-green-500 text-white'
                  : 'bg-[#1A1A2E] text-[#C4A35A] hover:bg-[#2a2a4e]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {proofSaving ? '保存中...' : proofSaved ? '保存しました' : '強み設定を保存'}
            </button>

            {/* 選択一覧 */}
            {totalSelected > 0 && (
              <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
                <p className="text-xs text-[#9CA3AF] mb-2">選択中の項目</p>
                <div className="flex flex-wrap gap-2">
                  {proofItems
                    .filter(p => selectedProofIds.has(p.id))
                    .map(p => (
                      <span key={p.id} className="px-3 py-1 bg-[#C4A35A]/10 text-[#1A1A2E] text-xs rounded-full">
                        {p.strength_label}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Featured Proof 選択（全項目対応） */}
      {(() => {
        const votedItems = [...votes].filter(v => v.vote_count > 0).sort((a, b) => b.vote_count - a.vote_count)
        if (votedItems.length === 0) return null
        return (
          <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">検索カードに表示する強みを選ぶ</h2>
            <p className="text-sm text-[#9CA3AF] mb-4">
              検索結果のプロカードに表示される強みを選べます。
              {!featuredProofId && '選択しない場合は最も票数が多い項目が自動で表示されます。'}
            </p>
            <div className="space-y-2">
              {votedItems.map(item => {
                const isSelected = featuredProofId === item.proof_id
                const isProven = item.vote_count >= PROVEN_THRESHOLD
                return (
                  <button
                    key={item.proof_id || item.category}
                    disabled={featuredProofSaving}
                    onClick={async () => {
                      const newId = isSelected ? null : (item.proof_id || null)
                      setFeaturedProofSaving(true)
                      try {
                        const res = await fetch('/api/dashboard/set-featured-proof', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ proofItemId: newId }),
                        })
                        if (res.ok) {
                          setFeaturedProofId(newId)
                        }
                      } catch {}
                      setFeaturedProofSaving(false)
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-[#C4A35A] bg-[#C4A35A]/5'
                        : 'border-[#E5E7EB] hover:border-[#C4A35A]/50'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: isSelected ? '#C4A35A' : 'transparent', minWidth: 16 }}>
                        {isSelected ? '✓' : ''}
                      </span>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#1A1A2E]">{item.strength_label || item.category}</span>
                          {isProven && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(196,163,90,0.1)', color: '#C4A35A' }}>
                              PROVEN
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#9CA3AF]">{item.vote_count} proofs</div>
                      </div>
                    </div>
                    <span className="text-xs font-medium" style={{ color: isSelected ? '#C4A35A' : '#9CA3AF' }}>
                      {isSelected ? '表示中' : '選択'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      </>)}

      {/* ═══ Tab: リワード設定 ═══ */}
      {dashboardTab === 'rewards' && (<>

      {/* リワード設定 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">リワード設定</h2>
        <p className="text-sm text-[#9CA3AF] mb-4">
          投票してくれたお客さんに見せる「お礼」です。任意ですが、設定すると投票率が上がります。
        </p>

        {/* プログレスバー */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-[#1A1A2E]">{rewards.length} / 3 設定中</span>
            {rewards.length === 3 && <span className="text-xs text-[#C4A35A] font-medium">✓ 設定完了</span>}
            {rewards.length < 3 && <span className="text-xs text-[#9CA3AF] font-medium">あと{3 - rewards.length}枠</span>}
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                rewards.length >= 3
                  ? 'bg-gradient-to-r from-[#C4A35A] to-[#d4b86a]'
                  : 'bg-gradient-to-r from-[#1A1A2E] to-[#2a2a4e]'
              }`}
              style={{ width: `${(rewards.length / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* 設定済みリワード一覧 */}
        {rewards.length > 0 && (
          <div className="space-y-3 mb-4">
            {rewards.map((reward, idx) => {
              const rt = getRewardType(reward.reward_type)
              const displayLabel = reward.reward_type === 'org_app' ? (reward.title || 'リワード') : (rt?.label || reward.reward_type)
              const needsTitle = rt?.hasTitle || false
              return (
                <div key={idx} className="p-4 bg-[#FAFAF7] rounded-lg border border-[#E5E7EB]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[#1A1A2E]">
                      {idx + 1}. {displayLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRewards(rewards.filter((_, i) => i !== idx))}
                      className="text-sm text-[#9CA3AF] hover:text-red-500 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                  {needsTitle && (
                    <input
                      value={reward.title}
                      onChange={e => {
                        const updated = [...rewards]
                        updated[idx] = { ...updated[idx], title: e.target.value }
                        setRewards(updated)
                      }}
                      className="w-full px-3 py-2 mb-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A]"
                      placeholder={reward.reward_type === 'selfcare' ? 'タイトル（例：自宅でできる肩こり解消法）' : 'タイトル（例：FNTリワードドリル）'}
                    />
                  )}
                  {reward.reward_type === 'fnt_neuro_app' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#9CA3AF] mb-1">リワードを1つ選択してください</p>
                      {FNT_NEURO_APPS.map(app => {
                        const isAppSelected = reward.content === app.url
                        return (
                          <div key={app.id} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...rewards]
                                updated[idx] = { ...updated[idx], content: isAppSelected ? '' : app.url }
                                setRewards(updated)
                              }}
                              className={`flex-1 text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                                isAppSelected
                                  ? 'border-[#C4A35A] bg-[#C4A35A]/10 font-medium text-[#1A1A2E]'
                                  : 'border-[#E5E7EB] bg-white text-[#1A1A2E] hover:bg-[#FAFAF7]'
                              }`}
                            >
                              <span className={isAppSelected ? 'text-[#C4A35A] mr-2' : 'text-[#E5E7EB] mr-2'}>
                                {isAppSelected ? '●' : '○'}
                              </span>
                              {app.name}
                            </button>
                            <a
                              href={app.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#C4A35A] hover:underline whitespace-nowrap px-2 py-2"
                            >
                              ▶ プレビュー
                            </a>
                          </div>
                        )
                      })}
                      {!reward.content && (
                        <p className="text-xs text-red-400 mt-1">リワードを選択してください</p>
                      )}
                    </div>
                  ) : reward.reward_type === 'org_app' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#9CA3AF]">{reward.url}</p>
                      <textarea
                        value={reward.content}
                        onChange={e => {
                          const updated = [...rewards]
                          updated[idx] = { ...updated[idx], content: e.target.value }
                          setRewards(updated)
                        }}
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A] resize-none"
                        placeholder="クライアントに表示される説明文（編集可能）"
                      />
                    </div>
                  ) : (
                  <textarea
                    value={reward.content}
                    onChange={e => {
                      const updated = [...rewards]
                      updated[idx] = { ...updated[idx], content: e.target.value }
                      setRewards(updated)
                    }}
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A] resize-none"
                    placeholder="リワードの内容を入力...（URLを入れるとボタンに変換されます）"
                  />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* リワード追加UI */}
        {rewards.length < 3 && (
          <div className="border border-dashed border-[#E5E7EB] rounded-lg p-4 mb-4">
            {!showRewardPicker ? (
              <button
                type="button"
                onClick={() => setShowRewardPicker(true)}
                className="w-full py-2 text-sm text-[#C4A35A] font-medium hover:text-[#b3923f] transition-colors"
              >
                + リワードを追加（残り{3 - rewards.length}枠）
              </button>
            ) : showOrgAppPicker ? (
              <>
                <p className="text-sm font-medium text-[#1A1A2E] mb-3">追加するリワードを選択</p>
                <div className="space-y-2 mb-3">
                  {availableApps.map((app: any) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => {
                        setRewards([...rewards, {
                          reward_type: 'org_app',
                          title: app.title,
                          url: app.url,
                          content: app.description || '',
                        }])
                        setShowOrgAppPicker(false)
                        setShowRewardPicker(false)
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-[#E5E7EB] hover:bg-[#FAFAF7] transition-colors"
                    >
                      <span className="text-sm font-medium text-[#1A1A2E]">{app.title}</span>
                      {app.description && (
                        <span className="text-xs text-[#9CA3AF] ml-2">{app.description}</span>
                      )}
                      <span className="text-xs text-[#C4A35A] ml-2">追加する ＋</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowOrgAppPicker(false)}
                  className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  ← カテゴリ一覧に戻る
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-[#1A1A2E] mb-3">カテゴリを選択</p>
                <div className="space-y-2 mb-3">
                  {REWARD_TYPES
                    .filter(rt => rt.id === 'freeform' || !rewards.some(r => r.reward_type === rt.id))
                    .map(rt => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => {
                          setRewards([...rewards, { reward_type: rt.id, title: '', content: '' }])
                          setShowRewardPicker(false)
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition-colors"
                      >
                        <span className="text-sm font-medium text-[#1A1A2E]">{rt.label}</span>
                        <span className="text-xs text-[#9CA3AF] ml-2">{rt.description}</span>
                      </button>
                    ))}
                  {availableAppsLoaded && availableApps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowOrgAppPicker(true)}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition-colors"
                    >
                      <span className="text-sm font-medium text-[#1A1A2E]">団体配布</span>
                      <span className="text-xs text-[#9CA3AF] ml-2">所属団体のリワードをクライアントにプレゼント</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRewardPicker(false)}
                  className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  キャンセル
                </button>
              </>
            )}
          </div>
        )}


        {/* 保存ボタン */}
        {rewardError && <p className="text-red-500 text-sm mb-2 mt-4">{rewardError}</p>}
        <button
          onClick={handleSaveRewards}
          disabled={rewardSaving}
          className={`w-full py-3 rounded-xl text-sm font-medium tracking-wider transition-colors mt-4 ${
            rewardSaved
              ? 'bg-green-500 text-white'
              : 'bg-[#1A1A2E] text-[#C4A35A] hover:bg-[#2a2a4e]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {rewardSaving ? '保存中...' : rewardSaved ? '保存しました' : 'リワード設定を保存'}
        </button>

        {/* 設定済み一覧 */}
        {rewards.filter(r => r.content.trim() || r.url?.trim()).length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
            <p className="text-xs text-[#9CA3AF] mb-2">設定中のリワード</p>
            <div className="flex flex-wrap gap-2">
              {rewards.filter(r => r.content.trim() || r.url?.trim()).map((r, idx) => {
                const rt = getRewardType(r.reward_type)
                const label = r.reward_type === 'org_app' ? (r.title || 'リワード') : (rt?.label || r.reward_type)
                return (
                  <span key={idx} className="px-3 py-1 bg-[#C4A35A]/10 text-[#1A1A2E] text-xs rounded-full">
                    {label}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      </>)}

      {/* ═══ Tab: Voices ═══ */}
      {dashboardTab === 'voices' && (<>

      <p className="text-sm text-[#9CA3AF] mb-4">
        お客さんが投票時に書いてくれたコメントです。タップしてSNSでシェアできます。
      </p>

      {/* シェア説明バナー */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border-l-4 border-[#C4A35A] bg-[#1A1A2E] px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#C4A35A]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <div>
          <p className="text-sm font-medium text-[#FAFAF7]">カードをタップしてシェア</p>
          <p className="mt-0.5 text-xs text-[#888888]">
            クライアントから届いたコメントを、感謝の言葉とともにSNSでシェアできます。
          </p>
        </div>
      </div>

      {/* Voices */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">
          <span style={{ fontSize: 10, fontWeight: 700, color: '#A0A0A0', letterSpacing: 2, textTransform: 'uppercase' as const, fontFamily: "'Inter', sans-serif", display: 'block', marginBottom: 4 }}>
            VOICES — {voiceComments.length} COMMENTS
          </span>
          クライアントの声
        </h2>
        {voiceComments.length > 0 ? (
          <div className="space-y-3">
            {voiceComments.map(c => {
              const isExpanded = expandedVoice === c.id
              const isSelectingPhrase = phraseSelecting === c.id
              const selectedPhraseId = selectedPhrases[c.id]
              const selectedPhraseText = voicePhrases.find(p => p.id === selectedPhraseId)?.text
                || voicePhrases.find(p => p.is_default)?.text || ''

              return (
                // 外側ラッパー: 背景・ボーダーは VoiceCommentCard 側に委譲。
                // ここでは onClick（カード展開）と cursor のみを担当する。
                <div key={c.id}
                  onClick={() => { if (!isExpanded) setExpandedVoice(c.id) }}
                  style={{ cursor: !isExpanded ? 'pointer' : 'default' }}
                >
                  {/* 顔写真 / 苗字 / 引用符 / コメント / 日時 / 常連バッジ */}
                  <VoiceCommentCard vote={c} />

                  {/* 検索カード設定ボタン（カード直下に独立配置） */}
                  <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    {featuredVoiceId === c.id ? (
                      <button
                        disabled={featuredVoiceSaving}
                        onClick={async () => {
                          setFeaturedVoiceSaving(true)
                          try {
                            await fetch('/api/dashboard/set-featured-voice', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ vote_id: null }),
                            })
                            setFeaturedVoiceId(null)
                          } catch {}
                          setFeaturedVoiceSaving(false)
                        }}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: 'rgba(196,163,90,0.1)', color: '#C4A35A',
                          border: '1px solid #C4A35A', cursor: 'pointer',
                          opacity: featuredVoiceSaving ? 0.5 : 1,
                        }}
                      >
                        ✓ 検索カードに表示中
                      </button>
                    ) : (
                      <button
                        disabled={featuredVoiceSaving}
                        onClick={async () => {
                          setFeaturedVoiceSaving(true)
                          try {
                            await fetch('/api/dashboard/set-featured-voice', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ vote_id: c.id }),
                            })
                            setFeaturedVoiceId(c.id)
                          } catch {}
                          setFeaturedVoiceSaving(false)
                        }}
                        style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: 'transparent', color: '#888888',
                          border: '1px solid #D0CCC4', cursor: 'pointer',
                          opacity: featuredVoiceSaving ? 0.5 : 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#C4A35A'; e.currentTarget.style.color = '#C4A35A' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#D0CCC4'; e.currentTarget.style.color = '#888888' }}
                      >
                        検索カードに設定
                      </button>
                    )}
                  </div>

                  {/* 展開時: フレーズ選択 + 「この声をシェアする」 */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 14,
                        background: '#FAF8F4',
                        border: '1px solid #E8E4DC',
                        borderRadius: 12,
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ fontSize: 11, color: '#888888', marginBottom: 8 }}>感謝のひとこと</div>

                      {isSelectingPhrase ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                          {voicePhrases.map(p => (
                            <button key={p.id}
                              onClick={() => {
                                setSelectedPhrases(prev => ({ ...prev, [c.id]: p.id }))
                                setPhraseSelecting(null)
                              }}
                              style={{
                                background: selectedPhraseId === p.id ? '#C4A35A' : '#FFFFFF',
                                color: selectedPhraseId === p.id ? '#fff' : '#555555',
                                border: '1px solid #E8E4DC', borderRadius: 8, padding: '8px 12px',
                                fontSize: 12, cursor: 'pointer', textAlign: 'left' as const,
                              }}
                            >
                              {p.text}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div
                          onClick={() => setPhraseSelecting(c.id)}
                          style={{
                            background: '#FFFFFF', border: '1px solid #E8E4DC',
                            borderRadius: 8, padding: '8px 12px',
                            fontSize: 12, color: '#C4A35A', cursor: 'pointer', marginBottom: 12,
                            fontStyle: 'italic',
                          }}
                        >
                          ── {selectedPhraseText || '感謝フレーズを選ぶ'}
                        </div>
                      )}

                      <button
                        onClick={() => setShareModalVoice(c)}
                        style={{
                          width: '100%', padding: '10px', border: '1px solid #C4A35A',
                          background: 'transparent', color: '#C4A35A', borderRadius: 10,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        この声をシェアする
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">コメントがまだありません。</p>
            <p className="text-gray-400 text-xs mt-1">クライアントからコメント付き投票が届くとここに表示されます。</p>
          </div>
        )}
      </div>

      {/* Voice Share Modal */}
      {shareModalVoice && pro && (
        <VoiceShareModal
          isOpen={true}
          onClose={() => setShareModalVoice(null)}
          voice={shareModalVoice}
          phraseId={selectedPhrases[shareModalVoice.id] || voicePhrases.find(p => p.is_default)?.id || 1}
          phrases={voicePhrases}
          proId={pro.id}
          proName={pro.name}
          proTitle={pro.title}
          proPhotoUrl={pro.photo_url}
          totalProofs={totalVotes}
          topStrengths={votes.sort((a, b) => b.vote_count - a.vote_count).slice(0, 3).map(v => ({ label: v.category, count: v.vote_count }))}
          savedThemeData={savedVoiceThemeDataOverride ?? savedVoiceThemeData}
          onSaveTheme={(data: any) => {
            setSavedVoiceThemeData(data);
            db.update('professionals', { voice_card_theme: data }, { id: pro.id })
          }}
        />
      )}

      </>)}

      {/* ═══ Tab: 団体管理 ═══ */}
      {dashboardTab === 'org' && ownedOrg && (<>
        <div style={{
          background: 'linear-gradient(135deg, #1A1A2E 0%, #2D2D4E 100%)',
          borderRadius: 16,
          padding: 24,
          marginBottom: 16,
          color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(196,163,90,0.2)',
              border: '1.5px solid rgba(196,163,90,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 'bold', color: '#C4A35A',
            }}>
              {ownedOrg.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{ownedOrg.name}</div>
              <div style={{ fontSize: 11, color: '#C4A35A', fontWeight: 600, marginTop: 2 }}>
                {ownedOrg.type === 'store' ? '店舗オーナー' : ownedOrg.type === 'credential' ? '資格発行団体オーナー' : '教育団体オーナー'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            団体のメンバー管理、バッジ管理、公開ページの確認ができます。
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => window.open('/org/dashboard', '_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.2s',
              textAlign: 'left', width: '100%',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#C4A35A'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
          >
            <span style={{ fontSize: 24 }}>📊</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>ダッシュボード</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>メンバー一覧・プルーフ集計</div>
            </div>
          </button>

          <button
            onClick={() => window.open('/org/dashboard/invite', '_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.2s',
              textAlign: 'left', width: '100%',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#C4A35A'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
          >
            <span style={{ fontSize: 24 }}>✉️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
                {ownedOrg.type === 'store' ? 'メンバー管理' : ownedOrg.type === 'credential' ? '認定者管理' : '修了者管理'}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                {ownedOrg.type === 'store' ? 'メンバーの一覧・管理' : ownedOrg.type === 'credential' ? '認定者の一覧・管理' : '修了者の一覧・管理'}
              </div>
            </div>
          </button>

          {ownedOrg.type !== 'store' && (
            <button
              onClick={() => window.open('/org/dashboard/badges', '_blank')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
                padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.2s',
                textAlign: 'left', width: '100%',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#C4A35A'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
            >
              <span style={{ fontSize: 24 }}>🎖️</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>バッジ管理</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>バッジの作成・取得URL管理</div>
              </div>
            </button>
          )}

          <button
            onClick={() => window.open(`/org/${ownedOrg.id}`, '_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
              padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.2s',
              textAlign: 'left', width: '100%',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#C4A35A'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
          >
            <span style={{ fontSize: 24 }}>🌐</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>公開ページ</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>団体の公開プロフィールを確認</div>
            </div>
          </button>
        </div>
      </>)}

      {/* ═══ Tab: はじめかたガイド ═══ */}
      {dashboardTab === 'guide' && (
      <div style={{ paddingBottom: 40 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: '#1A1A2E', marginBottom: 24 }}>はじめかたガイド</h2>

        {/* ────── STEP 1 ────── */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ background: '#C4A35A', color: '#1A1A2E', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 4, marginRight: 8 }}>STEP 1</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>最初にやること</span>
        </div>

        {/* アコーディオン1: プロフィール */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('profile')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>プロフィールを整える</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>35,000人に公開された時の第一印象を決める</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('profile') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('profile') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>名前</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>本名を推奨。プルーフはあなた個人に紐づく一生の資産。店舗や屋号ではなく、個人名で蓄積することで、独立・転職しても消えない実力の証明になる。</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>写真</p>
                  <p style={{ fontSize: 13, color: '#6B7280' }}>顔がはっきりわかるもの（施術中でもOK）</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>肩書き</p>
                  <p style={{ fontSize: 13, color: '#6B7280' }}>お客さんに伝わる言葉で（例: 痛み改善の専門家）</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>活動エリア</p>
                  <p style={{ fontSize: 13, color: '#6B7280' }}>都道府県 + 詳細（例: 渋谷・恵比寿 / 出張対応: 関東全域）</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>自己紹介文</p>
                  <p style={{ fontSize: 13, color: '#6B7280' }}>あなたの想いや専門性を自由に</p>
                </div>
              </div>
              <a href="/dashboard?tab=profile&edit=true" style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#C4A35A', textDecoration: 'none' }}>→ メニュー ＞ 設定 ＞ プロフィール編集</a>
            </div>
          )}
        </div>

        {/* アコーディオン2: 強み */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('strengths')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>強みを選ぶ</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>お客さんがアンケートで「この人の何が良かった？」と聞かれる項目</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('strengths') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('strengths') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, color: '#1A1A2E', marginBottom: 12, lineHeight: 1.6 }}>あなたがもっとも自信のあることを、85項目の中から <strong>9つ</strong> 選んでください。9つのカテゴリに分かれています:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                {['治療・回復', '体の機能改善', 'ボディメイク', 'パフォーマンス', 'マインド', '発見・気づき', '指導力', 'ビューティー', '栄養・生活'].map(cat => (
                  <span key={cat} style={{ fontSize: 13, color: '#C4A35A', padding: '4px 8px', background: 'white', borderRadius: 4, border: '1px solid #E5E7EB' }}>{cat}</span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>選んだ項目はいつでも変更OK。その時に磨きたい強みに合わせて入れ替えられます。変更しても、過去にもらった票は消えません。</p>
              <a href="/dashboard?tab=proofs" style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#C4A35A', textDecoration: 'none' }}>→ メニュー ＞ 設定 ＞ 強み設定</a>
            </div>
          )}
        </div>

        {/* アコーディオン3: リワード */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('rewards')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>リワードを用意する</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>アンケートへのお礼。設定すると回答率が上がる</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('rewards') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('rewards') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, color: '#1A1A2E', marginBottom: 12, lineHeight: 1.6 }}>8カテゴリから最大3つを選んで設定。お客さんには「種類」だけ見える。中身はアンケート後に開示。</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {[
                  ['プロの秘密', 'あなただけが知っている専門知識'],
                  ['自宅でできる○○', 'セルフケア・セルフワーク'],
                  ['おすすめの一冊', 'あなたの人生を変えた本'],
                  ['おすすめスポット', 'あなたの行きつけ'],
                  ['おすすめ作品', '映画・音楽・Podcast'],
                  ['シークレット', '種類すら非公開。好奇心が最大のトリガー'],
                  ['自由記入', '何でもOK'],
                ].map(([label, desc]) => (
                  <div key={label} style={{ background: 'white', padding: '10px 12px', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#C4A35A' }}>{label}</span>
                    <span style={{ fontSize: 13, color: '#6B7280' }}> — {desc}</span>
                  </div>
                ))}
              </div>
              <a href="/dashboard?tab=rewards" style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#C4A35A', textDecoration: 'none' }}>→ メニュー ＞ 設定 ＞ リワード設定</a>
            </div>
          )}
        </div>

        {/* アコーディオン4: NFCカード */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 24, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('nfc')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>NFCカードを登録する</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>お客さんがスマホをかざすだけでアンケートページへ</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('nfc') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('nfc') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>カード裏面のID（RP-XXXX形式、ハイフンも入力）を入力。お客さんがカードにスマホをかざすだけでアンケートページに飛べるようになる。QRコードより手軽。紛失した場合は無効化→再発行が可能。</p>
              <a href="/dashboard?tab=card" style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#C4A35A', textDecoration: 'none' }}>→ メニュー ＞ 設定 ＞ NFCカード</a>
            </div>
          )}
        </div>

        {/* ────── STEP 2 ────── */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ background: '#C4A35A', color: '#1A1A2E', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 4, marginRight: 8 }}>STEP 2</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>毎日やること</span>
        </div>

        {/* アコーディオン5: 声かけ */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('kakegoe')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>お客さんへの声かけ</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>セッション後にカードを見せるだけ。具体的な声かけ例</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('kakegoe') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('kakegoe') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginBottom: 4 }}>ベストタイミング</p>
                  <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>お客さんが「ありがとう」と言った瞬間。感動が冷めないうちにNFCカードを渡す。</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginBottom: 4 }}>一番シンプル <span style={{ fontSize: 11, background: 'rgba(196,163,90,0.1)', color: '#C4A35A', padding: '1px 6px', borderRadius: 4 }}>★ おすすめ</span></p>
                  <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{`「かんたんなアンケートに\nご協力いただけますか？\nスマホをかざすだけで、\n3分で終わります」`}</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginBottom: 4 }}>理由を添える</p>
                  <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{`「自分の技術を上げるために\nお客さんの声を集めてるんです。\nかんたんなアンケートなんですけど、\nご協力いただけますか？」`}</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginBottom: 4 }}>貢献を伝える</p>
                  <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{`「〇〇さんが感じた変化が、\n次に困っている方の力になります。\nかんたんなアンケートで\n教えていただけますか？」`}</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginBottom: 4 }}>断られたら</p>
                  <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.6 }}>大丈夫。別のお客さんに、別のタイミングで。無理は禁物。</p>
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, textAlign: 'center' as const }}>✕ 使わない言葉: 投票 / 評価 / 口コミ / レビュー / REALPROOF</p>
            </div>
          )}
        </div>

        {/* アコーディオン6: 配布資料 */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 24, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('flyer')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>配布資料</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>「これ何？」と聞かれた時に渡せるチラシ</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('flyer') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('flyer') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>クライアント説明用チラシ（PDF） — 印刷して施術室に置いておく</p>
              <a
                href="/docs/REALPROOF-flyer.pdf"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1A1A2E', color: '#C4A35A', textDecoration: 'none' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 18 15 15"/>
                </svg>
                クライアント説明用チラシ（PDF）
              </a>
            </div>
          )}
        </div>

        {/* ────── STEP 3 ────── */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ background: '#C4A35A', color: '#1A1A2E', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 4, marginRight: 8 }}>STEP 3</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>知っておくと安心</span>
        </div>

        {/* アコーディオン7: プルーフの仕組みとルール */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('rules')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>プルーフの仕組みとルール</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>公平性を保つためのルールと蓄積の仕組み</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('rules') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('rules') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>お客さんが回答する流れ</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.8 }}>NFC/QRをスマホで読み取る → プロフィール表示 → 強みを最大3つ選択（任意） → 人柄を最大3つ（任意） → ひとこと（任意） → メールアドレス入力 → リワード選択 → 完了</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>回数のルール</p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    <p style={{ fontSize: 13, color: '#6B7280' }}>来るたびに声を届けてもらえると嬉しいです</p>
                    <p style={{ fontSize: 13, color: '#6B7280' }}>毎回、その時の正直な感想を記録してもらえます（<span style={{ color: '#C4A35A', fontWeight: 600 }}>7日後から再投票可能</span>）</p>
                    <p style={{ fontSize: 13, color: '#6B7280' }}><span style={{ color: '#C4A35A', fontWeight: 600 }}>30分</span> — 回答後、次の回答まで30分の間隔が必要</p>
                    <div style={{ marginTop: 8, padding: '8px 10px', background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>クライアント構成の分類</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>◎ <strong>はじめて</strong> — 1回目のお客さん</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>● <strong>リピーター</strong> — 2回目のお客さん</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>● <strong>常連</strong> — 3回以上来てくれているお客さん</p>
                      <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>プロフィールページと検索カードに「初回 / リピーター / 常連」の比率グラフが表示されます</p>
                    </div>
                  </div>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>プルーフの蓄積</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>票はプロフィールページにリアルタイム反映。プルーフチャートであなたの多次元的な強みが可視化される。一度もらった票は一生消えない。</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* アコーディオン8: バッジと認定 */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('badges')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>バッジと認定</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>プルーフを集めるほど、あなたのプロフィールが進化する</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('badges') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('badges') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>プルーフ数で解除されるレベル（1つの強み項目単位）</p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    <p style={{ fontSize: 13, color: '#6B7280' }}><span style={{ color: '#C4A35A', fontWeight: 600 }}>15票 PROVEN</span> — プロフィールのバーがゴールドに輝く</p>
                    <p style={{ fontSize: 13, color: '#6B7280' }}><span style={{ color: '#C4A35A', fontWeight: 600 }}>30票 SPECIALIST</span> — 表彰状と名前入りカードが届く</p>
                    <p style={{ fontSize: 13, color: '#6B7280' }}><span style={{ color: '#C4A35A', fontWeight: 600 }}>50票 MASTER</span> — メタリックカードが届く</p>
                  </div>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>極め方でバッジが変わる</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>同じカテゴリ内で深く極めるか、複数カテゴリにわたって幅広く極めるかで、もらえるバッジが変わります。あなたのスタイルに合った成長の仕方を。</p>
                </div>
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>申請方法</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>30票または50票に到達すると、ダッシュボードに申請フォームが自動で表示されます。フォームから申請するだけ。初回申請は無料です。</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* アコーディオン: 検索での見え方 */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('search_algo')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
                検索での見え方 — 上位に出るコツ
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#1A1A2E', background: '#C4A35A', padding: '1px 6px', borderRadius: 3 }}>NEW</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>プロを探す人にどう表示されるかを知っておく</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('search_algo') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('search_algo') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>

                {/* 今月の評価バッジ */}
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>名前の横に表示されるバッジ</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
                    直近30日にプルーフをもらっている場合、検索カードの名前横に表示されます。
                  </p>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    <p style={{ fontSize: 13, color: '#6B7280' }}>🔥 <strong style={{ color: '#1A1A2E' }}>今月 N人に評価されています</strong> — 今月15人以上のプルーフ</p>
                    <p style={{ fontSize: 13, color: '#6B7280' }}>🟢 <strong style={{ color: '#1A1A2E' }}>今月 N人に評価されています</strong> — 今月1〜14人のプルーフ</p>
                  </div>
                </div>

                {/* サブカテゴリタブ */}
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>検索タブの種類と上位に出る条件</p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    <div style={{ padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 2 }}>🔥 今月急上昇</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>直近30日のプルーフ数が多い順。毎月リセットされるので、コンスタントに声かけを続けることが大切。</p>
                    </div>
                    <div style={{ padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 2 }}>⭐ この分野のプロ</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>そのカテゴリの累計プルーフ数が多い順。積み上げが評価されるタブ。</p>
                    </div>
                    <div style={{ padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 2 }}>🔄 リピーターが多い</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>常連（3回以上）の比率が高い順。何度も来てくれるお客さんが多いほど上位に出やすい。統計的な信頼性も加味されるため、母数が多いほど有利。ユニーク投票者が3人以上のプロのみ表示。</p>
                    </div>
                    <div style={{ padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 2 }}>🌊 新規に強い</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>初回のお客さんにしっかり結果を出して声をもらえているプロが上位に。新規客を次々獲得するビジネスタイプに向いたタブ。投票者が5人以上のプロのみ表示。</p>
                    </div>
                    <div style={{ padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 2 }}>🏆 総合力</p>
                      <p style={{ fontSize: 12, color: '#6B7280' }}>累計プルーフ + 直近の勢い + リピーター率を総合した順。バランスよく積み上げているプロが評価される。</p>
                    </div>
                  </div>
                </div>

                {/* Universalカテゴリ */}
                <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>どのカテゴリでも加点される強み項目がある</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
                    強み設定で選べる項目の中に、どの専門分野でも共通して評価される「ユニバーサル項目」があります。たとえば「分かり易い説明」「複数の悩みに対応」「セルフケア指導」など。
                  </p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginTop: 6 }}>
                    これらの項目への票は、<strong style={{ color: '#1A1A2E' }}>あなたが設定している全カテゴリのスコアに0.2倍のボーナス</strong>として加算されます。カテゴリを横断して検索されやすくなる効果があります。
                  </p>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* アコーディオン9: Voices */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('voices')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>Voices — お客さんの声をシェアする</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>「自慢」ではなく「お礼」の文脈で信頼を広げる</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('voices') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('voices') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.7 }}>お客さんがアンケートでひとことを書いてくれた場合、ダッシュボードのVoicesタブに表示されます。タップするとシェアカードが生成され、SNSで「この声にお礼する」形でシェアできます。主語がお客さんの声なので、「自慢」に見えずに信頼が静かに広がる仕組みです。</p>
            </div>
          )}
        </div>

        {/* アコーディオン10: LINE連携 */}
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 32, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('line')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>LINE連携（週次レポート）</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>毎週月曜に成長レポートが届く</div>
            </div>
            <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{openSections.has('line') ? '▲' : '▼'}</span>
          </button>
          {openSections.has('line') && (
            <div style={{ background: '#F9FAFB', padding: '16px', borderTop: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, color: '#1A1A2E', lineHeight: 1.7 }}>LINEを連携すると、毎週月曜朝に成長レポートが届きます: 今週の新規プルーフ数、累計と順位、PROVEN進捗（15票でゴールド認定）、届いた声のハイライト。メールでも届きますが、LINEの方が見逃しにくいです。</p>
              <a href="/dashboard?tab=profile&edit=true" style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#C4A35A', textDecoration: 'none' }}>→ メニュー ＞ 設定 ＞ LINE連携</a>
            </div>
          )}
        </div>

        {/* ────── COMING ────── */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ background: 'rgba(196,163,90,0.15)', color: '#C4A35A', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 4, marginRight: 8 }}>COMING</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>REALPROOFの今後</span>
        </div>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 16 }}>プルーフを集めるだけで終わりません。あなたの強みを活かしてクライアントを獲得し、ビジネスを成長させるための機能を順次追加していく予定です。</p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {[
            ['悩み相談機能（仮）', 'お客さんが悩みを投稿 → あなたが提案を送れる。看板や広告費がなくても、強みだけでクライアントを獲得できる仕組み。'],
            ['オンライン面談（仮）', '10分1,500円。「いきなり対面は不安」というお客さんが、まず画面越しにあなたと話せる。お客さんも安心、あなたにとっては集客導線。'],
            ['予約機能（仮）', 'プロフィールページから直接予約。プルーフを見て「この人に頼みたい」と思ったお客さんが、すぐに行動できる。'],
            ['AIプロ検索（仮）', '「肩が痛くて仕事に集中できない」と話しかけるだけで、AIがプルーフデータから最適なプロを提案。広告費ゼロであなたが見つけてもらえる。'],
            ['知識・スキル販売（仮）', 'あなたの専門知識をコンテンツとして販売できる機能。対面セッション以外の収益源を作れる。'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: 'white', padding: '12px 16px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#C4A35A', marginBottom: 4 }}>{title}</p>
              <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ═══ Tab: 団体（メンバー用リソース閲覧） ═══ */}
      {dashboardTab === 'myorgs' && hasOrgMembership && (<>
        {/* 複数団体の場合: セレクター */}
        {memberOrgs.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <select
              value={selectedMemberOrgId || ''}
              onChange={(e) => handleMemberOrgChange(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid #E5E7EB', fontSize: 14, color: '#1A1A2E',
                backgroundColor: '#fff', boxSizing: 'border-box' as const,
              }}
            >
              {memberOrgs.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 団体名（1団体のみの場合 or セレクターの補足） */}
        {memberOrgs.length === 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            padding: '14px 16px', background: '#fff', borderRadius: 12,
            border: '1px solid #E5E7EB',
          }}>
            {memberOrgs[0].logo_url ? (
              <img src={memberOrgs[0].logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#1A1A2E',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 16, fontWeight: 700,
              }}>
                {memberOrgs[0].name.charAt(0)}
              </div>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
              {memberOrgs[0].name}
            </div>
          </div>
        )}

        {/* 共有資料セクション（バッジ別アコーディオン） */}
        {memberResourcesLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="animate-spin" style={{
              width: 32, height: 32, border: '2px solid #C4A35A',
              borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto',
            }} />
            <p style={{ color: '#9CA3AF', marginTop: 12, fontSize: 13 }}>読み込み中...</p>
          </div>
        ) : memberResources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>まだ共有資料はありません</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {getMemberResourceGroups().map(group => (
              <div key={group.key} id={group.key}>
                {/* アコーディオンヘッダー */}
                <button
                  onClick={() => setMemberAccordionOpen(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: '#F3F4F6', borderRadius: 10,
                    border: 'none', cursor: 'pointer', marginBottom: memberAccordionOpen[group.key] ? 8 : 0,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
                    <span style={{ color: '#6B7280', marginRight: 6 }}>{memberAccordionOpen[group.key] ? '▼' : '▶'}</span>
                    {group.badgeName}
                  </span>
                  <span style={{ fontSize: 13, color: '#9CA3AF' }}>({group.resources.length}件)</span>
                </button>
                {/* アコーディオンコンテンツ */}
                {memberAccordionOpen[group.key] && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {group.resources.map((r: any) => (
                      <div key={r.id} style={{
                        background: '#fff', borderRadius: 14, padding: '18px 16px',
                        border: '1px solid #E5E7EB',
                      }}>
                        <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>
                          {r.title}
                        </h4>
                        {r.description && (
                          <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 12 }}>
                            {r.description}
                          </p>
                        )}
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '8px 16px', borderRadius: 10,
                            background: '#C4A35A', color: '#fff',
                            fontSize: 13, fontWeight: 600, textDecoration: 'none',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#B3923F')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
                        >
                          資料を開く
                          <span aria-hidden="true">→</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>)}


      {!isSettingsTab && (
      <>
      <div style={{ height: 16 }} />

      {/* Links */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-4">
          {pro && (
            <a href={`/card/${pro.id}`} className="flex-1 text-center py-3 border-2 border-[#1A1A2E] text-[#1A1A2E] rounded-lg hover:bg-[#1A1A2E] hover:text-white transition">
              カードを見る
            </a>
          )}
        </div>
        {pro && (
          <button
            onClick={() => window.open(`/vote/${pro.id}?preview=true`, '_blank')}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-[#C4A35A] text-[#C4A35A] rounded-lg hover:bg-[#C4A35A] hover:text-white transition-colors"
          >
            👁️ 投票画面を確認する
          </button>
        )}
      </div>
      </>
      )}

      {/* シェア促進ポップアップ (v1.2.1 §12) — タブに依存せずグローバル表示 */}
      {popupSuggestion && pro && (
        <VoiceSuggestionPopup
          isOpen={true}
          popupType={popupSuggestion.popup_type}
          badgeEvent={popupSuggestion.badge_event}
          vote={popupSuggestion.vote}
          suggestedTheme={popupSuggestion.suggested_theme}
          suggestedPhraseId={popupSuggestion.suggested_phrase_id}
          phraseText={
            voicePhrases.find(p => p.id === popupSuggestion.suggested_phrase_id)?.text
            ?? voicePhrases.find(p => p.is_default)?.text
            ?? ''
          }
          professionalId={pro.id}
          proName={pro.name}
          proTitle={pro.title}
          proPhotoUrl={pro.photo_url}
          // Fix-3: VoiceShareCard と同じデザインを再現するため、
          // トッププルーフ + 表示制御を popup にも渡す。
          // topStrengths は VoiceShareModal の既存パターン同様 votes から
          // sort+slice で導出。VoiceShareModal は配列を渡すが popup は
          // 単一オブジェクト（最上位 1 件）を渡す仕様。
          topStrengths={
            votes.length > 0
              ? (() => {
                  const top = [...votes].sort((a, b) => b.vote_count - a.vote_count)[0]
                  return { label: top.category, count: top.vote_count }
                })()
              : null
          }
          showProof={true}
          showProInfo={true}
          onShare={handlePopupShare}
          onEdit={handlePopupEdit}
          onDismiss={handlePopupDismiss}
        />
      )}

      {/* 認定申請モーダル */}
      {certModal && pro && (
        <CertificationModal
          professionalId={pro.id}
          categorySlug={certModal.slug}
          categoryName={certModal.name}
          proofCount={certModal.count}
          topPersonality={personalityVotes.length > 0 ? [...personalityVotes].sort((a, b) => b.vote_count - a.vote_count)[0].category : null}
          onClose={() => setCertModal(null)}
          onComplete={(certNum) => {
            setCertApplications(prev => [...prev, { category_slug: certModal.slug, status: 'pending' }])
            // モーダルは閉じない → 完了画面を表示し、ユーザーが「ダッシュボードに戻る」を押して閉じる
          }}
        />
      )}

      <InstallPrompt />
    </div>
  )
}

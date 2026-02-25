'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { signOutAndClear } from '@/lib/auth-helper'
import { useAuth } from '@/contexts/AuthContext'
import { Professional, VoteSummary, CustomForte, getResultForteLabel, REWARD_TYPES, getRewardType } from '@/lib/types'
import { resolveProofLabels, resolvePersonalityLabels } from '@/lib/proof-labels'
import ForteChart from '@/components/ForteChart'
import VoiceShareModal from '@/components/VoiceShareCard'
import ImageCropper from '@/components/ImageCropper'
import { PREFECTURES } from '@/lib/prefectures'

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

const CATEGORY_LABELS: Record<string, string> = {
  basic: '基本',
  body_pro: 'ボディプロ',
  yoga: 'ヨガ',
  pilates: 'ピラティス',
  esthe: 'エステ',
  sports: 'スポーツ',
  education: '教育',
  specialist: 'スペシャリスト',
}
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS)

export default function DashboardPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [personalityVotes, setPersonalityVotes] = useState<{category: string, vote_count: number}[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [qrUrl, setQrUrl] = useState('')
  const [qrRefreshed, setQrRefreshed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '', title: '', prefecture: '', area_description: '',
    is_online_available: false,
    bio: '', booking_url: '', photo_url: '', contact_email: '',
  })
  const [customResultFortes, setCustomResultFortes] = useState<CustomForte[]>([])
  const [customPersonalityFortes, setCustomPersonalityFortes] = useState<CustomForte[]>([])
  const [rewards, setRewards] = useState<{ id?: string; reward_type: string; title: string; content: string }[]>([])
  const [showRewardPicker, setShowRewardPicker] = useState(false)
  const [rewardSaving, setRewardSaving] = useState(false)
  const [rewardSaved, setRewardSaved] = useState(false)
  const [rewardError, setRewardError] = useState('')
  const [confirmingDeregister, setConfirmingDeregister] = useState(false)
  const [deregistering, setDeregistering] = useState(false)
  const [formError, setFormError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [hasEmailIdentity, setHasEmailIdentity] = useState(false)

  // プルーフ選択用 state
  const [proofItems, setProofItems] = useState<ProofItem[]>([])
  const [selectedProofIds, setSelectedProofIds] = useState<Set<string>>(new Set())
  const [customProofs, setCustomProofs] = useState<CustomProof[]>([])
  const [activeTab, setActiveTab] = useState('basic')
  const [dashboardTab, setDashboardTab] = useState<'profile' | 'proofs' | 'rewards' | 'voices' | 'org'>('profile')
  const [proofSaving, setProofSaving] = useState(false)
  const [proofSaved, setProofSaved] = useState(false)
  const [proofError, setProofError] = useState('')
  const [customProofVoteCounts, setCustomProofVoteCounts] = useState<Map<string, number>>(new Map())

  // Voices用 state
  const [voiceComments, setVoiceComments] = useState<{ id: string; comment: string; created_at: string }[]>([])
  const [voicePhrases, setVoicePhrases] = useState<{ id: number; text: string; is_default: boolean; sort_order: number }[]>([])
  const [expandedVoice, setExpandedVoice] = useState<string | null>(null)
  const [phraseSelecting, setPhraseSelecting] = useState<string | null>(null)
  const [selectedPhrases, setSelectedPhrases] = useState<Record<string, number>>({})
  const [shareModalVoice, setShareModalVoice] = useState<{ id: string; comment: string; created_at: string } | null>(null)

  // NFC カード管理 state
  const [nfcCard, setNfcCard] = useState<{ id: string; card_uid: string; status: string; linked_at: string | null } | null>(null)
  const [nfcInput, setNfcInput] = useState('')
  const [nfcLoading, setNfcLoading] = useState(false)
  const [nfcError, setNfcError] = useState('')
  const [nfcSuccess, setNfcSuccess] = useState('')
  const [nfcLostCard, setNfcLostCard] = useState<string | null>(null) // 紛失報告したカードUID

  // 団体招待 state
  const [pendingInvites, setPendingInvites] = useState<{id: string; organization_id: string; org_name: string; org_type: string; invited_at: string}[]>([])
  const [inviteProcessing, setInviteProcessing] = useState<string | null>(null)
  const [inviteAccepted, setInviteAccepted] = useState<string | null>(null) // 承認完了メッセージ用

  // 所属団体 state
  const [activeOrgs, setActiveOrgs] = useState<{id: string; member_id: string; org_name: string; org_type: string; accepted_at: string}[]>([])
  const [leavingOrg, setLeavingOrg] = useState<string | null>(null)
  const [credentialBadges, setCredentialBadges] = useState<{id: string; name: string; description: string | null; image_url: string | null; org_name: string; org_id: string}[]>([])

  // 団体オーナー state
  const [ownedOrg, setOwnedOrg] = useState<{id: string; name: string; type: string} | null>(null)

  const { user: authUser, isLoaded: authLoaded } = useAuth()

  useEffect(() => {
    if (!authLoaded) return
    if (!authUser) { window.location.href = '/login?role=pro'; return }

    async function load() {
      const u = authUser
      setUser(u)
      const emailIdentity = u.identities?.find((i: any) => i.provider === 'email')
      setHasEmailIdentity(!!emailIdentity)

      // プルーフ項目マスタ取得（プロの有無にかかわらず必要）
      const { data: piData } = await supabase
        .from('proof_items').select('*').order('sort_order') as any
      if (piData) {
        setProofItems(piData)
      }

      const { data: rawProData } = await (supabase
        .from('professionals').select('*').eq('user_id', u.id).maybeSingle()) as any
      const proData = rawProData as any

      if (!proData) {
        // 新規プロ → プロフィール作成フォームを表示
        setEditing(true)
        setLoading(false)
        return
      }

      setPro(proData)
      setForm({
        name: proData.name || '', title: proData.title || '',
        prefecture: proData.prefecture || '',
        area_description: proData.area_description || '',
        is_online_available: proData.is_online_available || false,
        bio: proData.bio || '', booking_url: proData.booking_url || '',
        photo_url: proData.photo_url || '',
        contact_email: proData.contact_email || '',
      })
      setCustomResultFortes(proData.custom_result_fortes || [])
      setCustomPersonalityFortes(proData.custom_personality_fortes || [])

      // リワード取得
      const { data: rewardData } = await (supabase as any)
        .from('rewards')
        .select('*')
        .eq('professional_id', proData.id)
        .order('sort_order')
      if (rewardData) {
        setRewards(rewardData.map((r: any) => ({
          id: r.id,
          reward_type: r.reward_type,
          title: r.title || '',
          content: r.content || '',
        })))
      }

      // vote_summary: proof_id → ラベル変換
      const { data: rawVoteData } = await supabase.from('vote_summary').select('*').eq('professional_id', proData.id) as any
      if (rawVoteData && piData) {
        const labeledVotes = resolveProofLabels(rawVoteData, piData, proData.custom_proofs || [])
        setVotes(labeledVotes)

        // カスタムプルーフの票数を保存
        const customVoteCounts = new Map<string, number>()
        for (const v of rawVoteData) {
          if (typeof v.proof_id === 'string' && v.proof_id.startsWith('custom_')) {
            customVoteCounts.set(v.proof_id, v.vote_count || 0)
          }
        }
        setCustomProofVoteCounts(customVoteCounts)
      }

      // personality_summary: personality_id → ラベル変換
      const { data: rawPersData } = await supabase.from('personality_summary').select('*').eq('professional_id', proData.id) as any
      if (rawPersData) {
        const { data: persItems } = await supabase.from('personality_items').select('id, label') as any
        if (persItems) {
          const labeledPers = resolvePersonalityLabels(rawPersData, persItems)
          setPersonalityVotes(labeledPers)
        }
      }

      const { count } = await supabase.from('votes').select('*', { count: 'exact', head: true }).eq('professional_id', proData.id).eq('status', 'confirmed') as any
      setTotalVotes(count || 0)

      // ブックマーク数取得
      const { count: bmCount } = await (supabase as any)
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('professional_id', proData.id)
      setBookmarkCount(bmCount || 0)

      // プルーフ選択状態を復元（マスタは上で取得済み）
      if (piData) {
        const validIds = new Set(piData.map((p: ProofItem) => p.id))
        const customIds = new Set((proData.custom_proofs || []).map((c: CustomProof) => c.id))
        const savedProofs: string[] = proData.selected_proofs || []
        // regular proof_item IDs + custom proof IDs の両方を復元
        setSelectedProofIds(new Set(savedProofs.filter((id: string) => validIds.has(id) || customIds.has(id))))
        setCustomProofs(proData.custom_proofs || [])
      }

      // Voices: コメント付き確定投票を取得
      const { data: voiceData } = await supabase
        .from('votes').select('id, comment, created_at')
        .eq('professional_id', proData.id).eq('status', 'confirmed')
        .not('comment', 'is', null).neq('comment', '')
        .order('created_at', { ascending: false }) as any
      if (voiceData) setVoiceComments(voiceData)

      // 感謝フレーズ
      const { data: phrasesData } = await supabase
        .from('gratitude_phrases').select('*').order('sort_order') as any
      if (phrasesData) setVoicePhrases(phrasesData)

      // NFCカード取得
      const { data: nfcData } = await (supabase as any)
        .from('nfc_cards')
        .select('id, card_uid, status, linked_at')
        .eq('professional_id', proData.id)
        .eq('status', 'active')
        .maybeSingle()
      if (nfcData) setNfcCard(nfcData)

      // 団体からの招待を取得
      const { data: memberInvites } = await (supabase as any)
        .from('org_members')
        .select('id, organization_id, invited_at, organizations(name, type)')
        .eq('professional_id', proData.id)
        .eq('status', 'pending')

      if (memberInvites) {
        setPendingInvites(memberInvites.map((m: any) => ({
          id: m.id,
          organization_id: m.organization_id,
          org_name: m.organizations?.name || '不明な団体',
          org_type: m.organizations?.type || 'store',
          invited_at: m.invited_at,
        })))
      }

      // 所属団体（active、credential_level_idなし＝純粋な所属）を取得
      const { data: activeMembers } = await (supabase as any)
        .from('org_members')
        .select('id, organization_id, accepted_at, organizations(id, name, type)')
        .eq('professional_id', proData.id)
        .eq('status', 'active')
        .is('credential_level_id', null)

      if (activeMembers) {
        const allOrgs = activeMembers
          .filter((m: any) => m.organizations)
          .map((m: any) => ({
            id: m.organizations.id,
            member_id: m.id,
            org_name: m.organizations.name,
            org_type: m.organizations.type,
            accepted_at: m.accepted_at,
          }))
        // organization_id で重複排除（最初のレコードを採用）
        const seen = new Set<string>()
        setActiveOrgs(allOrgs.filter((o: any) => {
          if (seen.has(o.id)) return false
          seen.add(o.id)
          return true
        }))
      }

      // credential_levels経由のバッジを取得
      const { data: credBadgeData } = await (supabase as any)
        .from('org_members')
        .select('credential_level_id, credential_levels(id, name, description, image_url), organizations(id, name)')
        .eq('professional_id', proData.id)
        .eq('status', 'active')
        .not('credential_level_id', 'is', null)

      if (credBadgeData) {
        setCredentialBadges(credBadgeData
          .filter((m: any) => m.credential_levels && m.organizations)
          .map((m: any) => ({
            id: m.credential_levels.id,
            name: m.credential_levels.name,
            description: m.credential_levels.description,
            image_url: m.credential_levels.image_url,
            org_name: m.organizations.name,
            org_id: m.organizations.id,
          }))
        )
      }

      // オーナー団体を取得
      const { data: ownedOrgData } = await (supabase as any)
        .from('organizations')
        .select('id, name, type')
        .eq('owner_id', u.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ownedOrgData) {
        setOwnedOrg(ownedOrgData)
      }

      setLoading(false)
    }
    load()
  }, [authLoaded, authUser])

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!user) return

    // セッションリフレッシュ（投票フローで作られた古いセッション対策）
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !session) {
      setFormError('セッションの有効期限が切れています。再ログインしてください。')
      return
    }

    const urlPattern = /https?:\/\/|www\./i
    if (form.name.length > 20) {
      setFormError('名前は20文字以内で入力してください')
      return
    }
    if (urlPattern.test(form.name)) {
      setFormError('名前にURLを含めることはできません')
      return
    }
    if (urlPattern.test(form.contact_email)) {
      setFormError('正しいメールアドレスを入力してください')
      return
    }

    // パスワード設定/変更
    if (newPassword || newPasswordConfirm) {
      if (newPassword.length < 6) {
        setFormError('パスワードは6文字以上で入力してください')
        return
      }
      if (newPassword !== newPasswordConfirm) {
        setFormError('パスワードが一致しません')
        return
      }
    }
    // 新規プロ登録時はパスワード必須（email identityがある場合は任意）
    if (!pro && !hasEmailIdentity && !newPassword) {
      setFormError('パスワードを設定してください')
      return
    }

    const validResultFortes = customResultFortes.filter(f => f.label.trim())
    const validPersonalityFortes = customPersonalityFortes.filter(f => f.label.trim())

    const record: any = {
      user_id: user.id, name: form.name, title: form.title,
      prefecture: form.prefecture || null,
      area_description: form.area_description || null,
      is_online_available: form.is_online_available,
      bio: form.bio || null, booking_url: form.booking_url || null,
      contact_email: form.contact_email || null,
      photo_url: form.photo_url || null,
      custom_result_fortes: validResultFortes,
      custom_personality_fortes: validPersonalityFortes,
      is_founding_member: true,
    }

    const isNew = !pro

    const upsertRecord = pro ? { ...record, id: pro.id } : record
    console.log('[handleSave] user.id:', user.id)
    console.log('[handleSave] pro:', pro)
    console.log('[handleSave] upsertRecord:', JSON.stringify(upsertRecord))
    const { data: savedData, error: saveError } = await (supabase.from('professionals') as any)
      .upsert(upsertRecord, { onConflict: 'user_id' })
      .select()
      .maybeSingle()

    if (saveError) {
      console.error('[handleSave] upsert pro error:', saveError.message, 'code:', (saveError as any).code, 'details:', (saveError as any).details)
      setFormError('プロフィールの保存に失敗しました。もう一度お試しください。')
      return
    }

    let professionalId = pro?.id
    if (savedData) {
      setPro(savedData)
      professionalId = savedData.id
      if (isNew) console.log('[handleSave] new pro created, id:', savedData.id)
    }

    // パスワード設定/変更
    if (newPassword && newPassword.length > 0) {
      const { error: pwError } = await (supabase as any).auth.updateUser({ password: newPassword })
      if (pwError) console.error('[handleSave] password update error:', pwError.message)
    }

    setEditing(false)
  }

  async function generateQR() {
    if (!pro) return
    // 既存トークンを削除
    await (supabase.from('qr_tokens') as any).delete().eq('professional_id', pro.id)
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await (supabase.from('qr_tokens') as any).insert({ professional_id: pro.id, token, expires_at: expiresAt })
    const voteUrl = `${window.location.origin}/vote/${pro.id}?token=${token}`
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
      const { data: card } = await (supabase as any)
        .from('nfc_cards')
        .select('id, status')
        .eq('card_uid', cardUid)
        .maybeSingle()

      if (!card) { setNfcError('カードIDが見つかりません。カード裏面に印字されたIDを確認してください。'); setNfcLoading(false); return }
      if (card.status !== 'unlinked') { setNfcError('このカードは既に使用されています。'); setNfcLoading(false); return }

      // 2. プロに既存のアクティブカードがないことを確認
      const { data: existing } = await (supabase as any)
        .from('nfc_cards')
        .select('id, card_uid')
        .eq('professional_id', pro.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existing) { setNfcError(`既にカード（${existing.card_uid}）が登録されています。先に紛失報告してください。`); setNfcLoading(false); return }

      // 3. カードをアクティブ化
      const { error } = await (supabase as any)
        .from('nfc_cards')
        .update({
          professional_id: pro.id,
          status: 'active',
          linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', card.id)

      if (error) { setNfcError('カードの登録に失敗しました。'); setNfcLoading(false); return }

      // 成功 → state更新
      setNfcCard({ id: card.id, card_uid: cardUid, status: 'active', linked_at: new Date().toISOString() })
      setNfcInput('')
      setNfcSuccess('カードが登録されました ✓')
      setNfcLostCard(null)
      setTimeout(() => setNfcSuccess(''), 3000)
    } catch {
      setNfcError('エラーが発生しました。')
    }
    setNfcLoading(false)
  }

  // NFC カード紛失報告
  async function reportNfcLost() {
    if (!pro || !nfcCard) return
    setNfcLoading(true)
    setNfcError('')

    try {
      const { error } = await (supabase as any)
        .from('nfc_cards')
        .update({
          status: 'lost',
          updated_at: new Date().toISOString(),
        })
        .eq('professional_id', pro.id)
        .eq('status', 'active')

      if (error) { setNfcError('紛失報告に失敗しました。'); setNfcLoading(false); return }

      setNfcLostCard(nfcCard.card_uid)
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
      for (const table of tables) {
        const { error } = await (supabase as any).from(table).delete().eq('professional_id', pro.id)
        if (error) throw new Error(`${table}: ${error.message}`)
      }
      const { error } = await (supabase as any).from('professionals').delete().eq('id', pro.id)
      if (error) throw new Error(`professionals: ${error.message}`)
      window.location.href = '/mycard'
    } catch (e: any) {
      console.error('[handleDeregister] error:', e.message)
      alert('解除に失敗しました')
      setDeregistering(false)
    }
  }

  // 団体招待の承認/拒否（APIルート経由 — getSessionSafeのlocalStorage問題を回避）
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

  // 団体離脱（店舗のみ）
  async function handleLeaveOrg(memberId: string) {
    if (!confirm('この団体から離脱しますか？')) return
    setLeavingOrg(memberId)
    const { error } = await (supabase as any)
      .from('org_members')
      .update({ status: 'removed', removed_at: new Date().toISOString() })
      .eq('id', memberId)

    if (!error) {
      setActiveOrgs(prev => prev.filter(o => o.member_id !== memberId))
    }
    setLeavingOrg(null)
  }

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
    const { error } = await (supabase.from('professionals') as any)
      .update({
        selected_proofs: Array.from(selectedProofIds),
        custom_proofs: filteredCustom,
      })
      .eq('id', pro.id)

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

    // 既存リワードを削除
    const { error: delError } = await (supabase as any).from('rewards').delete().eq('professional_id', pro.id)
    if (delError) {
      console.error('[handleSaveRewards] delete error:', delError.message)
      setRewardError('保存に失敗しました。もう一度お試しください。')
      setRewardSaving(false)
      return
    }

    // 有効なリワードのみ保存
    const validRewards = rewards.filter(r => r.reward_type && r.content.trim())
    if (validRewards.length > 0) {
      const { error: insertError } = await (supabase as any).from('rewards').insert(
        validRewards.map((r, idx) => ({
          professional_id: pro.id,
          reward_type: r.reward_type,
          title: r.title.trim() || '',
          content: r.content.trim(),
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
    if (tab === 'specialist') {
      return customProofs.filter(c => c.label.trim() && selectedProofIds.has(c.id)).length
    }
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
    const { data: affectedVotes } = await (supabase as any)
      .from('votes')
      .select('id, selected_proof_ids')
      .eq('professional_id', pro.id)
      .contains('selected_proof_ids', [cp.id])

    if (affectedVotes && affectedVotes.length > 0) {
      for (const vote of affectedVotes) {
        const updatedIds = (vote.selected_proof_ids || []).filter((id: string) => id !== cp.id)
        const { error: voteError } = await (supabase as any)
          .from('votes')
          .update({ selected_proof_ids: updatedIds })
          .eq('id', vote.id)
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
    const { error } = await (supabase as any)
      .from('professionals')
      .update({
        custom_proofs: updatedCustomProofs.filter(c => c.label.trim()),
        selected_proofs: updatedSelectedIds,
      })
      .eq('id', pro.id)

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
      const { error } = await (supabase.storage.from('avatars') as any).upload(path, file, { upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        setForm(prev => ({...prev, photo_url: urlData.publicUrl + '?t=' + Date.now()}))
      } else {
        console.error('Upload error:', error)
        alert('アップロードに失敗しました')
      }
    } catch (e) {
      console.error('Upload error:', e)
      alert('アップロードに失敗しました')
    }
    setUploading(false)
  }

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>

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
                <img src={form.photo_url} alt="" className={`w-24 h-24 rounded-full object-cover mb-2 ${uploading ? 'opacity-40' : ''}`} />
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名前 *（20文字以内）</label>
            <input required maxLength={20} value={form.name} onChange={e => setForm({...form, name: e.target.value})}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">予約URL</label>
            <input value={form.booking_url} onChange={e => setForm({...form, booking_url: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">連絡先メールアドレス</label>
            <input type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" placeholder="you@example.com" />
            <p className="text-xs text-gray-400 mt-1">カードページに「このプロに相談する」ボタンが表示されます（ログインメールとは別に設定できます）</p>
          </div>
          {/* パスワード設定 */}
          <div className="border-t pt-4">
            <label className="block text-sm font-bold text-[#1A1A2E] mb-2">
              {pro ? 'パスワード変更（変更しない場合は空欄）' : hasEmailIdentity ? 'パスワード変更（変更しない場合は空欄）' : 'パスワード設定 *'}
            </label>
            <div className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                minLength={6}
                required={!pro && !hasEmailIdentity}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
                placeholder={pro ? '新しいパスワード（6文字以上）' : hasEmailIdentity ? '新しいパスワード（6文字以上）' : 'パスワード（6文字以上）'}
              />
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={e => setNewPasswordConfirm(e.target.value)}
                minLength={6}
                required={!pro && !hasEmailIdentity}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
                placeholder={pro ? '新しいパスワード（確認）' : hasEmailIdentity ? '新しいパスワード（確認）' : 'パスワード（確認）'}
              />
            </div>
          </div>

          {formError && <p className="text-red-500 text-sm">{formError}</p>}
          <button type="submit" disabled={uploading}
            className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50 disabled:cursor-not-allowed">
            保存する
          </button>
        </form>

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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">ダッシュボード</h1>
          {user?.email && (
            <p className="text-sm text-gray-400 mt-1 truncate max-w-[260px]">
              {user.email.startsWith('line_') && user.email.endsWith('@line.realproof.jp') ? 'LINE連携済み' : user.email}
            </p>
          )}
        </div>
        <button onClick={() => setEditing(true)} className="text-sm text-[#C4A35A] hover:underline">
          プロフィール編集
        </button>
      </div>

      {/* ダッシュボードタブ */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: 0, marginBottom: 24, borderBottom: '1px solid #E5E7EB', scrollbarWidth: 'none' as any }}>
        {([
          { key: 'profile' as const, label: 'プロフィール' },
          { key: 'proofs' as const, label: '強み設定' },
          { key: 'rewards' as const, label: 'リワード設定' },
          { key: 'voices' as const, label: 'Voices' },
          ...(ownedOrg ? [{ key: 'org' as const, label: '🏢 団体管理' }] : []),
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setDashboardTab(tab.key)}
            style={{
              flex: '0 0 auto',
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: dashboardTab === tab.key ? 700 : 600,
              color: tab.key === 'org'
                ? (dashboardTab === 'org' ? '#C4A35A' : '#B8963E')
                : (dashboardTab === tab.key ? '#1A1A2E' : '#9CA3AF'),
              background: tab.key === 'org' && dashboardTab === 'org' ? 'rgba(196,163,90,0.06)' : 'transparent',
              border: 'none',
              borderBottom: dashboardTab === tab.key
                ? (tab.key === 'org' ? '2px solid #C4A35A' : '2px solid #C4A35A')
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

      {/* ═══ Tab: プロフィール ═══ */}
      {dashboardTab === 'profile' && (<>

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

      {/* 所属団体 */}
      {activeOrgs.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3">所属団体</h3>
          <div className="space-y-3">
            {activeOrgs.map(o => {
              const typeIcon = o.org_type === 'store' ? '🏪' : o.org_type === 'credential' ? '🎓' : '📚'
              return (
                <div key={o.member_id} className="flex items-center justify-between py-2">
                  <a
                    href={`/org/${o.id}`}
                    className="flex items-center gap-3 hover:opacity-70 transition"
                  >
                    <span className="text-lg">{typeIcon}</span>
                    <div>
                      <div className="text-sm font-medium text-[#1A1A2E]">{o.org_name}</div>
                      {o.accepted_at && (
                        <div className="text-xs text-gray-400">
                          {new Date(o.accepted_at).toLocaleDateString('ja-JP')} {o.org_type === 'credential' ? 'から認定' : o.org_type === 'education' ? 'から修了' : 'から所属'}
                        </div>
                      )}
                    </div>
                  </a>
                  {/* 店舗からのみ自分で離脱可能 */}
                  {o.org_type === 'store' && (
                    <button
                      onClick={() => handleLeaveOrg(o.member_id)}
                      disabled={leavingOrg === o.member_id}
                      className="text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-50"
                    >
                      {leavingOrg === o.member_id ? '...' : '離脱'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Founding Member Challenge */}
      {(pro as any)?.founding_member_status === 'achieved' && (
        <div style={{
          background: 'rgba(196,163,90,0.08)',
          border: '1px solid rgba(196,163,90,0.3)',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 18 }}>✦</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#C4A35A' }}>
              Founding Member
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>
              達成日: {(pro as any).founding_member_achieved_at
                ? new Date((pro as any).founding_member_achieved_at).toLocaleDateString('ja-JP')
                : '—'}
            </div>
          </div>
        </div>
      )}
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
                <a key={badge.id} href={`/org/${badge.org_id}`} className="flex flex-col items-center hover:opacity-70 transition">
                  {badge.image_url ? (
                    <img src={badge.image_url} alt={badge.name} className="w-16 h-16 rounded-xl object-cover" />
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
                  <img src={badge.image_url} alt={badge.label} className="w-16 h-16" />
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

      {/* トッププルーフ — 黒背景横長 */}
      {topForte !== '-' && (
        <div className="rounded-xl p-4 mb-8 flex items-center justify-between gap-3" style={{ background: '#1A1A2E' }}>
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#9CA3AF', fontFamily: "'Inter', sans-serif" }}>TOP PROOF</div>
            <div className="text-lg font-bold mt-0.5" style={{ color: '#FFFFFF' }}>{topForte}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: '#C4A35A', fontFamily: "'Inter', sans-serif" }}>
              {votes.length > 0 ? votes.sort((a, b) => b.vote_count - a.vote_count)[0]?.vote_count : 0}
            </div>
            <div className="text-[10px]" style={{ color: '#9CA3AF' }}>votes</div>
          </div>
        </div>
      )}
      {topForte === '-' && <div className="mb-8" />}

      {/* Proof Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">プルーフチャート</h2>
        <ForteChart votes={votes} personalityVotes={personalityVotes} professional={pro} />
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8 text-center">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">24時間限定 投票用QRコード</h2>
        {(() => {
          const proofsReady = selectedProofIds.size === 9

          if (!proofsReady) {
            return (
              <div className="py-4">
                <p className="text-sm text-[#9CA3AF] mb-3">
                  QRコードを発行するには、プルーフ設定を完了してください：
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <span className="text-red-400">✗</span>
                    <span className="text-[#1A1A2E]">プルーフ設定（{selectedProofIds.size} / 9 選択中）</span>
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

      {/* NFC Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">NFCカード</h2>

        {nfcCard ? (
          // 状態B: カード登録済み
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
              onClick={reportNfcLost}
              disabled={nfcLoading}
              style={{
                fontSize: 13, fontWeight: 600,
                color: '#EF4444', background: 'transparent',
                border: '1px solid #FCA5A5', borderRadius: 8,
                padding: '8px 16px', cursor: 'pointer',
                opacity: nfcLoading ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {nfcLoading ? '処理中...' : '紛失を報告する'}
            </button>
          </div>
        ) : (
          // 状態A: カード未登録 / 状態C: 紛失報告後
          <div>
            {nfcLostCard && (
              <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                前のカード（{nfcLostCard}）は紛失として無効化されました。
              </p>
            )}
            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              カード裏面に印字されたIDを入力してください
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={nfcInput}
                onChange={(e) => { setNfcInput(e.target.value); setNfcError('') }}
                placeholder="RP-001"
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

      </>)}

      {/* ═══ Tab: 強み設定 ═══ */}
      {dashboardTab === 'proofs' && (<>

      {/* プルーフ設定 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">プルーフ設定</h2>
        <p className="text-sm text-[#9CA3AF] mb-4">
          クライアントに投票してもらう「強み項目」を選んでください
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
            {activeTab === 'specialist' ? (
              /* スペシャリストタブ: カスタム項目の管理 */
              <div className="space-y-2 mb-6">
                <p className="text-xs text-[#9CA3AF] mb-3">
                  あなた独自の強み項目を作成し、チェックで投票対象に追加できます（最大3個）
                </p>

                {customProofs.map((cp, idx) => {
                  const isChecked = selectedProofIds.has(cp.id)
                  const isDisabled = !isChecked && isMaxSelected
                  const voteCount = customProofVoteCounts.get(cp.id) || 0
                  const hasLabel = cp.label.trim().length > 0

                  return (
                    <div key={cp.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isChecked ? 'bg-[#FAFAF7]' : ''
                    }`}>
                      {/* チェックボックス */}
                      <div
                        className={`relative flex-shrink-0 ${hasLabel ? 'cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
                        onClick={() => hasLabel && !isDisabled && toggleCustomProofSelection(cp.id)}
                      >
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

                      {/* ラベル入力 */}
                      <input
                        value={cp.label}
                        onChange={e => updateCustomProofLabel(idx, e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A]"
                        placeholder="例：独自のアプローチがある"
                      />

                      {/* 票数 */}
                      {voteCount > 0 && (
                        <span className="text-xs text-[#C4A35A] font-medium flex-shrink-0">{voteCount}票</span>
                      )}

                      {/* 削除ボタン */}
                      <button
                        type="button"
                        onClick={() => deleteCustomProof(idx)}
                        className="px-2 py-1.5 text-[#9CA3AF] hover:text-red-500 transition-colors text-sm flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}

                {/* カスタム項目追加ボタン */}
                {customProofs.length < 3 && (
                  <button
                    type="button"
                    onClick={addCustomProof}
                    className="w-full py-2 border-2 border-dashed border-[#E5E7EB] rounded-lg text-sm text-[#9CA3AF] hover:border-[#C4A35A] hover:text-[#C4A35A] transition-colors"
                  >
                    + カスタム項目を追加（残り{3 - customProofs.length}枠）
                  </button>
                )}
              </div>
            ) : (
              /* 通常タブ: 既存プルーフ項目 */
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
                          <span className="text-sm text-[#1A1A2E]">{item.label}</span>
                          <span className="text-xs text-[#9CA3AF] ml-2">{item.strength_label}</span>
                        </div>
                      </label>
                    )
                  })}
              </div>
            )}

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
              {proofSaving ? '保存中...' : proofSaved ? '保存しました' : 'プルーフ設定を保存'}
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
                  {customProofs
                    .filter(c => c.label.trim() && selectedProofIds.has(c.id))
                    .map(c => (
                      <span key={c.id} className="px-3 py-1 bg-[#C4A35A] text-white text-xs rounded-full">
                        {c.label}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      </>)}

      {/* ═══ Tab: リワード設定 ═══ */}
      {dashboardTab === 'rewards' && (<>

      {/* リワード設定 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">リワード設定</h2>
        <p className="text-sm text-[#9CA3AF] mb-4">
          リワードは任意です。設定しなくても投票は受け付けられます。
        </p>
        <p className="text-sm text-[#9CA3AF] mb-4">
          投票してくれたクライアントへのお礼を設定。プロの秘密やおすすめを共有して、信頼を深めましょう。
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
              const displayLabel = rt?.label || reward.reward_type
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
                      placeholder={reward.reward_type === 'selfcare' ? 'タイトル（例：自宅でできる肩こり解消法）' : 'タイトル（例：FNTアプリドリル）'}
                    />
                  )}
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
            ) : (
              <>
                <p className="text-sm font-medium text-[#1A1A2E] mb-3">カテゴリを選択</p>
                <div className="space-y-2 mb-3">
                  {REWARD_TYPES
                    .filter(rt => !rewards.some(r => r.reward_type === rt.id))
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
        {rewardError && <p className="text-red-500 text-sm mb-2">{rewardError}</p>}
        <button
          onClick={handleSaveRewards}
          disabled={rewardSaving}
          className={`w-full py-3 rounded-xl text-sm font-medium tracking-wider transition-colors ${
            rewardSaved
              ? 'bg-green-500 text-white'
              : 'bg-[#1A1A2E] text-[#C4A35A] hover:bg-[#2a2a4e]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {rewardSaving ? '保存中...' : rewardSaved ? '保存しました' : 'リワード設定を保存'}
        </button>

        {/* 設定済み一覧 */}
        {rewards.filter(r => r.content.trim()).length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
            <p className="text-xs text-[#9CA3AF] mb-2">設定中のリワード</p>
            <div className="flex flex-wrap gap-2">
              {rewards.filter(r => r.content.trim()).map((r, idx) => {
                const rt = getRewardType(r.reward_type)
                return (
                  <span key={idx} className="px-3 py-1 bg-[#C4A35A]/10 text-[#1A1A2E] text-xs rounded-full">
                    {rt?.label || r.reward_type}
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
                <div key={c.id}
                  onClick={() => { if (!isExpanded) setExpandedVoice(c.id) }}
                  style={{
                    background: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
                    border: '1px solid #E8E4DC',
                    borderRadius: 14, padding: '20px',
                    cursor: !isExpanded ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontSize: 32, color: 'rgba(196, 163, 90, 0.3)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', lineHeight: 1.8, margin: '4px 0 10px' }}>{c.comment}</div>
                  <div style={{ fontSize: 11, color: '#888888', fontFamily: "'Inter', sans-serif" }}>
                    {new Date(c.created_at).toLocaleDateString('ja-JP')}
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #E8E4DC', marginTop: 14, paddingTop: 14 }}
                      onClick={e => e.stopPropagation()}>
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
                                background: selectedPhraseId === p.id ? '#C4A35A' : '#FAF8F4',
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
                            background: '#FAF8F4', border: '1px solid #E8E4DC',
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
                        この声にお礼する
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
          phraseText={
            voicePhrases.find(p => p.id === selectedPhrases[shareModalVoice.id])?.text
            || voicePhrases.find(p => p.is_default)?.text || ''
          }
          proId={pro.id}
          proName={pro.name}
          proTitle={pro.title}
          proPhotoUrl={pro.photo_url}
          proPrefecture={pro.prefecture}
          proAreaDescription={pro.area_description}
          totalProofs={totalVotes}
          topStrengths={votes.sort((a, b) => b.vote_count - a.vote_count).slice(0, 3).map(v => ({ label: v.category, count: v.vote_count }))}
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
                {ownedOrg.type === 'store' ? 'メンバー招待' : ownedOrg.type === 'credential' ? '認定者追加' : '修了者追加'}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>メールで招待を送信</div>
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

      <div style={{ height: 16 }} />

      {/* Links */}
      <div className="flex gap-4">
        {pro && (
          <a href={`/card/${pro.id}`} className="flex-1 text-center py-3 border-2 border-[#1A1A2E] text-[#1A1A2E] rounded-lg hover:bg-[#1A1A2E] hover:text-white transition">
            カードを見る
          </a>
        )}
        <button onClick={() => signOutAndClear('/')}
          className="px-6 py-3 text-gray-500 hover:text-red-500 transition">
          ログアウト
        </button>
      </div>

      {/* プロ登録解除 */}
      <div className="mt-6 text-center">
        {confirmingDeregister ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-600 font-medium mb-3">
              本当にプロ登録を解除しますか？プロフィールやプルーフデータが削除されます。この操作は取り消せません。
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleDeregister}
                disabled={deregistering}
                className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition disabled:opacity-50"
              >
                {deregistering ? '処理中...' : '解除する'}
              </button>
              <button
                onClick={() => setConfirmingDeregister(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDeregister(true)}
            className="text-sm text-red-400 hover:text-red-600 transition"
          >
            プロ登録を解除する
          </button>
        )}
      </div>
    </div>
  )
}

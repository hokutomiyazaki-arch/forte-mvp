'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { db, uploadFile } from '@/lib/db'
import { REWARD_TYPES, getRewardType, FNT_NEURO_APPS } from '@/lib/types'
import { PREFECTURES } from '@/lib/prefectures'
import ImageCropper from '@/components/ImageCropper'
import { TAB_ORDER, TAB_DISPLAY_NAMES } from '@/lib/constants'
import { validateBookingUrl } from '@/lib/validation'

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

export default function SetupPage() {
  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const clerkUserId = clerkUser?.id

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [proId, setProId] = useState<string | null>(null)

  // マスターデータ
  const [proofItems, setProofItems] = useState<ProofItem[]>([])

  // === Step 1: プロフィール ===
  const [form, setForm] = useState({
    last_name: '', first_name: '', title: '', prefecture: '',
    area_description: '', is_online_available: false, photo_url: '',
  })
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // === Step 2: プルーフ選択 ===
  const [selectedProofIds, setSelectedProofIds] = useState<Set<string>>(new Set())
  const [customProofs, setCustomProofs] = useState<CustomProof[]>([])
  const [activeTab, setActiveTab] = useState('healing')
  const [proofSaving, setProofSaving] = useState(false)
  const [proofError, setProofError] = useState('')

  // === Step 3: リワード ===
  const [rewards, setRewards] = useState<{ id?: string; reward_type: string; title: string; content: string; url?: string }[]>([])
  const [showRewardPicker, setShowRewardPicker] = useState(false)
  const [rewardSaving, setRewardSaving] = useState(false)
  const [rewardError, setRewardError] = useState('')
  const [availableApps, setAvailableApps] = useState<any[]>([])
  const [availableAppsLoaded, setAvailableAppsLoaded] = useState(false)
  const [showOrgAppPicker, setShowOrgAppPicker] = useState(false)

  // === Step 4: 予約・連絡先URL (Phase 2 追加) ===
  const [bookingUrl, setBookingUrl] = useState('')
  const [bookingUrlError, setBookingUrlError] = useState('')
  const [bookingSaving, setBookingSaving] = useState(false)

  // 初期ロード
  useEffect(() => {
    if (!authLoaded || !clerkUserId) return

    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        if (!data.role || data.role !== 'professional') {
          window.location.href = '/mycard'
          return
        }
        if (data.setupCompleted) {
          window.location.href = '/dashboard'
          return
        }

        if (data.proofItems) setProofItems(data.proofItems)

        const pro = data.professional
        if (pro) {
          setProId(pro.id)
          setForm({
            last_name: pro.last_name || '',
            first_name: pro.first_name || '',
            title: pro.title || '',
            prefecture: pro.prefecture || '',
            area_description: pro.area_description || '',
            is_online_available: pro.is_online_available || false,
            photo_url: pro.photo_url || '',
          })

          // Step 4 (Phase 2): 既存プロの booking_url を復元 (再編集ケース)
          setBookingUrl(pro.booking_url || '')

          // プルーフ選択状態を復元
          if (data.proofItems) {
            const validIds = new Set(data.proofItems.map((p: ProofItem) => p.id))
            const customIds = new Set((pro.custom_proofs || []).map((c: CustomProof) => c.id))
            const savedProofs: string[] = pro.selected_proofs || []
            setSelectedProofIds(new Set(savedProofs.filter((id: string) => validIds.has(id) || customIds.has(id))))
            setCustomProofs(pro.custom_proofs || [])
          }
        }

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

        setLoading(false)
      })
      .catch(err => {
        console.error('[setup] load error:', err)
        setLoading(false)
      })
  }, [authLoaded, clerkUserId])

  // === プルーフ選択ヘルパー ===
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
        if (next.size >= 9) return prev
        next.add(id)
      }
      return next
    })
  }

  function toggleCustomProofSelection(id: string) {
    setSelectedProofIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= 9) return prev
        next.add(id)
      }
      return next
    })
  }

  function addCustomProof() {
    if (customProofs.length >= 3) return
    setCustomProofs([...customProofs, { id: `custom_${Date.now()}`, label: '' }])
  }

  function updateCustomProofLabel(idx: number, label: string) {
    const updated = [...customProofs]
    updated[idx] = { ...updated[idx], label }
    setCustomProofs(updated)
  }

  function removeCustomProof(idx: number) {
    const cp = customProofs[idx]
    if (!cp) return
    setSelectedProofIds(prev => {
      const next = new Set(prev)
      next.delete(cp.id)
      return next
    })
    setCustomProofs(customProofs.filter((_, i) => i !== idx))
  }

  function getCategorySelectedCount(tab: string): number {
    return proofItems.filter(p => p.tab === tab && selectedProofIds.has(p.id)).length
  }

  // === 写真アップロード ===
  async function handleCropComplete(croppedBlob: Blob) {
    setCropImageSrc(null)
    if (!clerkUserId) return
    setUploading(true)
    try {
      const file = new File([croppedBlob], `profile-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const path = `${clerkUserId}/avatar.jpg`
      const result = await uploadFile('avatars', path, file, { upsert: true })
      if (result.publicUrl) {
        setForm(prev => ({ ...prev, photo_url: result.publicUrl + '?t=' + Date.now() }))
      } else {
        alert('アップロードに失敗しました')
      }
    } catch {
      alert('アップロードに失敗しました')
    }
    setUploading(false)
  }

  // === Step 1: プロフィール保存 ===
  async function handleSaveProfile() {
    setSaving(true)
    setFormError('')

    if (!form.last_name.trim() || !form.first_name.trim()) {
      setFormError('姓と名を入力してください')
      setSaving(false)
      return
    }
    if (!form.title.trim()) {
      setFormError('肩書きを入力してください')
      setSaving(false)
      return
    }
    if (!form.prefecture) {
      setFormError('都道府県を選択してください')
      setSaving(false)
      return
    }

    const urlPattern = /https?:\/\/|www\./i
    if (urlPattern.test(form.last_name) || urlPattern.test(form.first_name)) {
      setFormError('名前にURLを含めることはできません')
      setSaving(false)
      return
    }

    const record: any = {
      user_id: clerkUserId,
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      name: `${form.last_name.trim()} ${form.first_name.trim()}`,
      title: form.title.trim(),
      prefecture: form.prefecture || null,
      area_description: form.area_description.trim() || null,
      is_online_available: form.is_online_available,
      photo_url: form.photo_url || null,
    }

    const upsertRecord = proId ? { ...record, id: proId } : record
    const { data: savedData, error } = await db.upsert(
      'professionals', upsertRecord, { onConflict: 'user_id' },
      { select: '*', maybeSingle: true }
    )

    if (error) {
      setFormError('保存に失敗しました。もう一度お試しください。')
      setSaving(false)
      return
    }

    if (savedData) {
      setProId(savedData.id)
    }

    // clients テーブルにも名前を同期
    await db.update('clients', {
      last_name: record.last_name,
      first_name: record.first_name,
      nickname: record.name,
    }, { user_id: clerkUserId })

    setSaving(false)
    setCurrentStep(2)
  }

  // === Step 2: プルーフ保存 ===
  async function handleSaveProofs() {
    if (!proId) return
    setProofSaving(true)
    setProofError('')

    const filteredCustom = customProofs.filter(c => c.label.trim())
    const { error } = await db.update('professionals', {
      selected_proofs: Array.from(selectedProofIds),
      custom_proofs: filteredCustom,
    }, { id: proId })

    if (error) {
      setProofError('保存に失敗しました。もう一度お試しください。')
      setProofSaving(false)
      return
    }

    setProofSaving(false)
    setCurrentStep(3)
  }

  // === Step 3: リワード保存 → Step 4 へ進む ===
  // Phase 2 でステップ追加。完了処理 (/api/setup/complete + redirect) は Step 4 へ移動。
  async function handleSaveRewardsAndAdvance() {
    if (!proId) return
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

    // ③ 空contentのリワードがある場合に警告
    const emptyRewards = rewards.filter(r => r.reward_type && !r.content.trim())
    if (emptyRewards.length > 0 && validRewards.length === 0) {
      setRewardError('リワードの内容を入力してください。')
      setRewardSaving(false)
      return
    }

    // ④ 既存リワードを削除
    const { error: delError } = await db.delete('rewards', { professional_id: proId })
    if (delError) {
      setRewardError('保存に失敗しました。もう一度お試しください。')
      setRewardSaving(false)
      return
    }

    // ⑤ 有効なリワードをINSERT
    if (validRewards.length > 0) {
      const { error: insertError } = await db.insert('rewards',
        validRewards.map((r, idx) => ({
          professional_id: proId,
          reward_type: r.reward_type,
          title: r.title.trim() || '',
          content: r.content.trim(),
          url: r.reward_type === 'org_app' ? (r.url || null) : null,
          sort_order: idx,
        }))
      )
      if (insertError) {
        setRewardError('保存に失敗しました。もう一度お試しください。')
        setRewardSaving(false)
        return
      }
    }

    // Step 4 (booking_url) へ進む。完了処理は Step 4 で実行。
    setRewardSaving(false)
    setCurrentStep(4)
  }

  // === Step 4: setup_completed → /dashboard 遷移の共通処理 ===
  async function finalizeSetupAndGo() {
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('[setup] complete API failed:', res.status, body)
        setBookingUrlError('完了処理に失敗しました。もう一度お試しください。')
        setBookingSaving(false)
        return false
      }
    } catch (err) {
      console.error('[setup] complete API network error:', err)
      setBookingUrlError('ネットワークエラーが発生しました。もう一度お試しください。')
      setBookingSaving(false)
      return false
    }
    window.location.href = '/dashboard'
    return true
  }

  // === Step 4: 予約・連絡先URL 保存 + 完了 ===
  async function handleSaveBookingUrl() {
    if (!proId || bookingSaving) return

    const validation = validateBookingUrl(bookingUrl)
    if (!validation.valid) {
      setBookingUrlError(validation.error)
      return
    }

    setBookingSaving(true)
    setBookingUrlError('')

    const trimmed = bookingUrl.trim()
    const { error } = await db.update(
      'professionals',
      { booking_url: trimmed || null },
      { id: proId }
    )

    if (error) {
      setBookingUrlError('保存に失敗しました。もう一度お試しください。')
      setBookingSaving(false)
      return
    }

    await finalizeSetupAndGo()
  }

  // === Step 4: スキップ → 完了 ===
  async function handleSkipBookingUrl() {
    if (!proId || bookingSaving) return
    setBookingSaving(true)
    setBookingUrlError('')
    await finalizeSetupAndGo()
  }

  // === バリデーション ===
  const profileReady = !!(form.last_name.trim() && form.first_name.trim() && form.title.trim() && form.prefecture)
  const proofsReady = isExactNine
  const rewardsReady = true

  // ローディング
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="w-12 h-12 border-4 border-[#C4A35A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: '#666' }}>読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF7' }}>
      {/* ヘッダー */}
      <div style={{ background: '#1A1A2E', padding: '16px 20px' }}>
        <span style={{ color: '#C4A35A', fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>REALPROOF</span>
      </div>

      {/* プログレスバー (Phase 2 で 4 段階に拡張) */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[1, 2, 3, 4].map(step => (
            <div
              key={step}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                background: step <= currentStep ? '#C4A35A' : '#E5E2D9',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>
          ステップ {currentStep} / 4
        </p>
      </div>

      {/* コンテンツ */}
      <div style={{ padding: '20px', maxWidth: 480, margin: '0 auto' }}>

        {/* ═══════════════════════════════════════ */}
        {/* Step 1: プロフィール基本情報             */}
        {/* ═══════════════════════════════════════ */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-2 text-center">
              まず、あなたのことを教えてください
            </h2>
            <p className="text-sm text-[#9CA3AF] mb-6 text-center">
              基本情報を入力してください
            </p>

            {/* プロフィール写真 */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="" loading="lazy"
                    className={`w-24 h-24 rounded-full object-cover mb-2 ${uploading ? 'opacity-40' : ''}`} />
                ) : (
                  <div className={`w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm mb-2 ${uploading ? 'opacity-40' : ''}`}>写真</div>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center mb-2">
                    <div className="w-8 h-8 border-3 border-[#C4A35A] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <label className={`text-sm text-[#C4A35A] hover:underline ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                {uploading ? 'アップロード中...' : '写真を設定（任意）'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { alert('画像サイズは5MB以下にしてください'); return }
                  if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください'); return }
                  const reader = new FileReader()
                  reader.onload = () => setCropImageSrc(reader.result as string)
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }} />
              </label>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">姓 *</label>
                  <input maxLength={20} value={form.last_name}
                    onChange={e => setForm({ ...form, last_name: e.target.value })}
                    placeholder="山田"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">名 *</label>
                  <input maxLength={20} value={form.first_name}
                    onChange={e => setForm({ ...form, first_name: e.target.value })}
                    placeholder="太郎"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">肩書き *</label>
                <input value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="パーソナルトレーナー / 整体師 など"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">都道府県 *</label>
                <select value={form.prefecture}
                  onChange={e => setForm({ ...form, prefecture: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none">
                  <option value="">選択してください</option>
                  {PREFECTURES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">活動エリア</label>
                <input value={form.area_description}
                  onChange={e => setForm({ ...form, area_description: e.target.value })}
                  placeholder="渋谷・恵比寿エリア / 出張対応：関東全域 など"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_online_available}
                  onChange={e => setForm({ ...form, is_online_available: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-[#C4A35A] focus:ring-[#C4A35A]" />
                <label className="text-sm font-medium text-gray-700">オンライン対応可</label>
              </div>
            </div>

            {formError && <p className="text-red-500 text-sm mt-3">{formError}</p>}

            <button
              onClick={handleSaveProfile}
              disabled={!profileReady || saving || uploading}
              style={{
                width: '100%', padding: '16px 0', marginTop: 24, borderRadius: 12,
                fontWeight: 700, fontSize: 18, color: '#fff', border: 'none',
                background: '#C4A35A',
                opacity: profileReady && !saving && !uploading ? 1 : 0.4,
                cursor: profileReady && !saving && !uploading ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.2s',
              }}
            >
              {saving ? '保存中...' : '次へ'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* Step 2: プルーフ項目を選ぶ              */}
        {/* ═══════════════════════════════════════ */}
        {currentStep === 2 && (
          <div>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-2 text-center">
              クライアントに見せたい強みを選びましょう
            </h2>
            <p className="text-sm text-[#9CA3AF] mb-6 text-center">
              9個を選んでください
            </p>

            {/* プログレス */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[#1A1A2E]">{totalSelected} / 9 選択中</span>
                {isExactNine && <span className="text-xs text-[#C4A35A] font-medium">✓ 選択完了</span>}
                {remaining > 0 && <span className="text-xs text-[#9CA3AF] font-medium">あと{remaining}個</span>}
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
                            isChecked ? 'bg-[#C4A35A] border-[#C4A35A]' : 'bg-white border-[#E5E7EB]'
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

            <p className="text-xs text-[#9CA3AF] mb-4">
              ※ 「期待できそう！」はすべてのプロに自動で表示されます
            </p>

            {/* 選択一覧 */}
            {totalSelected > 0 && (
              <div className="mb-4 pt-4 border-t border-[#E5E7EB]">
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

            {proofError && <p className="text-red-500 text-sm mb-2">{proofError}</p>}

            <button
              onClick={handleSaveProofs}
              disabled={!proofsReady || proofSaving}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 12,
                fontWeight: 700, fontSize: 18, color: '#fff', border: 'none',
                background: '#C4A35A',
                opacity: proofsReady && !proofSaving ? 1 : 0.4,
                cursor: proofsReady && !proofSaving ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.2s',
              }}
            >
              {proofSaving ? '保存中...' : '次へ'}
            </button>

            <button
              onClick={() => setCurrentStep(1)}
              style={{
                width: '100%', padding: '12px 0', marginTop: 8,
                background: 'none', border: 'none',
                fontSize: 14, color: '#9CA3AF', cursor: 'pointer',
              }}
            >
              ← 戻る
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* Step 3: リワードを設定する               */}
        {/* ═══════════════════════════════════════ */}
        {currentStep === 3 && (
          <div>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-2 text-center">
              投票してくれた方へのお返しを設定しましょう
            </h2>
            <p className="text-sm text-[#9CA3AF] mb-6 text-center">
              プロの秘密やおすすめを共有して、信頼を深めましょう（後からでも設定できます）
            </p>

            {/* プログレス */}
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
                        <button type="button" onClick={() => setRewards(rewards.filter((_, i) => i !== idx))}
                          className="text-sm text-[#9CA3AF] hover:text-red-500 transition-colors">
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
                          className="w-full px-3 py-2 mb-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A]"
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
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...rewards]
                                    updated[idx] = { ...updated[idx], content: isAppSelected ? '' : app.url }
                                    setRewards(updated)
                                  }}
                                  className={`flex-1 text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                                    isAppSelected
                                      ? 'border-[#C4A35A] bg-[#C4A35A]/10 font-medium text-[#1A1A2E]'
                                      : 'border-[#E5E7EB] bg-white text-[#1A1A2E] hover:bg-[#FAFAF7]'
                                  }`}>
                                  <span className={isAppSelected ? 'text-[#C4A35A] mr-2' : 'text-[#E5E7EB] mr-2'}>
                                    {isAppSelected ? '●' : '○'}
                                  </span>
                                  {app.name}
                                </button>
                                <a href={app.url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-[#C4A35A] hover:underline whitespace-nowrap px-2 py-2">
                                  ▶ プレビュー
                                </a>
                              </div>
                            )
                          })}
                          {!reward.content && <p className="text-xs text-red-400 mt-1">リワードを選択してください</p>}
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
                            className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] resize-none"
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
                          className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] resize-none"
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
                  <button type="button" onClick={() => setShowRewardPicker(true)}
                    className="w-full py-2 text-sm text-[#C4A35A] font-medium hover:text-[#b3923f] transition-colors">
                    + リワードを追加（残り{3 - rewards.length}枠）
                  </button>
                ) : showOrgAppPicker ? (
                  <>
                    <p className="text-sm font-medium text-[#1A1A2E] mb-3">追加するリワードを選択</p>
                    <div className="space-y-2 mb-3">
                      {availableApps.map((app: any) => (
                        <button key={app.id} type="button"
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
                          className="w-full text-left px-3 py-2.5 rounded-lg border border-[#E5E7EB] hover:bg-[#FAFAF7] transition-colors">
                          <span className="text-sm font-medium text-[#1A1A2E]">{app.title}</span>
                          {app.description && (
                            <span className="text-xs text-[#9CA3AF] ml-2">{app.description}</span>
                          )}
                          <span className="text-xs text-[#C4A35A] ml-2">追加する ＋</span>
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setShowOrgAppPicker(false)}
                      className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                      ← カテゴリ一覧に戻る
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[#1A1A2E] mb-3">カテゴリを選択</p>
                    <div className="space-y-2 mb-3">
                      {REWARD_TYPES
                        .filter(rt => !rewards.some(r => r.reward_type === rt.id))
                        .map(rt => (
                          <button key={rt.id} type="button"
                            onClick={() => {
                              setRewards([...rewards, { reward_type: rt.id, title: '', content: '' }])
                              setShowRewardPicker(false)
                            }}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition-colors">
                            <span className="text-sm font-medium text-[#1A1A2E]">{rt.label}</span>
                            <span className="text-xs text-[#9CA3AF] ml-2">{rt.description}</span>
                          </button>
                        ))}
                      {availableAppsLoaded && availableApps.length > 0 && (
                        <button type="button"
                          onClick={() => setShowOrgAppPicker(true)}
                          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition-colors">
                          <span className="text-sm font-medium text-[#1A1A2E]">団体配布</span>
                          <span className="text-xs text-[#9CA3AF] ml-2">所属団体のリワードをクライアントにプレゼント</span>
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowRewardPicker(false)}
                      className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                      キャンセル
                    </button>
                  </>
                )}
              </div>
            )}


            {rewardError && <p className="text-red-500 text-sm mb-2">{rewardError}</p>}

            <button
              onClick={handleSaveRewardsAndAdvance}
              disabled={!rewardsReady || rewardSaving}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 12,
                fontWeight: 700, fontSize: 18, color: '#fff', border: 'none',
                background: '#1A1A2E',
                opacity: rewardsReady && !rewardSaving ? 1 : 0.4,
                cursor: rewardsReady && !rewardSaving ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.2s',
              }}
            >
              {rewardSaving ? '保存中...' : '次へ'}
            </button>

            <button
              onClick={() => setCurrentStep(2)}
              style={{
                width: '100%', padding: '12px 0', marginTop: 8,
                background: 'none', border: 'none',
                fontSize: 14, color: '#9CA3AF', cursor: 'pointer',
              }}
            >
              ← 戻る
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* Step 4: 予約・連絡先URL (Phase 2)        */}
        {/* ═══════════════════════════════════════ */}
        {currentStep === 4 && (
          <div>
            <h2 className="text-xl font-bold text-[#1A1A2E] mb-2 text-center">
              予約・連絡先URLを設定しましょう
              <span className="text-sm font-normal text-[#9CA3AF] ml-2">(任意)</span>
            </h2>
            <p className="text-sm text-[#9CA3AF] mb-6 text-center" style={{ lineHeight: 1.7 }}>
              お客さんが「予約したい」「もっと話したい」と思った時の
              <br />
              連絡先を1つ設定してください。
            </p>

            {/* 説明ボックス */}
            <div className="p-4 mb-4 rounded-lg" style={{ background: '#F5EFDF', border: '1px solid rgba(196,163,90,0.3)' }}>
              <p className="text-sm font-bold text-[#1A1A2E] mb-2">こんなURLが使えます</p>
              <ul className="text-sm text-[#1A1A2E] pl-5 space-y-1" style={{ listStyle: 'disc', lineHeight: 1.7 }}>
                <li>公式LINEアカウントの追加URL (https://lin.ee/...)</li>
                <li>予約サイト (Coubic、Reserva、HotPepper 等)</li>
                <li>お問い合わせフォーム</li>
                <li>自社ホームページ</li>
                <li>Instagram プロフィールURL</li>
              </ul>
            </div>

            {/* URL 入力欄 */}
            <input
              type="url"
              value={bookingUrl}
              onChange={(e) => {
                setBookingUrl(e.target.value)
                if (bookingUrlError) setBookingUrlError('')
              }}
              placeholder="https://lin.ee/example または https://example.com"
              disabled={bookingSaving}
              className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg outline-none focus:ring-2 focus:ring-[#C4A35A] mb-2"
            />

            {bookingUrlError && (
              <p className="text-red-500 text-sm mb-2">{bookingUrlError}</p>
            )}

            {/* ボタン群 */}
            <button
              onClick={handleSaveBookingUrl}
              disabled={bookingSaving}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 12,
                fontWeight: 700, fontSize: 18, color: '#fff', border: 'none',
                background: '#1A1A2E',
                opacity: bookingSaving ? 0.5 : 1,
                cursor: bookingSaving ? 'wait' : 'pointer',
                transition: 'opacity 0.2s',
                marginTop: 16,
              }}
            >
              {bookingSaving ? '保存中...' : '保存して次へ'}
            </button>

            <button
              onClick={handleSkipBookingUrl}
              disabled={bookingSaving}
              style={{
                width: '100%', padding: '12px 0', marginTop: 8,
                background: 'none', border: '1px solid #E5E7EB', borderRadius: 12,
                fontSize: 14, color: '#666',
                cursor: bookingSaving ? 'wait' : 'pointer',
              }}
            >
              スキップ(後で設定する)
            </button>

            <button
              onClick={() => setCurrentStep(3)}
              disabled={bookingSaving}
              style={{
                width: '100%', padding: '12px 0', marginTop: 8,
                background: 'none', border: 'none',
                fontSize: 14, color: '#9CA3AF', cursor: bookingSaving ? 'wait' : 'pointer',
              }}
            >
              ← 戻る
            </button>
          </div>
        )}
      </div>

      {/* ImageCropper */}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </div>
  )
}

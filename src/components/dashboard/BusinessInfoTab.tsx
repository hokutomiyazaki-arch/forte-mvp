'use client'

import { useEffect, useState } from 'react'
import ProfessionTypeModal, { type ProfessionType } from './ProfessionTypeModal'
import AccessLinksSection, { type AccessLinksFormPart } from './AccessLinksSection'

const MENU_LIMIT = 20
const NAME_MAX = 100
const PRICE_MAX = 100
const DESC_MAX = 200

const ALLOWED_TAGS = [
  '個人セッション',
  'グループ',
  'パッケージ',
  'サブスク',
  '初回限定',
  'オンライン対応',
] as const

type Tag = (typeof ALLOWED_TAGS)[number]

interface Menu {
  id: string
  name: string
  price_text: string
  category_tags: string[]
  description: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  // タスクC(§2-3): 紹介予約の決済計算に使う数値の料金・受付フラグ。カラム未作成環境ではundefined(fail-soft)。
  price_jpy?: number | null
  is_referral_bookable?: boolean | null
}

const PRICE_JPY_MAX = 10_000_000

const PROFESSION_LABEL: Record<ProfessionType, string> = {
  trainer: 'トレーナー',
  therapist: '整体・施術系',
  yoga: 'ヨガ・ピラティス',
  nutrition: '栄養指導',
  other: 'その他',
}

const PLACEHOLDERS: Record<ProfessionType, { name: string; price: string; description: string }> = {
  trainer: {
    name: '60分パーソナルトレーニング',
    price: '¥8,000 / 60分',
    description: '姿勢改善と体幹強化を中心に、デスクワークでの肩こり解消を目指します',
  },
  therapist: {
    name: '整体施術 60分',
    price: '¥6,000 / 60分(初回 ¥5,000)',
    description: '全身の歪みを整える基本コース',
  },
  yoga: {
    name: 'ハタヨガクラス',
    price: '月謝 ¥8,000(週1回)',
    description: '初心者から経験者まで対応するクラスです',
  },
  nutrition: {
    name: '栄養カウンセリング初回',
    price: '¥10,000 / 90分',
    description: '食事習慣の見直しと改善プランの作成',
  },
  other: {
    name: 'メニュー名を入力',
    price: '¥◯◯◯◯ / 60分',
    description: 'サービス内容の説明',
  },
}

interface Props {
  initialProfessionType: ProfessionType | null
  onProfessionTypeUpdated?: (t: ProfessionType) => void
  // Phase A2: アクセス情報・外部リンクのフォーム連携
  accessLinks: AccessLinksFormPart
  onAccessLinksChange: (next: Partial<AccessLinksFormPart>) => void
  onSaveAccessLinks: () => void | Promise<void>
  savingAccessLinks: boolean
  /** 軽微5(レビュー指摘): fail-soft再試行(business_hours列未作成)発火時の非ブロッキング注記。 */
  accessLinksSaveNote?: string
  /** 移動(2026-08-06・CEO指摘): ダッシュボード上部にあった「条件を追記する」メモをこのタブへ移動。
   * PATCH /api/referral/accepting は accepting_status が必須のため、保存時にこの値をそのまま
   * 一緒に送る(受付ステータス自体は変更しない・巻き込まない)。 */
  initialAcceptingStatus?: 'open' | 'closed' | 'conditional' | null
  initialAcceptingNote?: string | null
  onAcceptingNoteUpdated?: (note: string | null) => void
}

interface FormState {
  id: string | null
  name: string
  price_text: string
  description: string
  category_tags: Tag[]
  // タスクC(§2-3): 料金(円・数値)と紹介予約受付フラグ
  price_jpy: string
  is_referral_bookable: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  price_text: '',
  description: '',
  category_tags: [],
  price_jpy: '',
  is_referral_bookable: false,
}

export default function BusinessInfoTab({
  initialProfessionType,
  onProfessionTypeUpdated,
  accessLinks,
  onAccessLinksChange,
  onSaveAccessLinks,
  savingAccessLinks,
  accessLinksSaveNote,
  initialAcceptingStatus,
  initialAcceptingNote,
  onAcceptingNoteUpdated,
}: Props) {
  const [professionType, setProfessionType] = useState<ProfessionType | null>(initialProfessionType)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // 移動(2026-08-06・CEO指摘): 受付条件メモの編集state。ダッシュボード上部にあった
  // AcceptingStatusWidget内の「条件を追記する」をこちらへ移した。
  const [acceptingNoteDraft, setAcceptingNoteDraft] = useState(initialAcceptingNote || '')
  const [savedAcceptingNote, setSavedAcceptingNote] = useState(initialAcceptingNote || '')
  const [savingAcceptingNote, setSavingAcceptingNote] = useState(false)
  const [acceptingNoteError, setAcceptingNoteError] = useState('')
  const [acceptingNoteSaved, setAcceptingNoteSaved] = useState(false)

  // 外部(ダッシュボード上部のトグル等)からaccepting_noteが変わった場合に追従する(依存はプリミティブのみ)
  useEffect(() => {
    setAcceptingNoteDraft(initialAcceptingNote || '')
    setSavedAcceptingNote(initialAcceptingNote || '')
  }, [initialAcceptingNote])

  async function saveAcceptingNote() {
    const trimmed = acceptingNoteDraft.trim().slice(0, 200)
    if (trimmed === savedAcceptingNote) return
    setSavingAcceptingNote(true)
    setAcceptingNoteError('')
    try {
      // 受付ステータス自体は変更しない: 現在の値(initialAcceptingStatus)をそのまま送る
      // (このAPIはaccepting_statusが必須のため、渡さないと更新できない・巻き込み変更を避けるため
      // 常に現在値をそのまま渡す)。
      const res = await fetch('/api/referral/accepting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          accepting_status: initialAcceptingStatus ?? 'open',
          accepting_note: trimmed,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAcceptingNoteError(json.error === 'note_too_long' ? '200文字以内で入力してください' : '保存に失敗しました')
        return
      }
      setSavedAcceptingNote(trimmed)
      setAcceptingNoteDraft(trimmed)
      if (onAcceptingNoteUpdated) onAcceptingNoteUpdated(trimmed || null)
      setAcceptingNoteSaved(true)
      setTimeout(() => setAcceptingNoteSaved(false), 2500)
    } catch {
      setAcceptingNoteError('保存に失敗しました')
    } finally {
      setSavingAcceptingNote(false)
    }
  }

  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadMenus = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/pro/menus', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setLoadError(json.error || 'メニューの読み込みに失敗しました')
        setMenus([])
        return
      }
      setMenus(Array.isArray(json.menus) ? json.menus : [])
    } catch (err: any) {
      setLoadError(err.message || 'メニューの読み込みに失敗しました')
      setMenus([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMenus()
  }, [])

  const placeholders = PLACEHOLDERS[professionType ?? 'other']
  const activeCount = menus.length
  const atLimit = activeCount >= MENU_LIMIT

  const startCreate = () => {
    if (atLimit) return
    setFormError('')
    setEditing({ ...EMPTY_FORM })
  }

  const startEdit = (m: Menu) => {
    setFormError('')
    setEditing({
      id: m.id,
      name: m.name,
      price_text: m.price_text,
      description: m.description ?? '',
      category_tags: (m.category_tags || []).filter((t): t is Tag =>
        (ALLOWED_TAGS as readonly string[]).includes(t)
      ),
      price_jpy: typeof m.price_jpy === 'number' ? String(m.price_jpy) : '',
      is_referral_bookable: !!m.is_referral_bookable,
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setFormError('')
  }

  const toggleTag = (tag: Tag) => {
    if (!editing) return
    const has = editing.category_tags.includes(tag)
    setEditing({
      ...editing,
      category_tags: has
        ? editing.category_tags.filter(t => t !== tag)
        : [...editing.category_tags, tag],
    })
  }

  const submitForm = async () => {
    if (!editing) return
    const name = editing.name.trim()
    const priceText = editing.price_text.trim()
    const description = editing.description.trim()

    if (!name) {
      setFormError('メニュー名を入力してください')
      return
    }
    if (name.length > NAME_MAX) {
      setFormError(`メニュー名は${NAME_MAX}文字以内で入力してください`)
      return
    }
    if (!priceText) {
      setFormError('料金を入力してください')
      return
    }
    if (priceText.length > PRICE_MAX) {
      setFormError(`料金は${PRICE_MAX}文字以内で入力してください`)
      return
    }
    if (description.length > DESC_MAX) {
      setFormError(`説明文は${DESC_MAX}文字以内で入力してください`)
      return
    }

    // タスクC(§2-3): 料金(円・数値)。空欄は null 可、入力時は1以上の整数のみ許可。
    const priceJpyRaw = editing.price_jpy.trim()
    let priceJpy: number | null = null
    if (priceJpyRaw !== '') {
      const parsed = Number(priceJpyRaw)
      if (!Number.isInteger(parsed) || parsed < 1) {
        setFormError('1円以上の金額を入力してください')
        return
      }
      if (parsed > PRICE_JPY_MAX) {
        setFormError(`料金（円）は${PRICE_JPY_MAX.toLocaleString()}円以内で入力してください`)
        return
      }
      priceJpy = parsed
    }
    if (editing.is_referral_bookable && (priceJpy === null || priceJpy <= 0)) {
      setFormError('紹介予約を受け付けるには料金（円）の入力が必要です')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const body = {
        name,
        price_text: priceText,
        description: description || null,
        category_tags: editing.category_tags,
        price_jpy: priceJpy,
        is_referral_bookable: editing.is_referral_bookable,
      }

      const isUpdate = !!editing.id
      const url = isUpdate ? `/api/pro/menus/${editing.id}` : '/api/pro/menus'
      const method = isUpdate ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) {
        setFormError(json.error || '保存に失敗しました')
        return
      }
      setEditing(null)
      await loadMenus()
    } catch (err: any) {
      setFormError(err.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const askDelete = (id: string) => {
    setConfirmDeleteId(id)
  }

  const confirmDelete = async () => {
    const id = confirmDeleteId
    if (!id) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/pro/menus/${id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        alert(json.error || '削除に失敗しました')
        return
      }
      await loadMenus()
    } catch (err: any) {
      alert(err.message || '削除に失敗しました')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const handleProfessionSaved = (t: ProfessionType) => {
    setProfessionType(t)
    setEditModalOpen(false)
    if (onProfessionTypeUpdated) onProfessionTypeUpdated(t)
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* §CEO指摘対応(2026-08-06): 見出し「サービス・案内」は上部の動的見出しと重複するため削除 */}
      <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 24 }}>
        提供メニューの料金・サービス内容を登録できます。
        登録するとあなたのカードページに「メニュー」タブが追加され、お客さんが見られるようになります。
      </p>

      {/* 業種表示 */}
      <div
        style={{
          background: '#F9FAFB',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid #E5E7EB',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: 1, marginBottom: 2 }}>業種</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
            {professionType ? PROFESSION_LABEL[professionType] : '未設定'}
          </div>
        </div>
        {professionType && (
          <button
            onClick={() => setEditModalOpen(true)}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              background: 'white',
              color: '#C4A35A',
              border: '1px solid #C4A35A',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            変更
          </button>
        )}
      </div>

      {/* 移動(2026-08-06・CEO指摘): 受付条件メモ。ダッシュボード上部の受付スイッチ横にあった
          「条件を追記する」テキストエリアをここへ移動。保存経路(PATCH /api/referral/accepting)は
          既存のまま・accepting_statusは巻き込まず現在値を維持したまま送る。 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: 1, marginBottom: 4 }}>
          受付条件のメモ（任意）
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.6, marginBottom: 8 }}>
          紹介リストや公開カードで、受付中の横に表示されます。
        </p>
        <textarea
          value={acceptingNoteDraft}
          onChange={e => setAcceptingNoteDraft(e.target.value.slice(0, 200))}
          placeholder="例: めまい・ふらつきのケースのみ／土曜のみ対応可"
          rows={2}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #E5E7EB',
            borderRadius: 6,
            boxSizing: 'border-box' as const,
            resize: 'vertical' as const,
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{acceptingNoteDraft.length} / 200</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {acceptingNoteSaved && <span style={{ fontSize: 12, color: '#2E7D32' }}>保存しました</span>}
            <button
              type="button"
              onClick={saveAcceptingNote}
              disabled={savingAcceptingNote || acceptingNoteDraft.trim() === savedAcceptingNote}
              style={{
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: '#1A1A2E',
                color: '#fff',
                cursor: savingAcceptingNote ? 'default' : 'pointer',
                opacity: savingAcceptingNote || acceptingNoteDraft.trim() === savedAcceptingNote ? 0.5 : 1,
              }}
            >
              {savingAcceptingNote ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
        {acceptingNoteError && (
          <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>{acceptingNoteError}</div>
        )}
      </div>

      {/* 一覧ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>メニュー一覧</h3>
        <span style={{ fontSize: 12, color: '#6B7280' }}>{activeCount} / {MENU_LIMIT}件</span>
      </div>

      {loading && <p style={{ fontSize: 13, color: '#6B7280' }}>読み込み中…</p>}

      {!loading && loadError && (
        <p style={{ fontSize: 13, color: '#E24B4A' }}>{loadError}</p>
      )}

      {!loading && !loadError && menus.length === 0 && !editing && (
        <p style={{ fontSize: 13, color: '#6B7280', padding: '16px 0' }}>
          まだメニューが登録されていません。「+ メニューを追加」から登録してください。
        </p>
      )}

      {/* メニュー一覧 */}
      {!loading && menus.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 16 }}>
          {menus.map(m => (
            <div
              key={m.id}
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>{m.name}</div>
              <div style={{ fontSize: 13, color: '#C4A35A', fontWeight: 600, marginBottom: 6 }}>{m.price_text}</div>
              {m.category_tags && m.category_tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
                  {m.category_tags.map(tag => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        background: '#F3F4F6',
                        color: '#1A1A2E',
                        borderRadius: 4,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {m.description && (
                <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 8 }}>{m.description}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => startEdit(m)}
                  disabled={!!editing || deletingId === m.id}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    background: 'white',
                    color: '#1A1A2E',
                    border: '1px solid #E5E7EB',
                    borderRadius: 6,
                    cursor: editing ? 'not-allowed' : 'pointer',
                  }}
                >
                  編集
                </button>
                <button
                  onClick={() => askDelete(m.id)}
                  disabled={!!editing || deletingId === m.id}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    background: 'white',
                    color: '#E24B4A',
                    border: '1px solid #E5E7EB',
                    borderRadius: 6,
                    cursor: editing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deletingId === m.id ? '削除中…' : '削除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 追加ボタン or 上限メッセージ */}
      {!loading && !editing && (
        atLimit ? (
          <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' as const, padding: '12px 0' }}>
            メニュー上限({MENU_LIMIT}件)に達しました
          </p>
        ) : (
          <button
            onClick={startCreate}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'white',
              color: '#C4A35A',
              border: '1px dashed #C4A35A',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + メニューを追加
          </button>
        )
      )}

      {/* 追加・編集フォーム */}
      {editing && (
        <div
          style={{
            background: 'white',
            border: '1px solid #C4A35A',
            borderRadius: 8,
            padding: 16,
            marginTop: 16,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>
            {editing.id ? 'メニューを編集' : 'メニューを追加'}
          </h3>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              メニュー名 <span style={{ color: '#E24B4A' }}>*</span>
            </label>
            <input
              type="text"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder={placeholders.name}
              maxLength={NAME_MAX}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                boxSizing: 'border-box' as const,
              }}
            />
            <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right' as const, marginTop: 2 }}>
              {editing.name.length} / {NAME_MAX}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              料金 <span style={{ color: '#E24B4A' }}>*</span>
            </label>
            <input
              type="text"
              value={editing.price_text}
              onChange={e => setEditing({ ...editing, price_text: e.target.value })}
              placeholder={placeholders.price}
              maxLength={PRICE_MAX}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                boxSizing: 'border-box' as const,
              }}
            />
            <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right' as const, marginTop: 2 }}>
              {editing.price_text.length} / {PRICE_MAX}
            </div>
          </div>

          {/* タスクC(§2-3): 料金(円・数値)。紹介予約の決済計算に使う。表示用の料金表記は上の「料金」欄。 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              料金（円）(任意)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={editing.price_jpy}
              onChange={e => setEditing({ ...editing, price_jpy: e.target.value })}
              placeholder="例: 10000"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                boxSizing: 'border-box' as const,
              }}
            />
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, lineHeight: 1.6 }}>
              料金（円）は紹介予約の決済計算に使われます。表示用の料金表記は上の「料金」欄へ（従来どおり自由記述）。
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1A1A2E', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editing.is_referral_bookable}
                onChange={e => setEditing({ ...editing, is_referral_bookable: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              紹介予約を受け付ける
            </label>
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, marginLeft: 24, lineHeight: 1.6 }}>
              ONにするには料金（円）の入力が必要です。
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
              カテゴリタグ(任意)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {ALLOWED_TAGS.map(tag => {
                const checked = editing.category_tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      fontSize: 12,
                      padding: '6px 10px',
                      background: checked ? '#C4A35A' : 'white',
                      color: checked ? '#1A1A2E' : '#6B7280',
                      border: checked ? '1px solid #C4A35A' : '1px solid #E5E7EB',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontWeight: checked ? 700 : 500,
                    }}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
              説明文(任意)
            </label>
            <textarea
              value={editing.description}
              onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder={placeholders.description}
              maxLength={DESC_MAX}
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                boxSizing: 'border-box' as const,
                resize: 'vertical' as const,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right' as const, marginTop: 2 }}>
              {editing.description.length} / {DESC_MAX}
            </div>
          </div>

          {formError && (
            <p style={{ fontSize: 13, color: '#E24B4A', marginBottom: 12 }}>{formError}</p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={submitForm}
              disabled={saving}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: saving ? '#E5E7EB' : '#C4A35A',
                color: saving ? '#9CA3AF' : '#1A1A2E',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '保存中…' : '保存する'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              style={{
                padding: '12px 16px',
                background: 'white',
                color: '#6B7280',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 削除確認 */}
      {confirmDeleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 16,
          }}
          onClick={() => deletingId === null && setConfirmDeleteId(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 24,
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>
              メニューを削除しますか?
            </h3>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
              削除するとカードページからも非表示になります。
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: deletingId ? '#E5E7EB' : '#E24B4A',
                  color: deletingId ? '#9CA3AF' : 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: deletingId ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingId ? '削除中…' : '削除する'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={!!deletingId}
                style={{
                  padding: '10px 16px',
                  background: 'white',
                  color: '#6B7280',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: deletingId ? 'not-allowed' : 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase A2: アクセス情報・外部リンク ── */}
      <AccessLinksSection
        accessLinks={accessLinks}
        onAccessLinksChange={onAccessLinksChange}
        onSave={onSaveAccessLinks}
        saving={savingAccessLinks}
        saveNote={accessLinksSaveNote}
      />

      <ProfessionTypeModal
        open={professionType === null || editModalOpen}
        mode={professionType === null ? 'initial' : 'edit'}
        currentValue={professionType}
        onSaved={handleProfessionSaved}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  )
}

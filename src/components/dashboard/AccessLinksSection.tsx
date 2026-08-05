'use client'

import { useState } from 'react'
import {
  validateOptionalUrl,
  validateSocialHandle,
  validatePhoneNumber,
  validateWalkMinutes,
  validateServiceFormats,
} from '@/lib/validation'

const SERVICE_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'store', label: '店舗(対面)' },
  { value: 'visit', label: '訪問(出張)' },
  { value: 'online', label: 'オンライン' },
]

/** 追加3(2026-08-05・CEO指示): closed_daysの値は英語3文字の小文字曜日コード(単一情報源はreferral-format.ts)。 */
const CLOSED_DAY_OPTIONS: { value: string; label: string }[] = [
  { value: 'mon', label: '月' },
  { value: 'tue', label: '火' },
  { value: 'wed', label: '水' },
  { value: 'thu', label: '木' },
  { value: 'fri', label: '金' },
  { value: 'sat', label: '土' },
  { value: 'sun', label: '日' },
]

export interface AccessLinksFormPart {
  address: string
  nearest_station: string
  walk_minutes: '' | number
  access_note: string
  service_formats: string[]
  google_maps_url: string
  website_url: string
  instagram_handle: string
  twitter_handle: string
  facebook_url: string
  youtube_url: string
  phone_number: string
  // 追加3(2026-08-05・CEO指示・構造化版): 受付時間(professionals.business_hours jsonb)。
  // {"start","end","closed_days"}の各フィールドをフラットなフォーム状態として保持する。
  business_hours_start: string
  business_hours_end: string
  business_hours_closed_days: string[]
}

interface Props {
  accessLinks: AccessLinksFormPart
  onAccessLinksChange: (next: Partial<AccessLinksFormPart>) => void
  onSave: () => void | Promise<void>
  saving: boolean
  /** 軽微5(レビュー指摘): fail-soft再試行(business_hours列未作成)が発火した場合の非ブロッキング注記。
   * 保存成功トースト表示中のみ一緒に出す(saving完了直後の1回分の結果を表す)。 */
  saveNote?: string
}

export default function AccessLinksSection({ accessLinks, onAccessLinksChange, onSave, saving, saveNote }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [savedToast, setSavedToast] = useState(false)

  const setField = <K extends keyof AccessLinksFormPart>(key: K, value: AccessLinksFormPart[K]) => {
    onAccessLinksChange({ [key]: value } as Partial<AccessLinksFormPart>)
    if (errors[key as string]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[key as string]
        return next
      })
    }
  }

  const toggleServiceFormat = (value: string) => {
    const current = Array.isArray(accessLinks.service_formats) ? accessLinks.service_formats : []
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    setField('service_formats', next)
  }

  /** 追加3(2026-08-05・CEO指示): 定休日チェックボックスのトグル。 */
  const toggleClosedDay = (value: string) => {
    const current = Array.isArray(accessLinks.business_hours_closed_days) ? accessLinks.business_hours_closed_days : []
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    setField('business_hours_closed_days', next)
  }

  const handleSubmit = async () => {
    const errs: Record<string, string> = {}

    const v1 = validateWalkMinutes(accessLinks.walk_minutes)
    if (!v1.valid) errs.walk_minutes = v1.error

    const v2 = validateServiceFormats(accessLinks.service_formats)
    if (!v2.valid) errs.service_formats = v2.error

    const v3 = validateOptionalUrl(accessLinks.google_maps_url, 'GoogleMaps URL')
    if (!v3.valid) errs.google_maps_url = v3.error

    const v4 = validateOptionalUrl(accessLinks.website_url, '公式HP URL')
    if (!v4.valid) errs.website_url = v4.error

    const v5 = validateOptionalUrl(accessLinks.facebook_url, 'Facebook URL')
    if (!v5.valid) errs.facebook_url = v5.error

    const v6 = validateOptionalUrl(accessLinks.youtube_url, 'YouTube URL')
    if (!v6.valid) errs.youtube_url = v6.error

    const v7 = validateSocialHandle(accessLinks.instagram_handle, 'Instagram')
    if (!v7.valid) errs.instagram_handle = v7.error

    const v8 = validateSocialHandle(accessLinks.twitter_handle, 'X(Twitter)')
    if (!v8.valid) errs.twitter_handle = v8.error

    const v9 = validatePhoneNumber(accessLinks.phone_number)
    if (!v9.valid) errs.phone_number = v9.error

    // 中4(レビュー指摘): 開始・終了とも入力時はstart<endを検証する(日をまたぐ深夜営業は非対応のため)。
    // "HH:mm"はゼロ埋め済みの固定長文字列のため文字列比較で時刻比較が成立する。
    if (
      accessLinks.business_hours_start &&
      accessLinks.business_hours_end &&
      accessLinks.business_hours_start >= accessLinks.business_hours_end
    ) {
      errs.business_hours_end = '終了時刻は開始時刻より後にしてください'
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setErrors({})
    await onSave()
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2000)
  }

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
  }
  const inputStyle = (hasError: boolean) => ({
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: `1px solid ${hasError ? '#E24B4A' : '#E5E7EB'}`,
    borderRadius: 6,
    boxSizing: 'border-box' as const,
  })
  const errorTextStyle = { color: '#E24B4A', fontSize: 12, marginTop: 4 }
  const sectionTitleStyle = {
    fontSize: 15,
    fontWeight: 700,
    color: '#1A1A2E',
    marginTop: 32,
    marginBottom: 4,
  }
  const sectionDescStyle = {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 1.6,
  }

  return (
    <>
      <hr style={{ margin: '32px 0 0', border: 'none', borderTop: '1px solid #E5E7EB' }} />

      {/* ── アクセス情報 ── */}
      <h3 style={sectionTitleStyle}>アクセス情報</h3>
      <p style={sectionDescStyle}>
        来店・出張・オンラインの可否や、アクセスをカードページに表示します。すべて任意です。
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>住所</label>
        <input
          type="text"
          value={accessLinks.address}
          maxLength={200}
          onChange={e => setField('address', e.target.value)}
          placeholder="例: 東京都渋谷区道玄坂1-2-3 〇〇ビル3F"
          style={inputStyle(false)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>最寄駅</label>
          <input
            type="text"
            value={accessLinks.nearest_station}
            maxLength={50}
            onChange={e => setField('nearest_station', e.target.value)}
            placeholder="例: 渋谷駅"
            style={inputStyle(false)}
          />
        </div>
        <div>
          <label style={labelStyle}>徒歩分数</label>
          <input
            type="number"
            value={accessLinks.walk_minutes}
            min={0}
            max={99}
            onChange={e => {
              const v = e.target.value
              setField('walk_minutes', v === '' ? '' : Number(v))
            }}
            placeholder="例: 5"
            style={inputStyle(!!errors.walk_minutes)}
          />
          {errors.walk_minutes && <p style={errorTextStyle}>{errors.walk_minutes}</p>}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>アクセス補足</label>
        <input
          type="text"
          value={accessLinks.access_note}
          maxLength={200}
          onChange={e => setField('access_note', e.target.value)}
          placeholder="例: 新南口より直結"
          style={inputStyle(false)}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>営業形態</label>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
          {SERVICE_FORMAT_OPTIONS.map(opt => {
            const checked = (accessLinks.service_formats || []).includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleServiceFormat(opt.value)}
                style={{
                  fontSize: 13,
                  padding: '8px 14px',
                  background: checked ? '#C4A35A' : 'white',
                  color: checked ? '#1A1A2E' : '#6B7280',
                  border: `1px solid ${checked ? '#C4A35A' : '#E5E7EB'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: checked ? 700 : 500,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {errors.service_formats && <p style={errorTextStyle}>{errors.service_formats}</p>}
      </div>

      {/* 追加3(2026-08-05・CEO指示・構造化版): 受付時間(開始/終了時刻・定休日)。すべて任意。 */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>受付時間(任意)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div>
            <label style={{ ...labelStyle, color: '#6B7280' }}>開始時刻</label>
            <input
              type="time"
              value={accessLinks.business_hours_start}
              step={1800}
              onChange={e => setField('business_hours_start', e.target.value)}
              style={inputStyle(false)}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#6B7280' }}>終了時刻</label>
            <input
              type="time"
              value={accessLinks.business_hours_end}
              step={1800}
              onChange={e => setField('business_hours_end', e.target.value)}
              style={inputStyle(!!errors.business_hours_end)}
            />
            {errors.business_hours_end && <p style={errorTextStyle}>{errors.business_hours_end}</p>}
          </div>
        </div>
        {/* 中4(レビュー指摘): 日をまたぐ深夜営業設定は現在非対応であることを明示する。 */}
        <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: -4, marginBottom: 10, lineHeight: 1.6 }}>
          日をまたぐ設定(深夜営業)は現在非対応です。
        </p>
        <label style={{ ...labelStyle, color: '#6B7280' }}>定休日</label>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
          {CLOSED_DAY_OPTIONS.map(opt => {
            const checked = accessLinks.business_hours_closed_days.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleClosedDay(opt.value)}
                style={{
                  fontSize: 13,
                  padding: '6px 12px',
                  background: checked ? '#C4A35A' : 'white',
                  color: checked ? '#1A1A2E' : '#6B7280',
                  border: `1px solid ${checked ? '#C4A35A' : '#E5E7EB'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: checked ? 700 : 500,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>GoogleMaps URL</label>
        <input
          type="url"
          value={accessLinks.google_maps_url}
          onChange={e => setField('google_maps_url', e.target.value)}
          placeholder="例: https://maps.google.com/..."
          style={inputStyle(!!errors.google_maps_url)}
        />
        {errors.google_maps_url && <p style={errorTextStyle}>{errors.google_maps_url}</p>}
      </div>

      {/* ── 外部リンク ── */}
      <h3 style={sectionTitleStyle}>外部リンク</h3>
      <p style={sectionDescStyle}>
        公式HPやSNSアカウントをカードページに表示します。すべて任意です。
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>公式HP URL</label>
        <input
          type="url"
          value={accessLinks.website_url}
          onChange={e => setField('website_url', e.target.value)}
          placeholder="例: https://example.com"
          style={inputStyle(!!errors.website_url)}
        />
        {errors.website_url && <p style={errorTextStyle}>{errors.website_url}</p>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Instagram</label>
        <input
          type="text"
          value={accessLinks.instagram_handle}
          onChange={e => setField('instagram_handle', e.target.value)}
          placeholder="例: @username または username"
          style={inputStyle(!!errors.instagram_handle)}
        />
        {errors.instagram_handle && <p style={errorTextStyle}>{errors.instagram_handle}</p>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>X(Twitter)</label>
        <input
          type="text"
          value={accessLinks.twitter_handle}
          onChange={e => setField('twitter_handle', e.target.value)}
          placeholder="例: @username または username"
          style={inputStyle(!!errors.twitter_handle)}
        />
        {errors.twitter_handle && <p style={errorTextStyle}>{errors.twitter_handle}</p>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Facebook URL</label>
        <input
          type="url"
          value={accessLinks.facebook_url}
          onChange={e => setField('facebook_url', e.target.value)}
          placeholder="例: https://www.facebook.com/yourpage"
          style={inputStyle(!!errors.facebook_url)}
        />
        {errors.facebook_url && <p style={errorTextStyle}>{errors.facebook_url}</p>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>YouTube URL</label>
        <input
          type="url"
          value={accessLinks.youtube_url}
          onChange={e => setField('youtube_url', e.target.value)}
          placeholder="例: https://www.youtube.com/@yourchannel"
          style={inputStyle(!!errors.youtube_url)}
        />
        {errors.youtube_url && <p style={errorTextStyle}>{errors.youtube_url}</p>}
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>電話番号</label>
        <input
          type="tel"
          value={accessLinks.phone_number}
          maxLength={20}
          onChange={e => setField('phone_number', e.target.value)}
          placeholder="例: 03-1234-5678"
          style={inputStyle(!!errors.phone_number)}
        />
        {errors.phone_number && <p style={errorTextStyle}>{errors.phone_number}</p>}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: saving ? '#E5E7EB' : '#C4A35A',
          color: saving ? '#9CA3AF' : '#1A1A2E',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          marginBottom: 8,
        }}
      >
        {saving ? '保存中…' : 'アクセス情報・外部リンクを保存'}
      </button>

      {savedToast && (
        <>
          <p style={{ fontSize: 13, color: '#10B981', textAlign: 'center' as const, marginTop: 4 }}>
            ✓ 保存しました
          </p>
          {/* 軽微5(レビュー指摘): fail-soft再試行(business_hours列未作成)が発火した場合のみ表示。 */}
          {saveNote && (
            <p style={{ fontSize: 13, color: '#B45309', textAlign: 'center' as const, marginTop: 2 }}>
              {saveNote}
            </p>
          )}
        </>
      )}
    </>
  )
}

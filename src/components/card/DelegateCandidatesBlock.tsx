'use client'

/**
 * §16-8 + §16-14（CEO決定・2026-08-06）+ §16-12: 停止中プロの公開カードに出す代理案内候補。
 *
 * 訪問者には何も質問しない(§16-14)。地域は任意のプルダウンとして候補リストの上に置くのみ
 * （初期状態は絞り込みなし・クライアント側フィルタで再フェッチしない・IP推定はしない）。
 *
 * §16-12: 代理経由は決済なし・報酬なしのリクエスト制。既存の紹介予約API
 * (POST /api/referral/bookings)は referral_lists の list_id 必須で criteria単体の
 * この経路にはまだ対応していないため、本フェーズは「プロフィールを見る」リンクのみに留める
 * (既存の紹介予約フロー/決済を変更しない。CC実装報告に明記)。
 */

import { useMemo, useState } from 'react'
import { COLORS, FONTS } from '@/lib/design-tokens'
import type { DelegateCandidatePro } from '@/lib/referral-delegate-criteria'

const T = { ...COLORS, font: FONTS.main }

interface Props {
  orgName: string
  candidates: DelegateCandidatePro[]
}

export function DelegateCandidatesBlock({ orgName, candidates }: Props) {
  // §16-14: 地域は任意のプルダウン(初期は絞り込みなし)。再フェッチせずクライアント側フィルタのみ。
  const [areaFilter, setAreaFilter] = useState('')

  const prefectures = useMemo(() => {
    const set = new Set<string>()
    for (const c of candidates) {
      if (c.prefecture) set.add(c.prefecture)
    }
    return Array.from(set)
  }, [candidates])

  const filtered = areaFilter ? candidates.filter((c) => c.prefecture === areaFilter) : candidates

  if (candidates.length === 0) return null

  return (
    <div style={{ marginTop: 10 }}>
      {prefectures.length > 1 && (
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          style={{
            fontSize: 12,
            color: T.text,
            background: '#fff',
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 8,
            padding: '6px 8px',
            marginBottom: 8,
            fontFamily: T.font,
          }}
        >
          <option value="">地域で絞り込む（任意）</option>
          {prefectures.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((c) => (
          <a
            key={c.proId}
            href={`/card/${c.proId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 10,
              padding: '10px 12px',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: T.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.photoUrl} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: T.gold, fontSize: 14, fontWeight: 700 }}>{c.name?.[0] || ''}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.dark, fontFamily: T.font }}>{c.name}</div>
              {c.title && (
                <div style={{ fontSize: 11, color: T.gold, fontFamily: T.font }}>{c.title}</div>
              )}
              {c.matchedProofLabels.length > 0 && (
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, fontFamily: T.font }}>
                  {c.matchedProofLabels.slice(0, 2).join('・')}
                </div>
              )}
            </div>
            <span style={{ fontSize: 11, color: T.gold, fontWeight: 700, flexShrink: 0, fontFamily: T.font }}>
              プロフィールを見る ›
            </span>
          </a>
        ))}
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6, fontFamily: T.font }}>
        {orgName}の受付中の先生をご案内しています
      </div>
    </div>
  )
}

'use client'

/**
 * §16-8 + §16-14 + §16-15（CEO決定・2026-08-06）+ §16-12: 停止中プロの公開カードに出す代理案内候補。
 *
 * 訪問者には何も質問しない(§16-14)。地域は任意のプルダウンとして候補リストの上に置くのみ
 * （初期状態は絞り込みなし・クライアント側フィルタで再フェッチしない・IP推定はしない）。
 *
 * §16-15: 自動抽出だけでは応えられない悩みのための逃げ道として、候補リストの「下」に
 * 「他のお悩みで探す」検索窓を置く(上に置くと質問ゼロの利点が消えるため)。検索範囲は
 * この団体(orgId)の受付中の認定者に限定する(全プロ検索にしない・専用API /api/referral/delegate-search)。
 *
 * §16-20: 案内元が自作リスト(source='list')の場合は団体スコープが無いため、この検索窓自体を
 * 出さない(全プロ検索にすると「本人が選んだ」という保証が消えるため。orgId/orgNameはnull)。
 *
 * §16-12: 代理経由は決済なし・報酬なしのリクエスト制。既存の紹介予約API
 * (POST /api/referral/bookings)は referral_lists の list_id 必須で criteria単体の
 * この経路にはまだ対応していないため、本フェーズは「プロフィールを見る」リンクのみに留める
 * (既存の紹介予約フロー/決済を変更しない。CC実装報告に明記)。
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import { COLORS, FONTS } from '@/lib/design-tokens'
import type { DelegateCandidatePro } from '@/lib/referral-delegate-criteria'

const T = { ...COLORS, font: FONTS.main }

interface Props {
  /** §16-20: 'org'=団体からの自動抽出／'list'=本人の自作リスト。検索窓の出し分けに使う。 */
  source: 'org' | 'list'
  orgId: string | null
  orgName: string | null
  candidates: DelegateCandidatePro[]
  /** 停止中プロ本人(このカードの主)。検索結果から誤って自分自身を出さないため除外する */
  excludeProId: string
}

function CandidateRow({ c }: { c: DelegateCandidatePro }) {
  return (
    <a
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
  )
}

export function DelegateCandidatesBlock({ source, orgId, orgName, candidates, excludeProId }: Props) {
  // §16-14: 地域は任意のプルダウン(初期は絞り込みなし)。再フェッチせずクライアント側フィルタのみ。
  const [areaFilter, setAreaFilter] = useState('')

  // §16-15: 「他のお悩みで探す」検索窓(団体内限定・受付中のみ)。デバウンスして専用APIを叩く。
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DelegateCandidatePro[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = searchQuery.trim()
    // §16-20: source='list'は団体スコープが無いため検索窓自体を出さない(JSX側でも非表示)が、
    // 依存配列がプリミティブのみのため念のためここでもorgId無しなら実行しない(fail-safe)。
    if (!q || !orgId) {
      setSearchResults([])
      setSearching(false)
      setSearched(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      fetch(
        `/api/referral/delegate-search?org_id=${encodeURIComponent(orgId)}&q=${encodeURIComponent(q)}&exclude_id=${encodeURIComponent(excludeProId)}`,
        { cache: 'no-store' }
      )
        .then((res) => (res.ok ? res.json() : { professionals: [] }))
        .then((json) => {
          setSearchResults(
            (json.professionals || []).map((p: any) => ({
              proId: p.proId,
              name: p.name,
              photoUrl: p.photoUrl,
              title: p.title,
              prefecture: p.prefecture,
              matchedProofLabels: p.matchedProofLabels || [],
              lastProofAt: p.lastProofAt,
            }))
          )
        })
        .catch(() => setSearchResults([]))
        .finally(() => {
          setSearching(false)
          setSearched(true)
        })
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, orgId, excludeProId])

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
        {filtered.map((c) => <CandidateRow key={c.proId} c={c} />)}
      </div>
      {/* §16-20: source='org'のときだけ団体名の帰属表示(自作リストには団体の保証が無い) */}
      {source === 'org' && orgName && (
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6, fontFamily: T.font }}>
          {orgName}の受付中の先生をご案内しています
        </div>
      )}

      {/* §16-15+§16-20: 「他のお悩みで探す」検索窓は団体スコープ(source='org')のときだけ出す。
          自作リスト(source='list')は全プロ検索にすると「本人が選んだ」保証が消えるため出さない。 */}
      {source === 'org' && orgId && orgName && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontFamily: T.font }}>
            他のお悩みで探す
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${orgName}の受付中の認定者を検索`}
            style={{
              width: '100%',
              fontSize: 12,
              color: T.text,
              background: '#fff',
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 8,
              padding: '8px 10px',
              fontFamily: T.font,
              boxSizing: 'border-box' as const,
            }}
          />
          {searching && (
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, fontFamily: T.font }}>検索中…</div>
          )}
          {!searching && searched && searchResults.length === 0 && (
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, fontFamily: T.font }}>
              該当する認定者が見つかりませんでした
            </div>
          )}
          {!searching && searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {searchResults.map((c) => <CandidateRow key={c.proId} c={c} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

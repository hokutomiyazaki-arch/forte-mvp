import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import {
  getCertificationTier,
  MEDAL_PATHS,
  type CertificationTier,
  type CertifiableTier,
} from '@/lib/constants'

export const runtime = 'edge'

// ===== 型定義 =====

type ProRecord = {
  id: string
  name: string | null
  last_name: string | null
  first_name: string | null
  title: string | null
  photo_url: string | null
}

type VoteSummaryRow = {
  proof_id: string
  vote_count: number | null
}

type ProofItemRow = {
  id: string
  label: string | null
}

type TopProof = {
  id: string
  label: string
  voteCount: number
}

// ===== カラーマップ (OGP 専用、ティアの金属色階調) =====

const TIER_COLOR_MAP: Record<CertificationTier, string> = {
  PROVEN: '#9B7C50',     // ブロンズ
  SPECIALIST: '#C0C0C0', // シルバー
  MASTER: '#C4A35A',     // ゴールド (ブランド色)
  LEGEND: '#E5E4E2',     // プラチナ
}

// ===== ヘルパー =====

/**
 * 名前ロジック (CEO 指示):
 *   name 優先 → 空なら last_name + ' ' + first_name → それも空なら 'REALPROOF Pro'
 */
function getDisplayName(pro: ProRecord): string {
  const name = (pro.name || '').trim()
  if (name) return name

  const last = (pro.last_name || '').trim()
  const first = (pro.first_name || '').trim()
  const combined = `${last} ${first}`.trim()
  if (combined) return combined

  return 'REALPROOF Pro'
}

/**
 * ArrayBuffer → base64 文字列 (Edge Runtime 対応、Buffer polyfill に依存しない)
 * 32KB チャンクで分割して stack overflow を回避。
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    )
  }
  return btoa(binary)
}

/**
 * URL から画像を fetch して data URI に変換。失敗時は null。
 */
async function fetchAsDataUri(url: string, fallbackMime = 'image/png'): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const ct = res.headers.get('content-type') || fallbackMime
    return `data:${ct};base64,${arrayBufferToBase64(buf)}`
  } catch {
    return null
  }
}

/**
 * トッププルーフ群の中の最高ティアを返す。
 * 優先順: LEGEND > MASTER > SPECIALIST > PROVEN > null
 */
function getHighestTier(proofs: TopProof[]): CertificationTier | null {
  const order: CertificationTier[] = ['LEGEND', 'MASTER', 'SPECIALIST', 'PROVEN']
  for (const tier of order) {
    if (proofs.some((p) => getCertificationTier(p.voteCount) === tier)) return tier
  }
  return null
}

/** PROVEN / 未達は null、SPECIALIST 以上はメダル画像パスを返す */
function getOgMedalPath(tier: CertificationTier | null): string | null {
  if (!tier || tier === 'PROVEN') return null
  return MEDAL_PATHS[tier as CertifiableTier].og
}

/** プルーフ行用の 64px メダルパス。PROVEN / 未達は null */
function getSmallMedalPath(tier: CertificationTier | null): string | null {
  if (!tier || tier === 'PROVEN') return null
  return MEDAL_PATHS[tier as CertifiableTier].small
}

// ===== フォールバック OGP (プロ未存在 / DB エラー / Satori エラー時) =====

function buildFallbackOg(fontData: ArrayBuffer, cacheMaxAge = 300) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          backgroundColor: '#1A1A2E',
          color: '#FAFAF7',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 80,
          fontFamily: 'NotoSansJP',
        }}
      >
        <span>REAL PROOF</span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
      ],
      headers: {
        'Cache-Control': `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}`,
      },
    }
  )
}

// ===== メインハンドラ =====

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const proId = params.id

  // フォント読み込み (Edge Runtime 対応)
  const fontData = await fetch(
    new URL('../../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((res) => res.arrayBuffer())

  // Supabase client (service_role)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // プロ情報取得 (deactivate 済みは OGP も出さない = デフォルトに落とす)
  const { data: proRaw } = await supabase
    .from('professionals')
    .select('id, name, last_name, first_name, title, photo_url')
    .eq('id', proId)
    .is('deactivated_at', null)
    .maybeSingle()

  const pro = proRaw as ProRecord | null

  if (!pro) {
    return buildFallbackOg(fontData, 300)
  }

  // === Step 1: vote_summary でトップ3 proof_id 取得 ===
  const { data: voteRowsRaw } = await supabase
    .from('vote_summary')
    .select('proof_id, vote_count')
    .eq('professional_id', proId)
    .order('vote_count', { ascending: false })
    .limit(3)

  const topVoteRows: VoteSummaryRow[] = (voteRowsRaw as VoteSummaryRow[]) || []
  const proofIds = topVoteRows.map((r) => r.proof_id).filter(Boolean)

  // === Step 2: proof_items から label を解決 ===
  // ⚠️ proof_id が "custom_xxx" 形式 (custom proof) のケースは proof_items に存在しない。
  //    CEO 判断 (STOP 3) でカスタムプルーフ対応はスキップ → '—' フォールバック維持。
  const labelMap = new Map<string, string>()
  if (proofIds.length > 0) {
    const { data: proofRowsRaw } = await supabase
      .from('proof_items')
      .select('id, label')
      .in('id', proofIds)
    const proofRows: ProofItemRow[] = (proofRowsRaw as ProofItemRow[]) || []
    for (const item of proofRows) {
      if (item.id && item.label) {
        labelMap.set(String(item.id), item.label)
      }
    }
  }

  // === Step 3: マージ ===
  const topProofs: TopProof[] = topVoteRows.map((row) => ({
    id: row.proof_id,
    label: labelMap.get(String(row.proof_id)) || '—',
    voteCount: row.vote_count || 0,
  }))

  // === 最高ティア & メダル群の path 確定 ===
  const highestTier = getHighestTier(topProofs)
  const bigMedalAsset = getOgMedalPath(highestTier)
  const origin = new URL(request.url).origin

  // === Step 4: 画像 fetch を Promise.all で並列化 (Edge Runtime タイムアウト回避) ===
  // - 顔写真 (photo_url、外部 URL)
  // - 大メダル (right column の 380px)
  // - 各プルーフ行のティアバッジ (40px 表示用 64px 画像、最大 3 個)
  const [
    avatarDataUri,
    bigMedalDataUri,
    proofBadgeDataUris,
  ] = await Promise.all([
    pro.photo_url
      ? fetchAsDataUri(pro.photo_url, 'image/jpeg')
      : Promise.resolve<string | null>(null),
    bigMedalAsset
      ? fetchAsDataUri(`${origin}${bigMedalAsset}`)
      : Promise.resolve<string | null>(null),
    Promise.all(
      topProofs.map((proof) => {
        const tier = getCertificationTier(proof.voteCount)
        const smallPath = getSmallMedalPath(tier)
        if (!smallPath) return Promise.resolve<string | null>(null)
        return fetchAsDataUri(`${origin}${smallPath}`)
      })
    ),
  ])

  const displayName = getDisplayName(pro)
  const title = (pro.title || '').trim()
  const initial = displayName.charAt(0) || '?'

  // === Satori 制約: 全 div に display 明示 / テキストノードは <span> に分離 ===
  try {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            backgroundColor: '#1A1A2E',
            color: '#FAFAF7',
            fontFamily: 'NotoSansJP',
            padding: 36,
            position: 'relative',
          }}
        >
          {/* ===== 内側ゴールドフレーム ===== */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              border: '1px solid rgba(196, 163, 90, 0.35)',
              padding: 44,
            }}
          >
            {/* ===== 左カラム: プロ情報 + プルーフ ===== */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                paddingRight: 40,
              }}
            >
              {/* ヘッダー: 顔写真 + 名前 + 肩書 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 32,
                }}
              >
                {avatarDataUri ? (
                  <img
                    src={avatarDataUri}
                    width={120}
                    height={120}
                    style={{
                      borderRadius: 60,
                      marginRight: 28,
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      backgroundColor: '#2a2a4e',
                      marginRight: 28,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 48,
                        color: '#C4A35A',
                        fontWeight: 700,
                      }}
                    >
                      {initial}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      marginBottom: title ? 8 : 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 48,
                        fontWeight: 700,
                        lineHeight: 1.1,
                      }}
                    >
                      {displayName}
                    </span>
                  </div>
                  {title ? (
                    <div style={{ display: 'flex' }}>
                      <span
                        style={{
                          fontSize: 22,
                          color: 'rgba(250,250,247,0.6)',
                        }}
                      >
                        {title}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* セパレータ */}
              <div
                style={{
                  display: 'flex',
                  height: 1,
                  backgroundColor: 'rgba(196,163,90,0.3)',
                  marginBottom: 28,
                }}
              />

              {/* トッププルーフ 3つ */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {topProofs.map((proof, idx) => {
                  const tier = getCertificationTier(proof.voteCount)
                  const tierColor = tier ? TIER_COLOR_MAP[tier] : '#FAFAF7'
                  const accent = tier !== null
                  const badgeDataUri = proofBadgeDataUris[idx]
                  return (
                    <div
                      key={proof.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 22px',
                        backgroundColor: accent
                          ? 'rgba(196,163,90,0.08)'
                          : 'rgba(250,250,247,0.04)',
                        borderRadius: 12,
                        border: accent
                          ? '1px solid rgba(196,163,90,0.3)'
                          : '1px solid rgba(250,250,247,0.06)',
                      }}
                    >
                      {/* 左: バッジ + ラベル */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                        }}
                      >
                        {badgeDataUri ? (
                          <img
                            src={badgeDataUri}
                            width={40}
                            height={40}
                            style={{ objectFit: 'contain' }}
                          />
                        ) : null}
                        <span
                          style={{
                            fontSize: 28,
                            color: '#FAFAF7',
                          }}
                        >
                          {proof.label}
                        </span>
                      </div>
                      {/* 右: ティア + 票数 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        {tier ? (
                          <div style={{ display: 'flex' }}>
                            <span
                              style={{
                                fontSize: 14,
                                color: tierColor,
                                fontWeight: 700,
                                letterSpacing: 1,
                              }}
                            >
                              {tier}
                            </span>
                          </div>
                        ) : null}
                        <div style={{ display: 'flex' }}>
                          <span
                            style={{
                              fontSize: 32,
                              fontWeight: 700,
                              color: tier ? tierColor : '#FAFAF7',
                            }}
                          >
                            {proof.voteCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* フッター: REAL PROOF ロゴ */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: 28,
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#C4A35A',
                    letterSpacing: 4,
                  }}
                >
                  REAL
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#FAFAF7',
                    letterSpacing: 4,
                    marginLeft: 8,
                  }}
                >
                  PROOF
                </span>
              </div>
            </div>

            {/* ===== 右カラム: 大メダル + 最高認定ラベル ===== */}
            {bigMedalDataUri ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 380,
                }}
              >
                <img
                  src={bigMedalDataUri}
                  width={360}
                  height={360}
                  style={{ objectFit: 'contain' }}
                />
                <div
                  style={{
                    display: 'flex',
                    marginTop: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 22,
                      color: '#C4A35A',
                      letterSpacing: 2,
                      fontWeight: 700,
                    }}
                  >
                    最高認定
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* ===== 4 コーナーアクセント (L字、絶対配置) ===== */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 24,
              left: 24,
              width: 28,
              height: 28,
              borderTop: '2px solid #C4A35A',
              borderLeft: '2px solid #C4A35A',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 24,
              right: 24,
              width: 28,
              height: 28,
              borderTop: '2px solid #C4A35A',
              borderRight: '2px solid #C4A35A',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 24,
              left: 24,
              width: 28,
              height: 28,
              borderBottom: '2px solid #C4A35A',
              borderLeft: '2px solid #C4A35A',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 24,
              right: 24,
              width: 28,
              height: 28,
              borderBottom: '2px solid #C4A35A',
              borderRight: '2px solid #C4A35A',
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'NotoSansJP',
            data: fontData,
            style: 'normal',
            weight: 700,
          },
        ],
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    )
  } catch (err) {
    // Satori レンダエラーで真っ白になるのを防ぐ最終フォールバック
    console.error('OG_RENDER_ERROR:', err)
    return buildFallbackOg(fontData, 60)
  }
}

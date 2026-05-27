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

// ===== カラーマップ (モードB のティアテキスト色分け) =====

const TIER_COLOR_MAP: Record<CertificationTier, string> = {
  PROVEN: '#9B7C50',     // ブロンズ
  SPECIALIST: '#C0C0C0', // シルバー
  MASTER: '#C4A35A',     // ゴールド
  LEGEND: '#E5E4E2',     // プラチナ
}

// ===== ヘルパー =====

function getDisplayName(pro: ProRecord): string {
  const name = (pro.name || '').trim()
  if (name) return name
  const last = (pro.last_name || '').trim()
  const first = (pro.first_name || '').trim()
  const combined = `${last} ${first}`.trim()
  if (combined) return combined
  return 'REALPROOF Pro'
}

/** 18 文字超は末尾「…」省略 (モードA 用、大文字描画の崩れ防止) */
function truncateLabel(text: string, maxLen: number = 18): string {
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLen) return text
  return chars.slice(0, maxLen - 1).join('') + '…'
}

/** プルーフ名の動的フォントサイズ (モードA 用、左カラム幅に応じた段階縮小) */
function getProofFontSize(label: string): number {
  const len = Array.from(label).length
  if (len <= 8) return 96
  if (len <= 12) return 80
  if (len <= 16) return 68
  return 60
}

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

function getOgMedalPath(tier: CertificationTier | null): string | null {
  if (!tier || tier === 'PROVEN') return null
  return MEDAL_PATHS[tier as CertifiableTier].og
}

function getSmallMedalPath(tier: CertificationTier | null): string | null {
  if (!tier || tier === 'PROVEN') return null
  return MEDAL_PATHS[tier as CertifiableTier].small
}

// ===== フォールバック OGP =====

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

// ===== 顔写真 / イニシャル の共通レンダ =====

function AvatarBlock({
  photoDataUri,
  initial,
  size,
}: {
  photoDataUri: string | null
  initial: string
  size: number
}) {
  const radius = size / 2
  if (photoDataUri) {
    return (
      <img
        src={photoDataUri}
        width={size}
        height={size}
        style={{
          borderRadius: radius,
          objectFit: 'cover',
        }}
      />
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#2a2a4e',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: Math.floor(size * 0.4),
          color: '#C4A35A',
          fontWeight: 700,
        }}
      >
        {initial}
      </span>
    </div>
  )
}

// ===== 4 コーナーアクセント =====
// モードA は右側白背景になるため、右上・右下をダーク色に切り替える (rightColor で制御)。
// computed property の TS 型推論を避けるため、4 個を個別に展開する。

function CornerAccents({ rightColor = '#C4A35A' }: { rightColor?: string } = {}) {
  const LEFT = '#C4A35A'
  return (
    <>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 24,
          left: 24,
          width: 32,
          height: 32,
          borderTop: `4px solid ${LEFT}`,
          borderLeft: `4px solid ${LEFT}`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 24,
          right: 24,
          width: 32,
          height: 32,
          borderTop: `4px solid ${rightColor}`,
          borderRight: `4px solid ${rightColor}`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 24,
          left: 24,
          width: 32,
          height: 32,
          borderBottom: `4px solid ${LEFT}`,
          borderLeft: `4px solid ${LEFT}`,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 24,
          right: 24,
          width: 32,
          height: 32,
          borderBottom: `4px solid ${rightColor}`,
          borderRight: `4px solid ${rightColor}`,
        }}
      />
    </>
  )
}

// ===== メインハンドラ =====

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const proId = params.id

  const fontData = await fetch(
    new URL('../../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((res) => res.arrayBuffer())

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // プロ情報取得 (顔写真復活: photo_url 再追加)
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

  // === vote_summary 取得: top 3 (モードB 用)。tier 判定は [0] = top 1 ===
  const { data: voteRowsRaw } = await supabase
    .from('vote_summary')
    .select('proof_id, vote_count')
    .eq('professional_id', proId)
    .order('vote_count', { ascending: false })
    .limit(3)

  const topVoteRows: VoteSummaryRow[] = (voteRowsRaw as VoteSummaryRow[]) || []
  const proofIds = topVoteRows.map((r) => r.proof_id).filter(Boolean)

  // proof_items から label 一括解決
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

  // === レイアウト分岐用ティア判定 ===
  const top1 = topVoteRows[0]
  const voteCount = top1?.vote_count ?? 0
  const tier = voteCount > 0 ? getCertificationTier(voteCount) : null
  const isModeA = tier === 'SPECIALIST' || tier === 'MASTER' || tier === 'LEGEND'

  const displayName = getDisplayName(pro)
  const title = (pro.title || '').trim()
  const initial = displayName.charAt(0) || '?'
  const origin = new URL(request.url).origin

  // === 並列 fetch: 顔写真 + (モードA) 大メダル / (モードB) ティアバッジ ×3 ===
  const [
    photoDataUri,
    bigMedalDataUri,
    smallBadgeDataUris,
  ] = await Promise.all([
    pro.photo_url
      ? fetchAsDataUri(pro.photo_url, 'image/jpeg')
      : Promise.resolve<string | null>(null),
    isModeA && getOgMedalPath(tier)
      ? fetchAsDataUri(`${origin}${getOgMedalPath(tier)}`)
      : Promise.resolve<string | null>(null),
    !isModeA
      ? Promise.all(
          topVoteRows.map((row) => {
            const t = getCertificationTier(row.vote_count ?? 0)
            const path = getSmallMedalPath(t)
            if (!path) return Promise.resolve<string | null>(null)
            return fetchAsDataUri(`${origin}${path}`)
          })
        )
      : Promise.resolve<(string | null)[]>([]),
  ])

  try {
    if (isModeA) {
      // ============================================================
      // モードA: コピー駆動型 (SPECIALIST / MASTER / LEGEND)
      // ============================================================
      const topProofLabel = top1 ? labelMap.get(String(top1.proof_id)) || '' : ''
      const mainText = truncateLabel(topProofLabel || '本物の強み', 18)
      const mainFontSize = getProofFontSize(mainText)
      const copyText = `${voteCount}人が証明！`
      const tierLabel = tier ? `${tier} 認定` : null

      return new ImageResponse(
        (
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              backgroundColor: '#1A1A2E',  // fallback
              // 斜め分割: 左58% ダークネイビー / 右42% クリーム白 (メダル視認性向上)
              backgroundImage:
                'linear-gradient(108deg, #1A1A2E 0%, #1A1A2E 58%, #F5F1E8 58.1%, #F5F1E8 100%)',
              color: '#FAFAF7',
              fontFamily: 'NotoSansJP',
              padding: 24,
              position: 'relative',
            }}
          >
            {/* 内側ゴールドフレーム */}
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                border: '3px solid #C4A35A',
                padding: 32,
              }}
            >
              {/* 左カラム (CEO 指示: paddingLeft: 24 追加) */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  paddingLeft: 24,
                  paddingRight: 32,
                  justifyContent: 'center',
                }}
              >
                {/* REAL PROOF 小ラベル */}
                <div style={{ display: 'flex', marginBottom: 20 }}>
                  <span
                    style={{
                      fontSize: 18,
                      color: '#C4A35A',
                      letterSpacing: 4,
                      fontWeight: 700,
                    }}
                  >
                    REAL PROOF
                  </span>
                </div>

                {/* コピー (N人が証明！) */}
                <div style={{ display: 'flex', marginBottom: 12 }}>
                  <span
                    style={{
                      fontSize: 56,
                      color: '#C4A35A',
                      fontWeight: 700,
                      lineHeight: 1.05,
                    }}
                  >
                    {copyText}
                  </span>
                </div>

                {/* プルーフ名 (動的サイズ、最大の主役) */}
                <div style={{ display: 'flex', marginBottom: 20 }}>
                  <span
                    style={{
                      fontSize: mainFontSize,
                      color: '#FAFAF7',
                      fontWeight: 700,
                      lineHeight: 1.05,
                    }}
                  >
                    {mainText}
                  </span>
                </div>

                {/* 区切り線 */}
                <div
                  style={{
                    display: 'flex',
                    height: 1,
                    width: 240,
                    backgroundColor: 'rgba(196,163,90,0.4)',
                    marginBottom: 20,
                  }}
                />

                {/* 顔写真 + 名前 + 肩書 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 18,
                  }}
                >
                  <AvatarBlock
                    photoDataUri={photoDataUri}
                    initial={initial}
                    size={72}
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ display: 'flex' }}>
                      <span
                        style={{
                          fontSize: 40,
                          fontWeight: 700,
                          color: '#FAFAF7',
                          lineHeight: 1.1,
                        }}
                      >
                        {displayName}
                      </span>
                    </div>
                    {title ? (
                      <div style={{ display: 'flex', marginTop: 4 }}>
                        <span
                          style={{
                            fontSize: 22,
                            color: 'rgba(250,250,247,0.7)',
                          }}
                        >
                          {title}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* 右カラム: メダル + ティアラベル (白背景になったので後光は削除) */}
              {bigMedalDataUri ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 450,
                  }}
                >
                  {/* メダル本体 */}
                  <img
                    src={bigMedalDataUri}
                    width={380}
                    height={380}
                    style={{ objectFit: 'contain' }}
                  />
                  {/* ティアラベル (白背景上なのでダーク色に) */}
                  {tierLabel ? (
                    <div style={{ display: 'flex', marginTop: 10 }}>
                      <span
                        style={{
                          fontSize: 22,
                          color: '#1A1A2E',
                          letterSpacing: 2,
                          fontWeight: 700,
                        }}
                      >
                        {tierLabel}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* 4 コーナーアクセント (モードA: 右側は白背景になるためダーク色) */}
            <CornerAccents rightColor="#1A1A2E" />
          </div>
        ),
        {
          width: 1200,
          height: 630,
          fonts: [
            { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
          ],
          headers: {
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          },
        }
      )
    }

    // ============================================================
    // モードB: 情報カード型 (PROVEN 以下 = 0〜29票)
    // ============================================================
    const topProofs: TopProof[] = topVoteRows.map((row) => ({
      id: row.proof_id,
      label: labelMap.get(String(row.proof_id)) || '—',
      voteCount: row.vote_count ?? 0,
    }))

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
            padding: 24,
            position: 'relative',
          }}
        >
          {/* 内側ゴールドフレーム */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              border: '3px solid #C4A35A',
              padding: 32,
            }}
          >
            {/* 左カラム: 顔写真ヘッダー + プルーフ3行 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                paddingRight: 32,
              }}
            >
              {/* ヘッダー: 顔写真 + 名前 + 肩書 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 28,
                }}
              >
                <AvatarBlock
                  photoDataUri={photoDataUri}
                  initial={initial}
                  size={120}
                />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    marginLeft: 24,
                  }}
                >
                  <div style={{ display: 'flex' }}>
                    <span
                      style={{
                        fontSize: 40,
                        fontWeight: 700,
                        color: '#FAFAF7',
                        lineHeight: 1.1,
                      }}
                    >
                      {displayName}
                    </span>
                  </div>
                  {title ? (
                    <div style={{ display: 'flex', marginTop: 6 }}>
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
                  marginBottom: 22,
                }}
              />

              {/* プルーフ 3 行 (バッジ + ラベル + 色分けティア + 票数) */}
              {topProofs.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {topProofs.map((proof, idx) => {
                    const rowTier = getCertificationTier(proof.voteCount)
                    const tierColor = rowTier ? TIER_COLOR_MAP[rowTier] : '#FAFAF7'
                    const accent = rowTier !== null
                    const badge = smallBadgeDataUris[idx]
                    return (
                      <div
                        key={proof.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 20px',
                          backgroundColor: accent
                            ? 'rgba(196,163,90,0.08)'
                            : 'rgba(250,250,247,0.04)',
                          borderRadius: 12,
                          border: accent
                            ? '1px solid rgba(196,163,90,0.3)'
                            : '1px solid rgba(250,250,247,0.06)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          {badge ? (
                            <img
                              src={badge}
                              width={28}
                              height={28}
                              style={{ objectFit: 'contain' }}
                            />
                          ) : null}
                          <span
                            style={{
                              fontSize: 22,
                              color: '#FAFAF7',
                            }}
                          >
                            {truncateLabel(proof.label, 25)}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          {rowTier ? (
                            <div style={{ display: 'flex' }}>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: tierColor,
                                  fontWeight: 700,
                                  letterSpacing: 2,
                                }}
                              >
                                {rowTier}
                              </span>
                            </div>
                          ) : null}
                          <div style={{ display: 'flex' }}>
                            <span
                              style={{
                                fontSize: 26,
                                fontWeight: 700,
                                color: rowTier ? tierColor : '#FAFAF7',
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
              ) : (
                <div style={{ display: 'flex', marginTop: 8 }}>
                  <span
                    style={{
                      fontSize: 22,
                      color: 'rgba(250,250,247,0.55)',
                    }}
                  >
                    クライアントが証明する本物の強み
                  </span>
                </div>
              )}
            </div>

            {/* 右カラム: REAL PROOF ブランド大表示 (CEO 指示: ロゴ大表示) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: 320,
                paddingLeft: 24,
                borderLeft: '1px solid rgba(196,163,90,0.2)',
              }}
            >
              <div style={{ display: 'flex' }}>
                <span
                  style={{
                    fontSize: 36,
                    color: '#C4A35A',
                    fontWeight: 700,
                    letterSpacing: 4,
                  }}
                >
                  REAL
                </span>
              </div>
              <div style={{ display: 'flex', marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 36,
                    color: '#FAFAF7',
                    fontWeight: 700,
                    letterSpacing: 4,
                  }}
                >
                  PROOF
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  marginTop: 28,
                  width: 100,
                  height: 1,
                  backgroundColor: 'rgba(196,163,90,0.4)',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  marginTop: 20,
                  paddingLeft: 8,
                  paddingRight: 8,
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    color: 'rgba(250,250,247,0.65)',
                    letterSpacing: 3,
                    lineHeight: 1.4,
                  }}
                >
                  強みが、あなたを定義する
                </span>
              </div>
            </div>
          </div>

          {/* 4 コーナーアクセント */}
          <CornerAccents />
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
        ],
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    )
  } catch (err) {
    console.error('OG_RENDER_ERROR:', err)
    return buildFallbackOg(fontData, 60)
  }
}

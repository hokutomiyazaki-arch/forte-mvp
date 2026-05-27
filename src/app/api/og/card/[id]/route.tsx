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
}

type VoteSummaryRow = {
  proof_id: string
  vote_count: number | null
}

type ProofItemRow = {
  id: string
  label: string | null
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

/**
 * 18 文字超は末尾「…」省略（OGP 大文字描画時の崩れ防止保険）。
 * Array.from() で書記素クラスタ単位の安全分割 (downlevelIteration ルール準拠 + 絵文字対策)。
 */
function truncateLabel(text: string, maxLen: number = 18): string {
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLen) return text
  return chars.slice(0, maxLen - 1).join('') + '…'
}

/**
 * プルーフ名の文字数に応じてフォントサイズを動的決定（CEO 指示）。
 * 左カラムの実描画幅は約 550px。大きすぎると枠外に出るため段階的に縮小。
 */
function getProofFontSize(label: string): number {
  const len = Array.from(label).length
  if (len <= 8) return 140
  if (len <= 12) return 120
  if (len <= 16) return 100
  return 88
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

// ===== メインハンドラ =====

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const proId = params.id

  // フォント読み込み
  const fontData = await fetch(
    new URL('../../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((res) => res.arrayBuffer())

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // プロ情報取得 (顔写真は新レイアウトで未使用なので photo_url 取得しない)
  const { data: proRaw } = await supabase
    .from('professionals')
    .select('id, name, last_name, first_name, title')
    .eq('id', proId)
    .is('deactivated_at', null)
    .maybeSingle()

  const pro = proRaw as ProRecord | null
  if (!pro) {
    return buildFallbackOg(fontData, 300)
  }

  // === vote_summary でトップ 1 件のみ取得 (CEO 指示: コピー駆動の主役を 1 つに) ===
  const { data: voteRowsRaw } = await supabase
    .from('vote_summary')
    .select('proof_id, vote_count')
    .eq('professional_id', proId)
    .order('vote_count', { ascending: false })
    .limit(1)

  const topVoteRows: VoteSummaryRow[] = (voteRowsRaw as VoteSummaryRow[]) || []
  const topVote = topVoteRows[0] ?? null

  // proof_items から label 解決 (1 件のみ)
  let topProofLabel: string = ''
  if (topVote?.proof_id) {
    const { data: proofRowsRaw } = await supabase
      .from('proof_items')
      .select('id, label')
      .eq('id', topVote.proof_id)
      .maybeSingle()
    const proofRow = proofRowsRaw as ProofItemRow | null
    topProofLabel = proofRow?.label || ''
  }

  // === 表示モード判定 ===
  const voteCount = topVote?.vote_count ?? 0
  const tier = voteCount > 0 ? getCertificationTier(voteCount) : null

  type DisplayMode = 'no-proof' | 'pre-proven' | 'proven-plus'
  let displayMode: DisplayMode
  if (!topVote || voteCount === 0 || !topProofLabel) {
    displayMode = 'no-proof'
  } else if (tier === null) {
    displayMode = 'pre-proven'
  } else {
    displayMode = 'proven-plus'
  }

  // メダル: SPECIALIST/MASTER/LEGEND のみ (PROVEN はメダルなし)
  const showMedalColumn = !!tier && tier !== 'PROVEN'
  const medalAsset = getOgMedalPath(tier)

  // === メダル fetch (並列構造維持、ただし最大 1 個) ===
  const [medalDataUri] = await Promise.all([
    medalAsset
      ? fetchAsDataUri(`${new URL(request.url).origin}${medalAsset}`)
      : Promise.resolve<string | null>(null),
  ])

  // === コピー文 + メイン主役テキスト + 動的フォントサイズ ===
  const displayName = getDisplayName(pro)
  const title = (pro.title || '').trim()

  let copyText: string | null = null
  let mainText: string
  switch (displayMode) {
    case 'no-proof':
      copyText = null
      mainText = 'REALPROOF認定プロフェッショナル'
      break
    case 'pre-proven':
      copyText = 'クライアントが証明する'
      mainText = truncateLabel(topProofLabel, 18)
      break
    case 'proven-plus':
      copyText = `${voteCount}人が証明！`
      mainText = truncateLabel(topProofLabel, 18)
      break
  }
  const mainFontSize = getProofFontSize(mainText)
  const tierLabel = showMedalColumn && tier ? `${tier} 認定` : null

  try {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            // radial-gradient で中央に光、外周にダークネイビー (CEO 指示)
            backgroundColor: '#1A1A2E',  // fallback
            backgroundImage:
              'radial-gradient(circle at 30% 50%, #252544 0%, #1A1A2E 70%)',
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
            {/* ===== 左カラム ===== */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                paddingRight: showMedalColumn ? 32 : 0,
                justifyContent: 'center',
              }}
            >
              {/* 上: REAL PROOF 小ラベル */}
              <div style={{ display: 'flex', marginBottom: 28 }}>
                <span
                  style={{
                    fontSize: 20,
                    color: '#C4A35A',
                    letterSpacing: 4,
                    fontWeight: 700,
                  }}
                >
                  REAL PROOF
                </span>
              </div>

              {/* コピー文 (ゴールド) — no-proof モードでは表示しない */}
              {copyText ? (
                <div style={{ display: 'flex', marginBottom: 12 }}>
                  <span
                    style={{
                      fontSize: 64,
                      color: '#C4A35A',
                      fontWeight: 700,
                      lineHeight: 1.05,
                    }}
                  >
                    {copyText}
                  </span>
                </div>
              ) : null}

              {/* メイン主役テキスト (白、最大の主役) */}
              <div style={{ display: 'flex', marginBottom: 32 }}>
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
                  marginBottom: 22,
                }}
              />

              {/* 下: プロ名 + 肩書 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 16,
                }}
              >
                <span style={{ fontSize: 36, fontWeight: 700, color: '#FAFAF7' }}>
                  {displayName}
                </span>
                {title ? (
                  <span
                    style={{
                      fontSize: 22,
                      color: 'rgba(250,250,247,0.7)',
                    }}
                  >
                    {title}
                  </span>
                ) : null}
              </div>
            </div>

            {/* ===== 右カラム: メダル + 後光 + ティアラベル ===== */}
            {showMedalColumn && medalDataUri ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 450,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* 後光 (光円、絶対配置でメダル背後に) */}
                <div
                  style={{
                    display: 'flex',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 600,
                    height: 600,
                    marginTop: -300,
                    marginLeft: -300,
                    backgroundImage:
                      'radial-gradient(circle, rgba(196,163,90,0.18) 0%, rgba(196,163,90,0) 65%)',
                  }}
                />
                {/* メダル本体 */}
                <img
                  src={medalDataUri}
                  width={420}
                  height={420}
                  style={{ objectFit: 'contain' }}
                />
                {/* ティアラベル */}
                {tierLabel ? (
                  <div style={{ display: 'flex', marginTop: 12 }}>
                    <span
                      style={{
                        fontSize: 28,
                        color: '#C4A35A',
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

          {/* ===== 4 コーナーアクセント ===== */}
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

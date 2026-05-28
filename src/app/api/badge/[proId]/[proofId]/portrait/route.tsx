import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import {
  getCertificationTier,
  MEDAL_PATHS,
  type CertificationTier,
  type CertifiableTier,
} from '@/lib/constants'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

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

// ===== ティア別カラー(称号テキスト用) =====

const TIER_TITLE_COLOR: Record<CertifiableTier, string> = {
  SPECIALIST: '#C0C0C0', // シルバー
  MASTER: '#C4A35A',     // ゴールド
  LEGEND: '#E5E4E2',     // プラチナ
}

// ===== 背景画像パス(CertifiableTier のみ) =====

const BADGE_BG_PATHS: Record<CertifiableTier, string> = {
  SPECIALIST: '/badge-bg-specialist.png',
  MASTER: '/badge-bg-master.png',
  LEGEND: '/badge-bg-legend.png',
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

/** プルーフ名の動的フォントサイズ (背景画像のテキスト幅に保守的に収める) */
function getProofFontSize(label: string): number {
  const len = Array.from(label).length
  if (len <= 8) return 64
  if (len <= 12) return 52
  if (len <= 16) return 44
  return 38
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

async function fetchAsDataUri(
  url: string,
  fallbackMime = 'image/png'
): Promise<string | null> {
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

// ===== フォールバック (1080x1350 透過) =====

function buildFallback(fontData: ArrayBuffer, message = 'REAL PROOF') {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'NotoSansJP',
        }}
      >
        <span style={{ fontSize: 40, color: '#C4A35A', letterSpacing: 4 }}>
          {message}
        </span>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      fonts: [
        { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
      ],
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  )
}

// ===== メインハンドラ =====

export async function GET(
  request: Request,
  { params }: { params: { proId: string; proofId: string } }
) {
  const proId = params.proId
  const proofId = params.proofId

  const fontData = await fetch(
    new URL(
      '../../../../../../../public/fonts/NotoSansJP-subset.ttf',
      import.meta.url
    )
  ).then((res) => res.arrayBuffer())

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // === プロ情報取得 ===
  const { data: proRaw } = await supabase
    .from('professionals')
    .select('id, name, last_name, first_name, title')
    .eq('id', proId)
    .is('deactivated_at', null)
    .maybeSingle()

  const pro = proRaw as ProRecord | null
  console.log('[badge-dbg] pro:', pro?.id ?? 'NOT_FOUND', 'name:', pro?.name)
  if (!pro) {
    console.log('[badge-dbg] FB: no pro')
    return buildFallback(fontData)
  }

  // === vote_summary から該当プルーフの票数を取得 ===
  // proofId 指定なし(または該当行なし)時は top1 プルーフにフォールバック
  console.log('[badge-dbg] proofId param:', proofId)
  let voteRow: VoteSummaryRow | null = null
  let matchedVoteRow: VoteSummaryRow | null = null
  let top1Row: VoteSummaryRow | null = null

  if (proofId) {
    const { data: targetVoteRaw } = await supabase
      .from('vote_summary')
      .select('proof_id, vote_count')
      .eq('professional_id', proId)
      .eq('proof_id', proofId)
      .maybeSingle()
    matchedVoteRow = (targetVoteRaw as VoteSummaryRow | null) ?? null
    voteRow = matchedVoteRow
  }
  console.log('[badge-dbg] matched row:', JSON.stringify(matchedVoteRow ?? null))

  if (!voteRow) {
    const { data: topVoteRaw } = await supabase
      .from('vote_summary')
      .select('proof_id, vote_count')
      .eq('professional_id', proId)
      .order('vote_count', { ascending: false })
      .limit(1)
      .maybeSingle()
    top1Row = (topVoteRaw as VoteSummaryRow | null) ?? null
    voteRow = top1Row
  }
  console.log('[badge-dbg] top1 fallback row:', JSON.stringify(top1Row ?? null))

  const voteCount = voteRow?.vote_count ?? 0
  console.log('[badge-dbg] final voteCount:', voteCount)

  const tier: CertificationTier | null =
    voteCount > 0 ? getCertificationTier(voteCount) : null
  console.log('[badge-dbg] tier:', tier)

  // === SPECIALIST 未満 (PROVEN / 未達) は今回はフォールバック ===
  // 背景画像とメダルが SPECIALIST 以上のみ存在するため
  if (
    !tier ||
    !(tier === 'SPECIALIST' || tier === 'MASTER' || tier === 'LEGEND')
  ) {
    console.log('[badge-dbg] FB: tier invalid', tier, voteCount)
    return buildFallback(fontData, 'REAL PROOF')
  }

  const certTier: CertifiableTier = tier

  // === プルーフ名取得 ===
  let proofLabel = '本物の強み'
  if (voteRow?.proof_id) {
    const { data: proofRaw } = await supabase
      .from('proof_items')
      .select('id, label')
      .eq('id', voteRow.proof_id)
      .maybeSingle()
    const proofItem = proofRaw as ProofItemRow | null
    if (proofItem?.label) {
      proofLabel = proofItem.label
    }
  }

  const displayName = getDisplayName(pro)
  const title = (pro.title || '').trim()
  const origin = new URL(request.url).origin

  // === 画像並列取得 ===
  const bgUrl = `${origin}${BADGE_BG_PATHS[certTier]}`
  const medalUrl = `${origin}${MEDAL_PATHS[certTier].og}`
  console.log('[badge-dbg] bg url:', bgUrl)

  let bgDataUri: string | null = null
  let medalDataUri: string | null = null
  try {
    const results = await Promise.all([
      fetchAsDataUri(bgUrl),
      fetchAsDataUri(medalUrl),
    ])
    bgDataUri = results[0]
    medalDataUri = results[1]
  } catch (err) {
    console.log('[badge-dbg] FB: bg load fail', String(err))
    return buildFallback(fontData)
  }

  if (!bgDataUri) {
    // 背景画像が読めない場合はフォールバック
    console.log('[badge-dbg] FB: bg load fail (null)', bgUrl)
    return buildFallback(fontData)
  }

  console.log('[badge-dbg] rendering full badge OK')

  const titleColor = TIER_TITLE_COLOR[certTier]
  const proofFontSize = getProofFontSize(proofLabel)

  try {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            position: 'relative',
            backgroundColor: 'transparent',
            fontFamily: 'NotoSansJP',
          }}
        >
          {/* === Layer 1: 背景画像 (ティア別、最背面) === */}
          <img
            src={bgDataUri}
            width={1080}
            height={1350}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1080,
              height: 1350,
            }}
          />

          {/* === Layer 2: メダル画像 (中央上、ティア別) === */}
          {medalDataUri ? (
            <img
              src={medalDataUri}
              width={400}
              height={400}
              style={{
                position: 'absolute',
                top: 180,
                left: 340,
                width: 400,
                height: 400,
              }}
            />
          ) : null}

          {/* === Layer 3: テキストオーバーレイ === */}

          {/* 称号 (MASTER / SPECIALIST / LEGEND) */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 620,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 72,
                color: titleColor,
                fontWeight: 800,
                letterSpacing: 4,
              }}
            >
              {certTier}
            </span>
          </div>

          {/* セパレータ横線 */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 720,
              left: 440,
              width: 200,
              height: 2,
              backgroundColor: '#C4A35A',
              opacity: 0.5,
            }}
          />

          {/* プルーフ名 */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 760,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: proofFontSize,
                color: '#FAFAF7',
                fontWeight: 700,
              }}
            >
              {proofLabel}
            </span>
          </div>

          {/* 票数 (大) */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 880,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 130,
                color: '#C4A35A',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {voteCount}
            </span>
          </div>

          {/* 「人が証明」 */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 1030,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 40,
                color: '#FAFAF7',
              }}
            >
              人が証明
            </span>
          </div>

          {/* プロ名 */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 1110,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 44,
                color: '#FAFAF7',
                fontWeight: 600,
              }}
            >
              {displayName}
            </span>
          </div>

          {/* 肩書 */}
          {title ? (
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                top: 1175,
                left: 0,
                width: 1080,
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  color: 'rgba(250, 250, 247, 0.7)',
                }}
              >
                {title}
              </span>
            </div>
          ) : null}

          {/* REAL PROOF */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 1245,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
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

          {/* URL */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 1290,
              left: 0,
              width: 1080,
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 16,
                color: 'rgba(196, 163, 90, 0.6)',
                letterSpacing: 2,
              }}
            >
              realproof.jp
            </span>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1350,
        fonts: [
          { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
        ],
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      }
    )
  } catch (err) {
    console.error('BADGE_PORTRAIT_ERROR:', err)
    return buildFallback(fontData)
  }
}

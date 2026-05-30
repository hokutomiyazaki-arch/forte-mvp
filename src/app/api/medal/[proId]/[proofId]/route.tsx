import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import {
  getCertifiableTier,
  MEDAL_PATHS,
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
}

type VoteSummaryRow = {
  proof_id: string
  vote_count: number | null
}

type ProofItemRow = {
  id: string
  label: string | null
}

// ===== サイズ =====

const SIZE = 640

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

/** プルーフ名の動的フォントサイズ (カード幅に保守的に収める) */
function getProofFontSize(label: string): number {
  const len = Array.from(label).length
  if (len <= 8) return 44
  if (len <= 12) return 38
  if (len <= 16) return 32
  return 28
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

// ===== フォールバック (透過、メダル非発行時) =====
// 15/30票未満・プロ不在・メダル読込失敗時は完全透過画像を返す。
// 常に inline (Content-Disposition 無し)。

function buildTransparent(fontData: ArrayBuffer) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          backgroundColor: 'transparent',
        }}
      />
    ),
    {
      width: SIZE,
      height: SIZE,
      fonts: [
        { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
      ],
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
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
      '../../../../../../public/fonts/NotoSansJP-subset.ttf',
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
    .select('id, name, last_name, first_name')
    .eq('id', proId)
    .is('deactivated_at', null)
    .maybeSingle()

  const pro = proRaw as ProRecord | null
  if (!pro) {
    return buildTransparent(fontData)
  }

  // === 該当プルーフの票数取得 ===
  let voteCount = 0
  if (proofId) {
    const { data: voteRaw } = await supabase
      .from('vote_summary')
      .select('proof_id, vote_count')
      .eq('professional_id', proId)
      .eq('proof_id', proofId)
      .maybeSingle()
    const voteRow = voteRaw as VoteSummaryRow | null
    voteCount = voteRow?.vote_count ?? 0
  }

  // === ティア判定 (SPECIALIST 未満は非発行) ===
  const tier: CertifiableTier | null = getCertifiableTier(voteCount)
  if (!tier) {
    return buildTransparent(fontData)
  }

  // === プルーフ名取得 ===
  let proofLabel = '本物の強み'
  if (proofId) {
    const { data: proofRaw } = await supabase
      .from('proof_items')
      .select('id, label')
      .eq('id', proofId)
      .maybeSingle()
    const proofItem = proofRaw as ProofItemRow | null
    if (proofItem?.label) {
      proofLabel = proofItem.label
    }
  }

  const displayName = getDisplayName(pro)
  const origin = new URL(request.url).origin
  const medalUrl = `${origin}${MEDAL_PATHS[tier].og}`
  const medalDataUri = await fetchAsDataUri(medalUrl)

  if (!medalDataUri) {
    return buildTransparent(fontData)
  }

  const proofFontSize = getProofFontSize(proofLabel)

  try {
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
            padding: 24,
            fontFamily: 'NotoSansJP',
          }}
        >
          {/* === 白カード (ベージュ枠、丸ごと画像化) === */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: SIZE - 48,
              backgroundColor: '#FFFFFF',
              border: '2px solid #E8E2D5',
              borderRadius: 28,
              paddingTop: 48,
              paddingBottom: 44,
              paddingLeft: 40,
              paddingRight: 40,
            }}
          >
            {/* メダル */}
            <img
              src={medalDataUri}
              width={260}
              height={260}
              style={{ objectFit: 'contain' }}
            />

            {/* プルーフ名 */}
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  fontSize: proofFontSize,
                  color: '#1A1A2E',
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {proofLabel}
              </span>
            </div>

            {/* N人が証明 · プロ名 */}
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 26,
                  color: '#9A7B3A',
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {voteCount}人が証明 · {displayName}
              </span>
            </div>

            {/* セパレータ */}
            <div
              style={{
                display: 'flex',
                marginTop: 26,
                width: 120,
                height: 1,
                backgroundColor: 'rgba(196,163,90,0.4)',
              }}
            />

            {/* 認定表記 */}
            <div
              style={{
                display: 'flex',
                marginTop: 20,
              }}
            >
              <span
                style={{
                  fontSize: 17,
                  color: 'rgba(196,163,90,0.85)',
                  letterSpacing: 2,
                  fontWeight: 600,
                }}
              >
                2026 REAL PROOF認定
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: SIZE,
        height: SIZE,
        fonts: [
          { name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 },
        ],
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    )
  } catch (err) {
    console.error('MEDAL_IMAGE_ERROR:', err)
    return buildTransparent(fontData)
  }
}

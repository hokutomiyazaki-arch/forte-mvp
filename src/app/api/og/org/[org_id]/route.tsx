import { ImageResponse } from 'next/og'
import { getSupabaseAdmin } from '@/lib/supabase'

// runtime 設定は手本の /api/og/card/[id] と完全に同一（force-dynamic は足さない）
export const runtime = 'edge'

// ===== ヘルパー（card 版から流用） =====

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

/** 団体名の動的フォントサイズ（長いほど縮小） */
function getNameFontSize(name: string): number {
  const len = Array.from(name).length
  if (len <= 10) return 72
  if (len <= 16) return 56
  if (len <= 24) return 44
  return 36
}

// ===== 数値スタットブロック =====

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 72, fontWeight: 700, color: '#C4A35A', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 24, color: 'rgba(250,250,247,0.7)', marginTop: 8, letterSpacing: 2 }}>
        {label}
      </span>
    </div>
  )
}

// ===== メインハンドラ =====

export async function GET(
  request: Request,
  { params }: { params: { org_id: string } }
) {
  const orgId = params.org_id

  const fontData = await fetch(
    new URL('../../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((res) => res.arrayBuffer())

  const supabase = getSupabaseAdmin()

  // 団体情報
  const { data: org } = await supabase
    .from('organizations')
    .select('name, logo_url')
    .eq('id', orgId)
    .maybeSingle()

  // org_aggregate VIEW から集計値（カラム名は 013_org_views.sql で確認済み）
  const { data: agg } = await supabase
    .from('org_aggregate')
    .select('active_member_count, total_org_votes')
    .eq('organization_id', orgId)
    .maybeSingle()

  // 取得失敗時もフォールバックで落ちないようにする
  const orgName = (org?.name || '').trim() || 'REALPROOF 団体'
  const memberCount = Number(agg?.active_member_count) || 0
  const totalVotes = Number(agg?.total_org_votes) || 0
  const nameFontSize = getNameFontSize(orgName)

  const logoDataUri = org?.logo_url
    ? await fetchAsDataUri(org.logo_url, 'image/png')
    : null

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
          padding: 80,
          position: 'relative',
        }}
      >
        {/* 内側ゴールドフレーム */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            border: '3px solid #C4A35A',
            padding: 48,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* REAL PROOF 小ラベル */}
          <div style={{ display: 'flex', marginBottom: 28 }}>
            <span style={{ fontSize: 20, color: '#C4A35A', letterSpacing: 5, fontWeight: 700 }}>
              REAL PROOF
            </span>
          </div>

          {/* ロゴ（あれば円形） */}
          {logoDataUri ? (
            <img
              src={logoDataUri}
              width={120}
              height={120}
              style={{ borderRadius: 60, objectFit: 'cover', marginBottom: 24 }}
            />
          ) : null}

          {/* 団体名（主役） */}
          <div style={{ display: 'flex', marginBottom: 28, textAlign: 'center' }}>
            <span style={{ fontSize: nameFontSize, fontWeight: 700, color: '#FAFAF7', lineHeight: 1.15 }}>
              {orgName}
            </span>
          </div>

          {/* 区切り線 */}
          <div style={{ display: 'flex', height: 1, width: 320, backgroundColor: 'rgba(196,163,90,0.4)', marginBottom: 36 }} />

          {/* 数値 2 つ（クライアントの声に由来する数字のみ。自己申告コピーは載せない） */}
          <div style={{ display: 'flex', gap: 96, alignItems: 'flex-start' }}>
            <StatBlock value={memberCount} label="所属プロ（名）" />
            <StatBlock value={totalVotes} label="累計証明（件）" />
          </div>
        </div>
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

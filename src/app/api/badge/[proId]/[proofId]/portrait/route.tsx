import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// ===== ヘルパー =====

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

function buildFallback(fontData: ArrayBuffer) {
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
          REAL PROOF
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
  _ctx: { params: { proId: string; proofId: string } }
) {
  // PoC: proId / proofId は受け取るが無視してハードコード返却
  const proName = '岡本 如弘'
  const title = '柔道整復師'
  const proofLabel = '痛みが取れた'
  const voteCount = 56
  const tier = 'MASTER'

  const fontData = await fetch(
    new URL(
      '../../../../../../../public/fonts/NotoSansJP-subset.ttf',
      import.meta.url
    )
  ).then((res) => res.arrayBuffer())

  const origin = new URL(request.url).origin
  const medalDataUri = await fetchAsDataUri(`${origin}/medals/master-400.png`)

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
            padding: 60,
            fontFamily: 'NotoSansJP',
          }}
        >
          {/* 内側カード 960x1230 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 960,
              height: 1230,
              backgroundColor: '#1A1A2E',
              borderRadius: 24,
              border: '3px solid #C4A35A',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* 斜めゴールドリボン(背景) */}
            <svg
              width="960"
              height="1230"
              viewBox="0 0 960 1230"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id="ribbonGold"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#8B6914" />
                  <stop offset="50%" stopColor="#E5C77B" />
                  <stop offset="100%" stopColor="#8B6914" />
                </linearGradient>
              </defs>
              <path
                d="M 0,180 L 960,420 L 960,520 L 0,280 Z"
                fill="url(#ribbonGold)"
                opacity="0.85"
              />
            </svg>

            {/* メダル */}
            <div style={{ display: 'flex', marginTop: 90 }}>
              {medalDataUri ? (
                <img
                  src={medalDataUri}
                  width={400}
                  height={400}
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <div style={{ display: 'flex', width: 400, height: 400 }} />
              )}
            </div>

            {/* 称号テキスト (MASTER) */}
            <div style={{ display: 'flex', marginTop: 28 }}>
              <span
                style={{
                  fontSize: 80,
                  color: '#C4A35A',
                  fontWeight: 700,
                  letterSpacing: 4,
                }}
              >
                {tier}
              </span>
            </div>

            {/* セパレータ */}
            <div
              style={{
                display: 'flex',
                width: 200,
                height: 2,
                backgroundColor: '#C4A35A',
                opacity: 0.5,
                marginTop: 18,
              }}
            />

            {/* プルーフ名 */}
            <div style={{ display: 'flex', marginTop: 22 }}>
              <span
                style={{
                  fontSize: 64,
                  color: '#FAFAF7',
                  fontWeight: 700,
                }}
              >
                {proofLabel}
              </span>
            </div>

            {/* 票数表記 (56 を大きめ + 説明文) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: 56,
              }}
            >
              <span
                style={{
                  fontSize: 48,
                  color: '#C4A35A',
                  fontWeight: 700,
                }}
              >
                {voteCount}
              </span>
              <span
                style={{
                  fontSize: 36,
                  color: '#C4A35A',
                  marginLeft: 10,
                }}
              >
                クライアントが証明 ✓
              </span>
            </div>

            {/* プロ名 */}
            <div style={{ display: 'flex', marginTop: 32 }}>
              <span
                style={{
                  fontSize: 44,
                  color: '#FAFAF7',
                  fontWeight: 600,
                }}
              >
                {proName}
              </span>
            </div>

            {/* 肩書 */}
            <div style={{ display: 'flex', marginTop: 8 }}>
              <span
                style={{
                  fontSize: 24,
                  color: 'rgba(250, 250, 247, 0.7)',
                }}
              >
                {title}
              </span>
            </div>

            {/* 下端余白スペーサー */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* フッター: REAL PROOF */}
            <div style={{ display: 'flex', marginBottom: 10 }}>
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
            <div style={{ display: 'flex', marginBottom: 36 }}>
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
  } catch (err) {
    console.error('BADGE_PORTRAIT_ERROR:', err)
    return buildFallback(fontData)
  }
}

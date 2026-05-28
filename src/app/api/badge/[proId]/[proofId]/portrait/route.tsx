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
            position: 'relative',
            backgroundColor: 'transparent',
            fontFamily: 'NotoSansJP',
          }}
        >
          {/* === Layer 1: 内側カード背景 (960x1230、ダークネイビー+ゴールド枠) === */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 60,
              left: 60,
              width: 960,
              height: 1230,
              backgroundColor: '#1A1A2E',
              borderRadius: 24,
              border: '3px solid #C4A35A',
            }}
          />

          {/* === Layer 2: 立体リボン SVG (カード左右端から透過エリアにはみ出す) === */}
          <svg
            width="1080"
            height="1350"
            viewBox="0 0 1080 1350"
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
            {/* ドロップシャドウ (本体より 8px 下にずらす) */}
            <path
              d="M -100,408 L 1180,628 L 1180,748 L -100,528 Z"
              fill="#000000"
              opacity="0.2"
            />
            {/* リボン本体 (ゴールドグラデ) */}
            <path
              d="M -100,400 L 1180,620 L 1180,740 L -100,520 Z"
              fill="url(#ribbonGold)"
            />
            {/* 左端折り返し (暗色で立体感) */}
            <path
              d="M -100,520 L -100,400 L -160,380 L -160,500 Z"
              fill="#5A4410"
            />
            {/* 右端折り返し */}
            <path
              d="M 1180,620 L 1180,740 L 1240,760 L 1240,640 Z"
              fill="#5A4410"
            />
            {/* ハイライト (上端に明色の細線) */}
            <line
              x1="-100"
              y1="415"
              x2="1180"
              y2="635"
              stroke="#F5DFA0"
              strokeWidth="3"
              opacity="0.5"
            />
          </svg>

          {/* === Layer 3: コンテンツ (メダル/テキスト/フッター、リボンの上に重ねる) === */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'absolute',
              top: 60,
              left: 60,
              width: 960,
              height: 1230,
            }}
          >
            {/* メダル (リボン中央に重なる位置) */}
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

            {/* 票数 (56 を主役級に強調、縦並び中央揃え) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: 50,
              }}
            >
              <div style={{ display: 'flex' }}>
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
              <div style={{ display: 'flex', marginTop: 8 }}>
                <span
                  style={{
                    fontSize: 40,
                    color: '#FAFAF7',
                  }}
                >
                  人が証明
                </span>
              </div>
            </div>

            {/* 余白スペーサー (証明書らしい余白の美) */}
            <div style={{ display: 'flex', flex: 1 }} />

            {/* プロ名 */}
            <div style={{ display: 'flex' }}>
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

            {/* フッター: REAL PROOF */}
            <div style={{ display: 'flex', marginTop: 40 }}>
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
            <div style={{ display: 'flex', marginTop: 8, marginBottom: 36 }}>
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

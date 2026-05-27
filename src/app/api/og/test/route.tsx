import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  // サブセットフォントを読み込み (Edge Runtime対応)
  // fetch(new URL(..., import.meta.url)) は Vercel が build 時に bundle してくれる
  const fontData = await fetch(
    new URL('../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((res) => res.arrayBuffer())

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#1A1A2E',
          color: '#FAFAF7',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'NotoSansJP',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
          REAL PROOF
        </div>
        <div style={{ fontSize: 48, color: '#C4A35A', marginTop: 24 }}>
          強みが、あなたを定義する
        </div>
        <div
          style={{
            fontSize: 28,
            color: 'rgba(250,250,247,0.6)',
            marginTop: 16,
          }}
        >
          宮崎ほくと · SPECIALIST 認定
        </div>
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
    }
  )
}

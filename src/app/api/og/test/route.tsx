import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          backgroundColor: '#1A1A2E',
          color: '#FAFAF7',
          fontSize: 96,
          fontWeight: 700,
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: -2,
        }}
      >
        REAL PROOF
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}

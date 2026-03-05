import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#1A1A2E',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#C4A35A',
          fontSize: '60px',
        }}
      >
        REALPROOF TEST
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

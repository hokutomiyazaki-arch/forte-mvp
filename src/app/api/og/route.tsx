import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  console.log('STEP_A: 開始')

  try {
    const response = new ImageResponse(
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
          REALPROOF TEST OK
        </div>
      ),
      { width: 1200, height: 630 }
    )
    console.log('STEP_B: 成功')
    return response
  } catch (e) {
    console.error('STEP_C: エラー', e)
    return new Response('error', { status: 500 })
  }
}

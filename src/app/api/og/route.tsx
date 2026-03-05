import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  console.log('STEP_A: 開始')

  const { searchParams } = new URL(request.url)
  const proId = searchParams.get('proId')

  let name = 'REALPROOF'
  let title = ''
  let totalProofs = 0

  if (proId) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      console.log('STEP_B: Supabase fetch開始')

      // プロ情報取得
      const proRes = await fetch(
        `${supabaseUrl}/rest/v1/professionals?id=eq.${proId}&select=name,title&limit=1`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${supabaseKey}`,
          }
        }
      )
      const proData = await proRes.json()
      console.log('STEP_C: プロ取得', JSON.stringify(proData))

      if (proData?.[0]) {
        name = proData[0].name || 'REALPROOF'
        title = proData[0].title || ''
      }

      // プルーフ数取得
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/votes?professional_id=eq.${proId}&vote_type=eq.proof&select=id`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'count=exact',
          }
        }
      )
      const countHeader = countRes.headers.get('content-range')
      totalProofs = countHeader ? parseInt(countHeader.split('/')[1]) || 0 : 0
      console.log('STEP_D: プルーフ数', totalProofs, countHeader)

    } catch (e) {
      console.error('FETCH_ERROR:', e)
    }
  }

  console.log('STEP_E: ImageResponse開始', { name, totalProofs })

  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px',
        background: '#1A1A2E', display: 'flex',
        flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '24px',
      }}>
        <div style={{ color: '#C4A35A', fontSize: '28px', letterSpacing: '6px' }}>
          REALPROOF
        </div>
        <div style={{ color: '#FAFAF7', fontSize: '72px', fontWeight: 'bold' }}>
          {name}
        </div>
        {title ? (
          <div style={{ color: '#aaaaaa', fontSize: '32px' }}>
            {title}
          </div>
        ) : null}
        <div style={{ color: '#C4A35A', fontSize: '40px' }}>
          {totalProofs} Proofs
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

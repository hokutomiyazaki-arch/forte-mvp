import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const proId = searchParams.get('proId')

  let proofCount = 0

  if (proId) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/votes?professional_id=eq.${proId}&vote_type=eq.proof&select=id`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'count=exact' } }
      )
      const countHeader = countRes.headers.get('content-range')
      proofCount = countHeader ? parseInt(countHeader.split('/')[1]) || 0 : 0
    } catch (e) {
      console.error('ERROR:', e)
    }
  }

  return new ImageResponse(
    (
      <div style={{ width: '1200px', height: '630px', background: '#1A1A2E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
        <div style={{ color: '#C4A35A', fontSize: '32px', letterSpacing: '8px' }}>
          REALPROOF
        </div>
        <div style={{ color: '#FAFAF7', fontSize: '48px', letterSpacing: '2px' }}>
          Proven by Clients
        </div>
        <div style={{ color: '#C4A35A', fontSize: '80px', fontWeight: 'bold' }}>
          {proofCount}
        </div>
        <div style={{ color: '#888', fontSize: '28px' }}>
          Client Proofs
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

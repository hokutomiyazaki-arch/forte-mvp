import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const proId = searchParams.get('proId')

  let name = 'NO_DATA'
  let totalProofs = 0

  if (proId) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: pro } = await supabase
        .from('professionals')
        .select('name, title')
        .eq('id', proId)
        .maybeSingle()

      if (pro) name = pro.name || 'NO_NAME'

      const { count } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('professional_id', proId)
        .eq('vote_type', 'proof')

      totalProofs = count || 0
    } catch (e) {
      console.error('DB_ERROR:', e)
      name = 'DB_ERROR'
    }
  }

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
        <div style={{ color: '#C4A35A', fontSize: '40px' }}>
          {totalProofs} Proofs
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

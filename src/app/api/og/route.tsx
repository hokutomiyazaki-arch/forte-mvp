import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const proId = searchParams.get('proId')

  let name = 'REALPROOF'
  let title = ''
  let totalProofs = 0

  if (proId) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // プロ情報取得
      const { data: pro } = await supabase
        .from('professionals')
        .select('name, title')
        .eq('id', proId)
        .maybeSingle()

      if (pro) {
        name = pro.name || 'REALPROOF'
        title = pro.title || ''
      }

      // プルーフ数取得
      const { count } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('professional_id', proId)
        .eq('vote_type', 'proof')

      totalProofs = count || 0

      console.log('OG_DEBUG:', JSON.stringify({ proId, name, title, totalProofs }))

    } catch (e) {
      console.error('OG_ERROR:', e)
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#1A1A2E',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FAFAF7',
          fontFamily: 'sans-serif',
          padding: '60px',
        }}
      >
        <div style={{ fontSize: '24px', color: '#C4A35A', marginBottom: '24px', letterSpacing: '4px' }}>
          REALPROOF | 強みの証明
        </div>
        <div style={{ fontSize: '64px', fontWeight: 'bold', marginBottom: '16px' }}>
          {name}
        </div>
        {title && (
          <div style={{ fontSize: '28px', color: '#aaa', marginBottom: '40px' }}>
            {title}
          </div>
        )}
        <div style={{ fontSize: '36px', color: '#C4A35A' }}>
          {totalProofs} クライアントからの証明
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

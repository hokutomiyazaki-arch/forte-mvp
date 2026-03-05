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

      const { data: pro } = await supabase
        .from('professionals')
        .select('name, title')
        .eq('id', proId)
        .maybeSingle()

      if (pro) {
        name = pro.name || 'REALPROOF'
        title = pro.title || ''
      }

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

  // Noto Sans JPフォントをGoogleから取得
  const fontRes = await fetch(
    'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75vY0rw-oME.woff2'
  )
  const fontData = await fontRes.arrayBuffer()

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
          padding: '60px',
        }}
      >
        <div style={{
          fontSize: '24px',
          color: '#C4A35A',
          marginBottom: '24px',
          letterSpacing: '4px',
          fontFamily: 'Noto Sans JP',
        }}>
          REALPROOF | 強みの証明
        </div>
        <div style={{
          fontSize: '64px',
          fontWeight: 'bold',
          color: '#FAFAF7',
          marginBottom: '16px',
          fontFamily: 'Noto Sans JP',
        }}>
          {name}
        </div>
        {title ? (
          <div style={{
            fontSize: '28px',
            color: '#aaaaaa',
            marginBottom: '40px',
            fontFamily: 'Noto Sans JP',
          }}>
            {title}
          </div>
        ) : null}
        <div style={{
          fontSize: '36px',
          color: '#C4A35A',
          fontFamily: 'Noto Sans JP',
        }}>
          {totalProofs} クライアントからの証明
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Noto Sans JP',
          data: fontData,
          style: 'normal',
        },
      ],
    }
  )
}

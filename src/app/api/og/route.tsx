import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

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

      const proRes = await fetch(
        `${supabaseUrl}/rest/v1/professionals?id=eq.${proId}&select=name,title&limit=1`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${supabaseKey}` } }
      )
      const proData = await proRes.json()
      console.log('STEP_C: プロ取得', JSON.stringify(proData))
      if (proData?.[0]) {
        name = proData[0].name || 'REALPROOF'
        title = proData[0].title || ''
      }

      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/votes?professional_id=eq.${proId}&vote_type=eq.proof&select=id`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'count=exact' } }
      )
      const countHeader = countRes.headers.get('content-range')
      totalProofs = countHeader ? parseInt(countHeader.split('/')[1]) || 0 : 0
      console.log('STEP_D: プルーフ数', totalProofs)

    } catch (e) {
      console.error('FETCH_ERROR:', e)
    }
  }

  // フォント読み込み
  let fontData: ArrayBuffer | Buffer
  try {
    const buf = readFileSync(join(process.cwd(), 'public/fonts/NotoSansJP-Regular.ttf'))
    fontData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    console.log('STEP_E: フォント読み込み完了')
  } catch (e) {
    console.error('FONT_ERROR:', e)
    // フォントなしフォールバック（英語のみ）
    return new ImageResponse(
      <div style={{ width: '1200px', height: '630px', background: '#1A1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4A35A', fontSize: '48px' }}>
        FONT ERROR
      </div>,
      { width: 1200, height: 630 }
    )
  }

  console.log('STEP_F: ImageResponse開始', { name, totalProofs })

  return new ImageResponse(
    (
      <div style={{ width: '1200px', height: '630px', background: '#1A1A2E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
        <div style={{ color: '#C4A35A', fontSize: '28px', letterSpacing: '6px', fontFamily: 'NotoSansJP' }}>
          REALPROOF | 強みの証明
        </div>
        <div style={{ color: '#FAFAF7', fontSize: '72px', fontWeight: 'bold', fontFamily: 'NotoSansJP' }}>
          {name}
        </div>
        {title ? (
          <div style={{ color: '#aaaaaa', fontSize: '32px', fontFamily: 'NotoSansJP' }}>
            {title}
          </div>
        ) : null}
        <div style={{ color: '#C4A35A', fontSize: '40px', fontFamily: 'NotoSansJP' }}>
          {totalProofs} クライアントからの証明
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'NotoSansJP', data: fontData, style: 'normal' }],
    }
  )
}

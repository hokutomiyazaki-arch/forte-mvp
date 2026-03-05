import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// ブランドカラー
const DARK = '#1A1A2E'
const GOLD = '#C4A35A'
const CREAM = '#FAFAF7'
const GOLD_LIGHT = '#D4B36A'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const proId = searchParams.get('proId')

  // Supabase（service_role key でサーバーサイドアクセス）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // デフォルト値（プロが見つからない場合のフォールバック）
  let proName = 'プロフェッショナル'
  let proTitle = '強みが、あなたを定義する。'
  let totalProofs = 0
  let topProofs: string[] = []

  if (proId) {
    // プロ基本情報取得（実在カラムのみ）
    const { data: pro } = await supabase
      .from('professionals')
      .select('name, title, prefecture')
      .eq('id', proId)
      .maybeSingle()

    if (pro) {
      proName = pro.name || 'プロフェッショナル'
      proTitle = pro.title || '強みが、あなたを定義する。'
    }

    // 証明数合計（vote_type='proof' のもの）
    const { count } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('professional_id', proId)
      .eq('vote_type', 'proof')
    totalProofs = count || 0

    // トップ3プルーフ（vote_summaryビュー経由）
    let summaryData: any[] | null = null
    try {
      const { data } = await supabase
        .from('vote_summary')
        .select('proof_id, vote_count')
        .eq('professional_id', proId)
        .order('vote_count', { ascending: false })
        .limit(3)
      summaryData = data

      // proof_idからラベルを取得
      if (summaryData && summaryData.length > 0) {
        const proofIds = summaryData.map((d: any) => d.proof_id)
        const { data: proofItems } = await supabase
          .from('proof_items')
          .select('id, label')
          .in('id', proofIds)

        if (proofItems) {
          topProofs = summaryData.map((d: any) => {
            const item = proofItems.find((p: any) => p.id === d.proof_id)
            return item?.label || ''
          }).filter(Boolean)
        }
      }
    } catch {
      // vote_summary が使えない場合は topProofs を空のまま
    }

    // デバッグログ
    console.log('OG_DEBUG:', JSON.stringify({
      proId,
      totalProofs,
      topProofs,
      summaryData,
    }))
  }

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: DARK,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* 背景装飾: ゴールドのグロー */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            background: `radial-gradient(circle, ${GOLD}22 0%, transparent 70%)`,
            borderRadius: '50%',
            display: 'flex',
          }}
        />

        {/* ヘッダー: REALPROOFロゴ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              color: GOLD,
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '3px',
            }}
          >
            REALPROOF
          </div>
          <div
            style={{
              width: '1px',
              height: '16px',
              background: `${GOLD}66`,
              display: 'flex',
            }}
          />
          <div style={{ color: `${CREAM}88`, fontSize: '14px', letterSpacing: '1px' }}>
            強みの証明
          </div>
        </div>

        {/* メイン: プロ名 + タイトル */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              color: CREAM,
              fontSize: '52px',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.5px',
            }}
          >
            {proName}
          </div>
          <div
            style={{
              color: `${CREAM}99`,
              fontSize: '20px',
              letterSpacing: '0.5px',
            }}
          >
            {proTitle}
          </div>
        </div>

        {/* フッター: プルーフ統計 + トップ3 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          {/* 証明数 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ color: GOLD, fontSize: '56px', fontWeight: 800, lineHeight: 1 }}>
              {totalProofs}
            </div>
            <div style={{ color: `${CREAM}88`, fontSize: '14px', letterSpacing: '1px' }}>
              クライアントからの証明
            </div>
          </div>

          {/* 上位プルーフ3件 */}
          {topProofs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
              {topProofs.map((proof, i) => (
                <div
                  key={i}
                  style={{
                    background: i === 0 ? `${GOLD}22` : `${CREAM}0A`,
                    border: `1px solid ${i === 0 ? `${GOLD}44` : `${CREAM}22`}`,
                    borderRadius: '100px',
                    padding: '8px 20px',
                    color: i === 0 ? GOLD_LIGHT : `${CREAM}AA`,
                    fontSize: i === 0 ? '16px' : '14px',
                    fontWeight: i === 0 ? 600 : 400,
                    letterSpacing: '0.3px',
                    display: 'flex',
                  }}
                >
                  {i === 0 ? '# ' : ''}{proof}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ゴールドのボトムライン */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )

  // キャッシュを無効化
  imageResponse.headers.set('Cache-Control', 'no-store, max-age=0')
  return imageResponse
}

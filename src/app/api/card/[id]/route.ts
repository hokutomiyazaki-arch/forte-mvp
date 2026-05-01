import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCardData } from '@/lib/card-data'

export const dynamic = 'force-dynamic'

/**
 * SEO Step 5 Phase A 以降:
 *   実データ取得は src/lib/card-data.ts に移植 (Server Component と共通)。
 *   このルートは Client Component (CardClient.tsx) からの再 fetch / 他コンポーネント
 *   からの参照のために残置。レスポンス形状は従来と完全互換。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: proId } = await params

  // Clerk認証（オプション — ブックマーク状態チェック用）
  let currentUserId: string | null = null
  try {
    const { userId } = await auth()
    currentUserId = userId
  } catch {
    // 未ログインでもOK
  }

  try {
    const data = await getCardData(proId, currentUserId)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err) {
    console.error('[api/card] Error:', err)
    return NextResponse.json(
      { error: 'Failed to load card data' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}

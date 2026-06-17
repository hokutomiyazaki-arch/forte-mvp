import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { randomUUID } from 'crypto'
import { persistExternalImage } from '@/lib/server-image'

export const dynamic = 'force-dynamic'

/**
 * クライアント側投票パス（vote/[id]/page.tsx の handleClerkVote）専用の中継ルート。
 * ブラウザからサーバーヘルパーを直接呼べないため、外部画像URL（Clerk imageUrl など）を
 * 受け取り、Supabase Storage(client-photos) にコピーした永続URL or null を返す。
 *
 * 投票フロー内なのでClerkログイン済み前提。失敗時も { url: null } を返し、呼び出し側は
 * null で投票を続行する（写真は付帯処理でフローを止めない）。
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { sourceUrl } = await req.json()
    const url = await persistExternalImage({
      sourceUrl,
      bucket: 'client-photos',
      path: `photos/migrated-${randomUUID()}.jpg`,
    })
    return NextResponse.json({ url })
  } catch (e) {
    console.warn('[IMG_PERSIST] persist-photo route error', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ url: null })
  }
}

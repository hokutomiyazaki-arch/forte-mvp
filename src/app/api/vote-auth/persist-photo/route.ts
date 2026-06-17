import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { randomUUID } from 'crypto'
import { persistExternalImage } from '@/lib/server-image'

export const dynamic = 'force-dynamic'

/**
 * クライアント側投票パス（vote/[id]/page.tsx の handleClerkVote）専用の中継ルート。
 * ブラウザからサーバーヘルパーを直接呼べないため、Clerkセッションの imageUrl を
 * Supabase Storage(client-photos) にコピーした永続URL or null を返す。
 *
 * SSRF対策: sourceUrl はクライアントから受け取らず、必ずサーバー側で認証済みセッションから
 * 引く（register/onboarding の currentUser().imageUrl と同形）。任意URLのfetchを許さない。
 *
 * 失敗時も { url: null } を返し、呼び出し側は null で投票を続行する
 * （写真は付帯処理でフローを止めない）。
 */
export async function POST() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = await persistExternalImage({
      sourceUrl: user.imageUrl ?? null,
      bucket: 'client-photos',
      path: `photos/migrated-${randomUUID()}.jpg`,
    })
    return NextResponse.json({ url })
  } catch (e) {
    console.warn('[IMG_PERSIST] persist-photo route error', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ url: null })
  }
}

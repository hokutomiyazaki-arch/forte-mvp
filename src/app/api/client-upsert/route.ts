import { auth, currentUser } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    const { userId } = await auth()
    const user = await currentUser()

    if (!userId || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const email = user.primaryEmailAddress?.emailAddress ?? null
    const nickname = email ? email.split('@')[0] : 'user'

    await supabaseAdmin
      .from('clients')
      .upsert(
        {
          user_id: userId,
          email: email,
          nickname: nickname,
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[client-upsert] error:', e.message)
    // エラーでも200を返す（投票フローを止めない）
    return NextResponse.json({ success: false, error: e.message })
  }
}

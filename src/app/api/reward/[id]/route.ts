import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 認証不要: リワードURLを知っている人なら誰でもアクセス可能
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('client_rewards')
    .select(`
      id,
      reward_id,
      professional_id,
      client_email,
      created_at,
      rewards (
        reward_type,
        title,
        content,
        url
      ),
      professionals (
        name
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[api/reward] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch reward' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const reward = data.rewards as any
  const pro = data.professionals as any

  return NextResponse.json({
    id: data.id,
    reward_type: reward?.reward_type || '',
    title: reward?.title || '',
    content: reward?.content || '',
    url: reward?.url || '',
    proName: pro?.name || '',
    professionalId: data.professional_id,
  })
}

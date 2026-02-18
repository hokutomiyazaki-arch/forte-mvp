import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const body = await req.json()
    const email = body.email
    const proId = body.proId

    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

    const normalizedEmail = email.toLowerCase().trim()

    if (proId) {
      const { data: pro } = await supabaseAdmin
        .from('professionals')
        .select('user_id, contact_email')
        .eq('id', proId)
        .single()

      if (pro) {
        if (pro.contact_email && pro.contact_email.toLowerCase() === normalizedEmail) {
          return NextResponse.json({ isSelf: true })
        }
        if (pro.user_id) {
          const { data: { user: proUser } } = await supabaseAdmin.auth.admin.getUserById(pro.user_id)
          if (proUser?.email?.toLowerCase() === normalizedEmail) {
            return NextResponse.json({ isSelf: true })
          }
        }
      }
      return NextResponse.json({ isSelf: false })
    }

    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existingUser = users.find((u: any) => u.email?.toLowerCase() === normalizedEmail)

    if (!existingUser) {
      return NextResponse.json({ exists: false, provider: null })
    }

    const provider = existingUser.app_metadata?.provider || 'email'
    return NextResponse.json({ exists: true, provider })
  } catch (err) {
    console.error('[check-email] error:', err)
    return NextResponse.json({ exists: false, provider: null, isSelf: false })
  }
}

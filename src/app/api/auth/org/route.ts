import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password === process.env.ORG_REGISTER_PASSWORD) {
    const cookieStore = await cookies()
    cookieStore.set('rp_org_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7日間（団体登録は余裕持たせる）
      path: '/',
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}

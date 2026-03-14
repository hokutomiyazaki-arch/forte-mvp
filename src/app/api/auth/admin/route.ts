import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password === process.env.ADMIN_PASSWORD) {
    const cookieStore = await cookies()
    cookieStore.set('rp_admin_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24時間
      path: '/',
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}

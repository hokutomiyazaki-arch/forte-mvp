'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthCallback() {
  useEffect(() => {
    const supabase = createClient() as any

    // Supabase client library automatically picks up the tokens from the URL hash
    // We just need to wait for the session to be established
    supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_IN' && session) {
        // Get role/nickname from URL search params
        const params = new URLSearchParams(window.location.search)
        const role = params.get('role') || 'pro'
        const nickname = params.get('nickname') || ''

        const redirectParams = new URLSearchParams()
        redirectParams.set('role', role)
        if (nickname) redirectParams.set('nickname', nickname)

        window.location.href = '/login?' + redirectParams.toString()
      }
    })

    // Also check if session already exists (in case onAuthStateChange already fired)
    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const params = new URLSearchParams(window.location.search)
        const role = params.get('role') || 'pro'
        const nickname = params.get('nickname') || ''

        const redirectParams = new URLSearchParams()
        redirectParams.set('role', role)
        if (nickname) redirectParams.set('nickname', nickname)

        window.location.href = '/login?' + redirectParams.toString()
      }
    }, 1000)
  }, [])

  return (
    <div className="text-center py-16 text-gray-400">
      認証中...
    </div>
  )
}

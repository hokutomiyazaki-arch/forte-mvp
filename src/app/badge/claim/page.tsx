'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const BADGE_CODES: Record<string, { id: string; label: string; image_url: string }> = {
  'FNT-BASIC': { id: 'fnt-basic', label: 'FNT Basic 認定', image_url: '/badges/fnt-basic.png' },
  'FNT-ADVANCE': { id: 'fnt-advance', label: 'FNT Advance 認定', image_url: '/badges/fnt-advance.png' },
  'FNT-MASTER': { id: 'fnt-master', label: 'FNT Master 認定', image_url: '/badges/fnt-master.png' },
  'BDC-ELITE': { id: 'bdc-elite', label: 'BDC Elite 修了', image_url: '/badges/bdc-elite.png' },
  'BDC-PRO': { id: 'bdc-pro', label: 'BDC Pro 修了', image_url: '/badges/bdc-pro.png' },
  'BDC-LEGEND': { id: 'bdc-legend', label: 'BDC Legend 修了', image_url: '/badges/bdc-legend.png' },
}

function ClaimForm() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')?.toUpperCase() || ''
  const badge = BADGE_CODES[code]
  const supabase = createClient() as any

  const [status, setStatus] = useState<'loading' | 'no-login' | 'no-pro' | 'invalid' | 'already' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!badge) { setStatus('invalid'); return }
    claimBadge()
  }, [])

  async function claimBadge() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setStatus('no-login'); return }

    const { data: pro } = await supabase
      .from('professionals').select('id, badges').eq('user_id', session.user.id).single()
    if (!pro) { setStatus('no-pro'); return }

    const existing = pro.badges || []
    if (existing.some((b: any) => b.id === badge.id)) {
      setStatus('already')
      return
    }

    const updated = [...existing, { id: badge.id, label: badge.label, image_url: badge.image_url }]
    const { error } = await supabase
      .from('professionals').update({ badges: updated }).eq('id', pro.id)

    if (error) {
      console.error('Badge claim error:', error)
      setStatus('error')
    } else {
      setStatus('success')
    }
  }

  if (status === 'loading') {
    return <div className="text-center py-16 text-gray-400">バッジを確認中...</div>
  }

  if (status === 'invalid') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">無効なバッジコード</h1>
        <p className="text-gray-500">このリンクは無効です。</p>
      </div>
    )
  }

  if (status === 'no-login') {
    const returnUrl = `/badge/claim?code=${code}`
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">ログインが必要です</h1>
        <p className="text-gray-500 mb-4">バッジを受け取るにはプロとしてログインしてください。</p>
        {badge && (
          <div className="mb-6">
            <img src={badge.image_url} alt={badge.label} className="w-20 h-20 mx-auto mb-2" />
            <p className="font-bold text-[#1A1A2E]">{badge.label}</p>
          </div>
        )}
        <a href={`/login?role=pro`}
          className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
          ログインする
        </a>
      </div>
    )
  }

  if (status === 'no-pro') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">👤</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">プロ登録が必要です</h1>
        <p className="text-gray-500 mb-4">バッジを受け取るにはプロプロフィールを作成してください。</p>
        <a href="/dashboard"
          className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
          プロフィールを作成する
        </a>
      </div>
    )
  }

  if (status === 'already') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <img src={badge.image_url} alt={badge.label} className="w-24 h-24 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">既に取得済みです</h1>
        <p className="text-gray-500 mb-6">{badge.label} バッジは既にあなたのプロフィールに表示されています。</p>
        <a href="/dashboard" className="text-[#C4A35A] hover:underline">ダッシュボードへ</a>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <img src={badge.image_url} alt={badge.label} className="w-28 h-28 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">バッジを獲得しました！</h1>
        <p className="text-lg font-medium text-[#C4A35A] mb-6">{badge.label}</p>
        <p className="text-gray-500 mb-6">あなたのプロフィールにバッジが追加されました。</p>
        <a href="/dashboard"
          className="inline-block px-8 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
          ダッシュボードで確認
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">エラーが発生しました</h1>
      <p className="text-gray-500">もう一度お試しください。</p>
    </div>
  )
}

export default function BadgeClaimPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <ClaimForm />
    </Suspense>
  )
}

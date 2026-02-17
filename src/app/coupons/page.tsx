'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface CouponWithPro {
  id: string
  pro_user_id: string
  status: string
  pro_name: string
  coupon_text: string
}

export default function CouponsPage() {
  const supabase = createClient()
  const [coupons, setCoupons] = useState<CouponWithPro[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        window.location.href = '/login?role=client&redirect=/coupons'
        return
      }
      setUser(u)

      // clientsレコードがなければ自動作成
      const { data: existing } = await (supabase as any)
        .from('clients')
        .select('id')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!existing) {
        const nn = u.user_metadata?.full_name || u.email?.split('@')[0] || 'ユーザー'
        await (supabase as any).from('clients').upsert({
          user_id: u.id,
          nickname: nn,
        }, { onConflict: 'user_id' })
      }

      // クーポンを取得
      const { data: couponData } = await (supabase as any)
        .from('coupons')
        .select('id, pro_user_id, status')
        .eq('client_email', u.email)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })

      if (!couponData || couponData.length === 0) {
        setLoading(false)
        return
      }

      // プロ情報を一括取得
      const proIds = Array.from(new Set(couponData.map((c: any) => c.pro_user_id)))
      const { data: proData } = await (supabase as any)
        .from('professionals')
        .select('id, name, coupon_text')
        .in('id', proIds)

      const proMap = new Map<string, { name: string; coupon_text: string }>()
      if (proData) {
        for (const p of proData) {
          proMap.set(p.id, { name: p.name, coupon_text: p.coupon_text || '' })
        }
      }

      const merged: CouponWithPro[] = couponData.map((c: any) => {
        const pro = proMap.get(c.pro_user_id)
        return {
          id: c.id,
          pro_user_id: c.pro_user_id,
          status: c.status,
          pro_name: pro?.name || 'プロ',
          coupon_text: pro?.coupon_text || '',
        }
      })

      setCoupons(merged)
      setLoading(false)
    }
    load()
  }, [])

  async function handleRedeem(couponId: string) {
    setRedeeming(true)
    setMessage('')

    const { data, error } = await (supabase as any).rpc('redeem_coupon', {
      coupon_id: couponId,
    })

    if (error) {
      setMessage('エラーが発生しました。もう一度お試しください。')
      setRedeeming(false)
      setConfirmingId(null)
      return
    }

    if (data?.success) {
      setCoupons(prev => prev.filter(c => c.id !== couponId))
      setMessage('クーポンを使用しました！')
    } else {
      setMessage(data?.error || 'クーポンの使用に失敗しました。')
    }

    setRedeeming(false)
    setConfirmingId(null)
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  const activeCoupons = coupons.filter(c => c.status === 'active')
  const usedCoupons = coupons.filter(c => c.status === 'used')

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">マイクーポン</h1>
      <p className="text-sm text-gray-500 mb-6">
        プルーフを贈ったプロからのクーポンです。対面時に「使用する」を押してください。
      </p>

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('クーポンを使用') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {activeCoupons.length === 0 && usedCoupons.length === 0 && (
        <div className="text-center py-12">
          <p className="text-5xl mb-4">🎫</p>
          <p className="text-gray-400">まだクーポンはありません</p>
          <a href="/explore" className="text-[#C4A35A] text-sm underline mt-2 inline-block">
            プロを探してプルーフを贈る →
          </a>
        </div>
      )}

      {activeCoupons.map(coupon => (
        <div key={coupon.id} className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">🎁 {coupon.pro_name}さんからのクーポン</p>
          <p className="text-xl font-bold text-[#1A1A2E] mb-4">「{coupon.coupon_text}」</p>

          {confirmingId === coupon.id ? (
            <div className="space-y-2">
              <p className="text-sm text-center text-orange-600 font-medium">
                本当に使用しますか？この操作は取り消せません。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRedeem(coupon.id)}
                  disabled={redeeming}
                  className="flex-1 py-2 bg-[#C4A35A] text-white font-bold rounded-lg hover:bg-[#b3923f] transition disabled:opacity-50"
                >
                  {redeeming ? '処理中...' : '使用する'}
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingId(coupon.id)}
              className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition text-sm"
            >
              使用する
            </button>
          )}
        </div>
      ))}

      {usedCoupons.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-400 mb-3">使用済み</h2>
          {usedCoupons.map(coupon => (
            <div key={coupon.id} className="bg-gray-50 text-gray-400 rounded-xl p-4 mb-2">
              <p className="text-xs mb-1">{coupon.pro_name}さんからのクーポン</p>
              <p className="text-sm line-through">「{coupon.coupon_text}」</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

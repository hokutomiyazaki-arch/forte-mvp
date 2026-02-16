'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Coupon {
  id: string
  pro_user_id: string
  client_email: string
  discount_type: string
  discount_value: number
  code: string
  status: string
  expires_at: string
  created_at: string
  used_at: string | null
}

export default function CouponsPage() {
  const supabase = createClient()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        // 未ログイン → ログインページへ
        window.location.href = '/login?redirect=/coupons'
        return
      }
      setUser(u)

      // 自分のクーポンを取得
      const { data } = await supabase
        .from('coupons')
        .select('*')
        .eq('client_email', u.email)
        .order('created_at', { ascending: false })

      if (data) setCoupons(data)
      setLoading(false)
    }
    load()
  }, [])

  async function handleRedeem(couponId: string) {
    setRedeeming(true)
    setMessage('')

    const { data, error } = await supabase.rpc('redeem_coupon', {
      coupon_id: couponId,
    })

    if (error) {
      setMessage('エラーが発生しました。もう一度お試しください。')
      setRedeeming(false)
      setConfirmingId(null)
      return
    }

    if (data?.success) {
      // クーポンをリストから削除（使用済み）
      setCoupons(prev => prev.filter(c => c.id !== couponId))
      setMessage('✅ クーポンを使用しました！')
    } else {
      setMessage(data?.error || 'クーポンの使用に失敗しました。')
    }

    setRedeeming(false)
    setConfirmingId(null)
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  const activeCoupons = coupons.filter(c => c.status === 'active' && new Date(c.expires_at) > new Date())
  const usedCoupons = coupons.filter(c => c.status === 'used')

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">🎁 マイクーポン</h1>
      <p className="text-sm text-gray-500 mb-6">
        プルーフを贈ったプロからのクーポンです。対面時に「使用する」を押してください。
      </p>

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* アクティブなクーポン */}
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
        <div key={coupon.id} className="bg-gradient-to-r from-[#1A1A2E] to-[#2a2a4e] text-white rounded-xl p-5 mb-4 relative overflow-hidden">
          {/* 装飾 */}
          <div className="absolute top-0 right-0 w-20 h-20 bg-[#C4A35A]/10 rounded-full -mr-8 -mt-8" />
          
          <p className="text-[#C4A35A] text-xs font-bold mb-2">THANK YOU COUPON</p>
          <p className="text-lg font-bold mb-3">{coupon.discount_value}% OFF</p>
          
          <div className="text-xs text-gray-400 mb-4">
            有効期限: {new Date(coupon.expires_at).toLocaleDateString('ja-JP')}
          </div>

          {confirmingId === coupon.id ? (
            <div className="space-y-2">
              <p className="text-sm text-center text-yellow-300 font-medium">
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
                  className="flex-1 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingId(coupon.id)}
              className="w-full py-3 bg-[#C4A35A] text-white font-bold rounded-lg hover:bg-[#b3923f] transition text-sm"
            >
              🎫 このクーポンを使用する
            </button>
          )}
        </div>
      ))}

      {/* 使用済みクーポン */}
      {usedCoupons.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-400 mb-3">使用済み</h2>
          {usedCoupons.map(coupon => (
            <div key={coupon.id} className="bg-gray-100 text-gray-400 rounded-xl p-4 mb-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold">USED</p>
                  <p className="text-sm">{coupon.discount_value}% OFF</p>
                </div>
                <p className="text-xs">
                  {coupon.used_at && new Date(coupon.used_at).toLocaleDateString('ja-JP')} 使用
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

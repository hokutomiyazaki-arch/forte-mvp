'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getForteLabel, getForteEmoji, getForteDesc } from '@/lib/types'
import type { Professional } from '@/lib/types'
import Link from 'next/link'

export default function VotePage({ params }: { params: { id: string } }) {
  const [pro, setPro] = useState<Professional | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', params.id)
        .single()
      setPro(data)
      setLoading(false)
    }
    load()
  }, [params.id])

  const handleVote = async () => {
    if (!selected || !pro) return
    setSubmitting(true)
    await supabase.from('votes').insert({
      professional_id: pro.id,
      category: selected,
      comment: comment.trim() || null,
      voter_fingerprint: Math.random().toString(36).slice(2),
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">読み込み中...</div></main>
  }
  if (!pro) {
    return <main className="min-h-screen flex items-center justify-center"><p className="text-gray-500">プロフェッショナルが見つかりません</p></main>
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-forte-cream flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-3xl shadow-lg p-8">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold text-forte-dark mb-2">投票ありがとうございます！</h1>
            <p className="text-gray-500 mb-6">{pro.name}さんのフォルテに反映されました</p>
            {pro.coupon_text && (
              <div className="bg-gradient-to-r from-forte-gold/10 to-amber-50 border-2 border-dashed border-forte-gold rounded-2xl p-6 mb-6">
                <p className="text-xs text-forte-gold font-bold mb-2 tracking-wider">🎁 お礼クーポン</p>
                <p className="text-xl font-bold text-forte-dark">{pro.coupon_text}</p>
                <p className="text-xs text-gray-400 mt-3">次回ご来店時にこの画面をお見せください</p>
              </div>
            )}
            <Link href={`/card/${pro.id}`} className="inline-block px-6 py-3 bg-forte-dark text-white rounded-xl font-medium hover:bg-opacity-90 transition">
              {pro.name}さんのFORTEカードを見る
            </Link>
          </div>
          <p className="text-xs text-gray-400 mt-6">FORTE — 強みに人が集まるデジタル名刺</p>
        </div>
      </main>
    )
  }

  // Build categories from pro's settings
  const categories: { key: string; label: string; emoji: string; desc: string }[] = [
    ...(pro.selected_fortes || []).map(key => ({
      key,
      label: getForteLabel(key, pro),
      emoji: getForteEmoji(key),
      desc: getForteDesc(key),
    })),
    ...(pro.custom_forte_1 ? [{ key: 'custom1', label: pro.custom_forte_1, emoji: '⭐', desc: '' }] : []),
    ...(pro.custom_forte_2 ? [{ key: 'custom2', label: pro.custom_forte_2, emoji: '🌟', desc: '' }] : []),
  ]

  return (
    <main className="min-h-screen bg-forte-cream flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <span className="text-lg font-bold tracking-wider text-forte-dark">FORTE</span>
        </div>
        <div className="bg-white rounded-3xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-forte-dark flex items-center justify-center text-2xl text-white mx-auto mb-3 overflow-hidden">
              {pro.photo_url ? <img src={pro.photo_url} alt={pro.name} className="w-full h-full object-cover" /> : pro.name.charAt(0)}
            </div>
            <h2 className="text-lg font-bold text-forte-dark">{pro.name}</h2>
            <p className="text-sm text-gray-400">{pro.title}</p>
          </div>

          <h3 className="text-center text-base font-medium text-forte-dark mb-1">
            {pro.name}さんの一番のフォルテは？
          </h3>
          <p className="text-center text-xs text-gray-400 mb-6">1つ選んでください</p>

          <div className="space-y-2 mb-6">
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setSelected(cat.key)}
                className={`w-full flex items-center gap-3 px-5 py-4 rounded-xl border-2 transition-all text-left ${
                  selected === cat.key ? 'border-forte-gold bg-forte-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <span className="text-xl">{cat.emoji}</span>
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${selected === cat.key ? 'text-forte-dark' : 'text-gray-600'}`}>{cat.label}</span>
                  {cat.desc && <p className="text-xs text-gray-400">{cat.desc}</p>}
                </div>
                {selected === cat.key && <span className="ml-auto text-forte-gold font-bold">✓</span>}
              </button>
            ))}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-500 mb-2">ひとことコメント（任意）</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 100))}
              rows={2}
              placeholder="例: いつも丁寧に向き合ってくれて感謝しています"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold focus:border-transparent resize-none text-sm"
            />
            <p className="text-right text-xs text-gray-300 mt-1">{comment.length}/100</p>
          </div>

          <button
            onClick={handleVote}
            disabled={!selected || submitting}
            className="w-full py-4 bg-forte-gold text-forte-dark rounded-xl font-bold text-lg hover:bg-opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? '送信中...' : '投票する 🗳'}
          </button>
          {pro.coupon_text && <p className="text-center text-xs text-gray-400 mt-3">🎁 投票後にお礼クーポンがもらえます</p>}
        </div>
      </div>
    </main>
  )
}

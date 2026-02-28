'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useUser } from '@clerk/nextjs'

const ORG_TYPE_LABELS: Record<string, { invite: string; inviteDesc: string }> = {
  store: {
    invite: 'メンバーを招待',
    inviteDesc: 'にメンバーを招待します。登録済みのプロのメールアドレスを入力してください。',
  },
  credential: {
    invite: '認定者を追加',
    inviteDesc: 'に認定者を追加します。登録済みのプロのメールアドレスを入力してください。',
  },
  education: {
    invite: '修了者を追加',
    inviteDesc: 'に修了者を追加します。登録済みのプロのメールアドレスを入力してください。',
  },
}

export default function OrgInvitePage() {
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [invitations, setInvitations] = useState<any[]>([])

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  useEffect(() => {
    if (!authLoaded) return
    if (!authUser) { window.location.href = '/login?role=pro'; return }
    load(authUser)
  }, [authLoaded, authUser])

  async function load(user: any) {
    try {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (orgError) throw orgError
      if (!orgData) {
        window.location.href = '/org/register'
        return
      }

      setOrg(orgData)

      // 既存の招待一覧
      const { data: invData } = await supabase
        .from('org_invitations')
        .select('*')
        .eq('organization_id', orgData.id)
        .order('created_at', { ascending: false })

      setInvitations(invData || [])
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      const trimmed = email.trim().toLowerCase()
      if (!trimmed) throw new Error('メールアドレスを入力してください')

      // APIルートでプロ存在確認 + 招待作成 + メール送信
      const res = await fetch('/api/org-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: org.id,
          orgName: org.name,
          email: trimmed,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '招待の送信に失敗しました')
      }

      setMessage(`${trimmed} に招待メールを送信しました`)
      setEmail('')

      // リスト更新
      const { data: invData } = await supabase
        .from('org_invitations')
        .select('*')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })

      setInvitations(invData || [])
    } catch (err: any) {
      setError(err.message || '招待の送信に失敗しました')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-4 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (!org) return null

  const L = ORG_TYPE_LABELS[org.type] || ORG_TYPE_LABELS.store

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待機中', color: 'text-yellow-600 bg-yellow-50' },
    accepted: { label: '承認済', color: 'text-green-600 bg-green-50' },
    expired: { label: '期限切れ', color: 'text-gray-400 bg-gray-50' },
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button
        onClick={() => window.location.href = '/org/dashboard'}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← ダッシュボードに戻る
      </button>

      <h1 className="text-xl font-bold text-[#1A1A2E] mb-1">{L.invite}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {org.name}{L.inviteDesc}
      </p>

      {/* 招待フォーム */}
      <form onSubmit={handleInvite} className="mb-8">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder="pro@example.com"
          />
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition disabled:opacity-50 whitespace-nowrap text-sm"
          >
            {submitting ? '送信中...' : '招待する'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {message && <p className="text-green-600 text-sm mt-2">{message}</p>}
      </form>

      {/* 招待履歴 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">招待履歴</h2>

        {invitations.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">まだ招待がありません</p>
        ) : (
          <div className="space-y-3">
            {invitations.map(inv => {
              const st = statusLabels[inv.status] || statusLabels.pending
              return (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm text-[#1A1A2E]">{inv.invited_email}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(inv.created_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${st.color}`}>
                    {st.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'

export default function CertifiedMembersPage() {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<any[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [orgType, setOrgType] = useState<string>('credential')
  const [revoking, setRevoking] = useState<string | null>(null)

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  useEffect(() => {
    if (!authLoaded) return
    if (!authUser) { window.location.href = '/login?role=pro'; return }
    fetchMembers()
  }, [authLoaded, authUser])

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/org-dashboard')
      if (!res.ok) throw new Error('データの取得に失敗しました')
      const data = await res.json()

      if (!data.org) {
        window.location.href = '/org/register'
        return
      }

      setOrgId(data.org.id)
      setOrgType(data.org.type || 'credential')

      // badgeHolders: credential_level_id付きのorg_membersレコード
      // professionals, credential_levels がJOINされている
      const holderList = data.badgeHolders || []

      const formatted = holderList.map((h: any) => ({
        professional_id: h.professional_id,
        name: h.professionals?.name || '不明',
        photo_url: h.professionals?.photo_url,
        badge_name: h.credential_levels?.name,
        badge_level_id: h.credential_level_id,
        accepted_at: h.accepted_at,
      }))

      // professional_idでグループ化 → 1人1行
      const grouped = Object.values(
        formatted.reduce((acc: Record<string, any>, m: any) => {
          if (!acc[m.professional_id]) {
            acc[m.professional_id] = {
              ...m,
              badges: [{ badge_name: m.badge_name, badge_level_id: m.badge_level_id, accepted_at: m.accepted_at }],
            }
          } else {
            acc[m.professional_id].badges.push({ badge_name: m.badge_name, badge_level_id: m.badge_level_id, accepted_at: m.accepted_at })
          }
          return acc
        }, {})
      )

      setMembers(grouped)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // 認定削除ハンドラ（全バッジ一括削除）
  const handleRevoke = async (member: any) => {
    const typeLabel = orgType === 'store' ? 'メンバー' : orgType === 'education' ? '修了者' : '認定者'
    const badgeNames = (member.badges || [])
      .map((b: any) => b.badge_name)
      .filter(Boolean)
      .join('、')

    if (!confirm(
      `${member.name} さんの${badgeNames ? `全バッジ（${badgeNames}）` : '認定'}を削除しますか？\n\n` +
      `※ この操作は取り消せません。\n` +
      `※ 再度バッジを付与するにはclaim URLからの再取得が必要です。`
    )) {
      return
    }

    setRevoking(member.professional_id)
    try {
      // badge_level_idを渡さず、organization_idで一括削除
      const params = new URLSearchParams({
        professional_id: member.professional_id,
        organization_id: orgId,
      })
      const res = await fetch(`/api/org-badge-revoke?${params}`, { method: 'DELETE' })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || '削除に失敗しました')
      }

      // 一覧から削除
      setMembers(prev => prev.filter(m => m.professional_id !== member.professional_id))
    } catch (error: any) {
      alert(error.message)
    } finally {
      setRevoking(null)
    }
  }

  // org.typeに応じたラベル
  const labels: Record<string, Record<string, string>> = {
    store: { title: 'メンバー管理', member: 'メンバー', empty: 'まだメンバーがいません' },
    credential: { title: '認定者管理', member: '認定者', empty: 'まだ認定者がいません' },
    education: { title: '修了者管理', member: '修了者', empty: 'まだ修了者がいません' },
  }
  const label = labels[orgType] || labels.credential

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#FAFAF7',
      }}>
        <div style={{
          width: '32px', height: '32px', border: '2px solid #C4A35A', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#FAFAF7',
      padding: '24px 16px', maxWidth: '640px', margin: '0 auto',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#1A1A2E', fontSize: '22px', fontWeight: 700, margin: 0 }}>
            {label.title}
          </h1>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>
            {members.length}名の{label.member}
          </p>
        </div>
        <button
          onClick={() => window.location.href = '/org/dashboard'}
          style={{
            background: 'none', border: '1px solid #E5E5E0', color: '#666',
            fontSize: '13px', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          戻る
        </button>
      </div>

      {/* 認定者一覧 */}
      {members.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #E5E5E0',
        }}>
          <p style={{ color: '#888', fontSize: '15px', marginBottom: '8px' }}>{label.empty}</p>
          <p style={{ color: '#AAA', fontSize: '13px' }}>
            バッジ管理からclaim URLを共有して{label.member}を追加しましょう
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {members.map((member: any) => {
            // 最も早い取得日を表示
            const earliestDate = (member.badges || [])
              .map((b: any) => b.accepted_at)
              .filter(Boolean)
              .sort()[0]

            return (
              <div
                key={member.professional_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', backgroundColor: '#fff', borderRadius: '12px',
                  border: '1px solid #E5E5E0',
                }}
              >
                {/* 左側: プロ情報 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  {member.photo_url ? (
                    <img
                      src={member.photo_url}
                      alt=""
                      style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        objectFit: 'cover', flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      backgroundColor: '#E5E5E0', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0,
                      fontSize: '16px', color: '#888',
                    }}>
                      {member.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontSize: '14px', fontWeight: 600, color: '#1A1A2E',
                      margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {member.name}
                    </p>
                    {/* バッジタグ */}
                    {member.badges && member.badges.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {member.badges.map((b: any) => (
                          <span
                            key={b.badge_level_id}
                            style={{
                              fontSize: '11px', color: '#C4A35A', backgroundColor: '#FFF8E7',
                              padding: '1px 6px', borderRadius: '4px',
                            }}
                          >
                            {b.badge_name}
                          </span>
                        ))}
                      </div>
                    )}
                    {earliestDate && (
                      <p style={{ fontSize: '11px', color: '#AAA', margin: '3px 0 0 0' }}>
                        {new Date(earliestDate).toLocaleDateString('ja-JP')} 取得
                      </p>
                    )}
                  </div>
                </div>

                {/* 右側: 削除ボタン */}
                <button
                  onClick={() => handleRevoke(member)}
                  disabled={revoking === member.professional_id}
                  style={{
                    background: 'none', border: '1px solid #E53E3E',
                    color: '#E53E3E', fontSize: '12px', padding: '6px 12px',
                    borderRadius: '6px', cursor: 'pointer', flexShrink: 0, marginLeft: '12px',
                    opacity: revoking === member.professional_id ? 0.5 : 1,
                  }}
                >
                  {revoking === member.professional_id ? '削除中...' : '認定削除'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

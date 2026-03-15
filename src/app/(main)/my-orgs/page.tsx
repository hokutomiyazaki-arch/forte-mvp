'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ORG_TYPE_LABELS: Record<string, string> = {
  store: '店舗',
  credential: '資格発行団体',
  education: '教育団体',
}

export default function MyOrgsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<any[]>([])
  const [error, setError] = useState('')
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    fetch('/api/my-orgs')
      .then(res => res.json())
      .then(data => {
        const orgs = data.organizations || []
        if (orgs.length === 1) {
          // 1団体のみ → 自動リダイレクト
          setRedirecting(true)
          router.push(`/org/${orgs[0].id}`)
          return
        }
        setOrganizations(orgs)
        setLoading(false)
      })
      .catch((err: any) => {
        setError(err.message || 'データの取得に失敗しました')
        setLoading(false)
      })
  }, [])

  if (loading || redirecting) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
        {redirecting && (
          <p className="text-sm text-gray-400 mt-4">団体ページに移動中...</p>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">{error}</p>
      </div>
    )
  }

  if (organizations.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">所属している団体はありません</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-[#1A1A2E] mb-6">所属団体</h1>

      <div className="space-y-4">
        {organizations.map((org: any) => (
          <a
            key={org.id}
            href={`/org/${org.id}`}
            className="block rounded-xl transition hover:shadow-md"
            style={{
              backgroundColor: '#FAFAF7',
              border: '1px solid #E5E5E0',
              padding: '16px',
              textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: '12px',
            }}
          >
            <div className="flex items-center gap-4">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                  style={{ backgroundColor: '#1A1A2E' }}
                >
                  {org.name?.charAt(0) || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#1A1A2E' }}>
                  {org.name}
                </p>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  {ORG_TYPE_LABELS[org.type] || org.type}
                </p>
                {org.badges && org.badges.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {org.badges.map((badge: any) => (
                      <div
                        key={badge.credential_level_id}
                        className="flex items-center gap-1"
                        style={{
                          backgroundColor: '#F0EDE4',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          color: '#1A1A2E',
                          fontWeight: 500,
                        }}
                      >
                        {badge.image_url && (
                          <img
                            src={badge.image_url}
                            alt=""
                            className="w-4 h-4 rounded object-cover"
                          />
                        )}
                        {badge.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ color: '#C4A35A', fontSize: '14px' }}>→</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

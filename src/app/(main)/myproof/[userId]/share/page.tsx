'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { VOICE_CARD_PRESETS, type VoiceCardTheme } from '@/lib/voiceCardThemes'
import { resolveProofLabels } from '@/lib/proof-labels'
import html2canvas from 'html2canvas'

interface ProofBar {
  label: string
  count: number
}

export default function MyProofSharePage() {
  const params = useParams()
  const userId = params.userId as string
  const supabase = createClient()
  const cardRef = useRef<HTMLDivElement>(null)

  const [userName, setUserName] = useState('')
  const [userPhoto, setUserPhoto] = useState('')
  const [topProofs, setTopProofs] = useState<ProofBar[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [presetIdx, setPresetIdx] = useState(0)
  const [showProfile, setShowProfile] = useState(true)

  const theme = VOICE_CARD_PRESETS[presetIdx]

  useEffect(() => {
    if (!userId) return
    loadData()
  }, [userId])

  async function loadData() {
    setLoading(true)

    // ユーザー情報取得
    const { data: proData } = await (supabase as any)
      .from('professionals')
      .select('id, display_name, photo_url, custom_proofs')
      .eq('user_id', userId)
      .maybeSingle()

    if (proData) {
      setUserName(proData.display_name || '')
      setUserPhoto(proData.photo_url || '')

      // 投票集計取得
      const { data: rawVoteData } = await (supabase as any)
        .from('vote_summary')
        .select('*')
        .eq('professional_id', proData.id)

      const { data: piData } = await (supabase as any)
        .from('proof_items')
        .select('id, label')

      if (rawVoteData && piData) {
        const labeledVotes = resolveProofLabels(rawVoteData, piData, proData.custom_proofs || [])
        const sorted = labeledVotes
          .sort((a: any, b: any) => b.vote_count - a.vote_count)
          .slice(0, 3)
          .map((v: any) => ({ label: v.forte_label || v.proof_id, count: v.vote_count }))
        setTopProofs(sorted)
      }
    } else {
      // クライアントの場合
      const { data: clientData } = await (supabase as any)
        .from('clients')
        .select('nickname')
        .eq('user_id', userId)
        .maybeSingle()
      if (clientData) setUserName(clientData.nickname || '')
    }

    setLoading(false)
  }

  async function handleExport() {
    const el = document.getElementById('myproof-share-card')
    if (!el) return
    setSaving(true)

    try {
      const scale = 1080 / el.offsetWidth
      const canvas = await html2canvas(el, {
        scale,
        backgroundColor: null,
        useCORS: true,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png')
      })

      // Web Share APIが使えればシェア、なければダウンロード
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], 'myproof-card.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${userName}のREALPROOF`,
          })
          setSaving(false)
          return
        }
      }

      // フォールバック: ダウンロード
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'myproof-card.png'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[share] export error:', e)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>読み込み中...</p>
      </div>
    )
  }

  const maxCount = topProofs.length > 0 ? topProofs[0].count : 1

  return (
    <div style={{ background: '#FAF8F4', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* 戻るリンク */}
        <div style={{ marginBottom: 16 }}>
          <a href={`/myproof/${userId}`} style={{ fontSize: 14, color: '#666', textDecoration: 'none' }}>
            ← マイプルーフに戻る
          </a>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A2E', marginBottom: 20, textAlign: 'center' }}>
          シェアカードを作成
        </h1>

        {/* ===== カードプレビュー ===== */}
        <div
          id="myproof-share-card"
          ref={cardRef}
          style={{
            background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
            borderRadius: 20,
            padding: '40px 28px',
            marginBottom: 24,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* 装飾 */}
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 120, height: 120, borderRadius: '50%',
            background: theme.accent, opacity: 0.08,
          }} />
          <div style={{
            position: 'absolute', bottom: -20, left: -20,
            width: 80, height: 80, borderRadius: '50%',
            background: theme.accent, opacity: 0.06,
          }} />

          {/* プロフィール */}
          {showProfile && (
            <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative' }}>
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={userName}
                  crossOrigin="anonymous"
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    objectFit: 'cover', margin: '0 auto 10px', display: 'block',
                    border: `3px solid ${theme.accent}`,
                  }}
                />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: theme.accent, margin: '0 auto 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, color: theme.bg, fontWeight: 700,
                }}>
                  {userName.charAt(0)}
                </div>
              )}
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
                {userName}
              </div>
            </div>
          )}

          {/* プルーフチャート: トップ3 */}
          {topProofs.length > 0 && (
            <div style={{ marginBottom: 28, position: 'relative' }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 2,
                color: theme.sub, textTransform: 'uppercase' as const,
                marginBottom: 14, textAlign: 'center',
              }}>
                TOP STRENGTHS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topProofs.map((proof, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: theme.text,
                      width: 80, textAlign: 'right', flexShrink: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {proof.label}
                    </div>
                    <div style={{
                      flex: 1, height: 24, borderRadius: 12,
                      background: `${theme.accent}22`,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.max((proof.count / maxCount) * 100, 15)}%`,
                        height: '100%', borderRadius: 12,
                        background: theme.accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        paddingRight: 8,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: theme.bg }}>
                          {proof.count}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* キャッチフレーズ */}
          <div style={{
            textAlign: 'center', position: 'relative',
            fontSize: 13, fontWeight: 600, color: theme.sub,
            fontStyle: 'italic',
            marginBottom: 16,
          }}>
            強みが、あなたを定義する。
          </div>

          {/* フッター */}
          <div style={{
            textAlign: 'center', position: 'relative',
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            color: theme.accent, opacity: 0.7,
          }}>
            realproof.jp
          </div>
        </div>

        {/* ===== テーマ選択 ===== */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: 20,
          border: '1px solid #E8E4DC', marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 14 }}>
            カラーテーマ
          </div>
          {(['Light', 'Dark', 'Vibrant'] as const).map((group, gi) => (
            <div key={group} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{group}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VOICE_CARD_PRESETS.slice(gi * 5, gi * 5 + 5).map((preset, i) => {
                  const idx = gi * 5 + i
                  const isSelected = presetIdx === idx
                  return (
                    <button
                      key={idx}
                      onClick={() => setPresetIdx(idx)}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: `linear-gradient(135deg, ${preset.bg} 0%, ${preset.bg2} 100%)`,
                        border: isSelected ? '3px solid #C4A35A' : '2px solid rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                      }}
                      title={preset.name}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* プロフィール ON/OFF */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '14px 20px',
          border: '1px solid #E8E4DC', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
            プロフィール写真を表示
          </span>
          <button
            onClick={() => setShowProfile(!showProfile)}
            style={{
              width: 48, height: 28, borderRadius: 14,
              background: showProfile ? '#C4A35A' : '#D1D5DB',
              border: 'none', cursor: 'pointer',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: '#fff', position: 'absolute', top: 3,
              left: showProfile ? 23 : 3,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
        </div>

        {/* エクスポートボタン */}
        <button
          onClick={handleExport}
          disabled={saving}
          style={{
            width: '100%', padding: '16px 0',
            background: '#1A1A2E', color: '#C4A35A',
            fontSize: 16, fontWeight: 700,
            borderRadius: 12, border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '作成中...' : '📲 画像を保存'}
        </button>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { db } from '@/lib/db'
import { Professional, Vote } from '@/lib/types'

const ADMIN_EMAILS = ['info@functionalneurotraining.com']

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false)
  const [pros, setPros] = useState<(Professional & { total_votes: number })[]>([])
  const [recentVotes, setRecentVotes] = useState<(Vote & { professionals: { name: string } })[]>([])
  const [stats, setStats] = useState({ totalPros: 0, totalClients: 0, totalVotes: 0 })
  const [loading, setLoading] = useState(true)

  // Badge form
  const [selectedPro, setSelectedPro] = useState('')
  const [badgeLabel, setBadgeLabel] = useState('')
  const [badgeUrl, setBadgeUrl] = useState('')

  // Weekly Report Content
  const [wrWeekStart, setWrWeekStart] = useState('')
  const [wrHighlight, setWrHighlight] = useState('')
  const [wrTips, setWrTips] = useState('')
  const [wrSaving, setWrSaving] = useState(false)
  const [wrToast, setWrToast] = useState('')

  // Broadcast
  const [bcTarget, setBcTarget] = useState<'all' | 'line' | 'email' | 'professional'>('all')
  const [bcProId, setBcProId] = useState('')
  const [bcChannel, setBcChannel] = useState<'auto' | 'line' | 'email'>('auto')
  const [bcTemplate, setBcTemplate] = useState<'custom' | 'founding' | 'achievement'>('custom')
  const [bcSubject, setBcSubject] = useState('')
  const [bcBody, setBcBody] = useState('')
  const [bcSending, setBcSending] = useState(false)
  const [bcToast, setBcToast] = useState('')
  const [bcPreviewResult, setBcPreviewResult] = useState<any>(null)

  const { user: clerkUser, isLoaded: authLoaded } = useUser()

  useEffect(() => {
    if (!authLoaded) return
    const email = clerkUser?.primaryEmailAddress?.emailAddress || ''
    if (!clerkUser || !ADMIN_EMAILS.includes(email)) {
      setLoading(false)
      return
    }

    async function load() {
      setAuthorized(true)

      // 全クエリを並列実行（N+1ループ廃止）
      const [proResult, voteSummaryResult, voteResult, pc, cc, vc] = await Promise.all([
        // プロ一覧
        db.select('professionals', { select: '*', order: { column: 'created_at' } }),
        // プロごとの投票数をvote_summaryで一括取得（N+1解消）
        db.select('vote_summary', { select: 'professional_id, vote_count' }),
        // 最新投票
        db.select('votes', {
          select: '*, professionals(name)',
          order: { column: 'created_at', options: { ascending: false } },
          limit: 30
        }),
        // 統計: 3つのcount
        db.select('professionals', { select: '*', options: { count: 'exact', head: true } }),
        db.select('clients', { select: '*', options: { count: 'exact', head: true } }),
        db.select('votes', { select: '*', options: { count: 'exact', head: true } }),
      ])

      if (proResult.data) {
        // vote_summaryからプロごとの合計投票数を集計
        const voteCountMap = new Map<string, number>()
        if (voteSummaryResult.data) {
          for (const vs of voteSummaryResult.data) {
            const current = voteCountMap.get(vs.professional_id) || 0
            voteCountMap.set(vs.professional_id, current + (vs.vote_count || 0))
          }
        }
        const prosWithVotes = proResult.data.map((p: any) => ({
          ...p,
          total_votes: voteCountMap.get(p.id) || 0,
        }))
        prosWithVotes.sort((a: any, b: any) => b.total_votes - a.total_votes)
        setPros(prosWithVotes)
      }

      if (voteResult.data) setRecentVotes(voteResult.data as any)
      setStats({ totalPros: pc.count || 0, totalClients: cc.count || 0, totalVotes: vc.count || 0 })

      setLoading(false)
    }
    load()
    loadWeeklyReportContent()
  }, [authLoaded, clerkUser])

  // 今週の月曜日を計算
  function getCurrentMonday(): string {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff)
    return monday.toISOString().split('T')[0]
  }

  // Weekly Report Content をロード
  async function loadWeeklyReportContent() {
    try {
      const res = await fetch('/api/admin/weekly-report-content')
      if (res.ok) {
        const result = await res.json()
        if (result.data) {
          setWrWeekStart(result.data.week_start || getCurrentMonday())
          setWrHighlight(result.data.highlight_text || '')
          setWrTips(result.data.tips_text || '')
          return
        }
      }
    } catch (e) {
      console.error('Weekly report content load failed:', e)
    }
    // データなしの場合、今週の月曜をデフォルト
    setWrWeekStart(getCurrentMonday())
  }

  // Weekly Report Content を保存
  async function saveWeeklyReportContent() {
    setWrSaving(true)
    setWrToast('')
    try {
      const res = await fetch('/api/admin/weekly-report-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: wrWeekStart,
          highlight_text: wrHighlight,
          tips_text: wrTips,
        }),
      })
      if (res.ok) {
        const result = await res.json()
        setWrToast(result.action === 'updated' ? '更新しました' : '保存しました')
        setTimeout(() => setWrToast(''), 3000)
      } else {
        const err = await res.json()
        setWrToast(`エラー: ${err.error}`)
      }
    } catch (e) {
      setWrToast('保存に失敗しました')
    } finally {
      setWrSaving(false)
    }
  }

  async function addBadge() {
    if (!selectedPro || !badgeLabel) return
    const pro = pros.find(p => p.id === selectedPro)
    if (!pro) return
    const badges = [...(pro.badges || []), { id: crypto.randomUUID(), label: badgeLabel, image_url: badgeUrl }]
    await db.update('professionals', { badges }, { id: selectedPro })
    alert('バッジを追加しました')
    window.location.reload()
  }

  async function toggleFounding(proId: string, current: boolean) {
    await db.update('professionals', { is_founding_member: !current }, { id: proId })
    window.location.reload()
  }

  function exportCSV() {
    const rows = [['名前', '肩書き', 'エリア', '総プルーフ', 'Founding', '登録日']]
    pros.forEach(p => {
      rows.push([p.name, p.title, p.location || '', String(p.total_votes), p.is_founding_member ? 'Y' : 'N', p.created_at.slice(0, 10)])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'proof_pros.csv'; a.click()
  }

  // Broadcast テンプレート定義
  const BROADCAST_TEMPLATES: Record<string, { subject: string; body: string }> = {
    founding: {
      subject: '【REALPROOF】ファウンディングメンバー特典のご案内',
      body: `{{name}}さん

REALPROOFをご利用いただきありがとうございます。

現在、初期にご登録いただいたプロフェッショナルの方限定で
「ファウンディングメンバー」特典をご用意しています。

詳しくはダッシュボードをご確認ください。`,
    },
    achievement: {
      subject: '【REALPROOF】プルーフ達成のお知らせ',
      body: `{{name}}さん

おめでとうございます！
あなたの累計プルーフが{{votes}}件に到達しました。

引き続き、あなたの強みを証明していきましょう。`,
    },
  }

  function onTemplateChange(tpl: 'custom' | 'founding' | 'achievement') {
    setBcTemplate(tpl)
    if (tpl !== 'custom' && BROADCAST_TEMPLATES[tpl]) {
      setBcSubject(BROADCAST_TEMPLATES[tpl].subject)
      setBcBody(BROADCAST_TEMPLATES[tpl].body)
    }
  }

  async function broadcastPreview() {
    setBcSending(true)
    setBcToast('')
    setBcPreviewResult(null)
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: bcTarget,
          professionalId: bcTarget === 'professional' ? bcProId : undefined,
          channel: bcChannel,
          subject: bcSubject,
          body: bcBody,
          preview: true,
        }),
      })
      const result = await res.json()
      if (res.ok) {
        setBcPreviewResult(result)
      } else {
        setBcToast(`エラー: ${result.error}`)
      }
    } catch (e) {
      setBcToast('プレビューに失敗しました')
    } finally {
      setBcSending(false)
    }
  }

  async function broadcastSend() {
    if (!confirm(`本当に送信しますか？\n\n対象: ${bcTarget === 'all' ? '全プロ' : bcTarget === 'line' ? 'LINE連携済み' : bcTarget === 'email' ? 'メールのみ' : '個別指定'}\nチャネル: ${bcChannel === 'auto' ? '自動（LINE優先）' : bcChannel}\n\nこの操作は取り消せません。`)) {
      return
    }
    setBcSending(true)
    setBcToast('')
    setBcPreviewResult(null)
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: bcTarget,
          professionalId: bcTarget === 'professional' ? bcProId : undefined,
          channel: bcChannel,
          subject: bcSubject,
          body: bcBody,
          preview: false,
        }),
      })
      const result = await res.json()
      if (res.ok) {
        const msg = `送信完了: LINE ${result.sent?.line || 0}件, メール ${result.sent?.email || 0}件, 失敗 ${result.failed || 0}件, スキップ ${result.skipped || 0}件`
        setBcToast(msg)
        setTimeout(() => setBcToast(''), 8000)
      } else {
        setBcToast(`エラー: ${result.error}`)
      }
    } catch (e) {
      setBcToast('送信に失敗しました')
    } finally {
      setBcSending(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  if (!authorized) return <div className="text-center py-16 text-gray-400">アクセス権限がありません</div>

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">管理画面</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#1A1A2E]">{stats.totalPros}</div>
          <div className="text-sm text-gray-500">登録プロ</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#1A1A2E]">{stats.totalClients}</div>
          <div className="text-sm text-gray-500">登録クライアント</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#C4A35A]">{stats.totalVotes}</div>
          <div className="text-sm text-gray-500">総投票数</div>
        </div>
      </div>

      {/* Badge Assignment */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">バッジ付与</h2>
        <div className="grid grid-cols-2 gap-4">
          <select value={selectedPro} onChange={e => setSelectedPro(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg">
            <option value="">プロを選択</option>
            {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={badgeLabel} onChange={e => setBadgeLabel(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg" placeholder="バッジ名（例：FNT認定）" />
          <input value={badgeUrl} onChange={e => setBadgeUrl(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg" placeholder="バッジ画像URL（Storageから）" />
          <button onClick={addBadge} className="px-4 py-2 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e]">付与</button>
        </div>
      </div>

      {/* Pro List */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[#1A1A2E]">プロ一覧（{pros.length}名）</h2>
          <button onClick={exportCSV} className="text-sm text-[#C4A35A] hover:underline">CSV出力</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2">名前</th><th className="py-2 px-2">肩書き</th>
                <th className="py-2 px-2">エリア</th><th className="py-2 px-2 text-right">プルーフ</th>
                <th className="py-2 px-2">FM</th><th className="py-2 px-2">バッジ</th>
              </tr>
            </thead>
            <tbody>
              {pros.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">
                    <a href={`/card/${p.id}`} className="text-[#1A1A2E] hover:text-[#C4A35A]">{p.name}</a>
                  </td>
                  <td className="py-2 px-2 text-gray-500">{p.title}</td>
                  <td className="py-2 px-2 text-gray-500">{p.location || '-'}</td>
                  <td className="py-2 px-2 text-right font-bold text-[#C4A35A]">{p.total_votes}</td>
                  <td className="py-2 px-2">
                    <button onClick={() => toggleFounding(p.id, p.is_founding_member)}
                      className={`text-xs px-2 py-1 rounded ${p.is_founding_member ? 'bg-[#C4A35A] text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {p.is_founding_member ? 'FM' : '-'}
                    </button>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">
                    {p.badges?.map(b => b.label).join(', ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Votes */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">最近の投票</h2>
        <div className="space-y-2">
          {recentVotes.map(v => (
            <div key={v.id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50">
              <span className="text-gray-400 text-xs w-20">{new Date(v.created_at).toLocaleDateString('ja-JP')}</span>
              <span className="font-medium text-[#1A1A2E]">{v.professionals.name}</span>
              <span className="px-2 py-0.5 bg-[#1A1A2E]/10 text-[#1A1A2E] rounded-full text-xs">
                {v.result_category}
              </span>
              {v.personality_categories && v.personality_categories.length > 0 && (<span className="px-2 py-0.5 bg-[#C4A35A]/10 text-[#C4A35A] rounded-full text-xs">人柄×{v.personality_categories.length}</span>)}
              {v.comment && <span className="text-gray-400 text-xs truncate max-w-[200px]">{v.comment}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Report Content */}
      <div className="bg-white rounded-xl p-6 shadow-sm mt-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">Weekly Report コンテンツ</h2>
        <p className="text-sm text-gray-500 mb-4">
          毎週月曜に配信されるWeekly Proof Reportの「HIGHLIGHT」と「TIPS」を入力してください。
        </p>

        <div className="space-y-4">
          {/* week_start */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象週（月曜日）</label>
            <input
              type="date"
              value={wrWeekStart}
              onChange={e => setWrWeekStart(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
            />
          </div>

          {/* highlight_text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              HIGHLIGHT（成功事例・トピック）
            </label>
            <textarea
              rows={5}
              value={wrHighlight}
              onChange={e => setWrHighlight(e.target.value)}
              placeholder="あるプロが1週間で7件のプルーフを獲得。秘訣は「施術後にカードを見せるだけ」というシンプルな習慣でした。"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-vertical"
            />
          </div>

          {/* tips_text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              TIPS（アドバイス）
            </label>
            <textarea
              rows={3}
              value={wrTips}
              onChange={e => setWrTips(e.target.value)}
              placeholder="施術後、お客様が「ありがとう」と言った瞬間がベストタイミング。「感想を記録してもらえませんか？」の一言で、あなたのプルーフが1つ増えます。"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-vertical"
            />
          </div>

          {/* Save button + Toast */}
          <div className="flex items-center gap-4">
            <button
              onClick={saveWeeklyReportContent}
              disabled={wrSaving}
              className="px-6 py-2 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e] disabled:opacity-50 text-sm font-medium"
            >
              {wrSaving ? '保存中...' : '保存'}
            </button>
            {wrToast && (
              <span className={`text-sm font-medium ${wrToast.startsWith('エラー') ? 'text-red-500' : 'text-green-600'}`}>
                {wrToast}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Broadcast — 一斉送信 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mt-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">一斉送信</h2>
        <p className="text-sm text-gray-500 mb-4">
          プロフェッショナルにメール/LINEで一斉メッセージを送信します。
          <code className="text-xs bg-gray-100 px-1 rounded">{'{{name}}'}</code> と
          <code className="text-xs bg-gray-100 px-1 rounded">{'{{votes}}'}</code> が使えます。
        </p>

        <div className="space-y-4">
          {/* 対象選択 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">対象</label>
              <select
                value={bcTarget}
                onChange={e => setBcTarget(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">全プロ</option>
                <option value="line">LINE連携済みのみ</option>
                <option value="email">メールのみ</option>
                <option value="professional">個別指定</option>
              </select>
            </div>

            {/* チャネル */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">送信チャネル</label>
              <select
                value={bcChannel}
                onChange={e => setBcChannel(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="auto">自動（LINE優先）</option>
                <option value="line">LINEのみ</option>
                <option value="email">メールのみ</option>
              </select>
            </div>
          </div>

          {/* 個別指定の場合のプロ選択 */}
          {bcTarget === 'professional' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">プロを選択</label>
              <select
                value={bcProId}
                onChange={e => setBcProId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">選択してください</option>
                {pros.map(p => (
                  <option key={p.id} value={p.id}>{p.name}（{p.total_votes}票）</option>
                ))}
              </select>
            </div>
          )}

          {/* テンプレート */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">テンプレート</label>
            <select
              value={bcTemplate}
              onChange={e => onTemplateChange(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="custom">カスタム（自由入力）</option>
              <option value="founding">Founding Member告知</option>
              <option value="achievement">達成おめでとう</option>
            </select>
          </div>

          {/* 件名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">件名（メール用）</label>
            <input
              type="text"
              value={bcSubject}
              onChange={e => setBcSubject(e.target.value)}
              placeholder="【REALPROOF】お知らせ"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {/* 本文 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
            <textarea
              rows={8}
              value={bcBody}
              onChange={e => setBcBody(e.target.value)}
              placeholder={`{{name}}さん\n\nメッセージ本文をここに入力...\n\n{{votes}}件のプルーフありがとうございます。`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-vertical font-mono"
            />
          </div>

          {/* プレビュー結果 */}
          {bcPreviewResult && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <div className="font-medium text-blue-800 mb-2">プレビュー結果</div>
              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                <div>
                  <div className="text-2xl font-bold text-blue-900">{bcPreviewResult.total}</div>
                  <div className="text-xs text-blue-600">対象者</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{bcPreviewResult.wouldSendLine}</div>
                  <div className="text-xs text-blue-600">LINE送信</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{bcPreviewResult.wouldSendEmail}</div>
                  <div className="text-xs text-blue-600">メール送信</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-400">{bcPreviewResult.wouldSkip}</div>
                  <div className="text-xs text-blue-600">スキップ</div>
                </div>
              </div>
              {bcPreviewResult.sampleRecipients?.length > 0 && (
                <div>
                  <div className="text-xs text-blue-600 mb-1">サンプル受信者:</div>
                  <div className="flex flex-wrap gap-1">
                    {bcPreviewResult.sampleRecipients.map((r: any, i: number) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${r.channel === 'line' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {r.name}（{r.channel === 'line' ? 'LINE' : 'メール'}）
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ボタン + Toast */}
          <div className="flex items-center gap-4">
            <button
              onClick={broadcastPreview}
              disabled={bcSending || !bcBody}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {bcSending ? '処理中...' : 'プレビュー'}
            </button>
            <button
              onClick={broadcastSend}
              disabled={bcSending || !bcBody}
              className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
            >
              {bcSending ? '送信中...' : '送信実行'}
            </button>
            {bcToast && (
              <span className={`text-sm font-medium ${bcToast.startsWith('エラー') || bcToast.includes('失敗') ? 'text-red-500' : 'text-green-600'}`}>
                {bcToast}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

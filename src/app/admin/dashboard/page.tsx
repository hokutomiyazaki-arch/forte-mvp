'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@/lib/supabase-client'

// ============================================================
// カラー定数
// ============================================================
const C = {
  bg: '#0A0A0A',
  surface: '#1A1A2E',
  surfaceLight: '#222240',
  gold: '#C9A84C',
  goldDark: '#8A6E1F',
  goldBg: '#C9A84C15',
  cream: '#FAFAF7',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  gray: '#6B7280',
  grayDark: '#374151',
}

// ============================================================
// 型定義
// ============================================================

interface GoNogoData {
  total_pros: number
  complete_profiles: number
  pros_who_showed_qr: number
  total_votes: number
  avg_votes_per_active_pro: number
  verdict: string
}

interface ProData {
  id: string | number
  n: string
  ps: string
  rw: number
  qr: number
  v: number
  s1: number
  s2: number
  s3: number
  spv: number
  pv: number
  eng: string
  lv: string | null
}

interface ChannelData {
  ch: string
  tokens: number
  votes: number
  pct: number
}

interface AuthMethodData {
  auth_method: string
  count: number
}

interface DailyTrendData {
  date: string
  votes: number
  active_pros: number
}

interface DailyProofData {
  date: string
  dateRaw: string
  pro_name: string
  daily_votes: number
}

// ============================================================
// サンプルデータ（フォールバック用）
// ============================================================

const SAMPLE_GO: GoNogoData = {
  total_pros: 14,
  complete_profiles: 4,
  pros_who_showed_qr: 4,
  total_votes: 18,
  avg_votes_per_active_pro: 4.5,
  verdict: 'MONITORING',
}

const SAMPLE_PROS: ProData[] = [
  { id: 1, n: 'トッププロ', ps: 'complete', rw: 3, qr: 15, v: 10, s1: 2, s2: 1, s3: 0, spv: 8, pv: 22, eng: 'active', lv: '2026-03-11' },
  { id: 2, n: '土井さん', ps: 'complete', rw: 2, qr: 8, v: 5, s1: 0, s2: 0, s3: 0, spv: 0, pv: 10, eng: 'active', lv: '2026-03-08' },
  { id: 3, n: '水田さん', ps: 'complete', rw: 2, qr: 4, v: 3, s1: 0, s2: 1, s3: 0, spv: 2, pv: 5, eng: 'active', lv: '2026-03-13' },
  { id: 4, n: '前田さん', ps: 'empty', rw: 0, qr: 0, v: 0, s1: 0, s2: 0, s3: 0, spv: 0, pv: 0, eng: 'never', lv: null },
  { id: 5, n: '宗田さん', ps: 'partial', rw: 0, qr: 0, v: 0, s1: 0, s2: 0, s3: 0, spv: 0, pv: 1, eng: 'cooling', lv: null },
  { id: 6, n: 'NFC報告者', ps: 'complete', rw: 1, qr: 3, v: 0, s1: 0, s2: 0, s3: 0, spv: 0, pv: 3, eng: 'cooling', lv: null },
]

// ============================================================
// 認証方式ラベル
// ============================================================
const AUTH_METHOD_LABELS: Record<string, string> = {
  email: 'メール認証',
  sms: 'SMS認証',
  line: 'LINE認証',
  google: 'Google認証',
}

// ============================================================
// サブコンポーネント
// ============================================================

function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: C.gold,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.1em',
      marginBottom: 14,
      textTransform: 'uppercase' as const,
      marginTop: 36,
    }}>
      {children}
    </div>
  )
}

function MC({ label, value, sub, status = 'neutral' }: {
  label: string
  value: number | string
  sub?: string
  status?: 'good' | 'bad' | 'warn' | 'neutral'
}) {
  const sc = status === 'good' ? C.green : status === 'bad' ? C.red : status === 'warn' ? C.amber : C.gray
  return (
    <div style={{ background: C.surface, borderRadius: 10, padding: '18px 20px', borderLeft: `3px solid ${sc}` }}>
      <div style={{ color: C.gray, fontSize: 11, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ color: C.cream, fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: sc, fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function VB({ verdict }: { verdict: string }) {
  const m: Record<string, { c: string; t: string }> = {
    GO: { c: C.green, t: 'GO → Phase 2へ' },
    PIVOT: { c: C.amber, t: 'PIVOT' },
    KILL: { c: C.red, t: 'KILL' },
    MONITORING: { c: C.gold, t: 'MONITORING — データ収集中' },
  }
  const v = m[verdict] || m.MONITORING
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      background: v.c + '18', border: `1px solid ${v.c}`, color: v.c,
      padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.c, display: 'inline-block' }} />
      {v.t}
    </div>
  )
}

function Placeholder({ message }: { message: string }) {
  return (
    <div style={{
      background: C.surface, borderRadius: 10, padding: 32,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: C.gray, fontSize: 13, textAlign: 'center' }}>{message}</div>
    </div>
  )
}

function Bdg({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      background: color + '20', color,
      padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
    }}>
      {text}
    </span>
  )
}

function ProTbl({ pros }: { pros: ProData[] }) {
  const sm: Record<string, { c: string; t: string }> = {
    complete: { c: C.green, t: '完了' },
    partial: { c: C.amber, t: '途中' },
    empty: { c: C.red, t: '未設定' },
  }
  const em: Record<string, { c: string; t: string }> = {
    active: { c: C.green, t: '活発' },
    cooling: { c: C.amber, t: '停滞' },
    at_risk: { c: C.red, t: '離脱危険' },
    never: { c: C.gray, t: '未訪問' },
  }
  const hds = ['名前', '設定', 'リワード', 'QR', '投票', 'Self', 'Card', 'Voice', '→PV', '閲覧', '状態', '最終投票']
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.grayDark}` }}>
            {hds.map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '10px 8px', color: C.gray,
                fontWeight: 500, fontSize: 10, letterSpacing: '0.04em', whiteSpace: 'nowrap',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pros.map(p => {
            const s = sm[p.ps] || sm.empty
            const e = em[p.eng] || em.never
            return (
              <tr key={p.id} style={{ borderBottom: `1px solid ${C.grayDark}15` }}>
                <td style={{ padding: '10px 8px', color: C.cream, fontWeight: 500 }}>{p.n}</td>
                <td style={{ padding: '10px 8px' }}><Bdg text={s.t} color={s.c} /></td>
                <td style={{ padding: '10px 8px', color: C.cream }}>{p.rw}/3</td>
                <td style={{ padding: '10px 8px', color: C.cream }}>{p.qr}</td>
                <td style={{ padding: '10px 8px', color: p.v >= 5 ? C.gold : C.cream, fontWeight: p.v >= 5 ? 700 : 400 }}>{p.v}</td>
                <td style={{ padding: '10px 8px', color: p.s1 > 0 ? C.green : C.grayDark }}>{p.s1}</td>
                <td style={{ padding: '10px 8px', color: p.s2 > 0 ? C.green : C.grayDark }}>{p.s2}</td>
                <td style={{ padding: '10px 8px', color: p.s3 > 0 ? C.green : C.grayDark }}>{p.s3}</td>
                <td style={{ padding: '10px 8px', color: p.spv > 0 ? C.gold : C.grayDark }}>{p.spv}</td>
                <td style={{ padding: '10px 8px', color: C.cream }}>{p.pv}</td>
                <td style={{ padding: '10px 8px' }}><Bdg text={e.t} color={e.c} /></td>
                <td style={{ padding: '10px 8px', color: C.gray, fontSize: 11 }}>
                  {p.lv ? new Date(p.lv).toLocaleDateString('ja-JP') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BN({ layer, title, metric, action, color }: {
  layer: string; title: string; metric: string; action: string; color: string
}) {
  return (
    <div style={{
      background: C.surface, borderRadius: '0 0 10px 10px',
      padding: 18, borderTop: `3px solid ${color}`, flex: 1,
    }}>
      <div style={{ color, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 3 }}>{layer}</div>
      <div style={{ color: C.cream, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ color: C.gray, fontSize: 12, marginBottom: 12 }}>{metric}</div>
      <div style={{
        color: C.gold, fontSize: 12, fontWeight: 500,
        padding: '5px 12px', background: C.goldBg, borderRadius: 5, display: 'inline-block',
      }}>
        → {action}
      </div>
    </div>
  )
}

function MiniBar({ data, dk, color, h = 80 }: {
  data: Record<string, any>[]; dk: string; color: string; h?: number
}) {
  const max = Math.max(...data.map(d => d[dk]), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h }}>
      {data.map((d, i) => {
        const bh = (d[dk] / max) * h * 0.8
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 8, color: d[dk] > 0 ? C.cream : 'transparent' }}>{d[dk]}</div>
            <div style={{
              width: '100%', maxWidth: 20,
              height: Math.max(bh, 2),
              background: d[dk] > 0 ? color : C.grayDark + '33',
              borderRadius: 3,
            }} />
            <div style={{ fontSize: 7, color: C.gray }}>{d.date}</div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// データ取得 & マッピング
// ============================================================

async function fetchDashboardData() {
  const supabase = createClientComponentClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const [goRes, proRes, authRes, trendRes, proofRes, qrTokensRes, votesForChRes] = await Promise.all([
    supabase.from('admin_go_nogo').select('*').maybeSingle(),
    supabase.from('admin_pro_status').select('*'),
    // 認証方式別
    supabase.from('votes').select('auth_method'),
    // 日別トレンド (30日)
    supabase.from('votes').select('created_at, professional_id').gte('created_at', thirtyDaysAgo.toISOString()),
    // 日別プルーフ獲得者 (14日)
    supabase.from('votes').select('created_at, professional_id, professionals(name, last_name, first_name)').gte('created_at', fourteenDaysAgo.toISOString()),
    // チャネル別: qr_tokens
    supabase.from('qr_tokens').select('token'),
    // チャネル別: votes の qr_token
    supabase.from('votes').select('id, qr_token'),
  ])

  // Go/No-Go マッピング
  let goNogo: GoNogoData | null = null
  if (goRes.data && !goRes.error) {
    const d = goRes.data
    goNogo = {
      total_pros: Number(d.total_pros) || 0,
      complete_profiles: Number(d.complete_profiles) || 0,
      pros_who_showed_qr: Number(d.pros_who_showed_qr) || 0,
      total_votes: Number(d.total_votes) || 0,
      avg_votes_per_active_pro: Number(d.avg_votes_per_active_pro) || 0,
      verdict: d.verdict || 'MONITORING',
    }
  }

  // プロ一覧マッピング
  let pros: ProData[] | null = null
  if (proRes.data && !proRes.error && Array.isArray(proRes.data) && proRes.data.length > 0) {
    pros = proRes.data.map((d: any) => ({
      id: d.id,
      n: d.display_name || '—',
      ps: d.profile_status || 'empty',
      rw: Number(d.reward_count) || 0,
      qr: Number(d.qr_scans) || 0,
      v: Number(d.total_votes) || 0,
      s1: Number(d.self_shares) || 0,
      s2: Number(d.card_shares) || 0,
      s3: Number(d.voice_shares) || 0,
      spv: Number(d.share_driven_views) || 0,
      pv: Number(d.profile_views) || 0,
      eng: d.engagement_status || 'never',
      lv: d.last_vote_at || null,
    }))
  }

  // 認証方式別マッピング
  let authMethods: AuthMethodData[] | null = null
  if (authRes.data && !authRes.error && Array.isArray(authRes.data)) {
    const counts: Record<string, number> = {}
    authRes.data.forEach((row: any) => {
      const method = row.auth_method || 'unknown'
      counts[method] = (counts[method] || 0) + 1
    })
    authMethods = Object.entries(counts)
      .map(([auth_method, count]) => ({ auth_method, count }))
      .sort((a, b) => b.count - a.count)
  }

  // 日別トレンドマッピング (30日)
  let dailyTrend: DailyTrendData[] | null = null
  if (trendRes.data && !trendRes.error && Array.isArray(trendRes.data)) {
    const byDate: Record<string, { votes: number; pros: Set<string> }> = {}
    trendRes.data.forEach((row: any) => {
      const date = row.created_at ? row.created_at.split('T')[0] : null
      if (!date) return
      if (!byDate[date]) byDate[date] = { votes: 0, pros: new Set() }
      byDate[date].votes++
      byDate[date].pros.add(row.professional_id)
    })
    dailyTrend = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => {
        const dt = new Date(date)
        return {
          date: `${dt.getMonth() + 1}/${dt.getDate()}`,
          votes: data.votes,
          active_pros: data.pros.size,
        }
      })
  }

  // 日別プルーフ獲得者マッピング (14日)
  let dailyProofs: DailyProofData[] | null = null
  if (proofRes.data && !proofRes.error && Array.isArray(proofRes.data)) {
    const byDatePro: Record<string, { pro_name: string; count: number; dateRaw: string }> = {}
    proofRes.data.forEach((row: any) => {
      const date = row.created_at ? row.created_at.split('T')[0] : null
      if (!date) return
      const pro = row.professionals as any
      const proName = pro
        ? ((pro.last_name && pro.first_name) ? `${pro.last_name} ${pro.first_name}` : pro.name || '—')
        : '—'
      const key = `${date}_${row.professional_id}`
      if (!byDatePro[key]) byDatePro[key] = { pro_name: proName, count: 0, dateRaw: date }
      byDatePro[key].count++
    })
    dailyProofs = Object.entries(byDatePro)
      .map(([, data]) => {
        const dt = new Date(data.dateRaw)
        return {
          date: `${dt.getMonth() + 1}/${dt.getDate()}`,
          dateRaw: data.dateRaw,
          pro_name: data.pro_name,
          daily_votes: data.count,
        }
      })
      .sort((a, b) => b.dateRaw.localeCompare(a.dateRaw) || b.daily_votes - a.daily_votes)
  }

  // チャネル別マッピング (QR vs NFC)
  let channels: ChannelData[] | null = null
  if (qrTokensRes.data && !qrTokensRes.error && Array.isArray(qrTokensRes.data)) {
    // トークンをチャネル別に分類（ハイフン含む→QR、含まない→NFC）
    const tokensByChannel: Record<string, Set<string>> = { QR: new Set(), NFC: new Set() }
    qrTokensRes.data.forEach((row: any) => {
      const token = row.token || ''
      const ch = token.includes('-') ? 'QR' : 'NFC'
      tokensByChannel[ch].add(token)
    })

    // 投票をチャネル別にカウント
    const votesByChannel: Record<string, Set<string>> = { QR: new Set(), NFC: new Set() }
    if (votesForChRes.data && !votesForChRes.error && Array.isArray(votesForChRes.data)) {
      votesForChRes.data.forEach((row: any) => {
        if (!row.qr_token) return
        const ch = row.qr_token.includes('-') ? 'QR' : 'NFC'
        votesByChannel[ch].add(row.id)
      })
    }

    channels = ['QR', 'NFC'].map(ch => {
      const tokens = tokensByChannel[ch].size
      const votes = votesByChannel[ch].size
      const pct = tokens > 0 ? Math.round((votes / tokens) * 1000) / 10 : 0
      return { ch, tokens, votes, pct }
    })
  }

  return { goNogo, pros, authMethods, dailyTrend, dailyProofs, channels }
}

// ============================================================
// メインダッシュボード
// ============================================================

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<'live' | 'sample'>('sample')
  const [goNogo, setGoNogo] = useState<GoNogoData>(SAMPLE_GO)
  const [pros, setPros] = useState<ProData[]>(SAMPLE_PROS)
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [authMethods, setAuthMethods] = useState<AuthMethodData[]>([])
  const [dailyTrend, setDailyTrend] = useState<DailyTrendData[]>([])
  const [dailyProofs, setDailyProofs] = useState<DailyProofData[]>([])

  const loadData = useCallback(async () => {
    try {
      const result = await fetchDashboardData()
      let hasLiveData = false

      if (result.goNogo) { setGoNogo(result.goNogo); hasLiveData = true }
      if (result.pros) { setPros(result.pros); hasLiveData = true }
      if (result.channels) { setChannels(result.channels) }
      if (result.authMethods) { setAuthMethods(result.authMethods) }
      if (result.dailyTrend) { setDailyTrend(result.dailyTrend) }
      if (result.dailyProofs) { setDailyProofs(result.dailyProofs) }

      setDataSource(hasLiveData ? 'live' : 'sample')
    } catch (e) {
      console.error('Dashboard data fetch failed, using sample data:', e)
      setDataSource('sample')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const g = goNogo
  const pr = g.total_pros > 0 ? Math.round((g.complete_profiles / g.total_pros) * 100) : 0
  const qr = g.total_pros > 0 ? Math.round((g.pros_who_showed_qr / g.total_pros) * 100) : 0
  const totalAuthVotes = authMethods.reduce((sum, a) => sum + a.count, 0)

  // Group daily proofs by date for rendering
  const proofsByDate: Record<string, DailyProofData[]> = {}
  dailyProofs.forEach(dp => {
    if (!proofsByDate[dp.dateRaw]) proofsByDate[dp.dateRaw] = []
    proofsByDate[dp.dateRaw].push(dp)
  })
  const proofDates = Object.keys(proofsByDate).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      padding: '24px 28px',
      fontFamily: "'Inter','Noto Sans JP',sans-serif",
      color: C.cream,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ color: C.gold, fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 3 }}>
            REALPROOF
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>MVP Dashboard</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* データソース表示 */}
          <div style={{
            fontSize: 10, color: dataSource === 'live' ? C.green : C.amber,
            background: (dataSource === 'live' ? C.green : C.amber) + '18',
            padding: '4px 10px', borderRadius: 5, fontWeight: 500,
          }}>
            {loading ? '読み込み中...' : dataSource === 'live' ? '● LIVE DATA' : '● SAMPLE DATA'}
          </div>
          <a
            href="/downloads/REALPROOF_クライアント説明チラシ.pdf"
            download
            style={{
              background: C.surface, border: `1px solid ${C.grayDark}`,
              color: C.cream, padding: '8px 16px', borderRadius: 7,
              fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>↓</span> クライアント説明チラシ
          </a>
          <VB verdict={g.verdict} />
        </div>
      </div>

      {/* [A] Go/No-Go */}
      <Sec>Go / No-Go 判定</Sec>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>
        <MC label="プロ登録数" value={g.total_pros} sub="Go基準: 30名以上"
          status={g.total_pros >= 30 ? 'good' : g.total_pros >= 20 ? 'warn' : 'bad'} />
        <MC label="プロフィール完了" value={g.complete_profiles} sub={`${pr}% — Layer 1`}
          status={pr >= 80 ? 'good' : pr >= 50 ? 'warn' : 'bad'} />
        <MC label="QR提示プロ数" value={g.pros_who_showed_qr} sub={`${qr}% — Layer 2`}
          status={qr >= 60 ? 'good' : qr >= 30 ? 'warn' : 'bad'} />
        <MC label="平均投票/アクティブ" value={g.avg_votes_per_active_pro} sub="Go基準: 5票以上"
          status={g.avg_votes_per_active_pro >= 5 ? 'good' : g.avg_votes_per_active_pro >= 3 ? 'warn' : 'bad'} />
        <MC label="総投票数" value={g.total_votes} sub="累計" />
      </div>

      {/* [B] Channel */}
      <Sec>チャネル別（QR vs NFC）</Sec>
      {channels.length === 0 ? (
        <Placeholder message="データなし" />
      ) : (
        <div style={{ background: C.surface, borderRadius: 10, padding: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.grayDark}` }}>
                {['チャネル', 'トークン発行数', '投票完了', '転換率'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: C.gray, fontWeight: 500, fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map(r => (
                <tr key={r.ch} style={{ borderBottom: `1px solid ${C.grayDark}22` }}>
                  <td style={{ padding: '10px 14px', color: C.cream, fontWeight: 500 }}>{r.ch}</td>
                  <td style={{ padding: '10px 14px', color: C.cream }}>{r.tokens}</td>
                  <td style={{ padding: '10px 14px', color: C.cream }}>{r.votes}</td>
                  <td style={{
                    padding: '10px 14px',
                    color: r.pct >= 50 ? C.green : r.pct > 0 ? C.amber : C.gray,
                    fontWeight: 600,
                  }}>
                    {r.pct > 0 ? `${r.pct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* [C] Funnel + Auth Method */}
      <Sec>投票ファネル — Layer 3 離脱分析</Sec>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Left: Funnel placeholder */}
        <Placeholder message="トラッキング実装後に表示" />
        {/* Right: Auth method real data */}
        <div style={{ background: C.surface, borderRadius: 10, padding: 20 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 10 }}>認証方式別 完了率</div>
          {authMethods.length === 0 ? (
            <div style={{ color: C.gray, fontSize: 13, textAlign: 'center', padding: 20 }}>データなし</div>
          ) : (
            authMethods.map(x => {
              const pct = totalAuthVotes > 0 ? Math.round((x.count / totalAuthVotes) * 100) : 0
              const label = AUTH_METHOD_LABELS[x.auth_method] || x.auth_method
              return (
                <div key={x.auth_method} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: `1px solid ${C.grayDark}15`,
                }}>
                  <span style={{ color: C.cream, fontSize: 13 }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: C.gray, fontSize: 11 }}>{pct}%</span>
                    <span style={{ color: C.cream, fontWeight: 600, fontSize: 14 }}>{x.count}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* [D] Share — placeholder */}
      <Sec>シェア分析（S1 / S2 / S3）</Sec>
      <Placeholder message="トラッキング実装後に表示" />

      {/* [D2] Daily Proof Gainers */}
      <Sec>日別プルーフ獲得者（直近14日）</Sec>
      <div style={{ background: C.surface, borderRadius: 10, padding: 18 }}>
        {dailyProofs.length === 0 ? (
          <div style={{ color: C.gray, fontSize: 13, textAlign: 'center', padding: 20 }}>データなし</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.grayDark}` }}>
                  {['日付', 'プロ名', '投票数'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 12px', color: C.gray,
                      fontWeight: 500, fontSize: 10, letterSpacing: '0.04em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proofDates.map(dateRaw => (
                  proofsByDate[dateRaw].map((dp, i) => (
                    <tr key={`${dateRaw}-${i}`} style={{ borderBottom: `1px solid ${C.grayDark}15` }}>
                      <td style={{ padding: '10px 12px', color: C.gray, fontSize: 11 }}>
                        {i === 0 ? dp.date : ''}
                      </td>
                      <td style={{ padding: '10px 12px', color: C.cream, fontWeight: 500 }}>{dp.pro_name}</td>
                      <td style={{
                        padding: '10px 12px',
                        color: dp.daily_votes >= 3 ? C.gold : C.cream,
                        fontWeight: dp.daily_votes >= 3 ? 700 : 400,
                      }}>
                        {dp.daily_votes}
                      </td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* [E] Pro List */}
      <Sec>プロ一覧 — 個別ステータス</Sec>
      <div style={{ background: C.surface, borderRadius: 10, padding: 18 }}>
        <ProTbl pros={pros} />
      </div>

      {/* [F] Bottleneck */}
      <Sec>3層ボトルネック</Sec>
      <div style={{ display: 'flex', gap: 12 }}>
        <BN
          layer="LAYER 1" title="設定できない"
          metric={`${g.total_pros - g.complete_profiles}名が未完了`}
          action="設定ガイド送付"
          color={pr >= 80 ? C.green : C.red}
        />
        <BN
          layer="LAYER 2" title="見せられない"
          metric={`${g.complete_profiles - g.pros_who_showed_qr}名が設定済→未提示`}
          action="見せ方スクリプト共有"
          color={C.amber}
        />
        <BN
          layer="LAYER 3" title="投票完了できない"
          metric="ファネルデータで判定"
          action="SMS認証追加済み"
          color={C.amber}
        />
      </div>

      {/* [G] Trend (30 days) */}
      <Sec>日別トレンド（直近30日）</Sec>
      {dailyTrend.length === 0 ? (
        <Placeholder message="データなし" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
            <div style={{ color: C.gray, fontSize: 11, marginBottom: 8 }}>投票数</div>
            <MiniBar data={dailyTrend} dk="votes" color={C.gold} />
          </div>
          <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
            <div style={{ color: C.gray, fontSize: 11, marginBottom: 8 }}>アクティブプロ数</div>
            <MiniBar data={dailyTrend} dk="active_pros" color={C.green} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: 'center', color: C.grayDark, fontSize: 11,
        paddingTop: 24, marginTop: 28, borderTop: `1px solid ${C.grayDark}22`,
      }}>
        CONFIDENTIAL — 株式会社 Legrand chariot — REALPROOF MVP Dashboard
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@/lib/supabase-client'
import dynamic from 'next/dynamic'

// Recharts（SSR無効化）
const ScatterChart = dynamic(() => import('recharts').then(m => m.ScatterChart), { ssr: false })
const Scatter = dynamic(() => import('recharts').then(m => m.Scatter), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const RechartsTooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

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

interface ShareAnalytics {
  s1: number
  s2: number
  s3: number
  pv1: number
  pv2: number
  pv3: number
}

interface DailyTrendData {
  date: string
  votes: number
  active_pros: number
}

interface TrackingProStat {
  professional_id: string
  name: string
  title: string
  total_proofs: number
  profile_views: number
  profile_unique_visitors: number
  card_views: number
  card_unique_visitors: number
  consultation_clicks: number
  booking_clicks: number
}

interface TrackingSummary {
  total_profile_views: number
  total_card_views: number
  total_consultation_clicks: number
  total_booking_clicks: number
  total_unique_visitors: number
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
  hopeful: '気になる投票',
  sms: 'SMS認証',
  sms_fallback: 'SMSフォールバック',
  email: 'メール認証',
  line: 'LINE認証',
  google: 'Google認証',
}

// 固定表示順
const AUTH_METHOD_ORDER = ['hopeful', 'sms', 'sms_fallback', 'email', 'line', 'google']

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

  const [goRes, proRes, authRes, trendRes, proofRes, qrTokensRes, votesForChRes, shareCountRes, sharePvRes] = await Promise.all([
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
    // シェア分析: シェア数
    supabase.from('page_views').select('page_type').in('page_type', ['share_profile_self', 'share_profile_other', 'share_voice']),
    // シェア分析: シェア経由PV
    supabase.from('page_views').select('source').eq('page_type', 'pro_profile').in('source', ['pro_share', 'client_share', 'voice_share']),
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

  // シェア分析マッピング
  const shares: ShareAnalytics = { s1: 0, s2: 0, s3: 0, pv1: 0, pv2: 0, pv3: 0 }
  if (shareCountRes.data && !shareCountRes.error && Array.isArray(shareCountRes.data)) {
    shareCountRes.data.forEach((row: any) => {
      if (row.page_type === 'share_profile_self') shares.s1++
      else if (row.page_type === 'share_profile_other') shares.s2++
      else if (row.page_type === 'share_voice') shares.s3++
    })
  }
  if (sharePvRes.data && !sharePvRes.error && Array.isArray(sharePvRes.data)) {
    sharePvRes.data.forEach((row: any) => {
      if (row.source === 'pro_share') shares.pv1++
      else if (row.source === 'client_share') shares.pv2++
      else if (row.source === 'voice_share') shares.pv3++
    })
  }

  return { goNogo, pros, authMethods, dailyTrend, dailyProofs, channels, shares }
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
  const [shares, setShares] = useState<ShareAnalytics>({ s1: 0, s2: 0, s3: 0, pv1: 0, pv2: 0, pv3: 0 })

  // Tracking state
  const [trackingStats, setTrackingStats] = useState<TrackingProStat[]>([])
  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null)
  const [trackingSortKey, setTrackingSortKey] = useState<string>('total_proofs')
  const [trackingSortAsc, setTrackingSortAsc] = useState(false)

  // Bug Reports state
  const [bugReports, setBugReports] = useState<any[]>([])
  const [bugFilter, setBugFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved' | 'wontfix'>('all')

  // Announcements state
  const [annList, setAnnList] = useState<any[]>([])
  const [annModal, setAnnModal] = useState<any | null>(null) // null=閉じ, {}=新規, {id,...}=編集
  const [annForm, setAnnForm] = useState({ title: '', body: '', banner_type: 'info', target: 'all', starts_at: '', expires_at: '', is_active: true, link_url: '', link_label: '' })
  const [annSaving, setAnnSaving] = useState(false)

  async function loadAnnouncements() {
    try {
      const res = await fetch('/api/admin/announcements')
      if (res.ok) {
        const data = await res.json()
        setAnnList(data.announcements || [])
      }
    } catch {}
  }

  async function loadBugReports() {
    try {
      const res = await fetch('/api/admin/bug-reports')
      if (res.ok) {
        const data = await res.json()
        setBugReports(data.reports || [])
      }
    } catch {}
  }

  async function loadTracking() {
    try {
      const res = await fetch('/api/admin/tracking')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.proStats)) {
          setTrackingStats(data.proStats.map((s: any) => ({
            professional_id: s.professional_id,
            name: s.name || '—',
            title: s.title || '—',
            total_proofs: Number(s.total_proofs) || 0,
            profile_views: Number(s.profile_views) || 0,
            profile_unique_visitors: Number(s.profile_unique_visitors) || 0,
            card_views: Number(s.card_views) || 0,
            card_unique_visitors: Number(s.card_unique_visitors) || 0,
            consultation_clicks: Number(s.consultation_clicks) || 0,
            booking_clicks: Number(s.booking_clicks) || 0,
          })))
        }
        if (data.summary) {
          const s = Array.isArray(data.summary) ? data.summary[0] : data.summary
          if (s) {
            setTrackingSummary({
              total_profile_views: Number(s.total_profile_views) || 0,
              total_card_views: Number(s.total_card_views) || 0,
              total_consultation_clicks: Number(s.total_consultation_clicks) || 0,
              total_booking_clicks: Number(s.total_booking_clicks) || 0,
              total_unique_visitors: Number(s.total_unique_visitors) || 0,
            })
          }
        }
      }
    } catch (e) {
      console.error('Tracking data fetch failed:', e)
    }
  }

  async function bugStatusChange(id: string, newStatus: string) {
    await fetch(`/api/admin/bug-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    loadBugReports()
  }

  async function annToggle(id: string, current: boolean) {
    await fetch(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    })
    loadAnnouncements()
  }

  async function annDelete(id: string) {
    if (!window.confirm('このお知らせを削除しますか？')) return
    await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' })
    loadAnnouncements()
  }

  function annOpenNew() {
    setAnnForm({ title: '', body: '', banner_type: 'info', target: 'all', starts_at: new Date().toISOString().slice(0, 16), expires_at: '', is_active: true, link_url: '', link_label: '' })
    setAnnModal({})
  }

  function annOpenEdit(a: any) {
    setAnnForm({
      title: a.title || '',
      body: a.body || '',
      banner_type: a.banner_type || 'info',
      target: a.target || 'all',
      starts_at: a.starts_at ? new Date(a.starts_at).toISOString().slice(0, 16) : '',
      expires_at: a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : '',
      is_active: a.is_active ?? true,
      link_url: a.link_url || '',
      link_label: a.link_label || '',
    })
    setAnnModal(a)
  }

  async function annSave() {
    if (!annForm.title.trim()) return
    setAnnSaving(true)
    try {
      const payload = {
        title: annForm.title,
        body: annForm.body || null,
        banner_type: annForm.banner_type,
        target: annForm.target,
        starts_at: annForm.starts_at ? new Date(annForm.starts_at).toISOString() : new Date().toISOString(),
        expires_at: annForm.expires_at ? new Date(annForm.expires_at).toISOString() : null,
        is_active: annForm.is_active,
        link_url: annForm.link_url || null,
        link_label: annForm.link_label || null,
      }
      if (annModal?.id) {
        await fetch(`/api/admin/announcements/${annModal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setAnnModal(null)
      loadAnnouncements()
    } catch {}
    setAnnSaving(false)
  }

  // Broadcast state
  const [bcTarget, setBcTarget] = useState<'all' | 'line' | 'email' | 'professional'>('all')
  const [bcProId, setBcProId] = useState('')
  const [bcChannel, setBcChannel] = useState<'auto' | 'line' | 'email'>('auto')
  const [bcTemplate, setBcTemplate] = useState<'custom' | 'founding' | 'achievement'>('custom')
  const [bcSubject, setBcSubject] = useState('')
  const [bcBody, setBcBody] = useState('')
  const [bcSending, setBcSending] = useState(false)
  const [bcToast, setBcToast] = useState('')
  const [bcPreviewResult, setBcPreviewResult] = useState<any>(null)

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
      if (result.shares) { setShares(result.shares) }

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
    loadAnnouncements()
    loadBugReports()
    loadTracking()
  }, [loadData])

  // Broadcast テンプレート定義
  const BROADCAST_TEMPLATES: Record<string, { subject: string; body: string }> = {
    founding: {
      subject: '【REALPROOF】ファウンディングメンバー特典のご案内',
      body: `{{name}}さん\n\nREALPROOFをご利用いただきありがとうございます。\n\n現在、初期にご登録いただいたプロフェッショナルの方限定で\n「ファウンディングメンバー」特典をご用意しています。\n\n詳しくはダッシュボードをご確認ください。`,
    },
    achievement: {
      subject: '【REALPROOF】プルーフ達成のお知らせ',
      body: `{{name}}さん\n\nおめでとうございます！\nあなたの累計プルーフが{{votes}}件に到達しました。\n\n引き続き、あなたの強みを証明していきましょう。`,
    },
  }

  function onBcTemplateChange(tpl: 'custom' | 'founding' | 'achievement') {
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
    } catch {
      setBcToast('プレビューに失敗しました')
    } finally {
      setBcSending(false)
    }
  }

  async function broadcastSend() {
    const targetLabel = bcTarget === 'all' ? '全プロ' : bcTarget === 'line' ? 'LINE連携済み' : bcTarget === 'email' ? 'メールのみ' : '個別指定'
    const channelLabel = bcChannel === 'auto' ? '自動（LINE優先）' : bcChannel
    if (!confirm(`本当に送信しますか？\n\n対象: ${targetLabel}\nチャネル: ${channelLabel}\n\nこの操作は取り消せません。`)) {
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
        setBcToast(`送信完了: LINE ${result.sent?.line || 0}件, メール ${result.sent?.email || 0}件, 失敗 ${result.failed || 0}件, スキップ ${result.skipped || 0}件`)
        setTimeout(() => setBcToast(''), 8000)
      } else {
        setBcToast(`エラー: ${result.error}`)
      }
    } catch {
      setBcToast('送信に失敗しました')
    } finally {
      setBcSending(false)
    }
  }

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
          {AUTH_METHOD_ORDER.map(method => {
            const found = authMethods.find(a => a.auth_method === method)
            const count = found ? found.count : 0
            const pct = totalAuthVotes > 0 ? Math.round((count / totalAuthVotes) * 100) : 0
            const label = AUTH_METHOD_LABELS[method] || method
            return (
              <div key={method} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 0', borderBottom: `1px solid ${C.grayDark}15`,
              }}>
                <span style={{ color: C.cream, fontSize: 13 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.gray, fontSize: 11 }}>{pct}%</span>
                  <span style={{ color: count > 0 ? C.cream : C.grayDark, fontWeight: 600, fontSize: 14 }}>{count}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* [D] Share */}
      <Sec>シェア分析（S1 / S2 / S3）</Sec>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { l: 'S1: プロ自身', d: 'プロフィールをシェア', c: shares.s1, p: shares.pv1 },
          { l: 'S2: カードシェア', d: '他者がプロのカードをシェア', c: shares.s2, p: shares.pv2 },
          { l: 'S3: Voiceシェア', d: '投票コメントをシェア', c: shares.s3, p: shares.pv3 },
        ].map(x => (
          <div key={x.l} style={{ background: C.surface, borderRadius: 10, padding: 18 }}>
            <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{x.l}</div>
            <div style={{ color: C.gray, fontSize: 11, marginBottom: 10 }}>{x.d}</div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ color: C.gray, fontSize: 10, marginBottom: 2 }}>シェア数</div>
                <div style={{ color: C.cream, fontSize: 24, fontWeight: 700 }}>{x.c}</div>
              </div>
              <div>
                <div style={{ color: C.gray, fontSize: 10, marginBottom: 2 }}>→ PV</div>
                <div style={{ color: x.p > 0 ? C.gold : C.grayDark, fontSize: 24, fontWeight: 700 }}>{x.p}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

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

      {/* 声かけ事例 */}
      <Sec>クライアントへの声かけ事例</Sec>
      <div className="voicekake-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
      }}>
        {/* カード1: 一番シンプル（推奨） */}
        <div style={{
          background: C.surface,
          borderRadius: '0 0 10px 10px',
          borderTop: `3px solid ${C.gold}`,
          padding: '18px 20px',
        }}>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 6 }}>一番シンプル</div>
          <div style={{ background: C.goldBg, display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: C.gold, fontWeight: 600, marginBottom: 12 }}>★ おすすめ</div>
          <p style={{ color: C.cream, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
{`「かんたんなアンケートに
ご協力いただけますか？
スマホをかざすだけで、
30秒で終わります」`}
          </p>
        </div>

        {/* カード2: 理由を添える */}
        <div style={{
          background: C.surface,
          borderRadius: '0 0 10px 10px',
          borderTop: `3px solid ${C.grayDark}`,
          padding: '18px 20px',
        }}>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 12 }}>理由を添える</div>
          <p style={{ color: C.cream, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
{`「自分の技術を上げるために
お客さんの声を集めてるんです。
かんたんなアンケートなんですけど、
ご協力いただけますか？」`}
          </p>
        </div>

        {/* カード3: 常連のお客さんに */}
        <div style={{
          background: C.surface,
          borderRadius: '0 0 10px 10px',
          borderTop: `3px solid ${C.grayDark}`,
          padding: '18px 20px',
        }}>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 12 }}>常連のお客さんに</div>
          <p style={{ color: C.cream, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
{`「○○さんにお聞きしたいんですけど、
どんなところがよかったか、
アンケートで教えてもらえますか？
スマホかざすだけで大丈夫です」`}
          </p>
        </div>
      </div>


      <style>{`@media (max-width: 768px) { .voicekake-grid { grid-template-columns: 1fr !important; } }`}</style>

      {/* よくある質問 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ color: C.gold, fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 12 }}>よくある質問</div>
        <div style={{ background: C.surface, borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ color: C.gold, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Q: お客さんが「回答できない」と言われた</div>
          <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
            アンケートには不正防止のため、いくつかの制限があります。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 4 }}>
            <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7 }}>
              <span style={{ color: C.gold }}>・</span>同じお客さんからは30分に1回まで受けられます<br />
              <span style={{ color: C.gray, fontSize: 12, paddingLeft: 12, display: 'inline-block' }}>→ 少し時間を置いてから再度お願いしてみてください。</span>
            </div>
            <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7 }}>
              <span style={{ color: C.gold }}>・</span>1人のお客さんが1日に回答できるのは最大3名のプロまでです<br />
              <span style={{ color: C.gray, fontSize: 12, paddingLeft: 12, display: 'inline-block' }}>→ 翌日以降にお願いしてみてください。</span>
            </div>
            <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7 }}>
              <span style={{ color: C.gold }}>・</span>同じお客さんからの回答は、前回から約3ヶ月空ける必要があります<br />
              <span style={{ color: C.gray, fontSize: 12, paddingLeft: 12, display: 'inline-block' }}>→ 次回のご来店時にまたお願いしてみてください。</span><br />
              <span style={{ color: C.gray, fontSize: 12, paddingLeft: 16, display: 'inline-block' }}>リピーターの方からの継続的な声は、</span><br />
              <span style={{ color: C.gray, fontSize: 12, paddingLeft: 16, display: 'inline-block' }}>あなたの強みの証明をさらに確かなものにします。</span>
            </div>
          </div>
          <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7, marginTop: 14, borderTop: `1px solid ${C.grayDark}`, paddingTop: 12 }}>
            これらの仕組みは、プルーフの信頼性を守るためのものです。
          </div>
        </div>
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

      {/* [G] Announcements — お知らせ管理 */}
      <Sec>お知らせ管理</Sec>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={annOpenNew}
          style={{
            background: C.gold, color: C.bg, border: 'none', cursor: 'pointer',
            padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600,
          }}
        >
          ＋ 新規作成
        </button>
      </div>

      {annList.length === 0 ? (
        <div style={{ background: C.surface, borderRadius: 10, padding: 24, color: C.gray, textAlign: 'center', fontSize: 13 }}>
          お知らせはありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {annList.map((a: any) => {
            const targetLabel = a.target === 'all' ? '全員' : a.target === 'professionals' ? 'プロ' : a.target === 'founding_members' ? 'FM' : a.target?.startsWith('badge:') ? 'バッジ保有者' : a.target
            const typeColor = a.banner_type === 'success' ? C.green : a.banner_type === 'warning' ? C.amber : C.gold
            const startDate = a.starts_at ? new Date(a.starts_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
            const endDate = a.expires_at ? new Date(a.expires_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '無期限'
            return (
              <div key={a.id} style={{ background: C.surface, borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.is_active ? C.green : C.gray, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: C.cream, fontSize: 14, fontWeight: 600, flex: 1 }}>{a.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: typeColor, background: typeColor + '18', padding: '2px 8px', borderRadius: 4 }}>
                    {a.banner_type}
                  </span>
                </div>
                {a.body && (
                  <div style={{ color: C.gray, fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>
                    {a.body.length > 80 ? a.body.slice(0, 80) + '...' : a.body}
                  </div>
                )}
                <div style={{ color: C.gray, fontSize: 11, marginBottom: 10 }}>
                  対象: {targetLabel} ｜ 開始: {startDate} ｜ 終了: {endDate}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => annToggle(a.id, a.is_active)}
                    style={{
                      padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600,
                      background: a.is_active ? C.green + '20' : C.gray + '20',
                      color: a.is_active ? C.green : C.gray,
                    }}
                  >
                    {a.is_active ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => annOpenEdit(a)}
                    style={{
                      padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.gold}`,
                      background: 'transparent', color: C.gold, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => annDelete(a.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.red}`,
                      background: 'transparent', color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* お知らせ作成/編集モーダル */}
      {annModal !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={() => setAnnModal(null)}
        >
          <div
            style={{
              background: C.surface, borderRadius: 12, padding: 28, width: '90%', maxWidth: 480,
              maxHeight: '85vh', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ color: C.cream, fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
              {annModal?.id ? 'お知らせを編集' : 'お知らせを作成'}
            </div>

            {/* タイトル */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>タイトル *</div>
              <input
                value={annForm.title}
                onChange={e => setAnnForm({ ...annForm, title: e.target.value.slice(0, 100) })}
                placeholder="メンテナンスのお知らせ"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 7,
                  border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                  color: C.cream, fontSize: 14, boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>

            {/* 本文 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>メッセージ</div>
              <textarea
                value={annForm.body}
                onChange={e => setAnnForm({ ...annForm, body: e.target.value.slice(0, 500) })}
                placeholder="お知らせの詳細..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 7,
                  border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                  color: C.cream, fontSize: 13, boxSizing: 'border-box', outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* バナータイプ */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.gray, fontSize: 11, marginBottom: 6 }}>バナータイプ</div>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['info', 'success', 'warning'] as const).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.cream, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio" name="banner_type" checked={annForm.banner_type === t}
                      onChange={() => setAnnForm({ ...annForm, banner_type: t })}
                    />
                    {t === 'info' ? '📢 info' : t === 'success' ? '✅ success' : '⚠️ warning'}
                  </label>
                ))}
              </div>
            </div>

            {/* 対象 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>対象</div>
              <select
                value={annForm.target}
                onChange={e => setAnnForm({ ...annForm, target: e.target.value })}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 7,
                  border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                  color: C.cream, fontSize: 13, outline: 'none',
                }}
              >
                <option value="all">全員</option>
                <option value="professionals">プロフェッショナル</option>
                <option value="founding_members">ファウンディングメンバー</option>
              </select>
            </div>

            {/* リンクURL */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>リンクURL（任意）</div>
              <input
                value={annForm.link_url}
                onChange={e => setAnnForm({ ...annForm, link_url: e.target.value })}
                placeholder="https://..."
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 7,
                  border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                  color: C.cream, fontSize: 13, boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>

            {/* リンクラベル */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>リンクラベル（任意）</div>
              <input
                value={annForm.link_label}
                onChange={e => setAnnForm({ ...annForm, link_label: e.target.value })}
                placeholder="詳細を見る"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 7,
                  border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                  color: C.cream, fontSize: 13, boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>

            {/* 開始日時 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>表示開始</div>
                <input
                  type="datetime-local"
                  value={annForm.starts_at}
                  onChange={e => setAnnForm({ ...annForm, starts_at: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                    color: C.cream, fontSize: 12, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>
              <div>
                <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>表示終了（空=無期限）</div>
                <input
                  type="datetime-local"
                  value={annForm.expires_at}
                  onChange={e => setAnnForm({ ...annForm, expires_at: e.target.value })}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 7,
                    border: `1px solid ${C.grayDark}`, background: C.surfaceLight,
                    color: C.cream, fontSize: 12, boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* 公開チェック */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.cream, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={annForm.is_active}
                  onChange={e => setAnnForm({ ...annForm, is_active: e.target.checked })}
                />
                {annModal?.id ? '公開中にする' : '作成後すぐに公開する'}
              </label>
            </div>

            {/* ボタン */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAnnModal(null)}
                style={{
                  padding: '9px 20px', borderRadius: 7, border: `1px solid ${C.grayDark}`,
                  background: 'transparent', color: C.gray, fontSize: 13, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={annSave}
                disabled={annSaving || !annForm.title.trim()}
                style={{
                  padding: '9px 20px', borderRadius: 7, border: 'none',
                  background: C.gold, color: C.bg, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: annSaving || !annForm.title.trim() ? 0.5 : 1,
                }}
              >
                {annSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [H] Bug Reports — 不具合報告 */}
      <Sec>不具合報告</Sec>
      <div style={{ background: C.surface, borderRadius: 10, padding: 24 }}>
        {/* フィルター */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {([['all', 'すべて'], ['new', '新規'], ['in_progress', '対応中'], ['resolved', '解決済'], ['wontfix', '対応不要']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setBugFilter(key)}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                background: bugFilter === key ? C.gold : C.surfaceLight,
                color: bugFilter === key ? '#fff' : C.gray,
              }}
            >
              {label}
              {key !== 'all' && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>
                  ({bugReports.filter(r => r.status === key).length})
                </span>
              )}
              {key === 'all' && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({bugReports.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* 一覧 */}
        {bugReports.length === 0 ? (
          <Placeholder message="不具合報告はまだありません" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bugReports
              .filter(r => bugFilter === 'all' || r.status === bugFilter)
              .map((r: any) => {
                const statusMap: Record<string, { label: string; color: string }> = {
                  new: { label: '新規', color: C.red },
                  in_progress: { label: '対応中', color: C.amber },
                  resolved: { label: '解決済', color: C.green },
                  wontfix: { label: '対応不要', color: C.gray },
                }
                const st = statusMap[r.status] || statusMap.new
                return (
                  <div key={r.id} style={{
                    background: C.surfaceLight, borderRadius: 8, padding: 16,
                    borderLeft: `3px solid ${st.color}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Bdg text={st.label} color={st.color} />
                          {r.screen && (
                            <span style={{ color: C.gray, fontSize: 11 }}>{r.screen}</span>
                          )}
                          <span style={{ color: C.grayDark, fontSize: 10 }}>
                            {new Date(r.created_at).toLocaleString('ja-JP')}
                          </span>
                        </div>
                        <div style={{ color: C.cream, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {r.description}
                        </div>
                        {r.email && (
                          <div style={{ color: C.gray, fontSize: 11, marginTop: 6 }}>
                            連絡先: {r.email}
                          </div>
                        )}
                        {r.image_url && (
                          <div style={{ marginTop: 8 }}>
                            <a href={r.image_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={r.image_url}
                                alt="スクリーンショット"
                                style={{ maxHeight: 120, borderRadius: 6, border: `1px solid ${C.grayDark}` }}
                              />
                            </a>
                          </div>
                        )}
                      </div>
                      {/* ステータス変更 */}
                      <select
                        value={r.status}
                        onChange={(e) => bugStatusChange(r.id, e.target.value)}
                        style={{
                          background: C.surface, color: C.cream, border: `1px solid ${C.grayDark}`,
                          borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        <option value="new">新規</option>
                        <option value="in_progress">対応中</option>
                        <option value="resolved">解決済</option>
                        <option value="wontfix">対応不要</option>
                      </select>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* [I] Broadcast — 一斉送信 */}
      <Sec>一斉送信（メール / LINE）</Sec>
      <div style={{ background: C.surface, borderRadius: 10, padding: 24 }}>
        <div style={{ color: C.gray, fontSize: 12, marginBottom: 16 }}>
          プロフェッショナルにメール/LINEで一斉メッセージを送信。
          <code style={{ background: C.surfaceLight, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{'{{name}}'}</code> と
          <code style={{ background: C.surfaceLight, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{'{{votes}}'}</code> が変数として使えます。
        </div>

        {/* 対象 + チャネル */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>対象</div>
            <select
              value={bcTarget}
              onChange={e => setBcTarget(e.target.value as any)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                background: C.surfaceLight, color: C.cream, border: `1px solid ${C.grayDark}`,
                fontSize: 13,
              }}
            >
              <option value="all">全プロ</option>
              <option value="line">LINE連携済みのみ</option>
              <option value="email">メールのみ</option>
              <option value="professional">個別指定</option>
            </select>
          </div>
          <div>
            <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>送信チャネル</div>
            <select
              value={bcChannel}
              onChange={e => setBcChannel(e.target.value as any)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                background: C.surfaceLight, color: C.cream, border: `1px solid ${C.grayDark}`,
                fontSize: 13,
              }}
            >
              <option value="auto">自動（LINE優先）</option>
              <option value="line">LINEのみ</option>
              <option value="email">メールのみ</option>
            </select>
          </div>
        </div>

        {/* 個別指定 */}
        {bcTarget === 'professional' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>プロを選択</div>
            <select
              value={bcProId}
              onChange={e => setBcProId(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                background: C.surfaceLight, color: C.cream, border: `1px solid ${C.grayDark}`,
                fontSize: 13,
              }}
            >
              <option value="">選択してください</option>
              {pros.map(p => (
                <option key={p.id} value={p.id}>{p.n}（{p.v}票）</option>
              ))}
            </select>
          </div>
        )}

        {/* テンプレート */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>テンプレート</div>
          <select
            value={bcTemplate}
            onChange={e => onBcTemplateChange(e.target.value as any)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 7,
              background: C.surfaceLight, color: C.cream, border: `1px solid ${C.grayDark}`,
              fontSize: 13,
            }}
          >
            <option value="custom">カスタム（自由入力）</option>
            <option value="founding">Founding Member告知</option>
            <option value="achievement">達成おめでとう</option>
          </select>
        </div>

        {/* 件名 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>件名（メール用）</div>
          <input
            type="text"
            value={bcSubject}
            onChange={e => setBcSubject(e.target.value)}
            placeholder="【REALPROOF】お知らせ"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 7,
              background: C.surfaceLight, color: C.cream, border: `1px solid ${C.grayDark}`,
              fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* 本文 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 4 }}>本文</div>
          <textarea
            rows={8}
            value={bcBody}
            onChange={e => setBcBody(e.target.value)}
            placeholder={`{{name}}さん\n\nメッセージ本文をここに入力...\n\n{{votes}}件のプルーフありがとうございます。`}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 7,
              background: C.surfaceLight, color: C.cream, border: `1px solid ${C.grayDark}`,
              fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* プレビュー結果 */}
        {bcPreviewResult && (
          <div style={{
            background: C.surfaceLight, borderRadius: 10, padding: 16, marginBottom: 14,
            border: `1px solid ${C.gold}33`,
          }}>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>プレビュー結果</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, textAlign: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ color: C.cream, fontSize: 24, fontWeight: 700 }}>{bcPreviewResult.total}</div>
                <div style={{ color: C.gray, fontSize: 10 }}>対象者</div>
              </div>
              <div>
                <div style={{ color: C.green, fontSize: 24, fontWeight: 700 }}>{bcPreviewResult.wouldSendLine}</div>
                <div style={{ color: C.gray, fontSize: 10 }}>LINE送信</div>
              </div>
              <div>
                <div style={{ color: C.gold, fontSize: 24, fontWeight: 700 }}>{bcPreviewResult.wouldSendEmail}</div>
                <div style={{ color: C.gray, fontSize: 10 }}>メール送信</div>
              </div>
              <div>
                <div style={{ color: C.grayDark, fontSize: 24, fontWeight: 700 }}>{bcPreviewResult.wouldSkip}</div>
                <div style={{ color: C.gray, fontSize: 10 }}>スキップ</div>
              </div>
            </div>
            {bcPreviewResult.sampleRecipients?.length > 0 && (
              <div>
                <div style={{ color: C.gray, fontSize: 10, marginBottom: 4 }}>サンプル受信者:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {bcPreviewResult.sampleRecipients.map((r: any, i: number) => (
                    <span key={i} style={{
                      fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 500,
                      background: r.channel === 'line' ? C.green + '20' : C.gold + '20',
                      color: r.channel === 'line' ? C.green : C.gold,
                    }}>
                      {r.name}（{r.channel === 'line' ? 'LINE' : 'メール'}）
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ボタン + Toast */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={broadcastPreview}
            disabled={bcSending || !bcBody}
            style={{
              padding: '9px 22px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: C.gold, color: '#fff', fontSize: 13, fontWeight: 600,
              opacity: (bcSending || !bcBody) ? 0.5 : 1,
            }}
          >
            {bcSending ? '処理中...' : 'プレビュー'}
          </button>
          <button
            onClick={broadcastSend}
            disabled={bcSending || !bcBody}
            style={{
              padding: '9px 22px', borderRadius: 7, border: `1px solid ${C.red}`,
              cursor: 'pointer', background: 'transparent', color: C.red,
              fontSize: 13, fontWeight: 600,
              opacity: (bcSending || !bcBody) ? 0.5 : 1,
            }}
          >
            {bcSending ? '送信中...' : '送信実行'}
          </button>
          {bcToast && (
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: bcToast.includes('エラー') || bcToast.includes('失敗') ? C.red : C.green,
            }}>
              {bcToast}
            </span>
          )}
        </div>
      </div>

      {/* ═══ Tracking Section ═══ */}
      <Sec>📊 トラッキング</Sec>

      {/* サマリーカード */}
      {trackingSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>
          <MC label="カードPV" value={trackingSummary.total_card_views} />
          <MC label="ユニーク訪問者" value={trackingSummary.total_unique_visitors} />
          <MC label="相談クリック" value={trackingSummary.total_consultation_clicks}
            status={trackingSummary.total_consultation_clicks > 0 ? 'good' : 'neutral'} />
          <MC label="予約クリック" value={trackingSummary.total_booking_clicks}
            status={trackingSummary.total_booking_clicks > 0 ? 'good' : 'neutral'} />
          <MC label="合計クリック" value={trackingSummary.total_consultation_clicks + trackingSummary.total_booking_clicks}
            status={(trackingSummary.total_consultation_clicks + trackingSummary.total_booking_clicks) > 0 ? 'good' : 'neutral'} />
        </div>
      )}

      {/* 散布図 */}
      {trackingStats.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 10, padding: 20, marginTop: 14 }}>
          <div style={{ color: C.cream, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            プルーフ数 × クリック数の相関
          </div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grayDark + '44'} />
                <XAxis
                  dataKey="proofs"
                  name="プルーフ数"
                  type="number"
                  tick={{ fill: C.gray, fontSize: 11 }}
                  axisLine={{ stroke: C.grayDark }}
                  label={{ value: 'プルーフ数', position: 'insideBottom', offset: -10, fill: C.gray, fontSize: 11 }}
                />
                <YAxis
                  dataKey="clicks"
                  name="クリック数"
                  type="number"
                  tick={{ fill: C.gray, fontSize: 11 }}
                  axisLine={{ stroke: C.grayDark }}
                  label={{ value: 'クリック数', angle: -90, position: 'insideLeft', offset: 5, fill: C.gray, fontSize: 11 }}
                />
                <RechartsTooltip
                  cursor={{ strokeDasharray: '3 3', stroke: C.gray }}
                  content={({ payload }: any) => {
                    if (!payload || !payload[0]) return null
                    const d = payload[0].payload
                    return (
                      <div style={{
                        background: C.surface, border: `1px solid ${C.grayDark}`,
                        padding: '8px 12px', borderRadius: 6, fontSize: 12,
                      }}>
                        <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                        <div style={{ color: C.cream }}>プルーフ: {d.proofs}</div>
                        <div style={{ color: C.cream }}>クリック: {d.clicks}</div>
                      </div>
                    )
                  }}
                />
                <Scatter
                  data={trackingStats.map(s => ({
                    name: s.name,
                    proofs: s.total_proofs,
                    clicks: s.consultation_clicks + s.booking_clicks,
                  }))}
                  fill="#C4A35A"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* テーブル */}
      {trackingStats.length > 0 && (() => {
        const sortedStats = Array.from(trackingStats).sort((a, b) => {
          const aVal = (a as any)[trackingSortKey] ?? 0
          const bVal = (b as any)[trackingSortKey] ?? 0
          if (trackingSortKey === 'name' || trackingSortKey === 'title') {
            return trackingSortAsc
              ? String(aVal).localeCompare(String(bVal))
              : String(bVal).localeCompare(String(aVal))
          }
          return trackingSortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
        })

        const cols: { key: string; label: string }[] = [
          { key: 'name', label: 'プロ名' },
          { key: 'title', label: '職種' },
          { key: 'total_proofs', label: 'プルーフ' },
          { key: 'card_views', label: 'カードPV' },
          { key: 'card_unique_visitors', label: 'UV' },
          { key: 'consultation_clicks', label: '相談' },
          { key: 'booking_clicks', label: '予約' },
          { key: 'total_clicks', label: '合計' },
        ]

        function handleSort(key: string) {
          if (trackingSortKey === key) {
            setTrackingSortAsc(!trackingSortAsc)
          } else {
            setTrackingSortKey(key)
            setTrackingSortAsc(false)
          }
        }

        return (
          <div style={{ background: C.surface, borderRadius: 10, padding: 20, marginTop: 14, overflowX: 'auto' }}>
            <div style={{ color: C.cream, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              プロごとの詳細
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.grayDark}` }}>
                  {cols.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        textAlign: col.key === 'name' || col.key === 'title' ? 'left' : 'right',
                        padding: '10px 8px', color: trackingSortKey === col.key ? C.gold : C.gray,
                        fontWeight: 500, fontSize: 10, letterSpacing: '0.04em',
                        whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      {col.label} {trackingSortKey === col.key ? (trackingSortAsc ? '↑' : '↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStats.map(s => {
                  const totalClicks = s.consultation_clicks + s.booking_clicks
                  return (
                    <tr key={s.professional_id} style={{ borderBottom: `1px solid ${C.grayDark}15` }}>
                      <td style={{ padding: '10px 8px', color: C.cream, fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: '10px 8px', color: C.gray, fontSize: 11 }}>{s.title}</td>
                      <td style={{ padding: '10px 8px', color: s.total_proofs > 0 ? C.gold : C.grayDark, fontWeight: s.total_proofs >= 5 ? 700 : 400, textAlign: 'right' }}>{s.total_proofs}</td>
                      <td style={{ padding: '10px 8px', color: C.cream, textAlign: 'right' }}>{s.card_views}</td>
                      <td style={{ padding: '10px 8px', color: C.cream, textAlign: 'right' }}>{s.card_unique_visitors}</td>
                      <td style={{ padding: '10px 8px', color: s.consultation_clicks > 0 ? C.green : C.grayDark, textAlign: 'right' }}>{s.consultation_clicks}</td>
                      <td style={{ padding: '10px 8px', color: s.booking_clicks > 0 ? C.green : C.grayDark, textAlign: 'right' }}>{s.booking_clicks}</td>
                      <td style={{ padding: '10px 8px', color: totalClicks > 0 ? C.gold : C.grayDark, fontWeight: totalClicks > 0 ? 700 : 400, textAlign: 'right' }}>{totalClicks}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

      {!trackingSummary && !loading && (
        <Placeholder message="トラッキングデータがまだありません。RPC関数をSupabaseで作成してください。" />
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

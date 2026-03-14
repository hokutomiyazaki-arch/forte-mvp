'use client'

import { useState } from 'react'

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
// サンプルデータ（Supabase接続後にリアルデータに差し替え）
// ============================================================

// TODO: Supabase接続後は以下のViewからデータ取得:
//   const { data: goNogo } = await supabase.from('admin_go_nogo').select('*').maybeSingle()
const SAMPLE_GO = {
  total_pros: 14,
  complete_profiles: 4,
  pros_who_showed_qr: 4,
  total_votes: 18,
  avg_votes_per_active_pro: 4.5,
  verdict: 'MONITORING',
}

// TODO: Supabase接続後は以下のViewからデータ取得:
//   const { data: proStatus } = await supabase.from('admin_pro_status').select('*')
const SAMPLE_PROS = [
  { id: 1, n: 'トッププロ', ps: 'complete', rw: 3, qr: 15, v: 10, s1: 2, s2: 1, s3: 0, spv: 8, pv: 22, eng: 'active', lv: '2026-03-11' },
  { id: 2, n: '土井さん', ps: 'complete', rw: 2, qr: 8, v: 5, s1: 0, s2: 0, s3: 0, spv: 0, pv: 10, eng: 'active', lv: '2026-03-08' },
  { id: 3, n: '水田さん', ps: 'complete', rw: 2, qr: 4, v: 3, s1: 0, s2: 1, s3: 0, spv: 2, pv: 5, eng: 'active', lv: '2026-03-13' },
  { id: 4, n: '前田さん', ps: 'empty', rw: 0, qr: 0, v: 0, s1: 0, s2: 0, s3: 0, spv: 0, pv: 0, eng: 'never', lv: null },
  { id: 5, n: '宗田さん', ps: 'partial', rw: 0, qr: 0, v: 0, s1: 0, s2: 0, s3: 0, spv: 0, pv: 1, eng: 'cooling', lv: null },
  { id: 6, n: 'NFC報告者', ps: 'complete', rw: 1, qr: 3, v: 0, s1: 0, s2: 0, s3: 0, spv: 0, pv: 3, eng: 'cooling', lv: null },
]

// TODO: Supabase接続後は以下のViewからデータ取得:
//   const { data: voteFunnel } = await supabase.from('admin_vote_funnel').select('*').maybeSingle()
const SAMPLE_FUNNEL = [
  { label: 'QRスキャン', value: 32 },
  { label: '「投票する」タップ', value: 26 },
  { label: 'メール/SMS入力', value: 20 },
  { label: '投票完了', value: 18 },
  { label: 'リワード閲覧', value: 15 },
]

// TODO: Supabase接続後は以下のViewからデータ取得:
//   const { data: channelFunnel } = await supabase.from('admin_channel_funnel').select('*')
const SAMPLE_CHANNELS = [
  { ch: 'QR', scans: 28, votes: 16, pct: 57.1 },
  { ch: 'NFC', scans: 0, votes: 0, pct: 0 },
  { ch: 'Direct', scans: 4, votes: 2, pct: 50.0 },
]

// TODO: Supabase接続後は以下のViewからデータ取得:
//   const { data: shareAnalytics } = await supabase.from('admin_share_analytics').select('*').maybeSingle()
const SAMPLE_SHARES = { s1: 2, s2: 1, s3: 0, pv1: 8, pv2: 3, pv3: 0 }

// TODO: Supabase接続後は以下のViewからデータ取得:
//   const { data: dailyTrend } = await supabase.from('admin_daily_trend').select('*')
const SAMPLE_DAILY = Array.from({ length: 14 }, (_, i) => ({
  date: `3/${i + 1}`,
  votes: Math.floor(Math.random() * 4),
  views: Math.floor(Math.random() * 6 + 1),
  shares: Math.floor(Math.random() * 2),
}))

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

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(...steps.map(s => s.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s, i) => {
        const w = (s.value / max) * 100
        const prev = i > 0 ? steps[i - 1].value : null
        const rate = prev ? Math.round((s.value / prev) * 100) : null
        const rc = rate !== null ? (rate < 50 ? C.red : rate < 70 ? C.amber : C.green) : C.gray
        return (
          <div key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
              <span style={{ color: C.cream }}>{s.label}</span>
              <span style={{ color: C.gray }}>
                {s.value}
                {rate !== null && <span style={{ color: rc, marginLeft: 8 }}>({rate}%)</span>}
              </span>
            </div>
            <div style={{ height: 24, background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${w}%`,
                background: `linear-gradient(90deg,${C.gold},${C.gold}66)`,
                borderRadius: 5,
              }} />
            </div>
          </div>
        )
      })}
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

function ProTbl({ pros }: { pros: typeof SAMPLE_PROS }) {
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
  const hds = ['名前', '設定', 'RW', 'QR', '投票', 'Self', 'Card', 'Voice', '→PV', '閲覧', '状態', '最終投票']
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
// メインダッシュボード
// ============================================================

export default function AdminDashboard() {
  const g = SAMPLE_GO
  const pr = Math.round((g.complete_profiles / g.total_pros) * 100)
  const qr = Math.round((g.pros_who_showed_qr / g.total_pros) * 100)
  const sh = SAMPLE_SHARES

  // TODO: Supabase接続後:
  // useEffect(() => {
  //   trackPageView('admin_dashboard')
  //   fetchDashboardData()
  // }, [])
  //
  // async function fetchDashboardData() {
  //   const supabase = createClientComponentClient()
  //   const [goNogo, proStatus, ...] = await Promise.all([
  //     supabase.from('admin_go_nogo').select('*').maybeSingle(),
  //     supabase.from('admin_pro_status').select('*'),
  //     ...
  //   ])
  // }

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
      <Sec>チャネル別（QR vs NFC vs Direct）</Sec>
      <div style={{ background: C.surface, borderRadius: 10, padding: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.grayDark}` }}>
              {['チャネル', 'スキャン数', '投票完了', '転換率'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: C.gray, fontWeight: 500, fontSize: 11 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_CHANNELS.map(r => (
              <tr key={r.ch} style={{ borderBottom: `1px solid ${C.grayDark}22` }}>
                <td style={{ padding: '10px 14px', color: C.cream, fontWeight: 500 }}>{r.ch}</td>
                <td style={{ padding: '10px 14px', color: C.cream }}>{r.scans}</td>
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

      {/* [C] Funnel */}
      <Sec>投票ファネル — Layer 3 離脱分析</Sec>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: C.surface, borderRadius: 10, padding: 20 }}>
          <Funnel steps={SAMPLE_FUNNEL} />
          <div style={{
            marginTop: 12, padding: '8px 12px', background: C.bg,
            borderRadius: 6, color: C.gray, fontSize: 11,
          }}>
            ※ トラッキング実装後にリアルデータ表示
          </div>
        </div>
        <div style={{ background: C.surface, borderRadius: 10, padding: 20 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 10 }}>認証方式別 完了率</div>
          {[
            { m: 'SMS認証', n: '新規追加' },
            { m: 'メール入力のみ', n: '新規追加' },
            { m: 'LINE認証', n: '従来方式' },
            { m: 'Google認証', n: '従来方式' },
          ].map(x => (
            <div key={x.m} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 0', borderBottom: `1px solid ${C.grayDark}15`,
            }}>
              <span style={{ color: C.cream, fontSize: 13 }}>{x.m}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: C.gray, fontSize: 11 }}>{x.n}</span>
                <span style={{ color: C.cream, fontWeight: 600, fontSize: 14 }}>—</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* [D] Share */}
      <Sec>シェア分析（S1 / S2 / S3）</Sec>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { l: 'S1: プロ自身', d: 'プロフィールをシェア', c: sh.s1, p: sh.pv1 },
          { l: 'S2: カードシェア', d: '他者がプロのカードをシェア', c: sh.s2, p: sh.pv2 },
          { l: 'S3: Voiceシェア', d: '投票コメントをシェア', c: sh.s3, p: sh.pv3 },
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

      {/* [E] Pro List */}
      <Sec>プロ一覧 — 個別ステータス</Sec>
      <div style={{ background: C.surface, borderRadius: 10, padding: 18 }}>
        <ProTbl pros={SAMPLE_PROS} />
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

      {/* [G] Trend */}
      <Sec>日別トレンド（直近14日）</Sec>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 8 }}>投票数</div>
          <MiniBar data={SAMPLE_DAILY} dk="votes" color={C.gold} />
        </div>
        <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 8 }}>プロフィール閲覧</div>
          <MiniBar data={SAMPLE_DAILY} dk="views" color={C.green} />
        </div>
        <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
          <div style={{ color: C.gray, fontSize: 11, marginBottom: 8 }}>シェア数</div>
          <MiniBar data={SAMPLE_DAILY} dk="shares" color={C.amber} />
        </div>
      </div>

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

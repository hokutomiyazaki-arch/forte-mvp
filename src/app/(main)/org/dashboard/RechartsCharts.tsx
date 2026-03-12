'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  LineChart, Line,
} from 'recharts'

interface AnalyticsData {
  memberProofCounts?: { name: string; proof_count: number; photo_url?: string }[]
  strengthDistribution?: { label: string; count: number }[]
  recentComments?: { comment: string; created_at: string; professional_name: string; professional_photo?: string }[]
  monthlyTrend?: { month: string; count: number }[]
  dailyTrend?: { date: string; count: number }[]
  topProofItems?: { proof_id: string; label: string; strength_label: string; count: number }[]
  memberStrengths?: { professional_id: string; name: string; photo_url: string | null; total_proofs: number; top_proof_labels: string[]; top_strength?: string }[]
}

function MemberRanking({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        まだプルーフデータがありません
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        メンバー別プルーフ数
      </h4>
      <div style={{ width: '100%', height: Math.max(200, data.length * 40) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" />
            <XAxis type="number" tick={{ fill: '#888', fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#1A1A2E', fontSize: 12 }}
              width={75}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A2E', border: 'none',
                borderRadius: '8px', color: '#FAFAF7', fontSize: '13px',
              }}
              formatter={(value: number) => [`${value} プルーフ`, '']}
            />
            <Bar dataKey="proof_count" fill="#C4A35A" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function StrengthRadar({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        まだプルーフデータがありません
      </div>
    )
  }

  const chartData = data.map(d => ({
    ...d,
    displayLabel: d.label.length > 8 ? d.label.substring(0, 8) + '…' : d.label,
  }))

  // 3項目未満は横棒グラフ、3項目以上はレーダーチャート
  if (chartData.length < 3) {
    return (
      <div style={{ marginBottom: '32px' }}>
        <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          団体全体の強み分布
        </h4>
        <div style={{ width: '100%', height: Math.max(150, chartData.length * 50) }}>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="displayLabel" tick={{ fill: '#1A1A2E', fontSize: 12 }} width={75} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1A1A2E', border: 'none',
                  borderRadius: '8px', color: '#FAFAF7', fontSize: '13px',
                }}
                formatter={(value: number) => [`${value} 票`, '']}
              />
              <Bar dataKey="count" fill="#C4A35A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        団体全体の強み分布
      </h4>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <RadarChart data={chartData}>
            <PolarGrid stroke="#E5E5E0" />
            <PolarAngleAxis
              dataKey="displayLabel"
              tick={{ fill: '#1A1A2E', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A2E', border: 'none',
                borderRadius: '8px', color: '#FAFAF7', fontSize: '13px',
              }}
              formatter={(value: number) => [`${value} 票`, '']}
            />
            <Radar
              dataKey="count"
              stroke="#C4A35A"
              fill="#C4A35A"
              fillOpacity={0.3}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CommentFeed({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        まだコメントがありません
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        最新のクライアントコメント
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {data.map((item: any, i: number) => (
          <div
            key={i}
            style={{
              padding: '16px', borderRadius: '12px',
              backgroundColor: '#fff', border: '1px solid #E5E5E0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {item.professional_photo ? (
                <img src={item.professional_photo} alt=""
                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  backgroundColor: '#E5E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', color: '#888',
                }}>
                  {item.professional_name?.charAt(0) || '?'}
                </div>
              )}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A2E' }}>
                {item.professional_name}
              </span>
              <span style={{ fontSize: '11px', color: '#AAA', marginLeft: 'auto' }}>
                {new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p style={{ fontSize: '14px', color: '#333', lineHeight: '1.5', margin: 0 }}>
              「{item.comment}」
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthlyTrend({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        まだトレンドデータがありません
      </div>
    )
  }

  const chartData = data.map(d => ({
    ...d,
    displayMonth: `${parseInt(d.month.split('-')[1])}月`,
  }))

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        月別プルーフ推移
      </h4>
      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" />
            <XAxis dataKey="displayMonth" tick={{ fill: '#888', fontSize: 12 }} />
            <YAxis tick={{ fill: '#888', fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A2E', border: 'none',
                borderRadius: '8px', color: '#FAFAF7', fontSize: '13px',
              }}
              formatter={(value: number) => [`${value} プルーフ`, '']}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#C4A35A"
              strokeWidth={2}
              dot={{ fill: '#C4A35A', stroke: '#C4A35A', r: 4 }}
              activeDot={{ r: 6, fill: '#C4A35A' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function DailyTrend({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        日別データがありません
      </div>
    )
  }

  const chartData = data.map(d => ({
    ...d,
    displayDate: `${d.date.substring(5, 7)}/${d.date.substring(8, 10)}`,
  }))

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        日別プルーフ推移（直近30日）
      </h4>
      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" />
            <XAxis
              dataKey="displayDate"
              tick={{ fill: '#888', fontSize: 11 }}
              interval={4}
            />
            <YAxis tick={{ fill: '#888', fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A2E', border: 'none',
                borderRadius: '8px', color: '#FAFAF7', fontSize: '13px',
              }}
              labelFormatter={(label) => `${label}`}
              formatter={(value: number) => [`${value}票`, 'プルーフ']}
            />
            <Bar dataKey="count" fill="#C4A35A" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ProofRanking({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        まだプルーフデータがありません
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        強みランキング TOP{data.length}
      </h4>
      <div style={{ width: '100%', height: Math.max(200, data.length * 40) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" />
            <XAxis type="number" tick={{ fill: '#888', fontSize: 12 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="strength_label"
              tick={{ fill: '#1A1A2E', fontSize: 12 }}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1A2E', border: 'none',
                borderRadius: '8px', color: '#FAFAF7', fontSize: '13px',
              }}
              formatter={(value: any, name: any, props: any) => [
                `${props.payload.count}票`,
                props.payload.label
              ]}
            />
            <Bar dataKey="count" fill="#C4A35A" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function MemberStrengthsTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        まだメンバーデータがありません
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <h4 style={{ color: '#1A1A2E', fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        メンバー別 強み
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E5E5E0' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#888', fontWeight: 600 }}>名前</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>総プルーフ</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#888', fontWeight: 600 }}>主な強み</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m: any) => (
              <tr key={m.professional_id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {m.photo_url ? (
                      <img src={m.photo_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        backgroundColor: '#E5E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', color: '#888',
                      }}>
                        {m.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <span style={{ fontWeight: 600, color: '#1A1A2E', whiteSpace: 'nowrap' }}>{m.name}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center', padding: '10px 12px', color: '#C4A35A', fontWeight: 700 }}>
                  {m.total_proofs}票
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {m.top_strength ? (
                    <span style={{
                      fontSize: '12px', padding: '2px 10px', borderRadius: '12px',
                      backgroundColor: '#FFF8E7', color: '#C4A35A', fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {m.top_strength}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(m.top_proof_labels || []).map((label: string, i: number) => (
                        <span
                          key={i}
                          style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                            backgroundColor: '#FFF8E7', color: '#C4A35A', fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RechartsCharts({ analytics, strengthDistributionData }: { analytics: AnalyticsData | null; strengthDistributionData?: { label: string; count: number }[] }) {
  if (!analytics) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>
        分析データがありません。メンバーが追加されると表示されます。
      </div>
    )
  }

  return (
    <div>
      {/* KPIサマリーカード */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px', marginBottom: '24px',
      }}>
        <div style={{
          padding: '16px', borderRadius: '12px', backgroundColor: '#fff',
          border: '1px solid #E5E5E0', textAlign: 'center',
        }}>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#C4A35A', margin: 0 }}>
            {analytics.memberProofCounts?.reduce((sum, m) => sum + m.proof_count, 0) || 0}
          </p>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>総プルーフ数</p>
        </div>
        <div style={{
          padding: '16px', borderRadius: '12px', backgroundColor: '#fff',
          border: '1px solid #E5E5E0', textAlign: 'center',
        }}>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#C4A35A', margin: 0 }}>
            {analytics.memberProofCounts?.filter(m => m.proof_count > 0).length || 0}
          </p>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>評価済みメンバー</p>
        </div>
        <div style={{
          padding: '16px', borderRadius: '12px', backgroundColor: '#fff',
          border: '1px solid #E5E5E0', textAlign: 'center',
        }}>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#C4A35A', margin: 0 }}>
            {analytics.recentComments?.length || 0}
          </p>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>コメント数</p>
        </div>
      </div>

      {/* チャート */}
      <MemberRanking data={analytics.memberProofCounts || []} />
      <ProofRanking data={analytics.topProofItems || []} />
      <MemberStrengthsTable data={analytics.memberStrengths || []} />
      <StrengthRadar data={strengthDistributionData || analytics.strengthDistribution || []} />
      <MonthlyTrend data={analytics.monthlyTrend || []} />
      <DailyTrend data={analytics.dailyTrend || []} />
      <CommentFeed data={analytics.recentComments || []} />
    </div>
  )
}

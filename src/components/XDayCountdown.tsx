'use client'

interface XDayCountdownProps {
  proofVoteCount: number
  topStrengthLabel: string | null
  topStrengthVotes: number
}

const X_DAY = new Date('2026-06-30T00:00:00+09:00')

export default function XDayCountdown({ proofVoteCount, topStrengthLabel, topStrengthVotes }: XDayCountdownProps) {
  const now = new Date()
  if (now >= X_DAY) return null

  const diffMs = X_DAY.getTime() - now.getTime()
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const hasProof = proofVoteCount > 0 && topStrengthLabel !== null

  return (
    <div style={{
      border: '1px solid #C4A35A',
      background: '#1A1A2E',
      borderRadius: 12,
      padding: '24px 20px',
      marginBottom: 24,
      textAlign: 'center',
    }}>
      {/* タイトル */}
      <div style={{
        color: '#FAFAF7',
        fontSize: 14,
        fontWeight: 500,
        marginBottom: 16,
      }}>
        35,000人への公開まで
      </div>

      {/* 残り日数 */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        marginBottom: 20,
      }}>
        <span style={{
          color: '#C4A35A',
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1,
        }}>
          {daysLeft}
        </span>
        <span style={{
          color: '#C4A35A',
          fontSize: 18,
          fontWeight: 500,
          marginLeft: 4,
        }}>
          日
        </span>
      </div>

      {/* 強み表示 or ゼロ状態 */}
      {hasProof ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            color: 'rgba(250,250,247,0.7)',
            fontSize: 13,
            marginBottom: 4,
          }}>
            あなたの一番の強み:
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            <span style={{
              color: '#C4A35A',
              fontSize: 18,
              fontWeight: 700,
            }}>
              {topStrengthLabel}
            </span>
            <span style={{
              color: '#FAFAF7',
              fontSize: 18,
              fontWeight: 700,
            }}>
              {topStrengthVotes}票
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          color: 'rgba(250,250,247,0.5)',
          fontSize: 14,
          marginBottom: 16,
          textAlign: 'center',
        }}>
          まだ強みの証明がありません
        </div>
      )}

      {/* サブコピー */}
      <div style={{
        color: 'rgba(250,250,247,0.5)',
        fontSize: 12,
      }}>
        その日の数字が、第一印象になります。
      </div>
    </div>
  )
}

/**
 * §2-10 末尾「将来の拡張メモ」対応: フィー分配を「参加者リストを回して配る」形の
 * 純関数として先出しで実装しておく。Phase 1 では呼び出し箇所ゼロ(未使用)。
 *
 * 将来 referral_bookings.fee_sender_bps / fee_platform_bps を
 * booking_participants(booking_id / pro_id / role / share_bps) へ外出しした際も、
 * 参加者が2人でも4人でも同じこの関数で分配できる形にしておく。
 *
 * 端数処理: shareBps 比率で切り捨てた後、余った端数は受け手(role: 'receiver')へ寄せる。
 * 受け手が participants に含まれない場合は先頭の参加者へ寄せる。
 * 戻り値の amountJpy の合計は必ず totalJpy と一致する。
 */

export interface FeeParticipant {
  proId: string
  role: 'receiver' | 'sender' | 'platform'
  /** basis points（10000 = 100%）。participants間の合計が10000である必要はない(相対比率で按分)。 */
  shareBps: number
}

export interface FeeDistributionResult {
  proId: string
  role: string
  amountJpy: number
}

export function computeFeeDistribution(
  totalJpy: number,
  participants: FeeParticipant[]
): FeeDistributionResult[] {
  if (!Number.isFinite(totalJpy) || totalJpy <= 0 || participants.length === 0) {
    return []
  }

  const totalBps = participants.reduce((sum, p) => sum + (p.shareBps > 0 ? p.shareBps : 0), 0)
  if (totalBps <= 0) {
    return participants.map((p) => ({ proId: p.proId, role: p.role, amountJpy: 0 }))
  }

  const flooredAmounts = participants.map((p) => {
    const share = p.shareBps > 0 ? p.shareBps : 0
    return Math.floor((totalJpy * share) / totalBps)
  })

  const allocated = flooredAmounts.reduce((sum, amount) => sum + amount, 0)
  const remainder = totalJpy - allocated

  const result: FeeDistributionResult[] = participants.map((p, i) => ({
    proId: p.proId,
    role: p.role,
    amountJpy: flooredAmounts[i],
  }))

  const receiverIndex = participants.findIndex((p) => p.role === 'receiver')
  const targetIndex = receiverIndex >= 0 ? receiverIndex : 0
  result[targetIndex].amountJpy += remainder

  return result
}

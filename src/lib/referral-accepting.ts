/**
 * §2-2 受け入れステータス（先行テストのフィードバックにより2値+3色表示に再設計）。
 *
 * DBの `professionals.accepting_status` CHECK制約は 'open'|'conditional'|'closed' のまま
 * 変更しない（実データ0件のため移行不要・DDL変更もしない）。ただしアプリ側の書き込み・判定は
 * open/closed の2値のみを前提とする。想定外の値（旧conditional等）はclosed扱いにフォールバックする
 * (fail safe)。
 *
 * 3色インジケータの導出ロジックはここに集約し、ダッシュボード・公開カード・/r/候補・
 * プロ向け検索の全箇所で同じ関数を使う（同じ判定ロジックを2箇所に書かない）。
 */

export type ReferralSignal = 'open' | 'delegate' | 'closed'

export function isAcceptingOpen(status: string | null | undefined): boolean {
  return status === 'open'
}

/**
 * 🟢 受付中(open) / 🟡 停止中・代理リストで案内(closed+delegate_list_id) / 🔴 停止中(closed)
 */
export function computeReferralSignal(
  status: string | null | undefined,
  delegateListId: string | null | undefined
): ReferralSignal {
  if (isAcceptingOpen(status)) return 'open'
  return delegateListId ? 'delegate' : 'closed'
}

export const REFERRAL_SIGNAL_COLOR: Record<ReferralSignal, string> = {
  open: '#2E7D32',
  delegate: '#B8860B',
  closed: '#B00020',
}

export const REFERRAL_SIGNAL_DOT: Record<ReferralSignal, string> = {
  open: '🟢',
  delegate: '🟡',
  closed: '🔴',
}

export const REFERRAL_SIGNAL_LABEL: Record<ReferralSignal, string> = {
  open: '受付中',
  delegate: '停止中（代理リストで案内中）',
  closed: '停止中',
}

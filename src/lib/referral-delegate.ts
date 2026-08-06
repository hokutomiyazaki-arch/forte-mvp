/**
 * §2-2改訂（CEO決定・空約束の防止）: 🟡点灯条件の厳格化。
 *
 * 「delegate_list_id が設定されている」だけでは🟡の根拠にならない。
 * そのリストに consent_status='approved' かつ受付中(accepting_status IS NULL または
 * 'closed'以外 かつ deactivated_at IS NULL・fail-open)のメンバーが1名以上いる場合のみ、
 * そのリストIDを「有効な代理リスト」とみなす。
 *
 * サーバー専用(service_role)ヘルパー。src/lib/referral-accepting.ts の純関数
 * (computeReferralSignal 等)はクライアントからも import されるため、
 * このDB問い合わせロジックを絶対に混ぜない。
 *
 * 呼び出し側は「渡したいリストIDの集合」→「有効だったリストIDの集合(Set)」を受け取り、
 * computeReferralSignal の第2引数(hasValidDelegate: boolean)を自分で導出する。
 */

import { getSupabaseAdmin } from '@/lib/supabase'

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

export async function getValidDelegateListIds(
  supabase: SupabaseAdmin,
  listIds: Array<string | null | undefined>
): Promise<Set<string>> {
  const ids = Array.from(new Set(listIds.filter((id): id is string => !!id)))
  if (ids.length === 0) return new Set()

  // 1000行キャップについて: 呼び出し側は共有可能(link/public)リストのIDのみを渡す運用
  // （accepting PATCH が private を代理指定不可にしており、lists API も private を除外）。
  // 共有リストのピンは approved 込みで最大3件/リストのため、1000行に達しない前提。
  // この前提が崩れる呼び出し方を追加する場合は .range() ページネーションを入れること。
  const { data: items, error: itemsError } = await supabase
    .from('referral_list_items')
    .select('list_id, pro_id')
    .in('list_id', ids)
    .eq('consent_status', 'approved')

  if (itemsError) {
    console.error('[getValidDelegateListIds] items error:', itemsError)
    return new Set()
  }
  const rows = (items || []) as Array<{ list_id: string; pro_id: string }>
  if (rows.length === 0) return new Set()

  const proIds = Array.from(new Set(rows.map((r) => r.pro_id)))
  // §2-2改訂(先行テスト第3弾・fail-open): NULL(未設定)も受付中として扱う。closedのみ除外。
  // §16-18追記: 'conditional'(紹介のみ停止)もisAcceptingOpenと同じ判定基準で除外する。
  const { data: openPros, error: prosError } = await supabase
    .from('professionals')
    .select('id')
    .in('id', proIds)
    .or('accepting_status.is.null,and(accepting_status.neq.closed,accepting_status.neq.conditional)')
    .is('deactivated_at', null)

  if (prosError) {
    console.error('[getValidDelegateListIds] professionals error:', prosError)
    return new Set()
  }

  const openProIdSet = new Set(((openPros || []) as Array<{ id: string }>).map((p) => p.id))
  const validListIds = new Set<string>()
  for (const row of rows) {
    if (openProIdSet.has(row.pro_id)) validListIds.add(row.list_id)
  }
  return validListIds
}

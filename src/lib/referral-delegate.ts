/**
 * §2-2改訂（CEO決定・空約束の防止）: 🟡点灯条件の厳格化。
 *
 * 「delegate_list_id が設定されている」だけでは🟡の根拠にならない。
 * そのリストに consent_status='approved' かつ受付中(accepting_status='open' かつ
 * deactivated_at IS NULL)のメンバーが1名以上いる場合のみ、そのリストIDを「有効な代理リスト」とみなす。
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
  const { data: openPros, error: prosError } = await supabase
    .from('professionals')
    .select('id')
    .in('id', proIds)
    .eq('accepting_status', 'open')
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

/**
 * 団体の founder/instructor 判定（共通ヘルパー）。
 *
 * 元は src/lib/card-data.ts の getGrowthCards 内にインライン実装されていたロジックを
 * 切り出したもの。§16-8/§16-14（代理案内の設定UI・founder/instructor限定）からも
 * 同じ判定を使うため、二重実装を避けて共通化する（CLAUDE.md 設計規律）。
 *
 * founder: organizations.owner_id === professionals.user_id（団体を作れば自動判定）
 * instructor: org_members.growth_role='instructor' かつ status='active' かつ removed_at IS NULL
 * 同一団体で両方に該当する場合は founder を優先（重複なし）。
 *
 * fail-soft必須: growth_role等のカラムが未作成の環境でも例外を投げず空配列を返す。
 */

import { getSupabaseAdmin } from '@/lib/supabase'

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

export interface OrgRole {
  organizationId: string
  organizationName: string
  organizationType: string | null
  role: 'founder' | 'instructor'
}

export async function getFounderInstructorOrgs(
  supabase: SupabaseAdmin,
  proId: string,
  proUserId: string | null
): Promise<OrgRole[]> {
  try {
    const byOrg = new Map<string, OrgRole>()

    // (a) founder: organizations.owner_id が自分のClerk user_idと一致する団体を自動判定
    if (proUserId) {
      const { data: ownedOrgs } = await supabase
        .from('organizations')
        .select('id, name, type')
        .eq('owner_id', proUserId)
      for (const org of (ownedOrgs || []) as Array<{ id: string; name: string; type: string | null }>) {
        if (!org?.id) continue
        byOrg.set(org.id, {
          organizationId: org.id,
          organizationName: org.name,
          organizationType: org.type ?? null,
          role: 'founder',
        })
      }
    }

    // (b) instructor: org_members.growth_role='instructor' の手動指定
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRows } = await (supabase as any)
      .from('org_members')
      .select('organization_id, growth_role, organizations(id, name, type)')
      .eq('professional_id', proId)
      .eq('status', 'active')
      .is('removed_at', null)
      .eq('growth_role', 'instructor')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (roleRows || []) as any[]) {
      const org = row.organizations
      if (!org?.id) continue
      // founder が既にあれば instructor で上書きしない(founder優先・重複表示防止)
      if (byOrg.has(org.id)) continue
      byOrg.set(org.id, {
        organizationId: org.id,
        organizationName: org.name,
        organizationType: org.type ?? null,
        role: 'instructor',
      })
    }

    return Array.from(byOrg.values())
  } catch (e) {
    // fail-soft: growth_role等未作成の環境でも呼び出し元を落とさない
    console.error('getFounderInstructorOrgs error (fail-soft, returning []):', e)
    return []
  }
}

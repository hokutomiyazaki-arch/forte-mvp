import { getSupabaseAdmin } from '@/lib/supabase'

export type KeywordSourceType = 'voice' | 'vote_comment' | 'profile_method'

type KeywordRow = {
  id: string
  name: string
  category: 'concern' | 'goal' | 'posture' | 'target' | 'method'
  synonyms: string[] | null
}

type VoiceKeywordInsert = {
  professional_id: string
  keyword_id: string
  source_type: KeywordSourceType
  source_id: string
}

export async function matchKeywordsAndStore(
  proId: string,
  text: string | null | undefined,
  sourceType: KeywordSourceType,
  sourceId: string
): Promise<void> {
  if (!text || text.trim().length === 0) return

  const supabase = getSupabaseAdmin()

  const { data: keywords, error: kwErr } = await supabase
    .from('keywords')
    .select('id, name, category, synonyms')
    .eq('is_active', true)

  if (kwErr) {
    console.error('[keyword-matcher] failed to load keywords:', kwErr)
    return
  }
  if (!keywords || keywords.length === 0) return

  const matches: VoiceKeywordInsert[] = []

  for (const kw of keywords as KeywordRow[]) {
    if (sourceType === 'profile_method' && kw.category !== 'method') {
      continue
    }

    const allTerms = [kw.name, ...(kw.synonyms || [])]
    const matched = allTerms.some((term) => term.length > 0 && text.includes(term))

    if (matched) {
      matches.push({
        professional_id: proId,
        keyword_id: kw.id,
        source_type: sourceType,
        source_id: sourceId,
      })
    }
  }

  if (matches.length === 0) return

  const { error: upsertErr } = await supabase
    .from('voice_keywords')
    .upsert(matches, {
      onConflict: 'professional_id,keyword_id,source_type,source_id',
      ignoreDuplicates: true,
    })

  if (upsertErr) {
    console.error('[keyword-matcher] upsert error:', upsertErr)
  }
}

export async function deleteKeywordMatches(
  sourceType: KeywordSourceType,
  sourceId: string
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('voice_keywords')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)

  if (error) {
    console.error('[keyword-matcher] delete error:', error)
  }
}

// proof_id / personality_id → 表示ラベル変換ユーティリティ
// vote_summary と personality_summary の生データをラベル付きに変換する

interface RawVoteSummary {
  professional_id: string
  proof_id: string
  vote_count: number
}

interface RawPersonalitySummary {
  professional_id: string
  personality_id: string
  vote_count: number
}

interface LabeledSummary {
  professional_id: string
  category: string
  vote_count: number
}

interface ProofItem {
  id: string
  label: string
}

interface PersonalityItem {
  id: string
  label: string
}

interface CustomProof {
  id: string
  label: string
}

/**
 * vote_summary の proof_id を表示ラベルに変換
 * - UUID → proof_items.label
 * - custom_xxx → customProofs の label
 * - 見つからない → proof_id をそのまま表示
 */
export function resolveProofLabels(
  rawVotes: RawVoteSummary[],
  proofItems: ProofItem[],
  customProofs: CustomProof[],
): LabeledSummary[] {
  const proofMap = new Map<string, string>()
  for (const item of proofItems) {
    proofMap.set(item.id, item.label)
  }

  const customMap = new Map<string, string>()
  for (const cp of customProofs) {
    if (cp.label.trim()) {
      customMap.set(cp.id, cp.label)
    }
  }

  return rawVotes.map(v => ({
    professional_id: v.professional_id,
    category: proofMap.get(v.proof_id) || customMap.get(v.proof_id) || '-',
    vote_count: v.vote_count,
  }))
}

/**
 * personality_summary の personality_id を表示ラベルに変換
 * - UUID → personality_items.personality_label
 * - 見つからない → personality_id をそのまま表示
 */
export function resolvePersonalityLabels(
  rawPersonality: RawPersonalitySummary[],
  personalityItems: PersonalityItem[],
): LabeledSummary[] {
  const personalityMap = new Map<string, string>()
  for (const item of personalityItems) {
    personalityMap.set(item.id, item.label)
  }

  return rawPersonality.map(v => ({
    professional_id: v.professional_id,
    category: personalityMap.get(v.personality_id) || '-',
    vote_count: v.vote_count,
  }))
}

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyChain } from '@/lib/proof-chain'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    // ⚠️ Supabase JS のデフォルト 1000 行上限を回避するため .range() で全 proof 票を取得する。
    //    順序は migrate と一致させる必要があるため created_at ASC + id ASC の複合キーで取得。
    //    各ページは同一の全順序で並ぶため、from を順送りした連結結果は全体として整列済みになる。
    const PAGE = 1000
    const votes: Array<{
      id: string
      voter_email: string
      normalized_email: string | null
      professional_id: string
      vote_type: string
      selected_proof_ids: string[] | null
      comment: string | null
      created_at: string
      proof_nonce: string
      proof_hash: string
      prev_hash: string
    }> = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('votes')
        .select(
          'id, voter_email, normalized_email, professional_id, vote_type, selected_proof_ids, comment, created_at, proof_nonce, proof_hash, prev_hash'
        )
        .eq('vote_type', 'proof')
        .not('proof_hash', 'is', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)

      if (error) throw error
      if (!data || data.length === 0) break
      votes.push(...(data as typeof votes))
      if (data.length < PAGE) break
    }

    if (!votes || votes.length === 0) {
      return NextResponse.json({
        totalProofs: 0,
        verified: true,
        message: 'No proofs with hash chain found',
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const fixedVotes = votes.map(v => ({
      ...v,
      voter_email: v.normalized_email || v.voter_email
    }))
    const result = verifyChain(fixedVotes)

    return NextResponse.json({
      totalProofs: votes.length,
      verified: result.valid,
      brokenAt: result.brokenAt ?? null,
      formats: result.formats,
      firstProofDate: votes[0].created_at,
      lastProofDate: votes[votes.length - 1].created_at,
      message: result.valid
        ? `All ${votes.length} proofs are cryptographically verified ✓`
        : `Chain integrity broken at proof #${result.brokenAt! + 1}`,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Verification failed', detail: message },
      { status: 500 }
    )
  }
}

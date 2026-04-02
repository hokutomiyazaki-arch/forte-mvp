import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyChain } from '@/lib/proof-chain'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: votes, error } = await supabase
      .from('votes')
      .select(
        'voter_email, normalized_email, professional_id, vote_type, selected_proof_ids, comment, created_at, proof_nonce, proof_hash, prev_hash'
      )
      .eq('vote_type', 'proof')
      .not('proof_hash', 'is', null)
      .order('created_at', { ascending: true })

    if (error) throw error

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

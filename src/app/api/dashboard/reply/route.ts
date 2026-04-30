import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const REPLY_MAX = 200

type ReplyErrorCode =
  | 'VOTE_NOT_FOUND'
  | 'NOT_OWNER'
  | 'NO_COMMENT'
  | 'ALREADY_REPLIED'
  | 'INVALID_LENGTH'
  | 'REPLY_NOT_FOUND'
  | 'DELETED'

function errorJson(message: string, code: ReplyErrorCode, status: number) {
  return NextResponse.json({ error: message, code }, { status })
}

function validateReplyText(raw: unknown): { ok: true; text: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false }
  const text = raw.trim()
  if (text.length === 0 || text.length > REPLY_MAX) return { ok: false }
  return { ok: true, text }
}

async function getOwnedProfessional(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data: pro, error } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .is('deactivated_at', null)
    .maybeSingle()
  if (error) throw error
  return pro
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const voteId = body?.vote_id
    if (typeof voteId !== 'string' || voteId.length === 0) {
      return errorJson('vote_id is required', 'VOTE_NOT_FOUND', 400)
    }
    const validated = validateReplyText(body?.reply_text)
    if (!validated.ok) {
      return errorJson('reply_text must be 1-200 chars', 'INVALID_LENGTH', 400)
    }

    const supabase = getSupabaseAdmin()
    const pro = await getOwnedProfessional(userId)
    if (!pro) {
      return errorJson('Professional not found', 'NOT_OWNER', 403)
    }

    const { data: vote, error: voteErr } = await supabase
      .from('votes')
      .select('id, professional_id, comment')
      .eq('id', voteId)
      .maybeSingle()
    if (voteErr) throw voteErr
    if (!vote) return errorJson('Vote not found', 'VOTE_NOT_FOUND', 404)
    if (vote.professional_id !== pro.id) {
      return errorJson('Not the owner of this vote', 'NOT_OWNER', 403)
    }
    if (!vote.comment || vote.comment.trim().length === 0) {
      return errorJson('This vote has no comment', 'NO_COMMENT', 400)
    }

    const { data: existing, error: existErr } = await supabase
      .from('vote_replies')
      .select('id, is_deleted')
      .eq('vote_id', voteId)
      .maybeSingle()
    if (existErr) throw existErr
    if (existing) {
      return errorJson('Reply already exists for this vote', 'ALREADY_REPLIED', 409)
    }

    const { data: inserted, error: insErr } = await supabase
      .from('vote_replies')
      .insert({
        vote_id: voteId,
        professional_id: pro.id,
        reply_text: validated.text,
      })
      .select('id, vote_id, reply_text, created_at, updated_at, delivered_at, delivered_via')
      .maybeSingle()
    if (insErr) throw insErr
    if (!inserted) {
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json(inserted)
  } catch (err) {
    console.error('[api/dashboard/reply POST] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const replyId = body?.reply_id
    if (typeof replyId !== 'string' || replyId.length === 0) {
      return errorJson('reply_id is required', 'REPLY_NOT_FOUND', 400)
    }
    const validated = validateReplyText(body?.reply_text)
    if (!validated.ok) {
      return errorJson('reply_text must be 1-200 chars', 'INVALID_LENGTH', 400)
    }

    const supabase = getSupabaseAdmin()
    const pro = await getOwnedProfessional(userId)
    if (!pro) {
      return errorJson('Professional not found', 'NOT_OWNER', 403)
    }

    const { data: reply, error: replyErr } = await supabase
      .from('vote_replies')
      .select('id, professional_id, is_deleted')
      .eq('id', replyId)
      .maybeSingle()
    if (replyErr) throw replyErr
    if (!reply) return errorJson('Reply not found', 'REPLY_NOT_FOUND', 404)
    if (reply.professional_id !== pro.id) {
      return errorJson('Not the owner of this reply', 'NOT_OWNER', 403)
    }
    if (reply.is_deleted) {
      return errorJson('Reply is deleted', 'DELETED', 410)
    }

    // サイレント編集: delivered_at は触らない
    const { data: updated, error: updErr } = await supabase
      .from('vote_replies')
      .update({
        reply_text: validated.text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', replyId)
      .select('id, vote_id, reply_text, created_at, updated_at, delivered_at, delivered_via')
      .maybeSingle()
    if (updErr) throw updErr
    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[api/dashboard/reply PATCH] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const replyId = body?.reply_id
    if (typeof replyId !== 'string' || replyId.length === 0) {
      return errorJson('reply_id is required', 'REPLY_NOT_FOUND', 400)
    }

    const supabase = getSupabaseAdmin()
    const pro = await getOwnedProfessional(userId)
    if (!pro) {
      return errorJson('Professional not found', 'NOT_OWNER', 403)
    }

    const { data: reply, error: replyErr } = await supabase
      .from('vote_replies')
      .select('id, professional_id, is_deleted')
      .eq('id', replyId)
      .maybeSingle()
    if (replyErr) throw replyErr
    if (!reply) return errorJson('Reply not found', 'REPLY_NOT_FOUND', 404)
    if (reply.professional_id !== pro.id) {
      return errorJson('Not the owner of this reply', 'NOT_OWNER', 403)
    }

    const { error: updErr } = await supabase
      .from('vote_replies')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', replyId)
    if (updErr) throw updErr

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/dashboard/reply DELETE] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * General-purpose Supabase query proxy for client components.
 * Since the Supabase client now uses service_role key (server-only),
 * client components must use this API route for all DB operations.
 *
 * POST /api/db
 * Body: { action, table, query }
 *
 * action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc'
 * table: string (table name)
 * query: object with query parameters
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()

  try {
    const body = await req.json()
    const { action, table, query } = body

    if (!action || !table) {
      return NextResponse.json({ error: 'Missing action or table' }, { status: 400 })
    }

    let result: any

    switch (action) {
      case 'select': {
        let q = supabase.from(table).select(query.select || '*', query.options || {})
        if (query.eq) for (const [k, v] of Object.entries(query.eq)) q = q.eq(k, v)
        if (query.neq) for (const [k, v] of Object.entries(query.neq)) q = q.neq(k, v)
        if (query.in) for (const [k, v] of Object.entries(query.in)) q = (q as any).in(k, v)
        if (query.not) for (const item of query.not) q = q.not(item.column, item.operator, item.value)
        if (query.is) for (const [k, v] of Object.entries(query.is)) q = q.is(k, v as any)
        if (query.contains) for (const [k, v] of Object.entries(query.contains)) q = q.contains(k, v as any)
        if (query.gte) for (const [k, v] of Object.entries(query.gte)) q = q.gte(k, v as any)
        if (query.lte) for (const [k, v] of Object.entries(query.lte)) q = q.lte(k, v as any)
        if (query.like) for (const [k, v] of Object.entries(query.like)) q = q.like(k, v as string)
        if (query.ilike) for (const [k, v] of Object.entries(query.ilike)) q = q.ilike(k, v as string)
        if (query.order) q = q.order(query.order.column, query.order.options || {})
        if (query.limit) q = q.limit(query.limit)
        if (query.maybeSingle) q = (q as any).maybeSingle()
        result = await q
        break
      }

      case 'insert': {
        let q = supabase.from(table).insert(query.data)
        if (query.select) q = (q as any).select(query.select)
        if (query.maybeSingle) q = (q as any).maybeSingle()
        result = await q
        break
      }

      case 'update': {
        let q = supabase.from(table).update(query.data)
        if (query.eq) for (const [k, v] of Object.entries(query.eq)) q = q.eq(k, v as any)
        if (query.select) q = (q as any).select(query.select)
        if (query.maybeSingle) q = (q as any).maybeSingle()
        result = await q
        break
      }

      case 'upsert': {
        let q = (supabase.from(table) as any).upsert(query.data, query.options || {})
        if (query.select) q = q.select(query.select)
        if (query.maybeSingle) q = q.maybeSingle()
        result = await q
        break
      }

      case 'delete': {
        let q = supabase.from(table).delete()
        if (query.eq) for (const [k, v] of Object.entries(query.eq)) q = q.eq(k, v as any)
        result = await q
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message, code: result.error.code, details: result.error.details }, { status: 400 })
    }

    return NextResponse.json({ data: result.data, count: result.count })
  } catch (err: any) {
    console.error('[db-proxy] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

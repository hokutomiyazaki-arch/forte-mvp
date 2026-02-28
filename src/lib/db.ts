/**
 * Client-side database helper.
 * Proxies all Supabase queries through /api/db to avoid exposing service_role key.
 */

interface DbQuery {
  select?: string
  options?: Record<string, any>
  eq?: Record<string, any>
  neq?: Record<string, any>
  in?: Record<string, any[]>
  not?: { column: string; operator: string; value: any }[]
  is?: Record<string, any>
  contains?: Record<string, any>
  gte?: Record<string, any>
  lte?: Record<string, any>
  like?: Record<string, string>
  ilike?: Record<string, string>
  order?: { column: string; options?: Record<string, any> }
  limit?: number
  maybeSingle?: boolean
  data?: any
}

interface DbResult<T = any> {
  data: T | null
  error: { message: string; code?: string; details?: string } | null
  count?: number | null
}

async function dbFetch(action: string, table: string, query: DbQuery): Promise<DbResult> {
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, table, query }),
    })

    const result = await res.json()

    if (!res.ok) {
      return { data: null, error: { message: result.error || 'Request failed', code: result.code, details: result.details } }
    }

    return { data: result.data, error: null, count: result.count }
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error' } }
  }
}

export const db = {
  select: (table: string, query: DbQuery = {}): Promise<DbResult> =>
    dbFetch('select', table, query),

  insert: (table: string, data: any, opts?: { select?: string; maybeSingle?: boolean }): Promise<DbResult> =>
    dbFetch('insert', table, { data, ...opts }),

  update: (table: string, data: any, eq: Record<string, any>, opts?: { select?: string; maybeSingle?: boolean }): Promise<DbResult> =>
    dbFetch('update', table, { data, eq, ...opts }),

  upsert: (table: string, data: any, options?: Record<string, any>, opts?: { select?: string; maybeSingle?: boolean }): Promise<DbResult> =>
    dbFetch('upsert', table, { data, options, ...opts }),

  delete: (table: string, eq: Record<string, any>): Promise<DbResult> =>
    dbFetch('delete', table, { eq }),
}

/**
 * Upload a file to Supabase Storage via /api/storage.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean }
): Promise<{ publicUrl?: string; error?: string }> {
  try {
    const formData = new FormData()
    formData.append('bucket', bucket)
    formData.append('path', path)
    formData.append('file', file)
    if (options?.upsert) formData.append('upsert', 'true')

    const res = await fetch('/api/storage', {
      method: 'POST',
      body: formData,
    })

    const result = await res.json()

    if (!res.ok) {
      return { error: result.error || 'Upload failed' }
    }

    return { publicUrl: result.publicUrl }
  } catch (err: any) {
    return { error: err.message || 'Network error' }
  }
}

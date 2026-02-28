/**
 * Client-side Supabase proxy.
 * Provides the same chaining API as @supabase/supabase-js but
 * proxies all queries through /api/db to avoid exposing service_role key.
 *
 * Usage: import { createClientComponentClient } from '@/lib/supabase-client'
 * const supabase = createClientComponentClient()
 * const { data } = await supabase.from('table').select('*').eq('id', 1).maybeSingle()
 */

class StorageBucketProxy {
  constructor(private bucket: string) {}

  async upload(path: string, file: File | Blob, options?: { cacheControl?: string; upsert?: boolean }) {
    const formData = new FormData()
    formData.append('bucket', this.bucket)
    formData.append('path', path)
    formData.append('file', file)
    if (options?.upsert) formData.append('upsert', 'true')

    const res = await fetch('/api/storage', { method: 'POST', body: formData })
    const result = await res.json()

    if (!res.ok) {
      return { data: null, error: { message: result.error || 'Upload failed' } }
    }
    return { data: { path }, error: null }
  }

  getPublicUrl(path: string) {
    // Construct public URL from known supabase URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    return {
      data: { publicUrl: `${supabaseUrl}/storage/v1/object/public/${this.bucket}/${path}` }
    }
  }
}

class StorageProxy {
  from(bucket: string) {
    return new StorageBucketProxy(bucket)
  }
}

interface QueryState {
  table: string
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  selectCols?: string
  selectOptions?: any
  data?: any
  upsertOptions?: any
  filters: {
    eq?: Record<string, any>
    neq?: Record<string, any>
    inFilter?: Record<string, any[]>
    not?: { column: string; operator: string; value: any }[]
    is?: Record<string, any>
    contains?: Record<string, any>
    gte?: Record<string, any>
    lte?: Record<string, any>
    like?: Record<string, string>
    ilike?: Record<string, string>
  }
  orderCol?: string
  orderOpts?: any
  limitVal?: number
  isMaybeSingle?: boolean
  returnSelect?: string
}

class QueryBuilder {
  private state: QueryState

  constructor(table: string, action: 'select' | 'insert' | 'update' | 'upsert' | 'delete', data?: any, opts?: any) {
    this.state = {
      table,
      action,
      data,
      upsertOptions: action === 'upsert' ? opts : undefined,
      filters: {},
    }
  }

  select(cols?: string, options?: any) {
    if (this.state.action === 'select') {
      this.state.selectCols = cols || '*'
      this.state.selectOptions = options
    } else {
      // .select() after insert/update/upsert means we want data back
      this.state.returnSelect = cols || '*'
    }
    return this
  }

  eq(column: string, value: any) {
    if (!this.state.filters.eq) this.state.filters.eq = {}
    this.state.filters.eq[column] = value
    return this
  }

  neq(column: string, value: any) {
    if (!this.state.filters.neq) this.state.filters.neq = {}
    this.state.filters.neq[column] = value
    return this
  }

  in(column: string, values: any[]) {
    if (!this.state.filters.inFilter) this.state.filters.inFilter = {}
    this.state.filters.inFilter[column] = values
    return this
  }

  not(column: string, operator: string, value: any) {
    if (!this.state.filters.not) this.state.filters.not = []
    this.state.filters.not.push({ column, operator, value })
    return this
  }

  is(column: string, value: any) {
    if (!this.state.filters.is) this.state.filters.is = {}
    this.state.filters.is[column] = value
    return this
  }

  contains(column: string, value: any) {
    if (!this.state.filters.contains) this.state.filters.contains = {}
    this.state.filters.contains[column] = value
    return this
  }

  gte(column: string, value: any) {
    if (!this.state.filters.gte) this.state.filters.gte = {}
    this.state.filters.gte[column] = value
    return this
  }

  lte(column: string, value: any) {
    if (!this.state.filters.lte) this.state.filters.lte = {}
    this.state.filters.lte[column] = value
    return this
  }

  like(column: string, value: string) {
    if (!this.state.filters.like) this.state.filters.like = {}
    this.state.filters.like[column] = value
    return this
  }

  ilike(column: string, value: string) {
    if (!this.state.filters.ilike) this.state.filters.ilike = {}
    this.state.filters.ilike[column] = value
    return this
  }

  order(column: string, options?: any) {
    this.state.orderCol = column
    this.state.orderOpts = options
    return this
  }

  limit(count: number) {
    this.state.limitVal = count
    return this
  }

  maybeSingle() {
    this.state.isMaybeSingle = true
    return this
  }

  // single() alias -> maybeSingle() per project rules
  single() {
    return this.maybeSingle()
  }

  async then(resolve: (value: any) => void, reject?: (reason: any) => void) {
    try {
      const result = await this.execute()
      resolve(result)
    } catch (err) {
      if (reject) reject(err)
      else resolve({ data: null, error: { message: String(err) }, count: null })
    }
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    const { state } = this
    const query: any = {}

    // Build query object
    if (state.action === 'select') {
      query.select = state.selectCols || '*'
      if (state.selectOptions) query.options = state.selectOptions
    } else if (state.action === 'insert') {
      query.data = state.data
      if (state.returnSelect) query.select = state.returnSelect
    } else if (state.action === 'update') {
      query.data = state.data
      if (state.returnSelect) query.select = state.returnSelect
    } else if (state.action === 'upsert') {
      query.data = state.data
      if (state.upsertOptions) query.options = state.upsertOptions
      if (state.returnSelect) query.select = state.returnSelect
    } else if (state.action === 'delete') {
      // nothing extra
    }

    // Add filters
    if (state.filters.eq && Object.keys(state.filters.eq).length > 0) query.eq = state.filters.eq
    if (state.filters.neq && Object.keys(state.filters.neq).length > 0) query.neq = state.filters.neq
    if (state.filters.inFilter && Object.keys(state.filters.inFilter).length > 0) query.in = state.filters.inFilter
    if (state.filters.not && state.filters.not.length > 0) query.not = state.filters.not
    if (state.filters.is && Object.keys(state.filters.is).length > 0) query.is = state.filters.is
    if (state.filters.contains && Object.keys(state.filters.contains).length > 0) query.contains = state.filters.contains
    if (state.filters.gte && Object.keys(state.filters.gte).length > 0) query.gte = state.filters.gte
    if (state.filters.lte && Object.keys(state.filters.lte).length > 0) query.lte = state.filters.lte
    if (state.filters.like && Object.keys(state.filters.like).length > 0) query.like = state.filters.like
    if (state.filters.ilike && Object.keys(state.filters.ilike).length > 0) query.ilike = state.filters.ilike

    if (state.orderCol) query.order = { column: state.orderCol, options: state.orderOpts }
    if (state.limitVal) query.limit = state.limitVal
    if (state.isMaybeSingle) query.maybeSingle = true

    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: state.action, table: state.table, query }),
      })

      const result = await res.json()

      if (!res.ok) {
        return { data: null, error: { message: result.error, code: result.code, details: result.details }, count: null }
      }

      return { data: result.data, error: null, count: result.count ?? null }
    } catch (err: any) {
      return { data: null, error: { message: err.message || 'Network error' }, count: null }
    }
  }
}

class TableBuilder {
  constructor(private table: string) {}

  select(cols?: string, options?: any) {
    const qb = new QueryBuilder(this.table, 'select')
    qb.select(cols, options)
    return qb
  }

  insert(data: any) {
    return new QueryBuilder(this.table, 'insert', data)
  }

  update(data: any) {
    return new QueryBuilder(this.table, 'update', data)
  }

  upsert(data: any, options?: any) {
    return new QueryBuilder(this.table, 'upsert', data, options)
  }

  delete() {
    return new QueryBuilder(this.table, 'delete')
  }
}

class ClientProxy {
  storage = new StorageProxy()

  // Stub auth object - Clerk handles auth now
  auth = {
    signUp: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
    signInWithOtp: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    updateUser: async () => ({ data: null, error: { message: 'Use Clerk for password management' } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    verifyOtp: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
  }

  from(table: string) {
    return new TableBuilder(table)
  }
}

/**
 * Creates a client-side Supabase proxy.
 * Drop-in replacement for createClient() in 'use client' components.
 * All queries are proxied through /api/db.
 */
export function createClientComponentClient() {
  return new ClientProxy()
}

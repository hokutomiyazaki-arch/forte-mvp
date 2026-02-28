import { createClient as supaCreateClient } from '@supabase/supabase-js'

// サーバーサイド専用のSupabaseクライアント
// service_role keyを使うので、RLSをバイパスする
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return supaCreateClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// 旧互換: 他ファイルでimportしてる場合のために残す
// サーバーサイドではservice_role keyを使う
// クライアントサイドでは /api/db プロキシを使う
export function createClient(): any {
  // クライアントサイド（ブラウザ）で呼ばれた場合はプロキシを返す
  if (typeof window !== 'undefined') {
    // Dynamic import to avoid bundling server code on client
    const { createClientComponentClient } = require('@/lib/supabase-client')
    return createClientComponentClient()
  }
  // サーバーサイドではそのままadminクライアントを返す
  return getSupabaseAdmin()
}

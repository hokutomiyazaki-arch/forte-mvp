import { createClient as supaCreateClient } from '@supabase/supabase-js'

let client: ReturnType<typeof supaCreateClient> | null = null

export function createClient() {
  if (client) return client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  client = supaCreateClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: false,  // LINE認証: サーバー側で作成したrefresh tokenをクライアント側で自動リフレッシュすると失敗→sb-*キー削除→セッション消失を防ぐ
      persistSession: true,
      detectSessionInUrl: true,
    }
  })
  return client
}

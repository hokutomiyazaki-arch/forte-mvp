import { createClient as supaCreateClient } from '@supabase/supabase-js'

let client: ReturnType<typeof supaCreateClient> | null = null

export function createClient() {
  if (client) return client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  client = supaCreateClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: true,  // Client-side signInWithPassword creates proper refresh tokens
      persistSession: true,
      detectSessionInUrl: true,
    }
  })
  return client
}

import { createClient as supaCreateClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let client: ReturnType<typeof supaCreateClient> | null = null

export function createClient() {
  if (client) return client
  client = supaCreateClient(supabaseUrl, supabaseAnonKey)
  return client
}

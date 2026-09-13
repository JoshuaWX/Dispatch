import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

export function getServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) {
    throw new Error('Database configuration is unavailable')
  }

  client ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'dispatch-server' } },
  })

  return client
}

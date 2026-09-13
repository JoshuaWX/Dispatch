import { createClient } from '@supabase/supabase-js'
import { FIXTURE_ARTICLE_ID } from './global-setup'
import { localSupabaseEnvironment } from './local-supabase'

export default async function globalTeardown() {
  const { url, serviceRoleKey } = localSupabaseEnvironment()
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  await db.from('dispatch_articles').delete().eq('id', FIXTURE_ARTICLE_ID)
}

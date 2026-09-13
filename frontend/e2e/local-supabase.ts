import { execFileSync } from 'node:child_process'

export function localSupabaseEnvironment() {
  const output = process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx supabase status -o env'], { encoding: 'utf8' })
    : execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const value = (name: string) => {
    const match = output.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, 'm'))
    if (!match) throw new Error(`Local Supabase did not provide ${name}`)
    return match[1]
  }
  return { url: value('API_URL'), serviceRoleKey: value('SERVICE_ROLE_KEY') }
}

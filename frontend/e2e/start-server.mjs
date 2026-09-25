import { execFileSync, spawn } from 'node:child_process'

const output = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx supabase status -o env'], { encoding: 'utf8' })
  : execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
const value = (name) => {
  const match = output.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, 'm'))
  if (!match) throw new Error(`Local Supabase did not provide ${name}`)
  return match[1]
}
const serverMode = process.env.DISPATCH_SERVER_MODE === 'production' ? 'start' : 'dev'
const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${serverMode} -- --hostname 127.0.0.1 --port 3100`], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SUPABASE_URL: value('API_URL'),
        SUPABASE_SERVICE_ROLE_KEY: value('SERVICE_ROLE_KEY'),
        PIPELINE_PUBLISHING_ENABLED: serverMode === 'dev' ? 'true' : 'false',
        AI_MONTHLY_BUDGET_USD: '1.00',
        DISPATCH_E2E_FIXTURES: 'true',
        SCHEDULER_SECRET: 'e2e-scheduler-secret',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
      },
    })
  : spawn('npm', ['run', serverMode, '--', '--hostname', '127.0.0.1', '--port', '3100'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_URL: value('API_URL'),
    SUPABASE_SERVICE_ROLE_KEY: value('SERVICE_ROLE_KEY'),
    PIPELINE_PUBLISHING_ENABLED: serverMode === 'dev' ? 'true' : 'false',
    AI_MONTHLY_BUDGET_USD: '1.00',
    DISPATCH_E2E_FIXTURES: 'true',
    SCHEDULER_SECRET: 'e2e-scheduler-secret',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
  },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code) => process.exit(code ?? 0))

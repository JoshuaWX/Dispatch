import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { chromium } from '@playwright/test'

const url = 'http://127.0.0.1:3100'
const requestedRuns = Number.parseInt(process.env.LIGHTHOUSE_RUNS ?? '3', 10)
const runs = Number.isFinite(requestedRuns) && requestedRuns > 0 ? requestedRuns : 3
const thresholds = {
  performance: 85,
  accessibility: 95,
  'best-practices': 95,
  seo: 95,
  'largest-contentful-paint': 2_500,
  'cumulative-layout-shift': 0.1,
  'total-blocking-time': 200,
}

const server = spawn(process.execPath, ['e2e/start-server.mjs'], {
  env: { ...process.env, DISPATCH_SERVER_MODE: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-8_000)
  })
}

async function waitForServer() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Dispatch server exited before Lighthouse started.\n${serverOutput}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Dispatch server was not ready within 60 seconds.\n${serverOutput}`)
}

async function reservePort() {
  const socket = createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const address = socket.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a Chrome debugging port')
  await new Promise((resolve) => socket.close(resolve))
  return address.port
}

async function waitForChrome(port) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Chromium did not expose its debugging endpoint within 30 seconds')
}

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

let chrome
try {
  await waitForServer()
  const samples = []
  let lastLhr
  for (let run = 0; run < runs; run += 1) {
    const chromePort = await reservePort()
    chrome = await chromium.launch({
      headless: true,
      args: [`--remote-debugging-port=${chromePort}`],
    })
    try {
      await waitForChrome(chromePort)
      const result = await lighthouse(url, {
        port: chromePort,
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      }, desktopConfig)
      if (!result) throw new Error(`Lighthouse run ${run + 1} returned no result`)
      lastLhr = result.lhr
      samples.push({
        performance: result.lhr.categories.performance.score * 100,
        accessibility: result.lhr.categories.accessibility.score * 100,
        'best-practices': result.lhr.categories['best-practices'].score * 100,
        seo: result.lhr.categories.seo.score * 100,
        'largest-contentful-paint': result.lhr.audits['largest-contentful-paint'].numericValue,
        'cumulative-layout-shift': result.lhr.audits['cumulative-layout-shift'].numericValue,
        'total-blocking-time': result.lhr.audits['total-blocking-time'].numericValue,
      })
    } finally {
      await chrome.close()
      chrome = undefined
    }
  }

  const results = Object.fromEntries(
    Object.keys(thresholds).map((metric) => [metric, median(samples.map((sample) => sample[metric]))]),
  )

  const failures = []
  for (const [metric, threshold] of Object.entries(thresholds)) {
    const value = results[metric]
    const isScore = ['performance', 'accessibility', 'best-practices', 'seo'].includes(metric)
    if (isScore ? value < threshold : value > threshold) {
      failures.push(`${metric}: ${value.toFixed(2)} (required ${isScore ? '>=' : '<='} ${threshold})`)
    }
  }

  process.stdout.write(`Lighthouse samples: ${JSON.stringify(samples)}\n`)
  process.stdout.write(`Lighthouse medians (${runs} runs): ${JSON.stringify(results)}\n`)
  if (failures.length > 0) {
    const lcpElement = lastLhr?.audits['largest-contentful-paint-element']?.details?.items?.[0]
      ?? lastLhr?.audits['lcp-breakdown-insight']?.details?.items?.[0]
    const serverResponse = lastLhr?.audits['server-response-time']?.numericValue
    const lcpAudits = Object.fromEntries(Object.entries(lastLhr?.audits ?? {})
      .filter(([id]) => id.includes('lcp') || id.includes('largest-contentful'))
      .map(([id, audit]) => [id, { numericValue: audit.numericValue, displayValue: audit.displayValue, score: audit.score }]))
    const failedAudits = Object.fromEntries(Object.values(lastLhr?.categories ?? {})
      .flatMap((category) => category.auditRefs)
      .filter((reference) => reference.weight > 0 && (lastLhr?.audits[reference.id]?.score ?? 1) < 1)
      .map((reference) => {
        const audit = lastLhr?.audits[reference.id]
        return [reference.id, {
          title: audit?.title, displayValue: audit?.displayValue, score: audit?.score,
          items: audit?.details?.items?.slice(0, 10),
        }]
      }))
    const longTasks = lastLhr?.audits['long-tasks']?.details?.items?.slice(0, 20)
    const mainThread = lastLhr?.audits['mainthread-work-breakdown']?.details?.items?.slice(0, 20)
    const bootup = lastLhr?.audits['bootup-time']?.details?.items?.slice(0, 20)
    const scripts = lastLhr?.audits['network-requests']?.details?.items
      ?.filter((item) => item.resourceType === 'Script')
      .map(({ url: scriptUrl, transferSize, resourceSize }) => ({ url: scriptUrl, transferSize, resourceSize }))
    process.stdout.write(`Lighthouse diagnostics: ${JSON.stringify({ serverResponse, lcpElement, lcpAudits, failedAudits, longTasks, mainThread, bootup, scripts })}\n`)
    throw new Error(`Lighthouse thresholds failed:\n${failures.join('\n')}`)
  }
} finally {
  if (chrome) await chrome.close()
  if (server.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      server.kill('SIGTERM')
    }
  }
}

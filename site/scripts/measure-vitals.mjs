/**
 * Medição reproduzível de LCP / CLS / bytes transferidos (Playwright + CDP).
 *
 * Perfil "mobile" ≈ Lighthouse slow-4G: Pixel 7, CPU 4×, RTT 150 ms,
 * 1,6 Mbps down / 750 kbps up, cache vazio a cada execução. Mediana de N execuções.
 *
 *   node site/scripts/measure-vitals.mjs --label depois --runs 7 \
 *     http://localhost:3100/pt-BR http://localhost:3100/zh-CN
 */
import { chromium, devices } from '@playwright/test'

const PROFILES = {
  mobile: { device: devices['Pixel 7'], cpu: 4, latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 },
  desktop: { device: { viewport: { width: 1280, height: 800 } }, cpu: 1, latency: 0, down: -1, up: -1 },
}

function parseArgs(argv) {
  const args = { runs: 5, label: 'medicao', urls: [] }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--runs') args.runs = Number(argv[++i])
    else if (argv[i] === '--label') args.label = argv[++i]
    else args.urls.push(argv[i])
  }
  return args
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function measureOnce(browser, url, profile) {
  const context = await browser.newContext(profile.device)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  if (profile.latency) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up,
    })
  }
  const types = new Map()
  const bytes = { total: 0, script: 0, stylesheet: 0, font: 0 }
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type.toLowerCase()))
  cdp.on('Network.loadingFinished', (e) => {
    const type = types.get(e.requestId)
    bytes.total += e.encodedDataLength
    if (type in bytes) bytes[type] += e.encodedDataLength
  })
  await page.addInitScript(() => {
    window.__v = { lcp: 0, cls: 0 }
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const vitals = await page.evaluate(() => window.__v)
  await context.close()
  return { lcp: vitals.lcp, cls: vitals.cls, ...bytes }
}

const kb = (n) => Math.round(n / 1024)

async function main() {
  const { runs, label, urls } = parseArgs(process.argv.slice(2))
  const browser = await chromium.launch()
  console.log(`| ${label} | perfil | URL | LCP mediana (ms) | LCP min–máx | CLS | total KB | JS KB | CSS KB | fontes KB |`)
  console.log('|---|---|---|---|---|---|---|---|---|---|')
  for (const [name, profile] of Object.entries(PROFILES)) {
    for (const url of urls) {
      const samples = []
      for (let i = 0; i < runs; i += 1) samples.push(await measureOnce(browser, url, profile))
      const lcps = samples.map((s) => s.lcp)
      const last = samples[samples.length - 1]
      console.log(`| ${label} | ${name} | ${new URL(url).pathname} | ${Math.round(median(lcps))} | ${Math.round(Math.min(...lcps))}–${Math.round(Math.max(...lcps))} | ${median(samples.map((s) => s.cls)).toFixed(3)} | ${kb(last.total)} | ${kb(last.script)} | ${kb(last.stylesheet)} | ${kb(last.font)} |`)
    }
  }
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

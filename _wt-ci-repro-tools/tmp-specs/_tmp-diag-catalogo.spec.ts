import { devices, test } from '@playwright/test'
import { gotoApp } from './helpers/url'
import { loginGerente } from './helpers/login'

// TEMPORÁRIO (diagnóstico; não versionar).
test.setTimeout(240_000)
test.use({ ...devices['Pixel 7'] })

test('diag catalogo zh', async ({ page }, testInfo) => {
  const logs: string[] = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`console.${m.type()}: ${m.text().slice(0, 220)}`) })
  page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`))
  page.on('requestfailed', (r) => logs.push(`requestfailed: ${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText}`))
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) logs.push(`NAV ${f.url().slice(0,80)}`) })
  page.on('response', async (r) => { if (r.request().method() === 'POST') { const b = await r.text().catch(() => '?'); logs.push(`POST ${r.status()} ct=${r.headers()['content-type']} len=${b.length} hasMain=${/<main/.test(b)} head=${b.slice(0, 160).replace(/\s+/g, ' ')}`) } })
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`http ${r.status()} ${r.url().slice(0, 120)}`) })

  await loginGerente(page)
  if (process.env.WARM === '1') {
    await gotoApp(page, '/admin/catalogo')
    await page.waitForLoadState('networkidle').catch(() => {})
    console.log('AQUECIDO: rota ja compilada e hidratada uma vez')
  }
  const t0 = Date.now()
  await gotoApp(page, '/admin/catalogo')
  console.log('SEM networkidle: clica logo que o botao fica visivel')
  await page.getByRole('button', { name: '普通话' }).waitFor({ state: 'visible' })
  const snap = async (tag: string) => {
   try {
    const info = await page.evaluate(() => {
      const main = document.querySelector('main')
      return { mainChars: main ? (main.textContent || '').length : -1, h1: document.querySelector('h1')?.textContent ?? null, alert: [...document.querySelectorAll('[role=alert]')].map((a) => (a.textContent || '').slice(0, 120)), btn: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim().slice(0, 12)).filter((t) => /PT|普通话/.test(t)) }
    })
    console.log('SNAP', tag, JSON.stringify(info))
    await page.screenshot({ path: testInfo.outputPath(`${tag}.png`), timeout: 4000 })
   } catch (e) { console.log('SNAP-ERRO', tag, String(e).slice(0, 90)) }
  }
  await snap('0-antes')
  console.log('ms ate botao visivel', Date.now() - t0)
  await page.getByRole('button', { name: '普通话' }).click()
  for (const ms of [300, 1500, 4000, 12000]) { await page.waitForTimeout(ms); await snap(`1-apos-${ms}`) }
  console.log('LOGS', JSON.stringify(logs.slice(0, 25)))
  const pt = page.getByRole('button', { name: /^PT$/ })
  if (await pt.isEnabled().catch(() => false)) await pt.click()
  await page.waitForTimeout(3000)
})

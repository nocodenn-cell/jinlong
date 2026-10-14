import { devices, test } from '@playwright/test'
import { gotoApp } from './helpers/url'
import { loginGerente } from './helpers/login'

// TEMPORÁRIO (diagnóstico; não versionar).
test.setTimeout(240_000)
test.use({ ...devices['Pixel 7'] })
const DELAY = Number(process.env.DELAY_JS ?? '4000')

test('estado quebrado apos toggle pre-hidratacao', async ({ page }) => {
  const errs: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errs.push('pageerror ' + String(e).slice(0, 200)))
  await loginGerente(page)
  await page.route('**/_next/static/**/*.js', async (route) => { await new Promise((r) => setTimeout(r, DELAY)); await route.continue() })
  await gotoApp(page, '/admin/catalogo')
  const zh = page.getByRole('button', { name: '普通话' })
  await zh.waitFor({ state: 'visible' })
  const post = page.waitForResponse((r) => r.request().method() === 'POST')
  await zh.click()
  const r = await post
  const hdr = r.headers()
  console.log('HID POST', r.status(), 'ct', hdr['content-type'], 'csp?', !!hdr['content-security-policy'], 'x-action-redirect', hdr['x-action-redirect'])
  await page.waitForTimeout(DELAY + 5000)
  const d = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const chain: string[] = []
    for (let p: HTMLElement | null = h1 as HTMLElement | null; p && chain.length < 10; p = p.parentElement) chain.push(`${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}${p.hasAttribute('hidden') ? '[hidden]' : ''}`)
    return {
      mains: [...document.querySelectorAll('main')].map((m) => ({ id: m.id, chars: (m.textContent || '').length })),
      hiddenDivs: [...document.querySelectorAll('div[hidden]')].map((x) => x.id + ':' + (x.textContent || '').length).slice(0, 8),
      templates: document.querySelectorAll('template[id^="B:"]').length,
      h1chain: chain,
      scriptsInline: [...document.querySelectorAll('script:not([src])')].length,
      hasRC: typeof (window as unknown as { $RC?: unknown }).$RC,
    }
  })
  console.log('HID estado', JSON.stringify(d))
  console.log('HID erros', JSON.stringify(errs.slice(0, 6)))
  await page.reload().catch(() => {})
  await page.waitForTimeout(DELAY + 3000)
  const pt = page.getByRole('button', { name: /^PT$/ })
  if (await pt.isEnabled().catch(() => false)) await pt.click().catch(() => {})
  await page.waitForTimeout(DELAY + 3000)
})

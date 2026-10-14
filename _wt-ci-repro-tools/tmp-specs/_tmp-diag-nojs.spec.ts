import { devices, test } from '@playwright/test'
import { gotoApp } from './helpers/url'
import { loginGerente } from './helpers/login'

// TEMPORÁRIO (diagnóstico; não versionar). Formulário puro (JS desativado): o que o SERVIDOR devolve no POST?
test.setTimeout(240_000)
test.use({ ...devices['Pixel 7'] })

test('diag toggle sem JS', async ({ page, browser }, testInfo) => {
  await loginGerente(page)
  await gotoApp(page, '/admin/catalogo')
  await page.waitForLoadState('networkidle').catch(() => {})
  const state = await page.context().storageState()
  const ctx = await browser.newContext({ ...devices['Pixel 7'], javaScriptEnabled: false, storageState: state })
  const p2 = await ctx.newPage()
  await gotoApp(p2, '/admin/catalogo')
  const antes = await p2.content()
  console.log('SEMJS antes: main?', /<main/.test(antes), 'len', antes.length, 'h1', (antes.match(/<h1[^>]*>([^<]*)</) || [])[1])
  const post = p2.waitForResponse((r) => r.request().method() === 'POST', { timeout: 30_000 })
  await p2.getByRole('button', { name: '普通话' }).click()
  const r = await post
  console.log('SEMJS POST status', r.status(), 'ct', r.headers()['content-type'])
  await p2.waitForLoadState('domcontentloaded').catch(() => {})
  const html = await p2.content()
  const mainTxt = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [])[1] || ''
  console.log('SEMJS depois: main?', /<main/.test(html), 'main text chars', mainTxt.replace(/<[^>]+>/g, '').trim().length, 'h1', (html.match(/<h1[^>]*>([^<]*)</) || [])[1], 'len', html.length)
  console.log('SEMJS url', p2.url())
  await ctx.close()
  const pt = page.getByRole('button', { name: /^PT$/ })
  await page.reload()
  if (await pt.isEnabled().catch(() => false)) await pt.click()
  await page.waitForTimeout(3000)
})

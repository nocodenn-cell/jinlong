import { devices, test } from '@playwright/test'
import { gotoApp } from './helpers/url'
import { loginGerente } from './helpers/login'

// TEMPORÁRIO (diagnóstico; não versionar). Atrasa os chunks JS para forçar clique ANTES da hidratação.
test.setTimeout(240_000)
test.use({ ...devices['Pixel 7'] })
const DELAY = Number(process.env.DELAY_JS ?? '0')

test('early click: hamburger e toggle', async ({ page }) => {
  await loginGerente(page)
  if (DELAY > 0) {
    await page.route('**/_next/static/**/*.js', async (route) => {
      await new Promise((r) => setTimeout(r, DELAY))
      await route.continue()
    })
  }
  // 1) hamburger
  await gotoApp(page, '/admin/dashboard')
  const menu = page.getByRole('button', { name: 'Navegação' })
  await menu.waitFor({ state: 'visible' })
  await menu.click()
  const dlg = page.getByRole('dialog', { name: 'Navegação' })
  console.log('EARLY hamburger: dialog logo apos clique =', await dlg.isVisible())
  await page.waitForTimeout(DELAY + 4000)
  console.log('EARLY hamburger: dialog apos hidratar    =', await dlg.isVisible())

  // 2) toggle zh
  await gotoApp(page, '/admin/catalogo')
  const zh = page.getByRole('button', { name: '普通话' })
  await zh.waitFor({ state: 'visible' })
  await zh.click()
  await page.waitForTimeout(DELAY + 6000)
  const info = await page.evaluate(() => ({ main: (document.querySelector('main')?.textContent || '').length, h1: document.querySelector('h1')?.textContent, btns: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter((t) => /PT|普通话/.test(t)) }))
  console.log('EARLY toggle: estado apos', JSON.stringify(info))
  const pt = page.getByRole('button', { name: /^PT$/ })
  await page.reload().catch(() => {})
  await page.waitForTimeout(3000)
  if (await pt.isEnabled().catch(() => false)) await pt.click().catch(() => {})
  await page.waitForTimeout(2500)
})

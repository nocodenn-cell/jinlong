import { devices, test } from '@playwright/test'
import { gotoApp } from './helpers/url'
import { loginGerente } from './helpers/login'

// TEMPORÁRIO (diagnóstico; não versionar).
test.setTimeout(300_000)
test.use({ ...devices['Pixel 7'] })

test('diag toggle zh + h1 + nav no mobile', async ({ page }, testInfo) => {
  await loginGerente(page)
  await gotoApp(page, '/admin/dashboard')
  await page.waitForLoadState('networkidle').catch(() => {})
  const vp = page.viewportSize()
  console.log('VIEWPORT', JSON.stringify(vp))

  const nomes = async (rot: string) => {
    const bs = await page.getByRole('button').evaluateAll((els) =>
      els.map((e) => ({
        n: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30),
        dis: (e as HTMLButtonElement).disabled,
        vis: (e as HTMLElement).getBoundingClientRect().width > 0,
      })),
    )
    console.log(rot, 'BOTOES', JSON.stringify(bs.filter((b) => /PT|普通话|Navega/.test(b.n))))
  }
  await nomes('ANTES(pt)')
  console.log('NAVS(pt)', await page.getByRole('navigation').count(), 'dialogs', await page.getByRole('dialog').count())

  await page.screenshot({ path: testInfo.outputPath('01-pt.png'), fullPage: false })
  const zh = page.getByRole('button', { name: '普通话' })
  console.log('zh visivel antes?', await zh.isVisible())
  await zh.click()
  for (const ms of [500, 1500, 4000]) {
    await page.waitForTimeout(ms)
    console.log(`+${ms}ms URL`, page.url())
    await nomes(`DEPOIS+${ms}`)
  }
  await page.screenshot({ path: testInfo.outputPath('02-apos-clique.png'), fullPage: false })

  const h1 = page.locator('h1')
  console.log('H1 count', await h1.count())
  const info = await h1.first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    const chain: string[] = []
    let p: HTMLElement | null = el as HTMLElement
    while (p && chain.length < 12) {
      const cs = getComputedStyle(p)
      chain.push(`${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}[disp=${cs.display},vis=${cs.visibility},op=${cs.opacity},w=${Math.round(p.getBoundingClientRect().width)}]`)
      p = p.parentElement
    }
    const top = document.elementFromPoint(r.left + 5, r.top + 5)
    return { text: el.textContent, rect: [r.left, r.top, r.width, r.height].map(Math.round), chain, topEl: top ? top.tagName + '.' + (top.className || '').toString().slice(0, 60) : null }
  })
  console.log('H1 INFO', JSON.stringify(info))
  console.log('getByText 生意看板 count', await page.getByText('生意看板').count())

  // restaura PT (idioma é persistido no perfil)
  const pt = page.getByRole('button', { name: /^PT$/ })
  if (await pt.isEnabled().catch(() => false)) await pt.click()
  await page.waitForTimeout(2000)
  await page.reload()
  await nomes('RESTAURADO')
})

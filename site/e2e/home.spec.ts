import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const LOCALES = ['pt-BR', 'zh-CN'] as const
const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const MOBILE_MAX = 900

async function openHome(page: Page, locale: string) {
  await page.goto(`/${locale}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

for (const locale of LOCALES) {
  test.describe(`home ${locale}`, () => {
    for (const vp of VIEWPORTS) {
      test(`WCAG 2.2 AA e sem rolagem horizontal · ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await openHome(page, locale)
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).exclude('nextjs-portal').analyze()
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      })
    }

    test('lang do documento, um único h1 e metadados', async ({ page }) => {
      await openHome(page, locale)
      const html = await (await page.request.get(`/${locale}`)).text()
      expect(html).toContain(`<html lang="${locale}"`)
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page).toHaveTitle(/Jinlong|金龙/)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${locale}$`))
      const robots = page.locator('meta[name="robots"]')
      if (locale === 'zh-CN') await expect(robots).toHaveAttribute('content', /noindex/)
      else await expect(robots).toHaveCount(0)
    })

    test('seções na ordem do layout e FAQ abre por teclado', async ({ page }) => {
      await openHome(page, locale)
      const ids = await page.locator('main > section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')))
      expect(ids.indexOf('h-how')).toBeGreaterThan(ids.indexOf('h-ben'))
      expect(ids.indexOf('h-faq')).toBeGreaterThan(ids.indexOf('h-how'))
      expect(ids.at(-1)).toBe('h-final')
      await expect(page.locator('.jl-steps > li')).toHaveCount(3)
      const first = page.locator('.jl-faq details').first()
      await first.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(first).toHaveAttribute('open', '')
      await expect(first.locator('p')).toBeVisible()
    })

    test('teclado: skip link é o primeiro foco e leva ao conteúdo', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'Safari não tabula links por padrão')
      await openHome(page, locale)
      await page.keyboard.press('Tab')
      const skip = page.locator('a.jl-skip')
      await expect(skip).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#main-content$/)
    })

    test('foco visível nos links do cabeçalho (desktop)', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openHome(page, locale)
      const link = page.locator('header.jl-nav nav a').first()
      await link.focus()
      expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')
    })
  })
}

test('alternar idioma navega, persiste o cookie e volta', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHome(page, 'pt-BR')
  await page.locator('.jl-lang a').click()
  await page.waitForURL('**/zh-CN')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect((await context.cookies()).find((c) => c.name === 'idioma_preferido')?.value).toBe('zh')
  await page.locator('.jl-lang a').click()
  await page.waitForURL('**/pt-BR')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})

test('menu mobile: abre, prende o foco, fecha com Esc e devolve o foco ao botão', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page, 'pt-BR')
  const button = page.locator('button.jl-menu-btn')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#menu-mobile')).toHaveAttribute('data-open', 'true')
  await expect(page.locator('#menu-mobile a').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(button).toBeFocused()
})

test('menu mobile: link de seção fecha o menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openHome(page, 'pt-BR')
  await page.locator('button.jl-menu-btn').click()
  await page.locator('#menu-mobile a').nth(1).click()
  await expect(page.locator('#menu-mobile')).toHaveAttribute('data-open', 'false')
})

test('simulador de atacado: 6 un. no varejo, 10 un. aplica o atacado (teclado)', async ({ page }) => {
  await openHome(page, 'pt-BR')
  const output = page.locator('.jl-stepper output')
  await expect(output).toHaveText('6')
  await expect(page.locator('.jl-wh-result .total b')).toHaveText(/137,40/)
  const plus = page.getByRole('button', { name: /aumentar/i })
  await plus.focus()
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('Enter')
  await expect(output).toHaveText('10')
  await expect(page.locator('.jl-wh-result .total b')).toHaveText(/185,00/)
  await expect(page.locator('.jl-wh-live')).toContainText('✓')
})

test('simulador: quantidade respeita os limites 1 e 99', async ({ page }) => {
  await openHome(page, 'pt-BR')
  const minus = page.getByRole('button', { name: /diminuir/i })
  for (let i = 0; i < 8; i += 1) if (await minus.isEnabled()) await minus.click()
  await expect(page.locator('.jl-stepper output')).toHaveText('1')
  await expect(minus).toBeDisabled()
})

test('sem dados reais: nenhuma chamada ao Supabase nem a terceiros', async ({ page }) => {
  const external: string[] = []
  const origin = new URL(page.url() === 'about:blank' ? 'http://localhost:3100' : page.url()).origin
  page.on('request', (req) => {
    const url = req.url()
    if (/^https?:/.test(url) && !url.startsWith(origin) && !url.startsWith('http://localhost')) external.push(url)
  })
  await openHome(page, 'pt-BR')
  expect(external).toEqual([])
})

test('sem canais configurados, nenhum CTA de WhatsApp/WeChat é exibido', async ({ page }) => {
  await openHome(page, 'pt-BR')
  await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0)
})

test('locale inválido e caminhos desconhecidos retornam 404', async ({ page }) => {
  expect((await page.goto('/en-US'))?.status()).toBe(404)
  expect((await page.goto('/qualquer-coisa'))?.status()).toBe(404)
})

test('raiz negocia o idioma: navegador em chinês vai para zh-CN', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page).toHaveURL(/\/zh-CN$/)
  await context.close()
})

test('links legais e de login apontam para o ERP', async ({ page }) => {
  await openHome(page, 'pt-BR')
  const privacy = await page.locator('footer a[href$="/privacidade"]').getAttribute('href')
  expect(privacy).toMatch(/^https:\/\/[^/]+\/privacidade$/)
  const login = await page.locator('footer a[href$="/login"]').getAttribute('href')
  expect(login).toMatch(/^https:\/\/[^/]+\/login$/)
})

test('cabeçalhos de segurança presentes', async ({ page }) => {
  const headers = (await page.goto('/pt-BR'))?.headers() ?? {}
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-powered-by']).toBeUndefined()
})

test('CLS da home dentro do orçamento (≤ 0,1)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number }
    w.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) w.__cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await openHome(page, 'pt-BR')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.1)
})

test('fontes: Geist carregada na home em português', async ({ page }) => {
  await openHome(page, 'pt-BR')
  const geistLoaded = await page.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded' && /geist/i.test(f.family)))
  expect(geistLoaded).toBe(true)
})

test.describe('largura de menu', () => {
  test('navegação inline no desktop, hambúrguer no mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openHome(page, 'pt-BR')
    await expect(page.locator('header.jl-nav nav')).toBeVisible()
    await expect(page.locator('button.jl-menu-btn')).toBeHidden()
    await page.setViewportSize({ width: MOBILE_MAX - 100, height: 800 })
    await expect(page.locator('button.jl-menu-btn')).toBeVisible()
  })
})

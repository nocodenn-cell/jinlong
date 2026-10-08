import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const LOCALES = ['pt-BR', 'zh-CN'] as const
const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openHome(page: Page, locale: string) {
  await page.goto(`/${locale}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // Contraste medido só após o fade-in da prévia (opacidade parcial gera falso positivo).
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
}

for (const locale of LOCALES) {
  test.describe(`home ${locale}`, () => {
    for (const vp of VIEWPORTS) {
      test(`acessibilidade WCAG 2.2 AA e sem rolagem horizontal · ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await openHome(page, locale)

        const results = await new AxeBuilder({ page })
          .withTags(WCAG_TAGS)
          .exclude('nextjs-portal')
          .analyze()
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }

    test('lang do documento e do conteúdo coincidem com o idioma', async ({ page }) => {
      await openHome(page, locale)
      const response = await page.request.get(`/${locale}`)
      expect(await response.text()).toContain(`<html lang="${locale}"`)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.locator('h1')).toHaveCount(1)
    })

    test('metadados: título, canonical e robots', async ({ page }) => {
      await openHome(page, locale)
      await expect(page).toHaveTitle(/Jinlong/)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${locale}$`))
      const robots = page.locator('meta[name="robots"]')
      if (locale === 'zh-CN') {
        await expect(robots).toHaveAttribute('content', /noindex/)
      } else {
        await expect(robots).toHaveCount(0)
      }
    })

    test('navegação por teclado: skip link, alternância de idioma e foco visível', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'Safari não tabula links por padrão')
      await openHome(page, locale)
      await page.keyboard.press('Tab')
      await expect(page.locator('a.site-skip')).toBeFocused()
      const switchLink = page.locator('a.site-lang')
      await switchLink.focus()
      const outline = await switchLink.evaluate((el) => getComputedStyle(el).outlineStyle)
      expect(outline).not.toBe('none')
    })
  })
}

test('alternar idioma navega e persiste a preferência em cookie', async ({ page, context }) => {
  await openHome(page, 'pt-BR')
  await page.locator('a.site-lang').click()
  await page.waitForURL('**/zh-CN')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  const cookies = await context.cookies()
  expect(cookies.find((c) => c.name === 'idioma_preferido')?.value).toBe('zh')

  await page.locator('a.site-lang').click()
  await page.waitForURL('**/pt-BR')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})

test('prévia do PDV: atacado entra em 6 unidades (teclado)', async ({ page }) => {
  await openHome(page, 'pt-BR')
  const plus = page.getByRole('button', { name: /Aumentar quantidade de Cabo HDMI/ })
  await plus.focus()
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Enter')
  await expect(page.locator('.pdv__tier--atacado')).toHaveCount(1)
})

test('sem dados reais: nenhuma chamada ao Supabase na home', async ({ page }) => {
  const calls: string[] = []
  page.on('request', (req) => {
    if (/supabase\.(co|in)/.test(req.url())) calls.push(req.url())
  })
  await openHome(page, 'pt-BR')
  expect(calls).toEqual([])
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

test('links de login e documentos legais apontam para o ERP', async ({ page }) => {
  await openHome(page, 'pt-BR')
  const privacy = await page.locator('footer a').first().getAttribute('href')
  expect(privacy).toMatch(/^https:\/\/[^/]+\/privacidade$/)
})

test('cabeçalhos de segurança presentes', async ({ page }) => {
  const response = await page.goto('/pt-BR')
  const headers = response?.headers() ?? {}
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-powered-by']).toBeUndefined()
})

test('CLS da home dentro do orçamento (≤ 0,1)', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await openHome(page, 'pt-BR')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  expect(cls).toBeLessThanOrEqual(0.1)
})

test('tipografia aplicada: fontes do site carregadas em cada idioma', async ({ page }) => {
  const loadedFamilies = () =>
    page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))

  await openHome(page, 'pt-BR')
  await expect(page.locator('body')).toHaveCSS('font-family', /IBM Plex Sans/)
  await expect(page.locator('h1')).toHaveCSS('font-family', /Fraunces/)
  expect(await loadedFamilies()).not.toContain('displayZh')

  await openHome(page, 'zh-CN')
  await expect(page.locator('h1')).toHaveCSS('font-family', /displayZh/)
  expect(await loadedFamilies()).toContain('displayZh')
})

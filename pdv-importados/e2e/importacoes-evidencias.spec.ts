/**
 * F5 — capturas de tela do hub de Importações para o relatório (homologação local).
 * Só roda com E2E_EVIDENCIAS=1 e depois de `importacoes-hub.spec.ts` (usa a última operação
 * aprovada da empresa fictícia). Grava em docs/import-intelligence/evidencias-f5/.
 */
import path from 'node:path'
import { expect, test, type Browser } from '@playwright/test'

const SAIDA = path.resolve(__dirname, '../../docs/import-intelligence/evidencias-f5')
const SENHA = 'Homolog-Importacoes-2026!' // fictícia (backend/scripts/f5-homologacao-local.mjs)
const LENTO = { timeout: 90_000 }

test.describe.configure({ mode: 'serial', timeout: 600_000 })
test.skip(process.env.E2E_EVIDENCIAS !== '1', 'capturas só sob demanda (E2E_EVIDENCIAS=1)')

async function entrar(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240_000, waitUntil: 'commit' })
  return page
}

test('capturas do fluxo (DONO, empresa licenciada)', async ({ browser }) => {
  const page = await entrar(browser, 'dono.importadora@homolog.test')
  await page.goto('/admin/importacoes')
  await expect(page.getByTestId('importacoes-tabela')).toBeVisible(LENTO)
  await page.screenshot({ path: `${SAIDA}/01-hub-visao-geral-lista.png`, fullPage: true })

  await page.goto('/admin/importacoes?status=APROVADA')
  const link = page.getByTestId('importacoes-tabela').getByRole('link').first()
  await expect(link).toBeVisible(LENTO)
  const href = await link.getAttribute('href')
  const base = new URL(href ?? '', page.url()).toString().split('?')[0]

  for (const [aba, arquivo] of [
    ['mercadorias', '02-mercadorias'],
    ['lancamentos', '03-tributos-despesas'],
    ['documentos', '04-documentos'],
    ['apuracao', '05-apuracao-memoria'],
    ['versoes', '06-versoes-aprovacao'],
  ] as const) {
    await page.goto(`${base}?aba=${aba}`)
    await expect(page.getByTestId(`imp-aba-${aba}`)).toHaveAttribute('aria-current', 'page', LENTO)
    await page.screenshot({ path: `${SAIDA}/${arquivo}.png`, fullPage: true })
  }

  await page.getByRole('button', { name: '普通话', exact: true }).first().click()
  await expect(page.getByTestId('imp-aba-versoes')).toHaveText('版本与审批', LENTO)
  await page.goto(`${base}?aba=apuracao`)
  await page.screenshot({ path: `${SAIDA}/07-apuracao-zh.png`, fullPage: true })
  await page.getByRole('button', { name: 'PT', exact: true }).first().click()
  await expect(page.getByTestId('imp-aba-versoes')).toHaveText('Versões e aprovação', LENTO)
  await page.context().close()
})

test('captura: cliente sem módulo (menu sem Importações; rota direta negada)', async ({ browser }) => {
  const page = await entrar(browser, 'dono.semmodulo@homolog.test')
  await page.goto('/admin/dashboard')
  await expect(page.getByTestId('executive-sidebar-nav').first()).toBeVisible(LENTO)
  await page.screenshot({ path: `${SAIDA}/08-sem-modulo-menu.png` })
  await page.goto('/admin/importacoes')
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible(LENTO)
  await page.screenshot({ path: `${SAIDA}/09-sem-modulo-rota-negada.png` })
  await page.context().close()
})

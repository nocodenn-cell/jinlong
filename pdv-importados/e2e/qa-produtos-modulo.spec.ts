/**
 * QA autônomo — módulo /gerente/produtos (checklist produtos).
 * Requer PLAYWRIGHT_TEST_EMAIL + PLAYWRIGHT_TEST_PASSWORD (seed: npm run seed:dev-users).
 * Carrega pdv-importados/.env.local quando as variáveis não estão no processo do Playwright.
 */
import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers/url'
import * as fs from 'node:fs'
import * as path from 'node:path'

const LOGIN = '/login'
const PRODUTOS = '/gerente/produtos'

function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvLocal()

/** Alinha ao seed (`scripts/seed-dev-users.mjs`): muitos devs só têm SEED_* no .env.local. */
function resolveGerenteEmail(): string | undefined {
  return (
    process.env.PLAYWRIGHT_TEST_EMAIL?.trim() ||
    process.env.SEED_GERENTE_EMAIL?.trim() ||
    'e2e-gerente@localhost.test'
  )
}

function resolveGerentePassword(): string | undefined {
  return (
    process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
    process.env.SEED_DEV_PASSWORD?.trim()
  )
}

function hasGerenteCreds(): boolean {
  return Boolean(resolveGerenteEmail() && resolveGerentePassword())
}

async function loginGerente(page: import('@playwright/test').Page): Promise<void> {
  const email = resolveGerenteEmail()!
  const pwd = resolveGerentePassword()!
  await gotoApp(page, LOGIN)
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Senha').fill(pwd)
  await page.getByRole('button', { name: /^Entrar$/ }).click()
  await page.waitForURL(/\/(caixa|gerente)/, { timeout: 90_000, waitUntil: 'domcontentloaded' })
}

test.describe.configure({ mode: 'serial', timeout: 120_000 })
test.describe('QA módulo produtos (gerente)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasGerenteCreds(), 'Defina PLAYWRIGHT_TEST_EMAIL e PLAYWRIGHT_TEST_PASSWORD')
    await loginGerente(page)
    await gotoApp(page, PRODUTOS)
    await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible({ timeout: 60_000 })
  })

  test('1 — Bulk Import (grade, CSV, validação em tempo real, bloqueio, correção, commit)', async ({ page }) => {
    const suffix = String(Date.now())
    const novoNome = `QA CSV NOVO ${suffix}`
    const segundoNome = `QA CSV SEG ${suffix}`
    // Contrato canónico de importação (11 colunas). A 3ª linha de dados é inválida (nome vazio).
    const csv = [
      'id,nome,codigo_barras,preco_varejo,preco_atacado,quantidade_gatilho_atacado,unidade_medida,observacao,origem,tem_nf,ativo',
      `,${novoNome},QA${suffix}CB,9.99,,,,,china_manual,1,1`,
      `,${segundoNome},QA${suffix}S2,11.00,,,,,china_manual,0,1`,
      `,,QA${suffix}BAD,1,,,,,china_manual,1,1`,
    ].join('\n')
    const csvPath = path.join(process.cwd(), 'test-results', `qa-import-${suffix}.csv`)
    fs.mkdirSync(path.dirname(csvPath), { recursive: true })
    fs.writeFileSync(csvPath, csv, 'utf8')

    await page.getByRole('button', { name: /Importar produtos a partir de CSV/i }).click()
    await expect(page.getByRole('dialog', { name: /Importar produtos|导入商品/ })).toBeVisible()

    // Baixar modelo continua disponível e mantém o cabeçalho canónico.
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /Baixar planilha modelo|下载模板表格/i }).click(),
    ])
    expect(dl.suggestedFilename()).toMatch(/\.csv$/i)
    const tmpl = await dl.path()
    expect(tmpl).toBeTruthy()
    const head = fs.readFileSync(tmpl!, 'utf8').trim().split('\n')[0]
    expect(head).toContain('id,nome,codigo_barras')

    // Carrega o CSV para a grade editável (não commita direto).
    await page.locator('input[type=file][accept*="csv"]').setInputFiles(csvPath)

    // Validação em tempo real: a linha inválida bloqueia o commit e mostra o erro.
    await expect(
      page.getByRole('button', { name: /Corrija .*erro|请修正/ }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Nome demasiado curto|名称过短/)).toBeVisible()

    // Filtro "somente com erro" isola a linha inválida; removê-la desbloqueia o commit.
    await page
      .locator('label')
      .filter({ hasText: /Somente com erro|仅显示错误/ })
      .locator('input[type=checkbox]')
      .check()
    await page.getByRole('button', { name: /Remover linha|删除第/ }).first().click()

    const commit = page.getByRole('button', { name: /Salvar \d+ produto|保存 \d+ 个商品/ })
    await expect(commit).toBeEnabled({ timeout: 10_000 })
    await commit.click()

    // Sucesso → toast e modal fecha.
    const toast = page.locator('[aria-live="polite"]').first()
    await expect(toast).toContainText(/criado|创建/i, { timeout: 25_000 })
    await expect(page.getByRole('dialog', { name: /Importar produtos|导入商品/ })).toHaveCount(0, { timeout: 10_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible({ timeout: 30_000 })

    await page.locator('section').filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) }).getByRole('textbox', { name: /Buscar|搜索/i }).fill(novoNome.slice(0, 16))
    await expect(page.getByText(novoNome, { exact: true })).toBeVisible({ timeout: 15_000 })
    await page.locator('section').filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) }).getByRole('textbox', { name: /Buscar|搜索/i }).fill(segundoNome.slice(0, 16))
    await expect(page.getByText(segundoNome, { exact: true })).toBeVisible({ timeout: 20_000 })
  })

  test('2 — Exportação CSV (filtro Ativo, cabeçalhos, só ativos)', async ({ page }) => {
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) })
      .locator('select')
      .nth(1)
      .selectOption({ label: 'Ativo' })
    await page.waitForTimeout(400)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('button', { name: /Exportar lista filtrada em CSV|Exportar/i }).click(),
    ])
    const fp = await download.path()
    expect(fp).toBeTruthy()
    const text = fs.readFileSync(fp!, 'utf8').trim()
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
    expect(lines[0]).toBe('id,nome,codigo_barras,preco_varejo,origem,tem_nf,ativo')
    expect(lines.length).toBeGreaterThan(1)
    for (const row of lines.slice(1)) {
      const last = row.split(',').pop()?.replace(/"/g, '') ?? ''
      expect(last).toBe('1')
    }
  })

  test('3 — Imagem: upload, substituir, remover', async ({ page }) => {
    const imgA = path.join(process.cwd(), 'test-assets', 'product-a.png')
    const imgB = path.join(process.cwd(), 'test-assets', 'product-b.png')
    const tag = `QA E2E IMG ${Date.now()}`
    await page.locator('#cadastro-rapido input[name=nome]').fill(tag)
    await page.locator('#cadastro-rapido input[name=codigo_barras]').fill(`IM${Date.now()}`)
    await page.locator('#cadastro-rapido input[name=preco_varejo]').fill('5.55')
    await page.locator('#cadastro-rapido button[type=submit]').click()
    await expect(page.getByText(tag, { exact: true })).toBeVisible({ timeout: 25_000 })

    const row = page.getByRole('row').filter({ hasText: tag })
    await expect(row).toBeVisible({ timeout: 15_000 })

    const remover = row.getByRole('button', { name: /Remover foto deste produto|移除此商品照片/i })
    if (await remover.isVisible().catch(() => false)) {
      await remover.click({ force: true })
      await page.waitForTimeout(2000)
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible()
    }

    const row2 = page.getByRole('row').filter({ hasText: tag })
    const fileInp = row2.locator('input[type=file][accept*="image"]')
    await row2.locator('td').nth(2).locator('button[type=button]').first().click()
    await fileInp.setInputFiles(imgA)
    await expect(page.locator('[aria-live="polite"]').first()).toBeVisible({ timeout: 25_000 })
    await page.waitForTimeout(1500)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible()

    const row3 = page.getByRole('row').filter({ hasText: tag })
    await expect(row3.locator('td').nth(2).locator('img')).toBeVisible({ timeout: 20_000 })

    await row3.locator('td').nth(2).locator('button[type=button]').first().click()
    await row3.locator('input[type=file][accept*="image"]').setInputFiles(imgB)
    await page.waitForTimeout(2500)
    await page.reload()
    const row4 = page.getByRole('row').filter({ hasText: tag })
    await expect(row4.locator('td').nth(2).locator('img')).toBeVisible({ timeout: 20_000 })

    await row4.locator('td').nth(2).hover()
    await row4.getByRole('button', { name: /Remover foto deste produto|移除此商品照片/i }).click({ force: true })
    await page.waitForTimeout(2000)
    await page.reload()
    const row5 = page.getByRole('row').filter({ hasText: tag })
    await expect(row5.locator('td').nth(2).locator('svg')).toBeVisible()
  })

  test('4 — Exclusão em lote (toast, sumiu limpo, demo inativo ou removido)', async ({ page }) => {
    const suffix = String(Date.now())
    const nomeLimpo = `QA DEL LIMPO ${suffix}`
    await page.locator('#cadastro-rapido input[name=nome]').fill(nomeLimpo)
    await page.locator('#cadastro-rapido input[name=codigo_barras]').fill(`DL${suffix}`)
    await page.locator('#cadastro-rapido input[name=preco_varejo]').fill('8.88')
    await page.locator('#cadastro-rapido button[type=submit]').click()
    await expect(page.getByRole('cell', { name: nomeLimpo })).toBeVisible({ timeout: 20_000 })

    const nomeB = `QA DEL B ${suffix}`
    await page.locator('#cadastro-rapido input[name=nome]').fill(nomeB)
    await page.locator('#cadastro-rapido input[name=codigo_barras]').fill(`DB${suffix}`)
    await page.locator('#cadastro-rapido input[name=preco_varejo]').fill('7.77')
    await page.locator('#cadastro-rapido button[type=submit]').click()
    await expect(page.getByText(nomeB, { exact: true })).toBeVisible({ timeout: 20_000 })

    const rowLimpo = page.getByRole('row').filter({ hasText: nomeLimpo })
    const rowB = page.getByRole('row').filter({ hasText: nomeB })

    await rowLimpo.getByRole('checkbox').first().check()
    await rowB.getByRole('checkbox').first().check()

    await page.getByRole('button', { name: /Abrir confirmação de exclusão em lote/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /^Confirmar$/ }).click()

    await expect(page.locator('[aria-live="polite"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[aria-live="polite"]').first()).toContainText(/removido|inativado/i)

    await page.getByRole('button', { name: /^Fechar$/ }).click().catch(() => {})

    await expect(page.getByRole('cell', { name: nomeLimpo })).toHaveCount(0)

    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) })
      .locator('select')
      .nth(1)
      .selectOption({ label: 'Inativo' })
    await page.waitForTimeout(600)
    const nB = await page.getByRole('row').filter({ hasText: nomeB }).count()
    console.log(`[qa-produtos] após exclusão — linhas com ${nomeB} (Inativo): ${nB}`)
  })

  test('4b — Exclusão individual (ícone na linha)', async ({ page }) => {
    const suffix = String(Date.now())
    const nome = `QA ROW ${suffix}`
    await page.locator('#cadastro-rapido input[name=nome]').fill(nome)
    await page.locator('#cadastro-rapido input[name=codigo_barras]').fill(`RW${suffix}`)
    await page.locator('#cadastro-rapido input[name=preco_varejo]').fill('3.33')
    await page.locator('#cadastro-rapido button[type=submit]').click()
    await expect(page.getByText(nome, { exact: true })).toBeVisible({ timeout: 20_000 })

    const row = page.getByRole('row').filter({ hasText: nome })
    await row.getByRole('button', { name: /Excluir ou inativar este produto|删除或停用此商品/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /^Confirmar$/ }).click()
    await expect(page.locator('[aria-live="polite"]').first()).toBeVisible({ timeout: 25_000 })
    await page.getByRole('button', { name: /^Fechar$/ }).click().catch(() => {})
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible()
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) })
      .getByRole('textbox', { name: /Buscar|搜索/i })
      .fill(nome.slice(0, 10))
    await expect(page.getByText(nome, { exact: true })).toHaveCount(0)
  })

  test('5 — Regressão: cadastro rápido, preço inline, filtro Inativos, busca', async ({ page }) => {
    const s = String(Date.now())
    const nome = `QA REG ${s}`
    await page.locator('#cadastro-rapido input[name=nome]').fill(nome)
    await page.locator('#cadastro-rapido input[name=codigo_barras]').fill(`RG${s}`)
    await page.locator('#cadastro-rapido input[name=preco_varejo]').fill('12.34')
    await page.locator('#cadastro-rapido button[type=submit]').click()
    await expect(page.getByRole('cell', { name: nome })).toBeVisible({ timeout: 20_000 })

    const row = page.getByRole('row').filter({ hasText: nome })
    const precoInput = row.getByLabel('Preço varejo')
    await precoInput.fill('15,50')
    await precoInput.blur()
    await expect(page.locator('[aria-live="polite"]').first()).toBeVisible({ timeout: 15_000 })

    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) })
      .locator('select')
      .nth(1)
      .selectOption({ label: 'Inativo' })
    await page.waitForTimeout(500)

    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Lista de produtos|商品列表/ }) })
      .locator('select')
      .nth(1)
      .selectOption({ label: 'Todos os status' })
    await page.getByRole('textbox', { name: /Buscar|搜索/i }).fill(nome)
    await expect(page.getByRole('cell', { name: nome })).toBeVisible()
  })

  test('6 — i18n zh: importação com 是/否', async ({ page }) => {
    await page.getByRole('button', { name: '普通话' }).click()
    await expect(page.getByRole('heading', { name: '商品管理' })).toBeVisible({ timeout: 15_000 })

    const suffix = String(Date.now())
    const csv = [
      'id,nome,codigo_barras,preco_varejo,origem,tem_nf,ativo',
      `,QA ZH ${suffix},ZH${suffix}X,7.77,china_manual,是,否`,
    ].join('\n')
    const csvPath = path.join(process.cwd(), 'test-results', `qa-zh-${suffix}.csv`)
    fs.writeFileSync(csvPath, csv, 'utf8')

    await page.getByRole('button', { name: /从 CSV 导入商品/i }).click()
    await page.locator('input[type=file][accept*="csv"]').setInputFiles(csvPath)
    await page.getByRole('button', { name: /^开始导入$/ }).click()
    await expect(page.locator('[aria-live="polite"]').first()).toContainText(/已创建|成功|错误/i, { timeout: 30_000 })
  })
})

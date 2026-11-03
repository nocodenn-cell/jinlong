/**
 * Smoke homologação Fase 1 — contrato atual (PDV-100.1, decisão 1):
 * - Perfil ADMIN descontinuado (migration 20261028110000). Não é criado nem usado aqui.
 * - Provisionamento de empresa não é feito pelo app das lojas: fica fechado (fail-closed,
 *   migration 20261028121000). O caminho oficial é o hub comercial; o manual é contingência.
 * - Fixture de homologação: DONO e loja Matriz criados pelo seed local (npm run seed:dev-users).
 * Fluxo: (1) contrato: o app das lojas não provisiona; (2) DONO -> produto -> caixa -> venda -> fechar -> dashboard.
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loginWithRetry } from './helpers/login'
import { gotoApp, E2E_GOTO_DOMCONTENTLOADED, LOGIN_PATH, esperarHidratacao } from './helpers/url'
import { ensureCaixaAberto, BTN_FECHAR_CAIXA } from './helpers/ensureCaixaAberto'
import {
  adicionarProdutoDemo,
  dismissReciboSeAberto,
  finalizarVenda,
  irParaAbaPgto,
} from './helpers/caixaPagamento'
import {
  confirmarModalMotivoMin,
  confirmarModalValorNumerico,
  MODAL_TITULO_FECHAR,
  MODAL_TITULO_MOTIVO_DIF,
} from './helpers/caixaModais'

function loadEnvLocal(): void {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
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

// Fixture de homologação (seed local): DONO da empresa piloto, loja Matriz.
const DONO_EMAIL = process.env.SEED_DONO_EMAIL?.trim() || 'e2e-dono@localhost.test'
const DONO_PASSWORD =
  process.env.SEED_DEV_PASSWORD?.trim() || process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() || ''

function hasSmokeEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      DONO_PASSWORD,
  )
}


async function logoutViaUi(page: Page): Promise<void> {
  const sair = page.getByRole('link', { name: /^Sair$/ }).or(page.getByRole('button', { name: /^Sair$/ }))
  if (await sair.first().isVisible().catch(() => false)) {
    await sair.first().click()
    await page.waitForURL(/\/login/, { timeout: 30_000 })
    return
  }
  await gotoApp(page, '/auth/signout', E2E_GOTO_DOMCONTENTLOADED)
  await page.waitForURL(/\/login/, { timeout: 30_000 }).catch(async () => {
    await gotoApp(page, LOGIN_PATH, E2E_GOTO_DOMCONTENTLOADED)
  })
}

async function loginAs(page: Page, email: string, password: string, post: RegExp): Promise<void> {
  await loginWithRetry(page, email, password, post, 90_000)
}

/** Digitação real — dispara onChange do React em inputs controlados. */
async function typeInto(page: Page, testId: string, value: string) {
  const locator = page.getByTestId(testId)
  await locator.click()
  await locator.fill('')
  await page.keyboard.type(value, { delay: 20 })
  await expect(locator).toHaveValue(value)
}

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('Smoke Fase 1 — contrato de provisionamento -> venda -> dashboard', () => {
  const stamp = Date.now()
  const produtoNome = `Produto Smoke ${stamp}`
  const produtoCodigo = `SMK${String(stamp).slice(-10)}`
  const produtoPreco = '10,00'

  test.beforeAll(async () => {
    test.skip(!hasSmokeEnv(), 'Exige SUPABASE e SEED_DEV_PASSWORD no .env.local')
  })

  test('1 — App das lojas não provisiona empresa (contrato fail-closed)', async ({ page }) => {
    await loginAs(page, DONO_EMAIL, DONO_PASSWORD, /\/(admin|gerente)/)
    await gotoApp(page, '/admin/provisionamento', E2E_GOTO_DOMCONTENTLOADED)
    await expect(page.getByTestId('prov-loja-nome')).toHaveCount(0)
    await expect(page.getByText(/não está disponível no app das lojas/i)).toBeVisible({
      timeout: 60_000,
    })
  })

  test('2 — DONO cadastra produto no catálogo', async ({ page }) => {
    await loginAs(page, DONO_EMAIL, DONO_PASSWORD, /\/(admin|gerente)/)
    await gotoApp(page, '/admin/catalogo', E2E_GOTO_DOMCONTENTLOADED)
    await expect(page.getByRole('heading', { name: /Catálogo|Produtos|商品/i }).first()).toBeVisible({
      timeout: 60_000,
    })

    await esperarHidratacao(page)
    const novo = page
      .getByRole('button', { name: /Cadastro rápido|Novo produto|创建商品|快速/i })
      .first()
    await novo.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })

    await dialog.locator('input[data-field="nome"]').fill(produtoNome)
    await dialog.locator('input[data-field="codigo_barras"]').fill(produtoCodigo)
    await dialog.locator('input[data-field="preco_varejo"]').fill(produtoPreco)

    const labelEstoque = dialog.locator('label').filter({ hasText: /Estoque inicial|初始库存/i })
    await labelEstoque.locator('input').fill('20')

    // Primário do `NovoProdutoModal` (`m.produtos.salvar_produto`). O rodapé tem
    // três botões "Salvar…" ("Salvar e novo", "Salvar rascunho"); nenhum se
    // chama só "Salvar" — o seletor antigo esperava até o timeout do teste.
    await dialog.getByRole('button', { name: /^Salvar produto$|^保存商品$/ }).click()

    // Pós-salvar pode mostrar painel de sucesso; fechar se houver
    const fecharPos = dialog.getByRole('button', { name: /Fechar|关闭|繼續|Continuar/i })
    if (await fecharPos.first().isVisible({ timeout: 8_000 }).catch(() => false)) {
      await fecharPos.first().click()
    }

    await expect(dialog).toBeHidden({ timeout: 30_000 }).catch(async () => {
      // alguns fluxos fecham e recarregam a lista
      await page.keyboard.press('Escape')
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    // `exact`: o menu da linha (UX-01) tem o link "Duplicar <nome>", que também
    // contém o nome e violava o strict mode.
    await expect(page.getByText(produtoNome, { exact: true })).toBeVisible({ timeout: 30_000 })
  })

  // Depende das formas de pagamento semeadas pelo provisionamento
  // (`ensureFormasPagamento`): sem elas a RPC de venda recusa a loja nova
  // (FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA, achado no CI do #556).
  test('3 — DONO abre caixa → venda → fecha caixa', async ({ page }) => {
    await loginAs(page, DONO_EMAIL, DONO_PASSWORD, /\/(admin|gerente)/)
    await gotoApp(page, '/caixa', E2E_GOTO_DOMCONTENTLOADED)

    await ensureCaixaAberto(page, '300')
    await adicionarProdutoDemo(page, produtoCodigo)
    await irParaAbaPgto(page)
    await finalizarVenda(page)
    await dismissReciboSeAberto(page)

    await page.getByRole('button', { name: BTN_FECHAR_CAIXA }).click()
    // fundo 300 + venda 10 = 310
    await confirmarModalValorNumerico(page, MODAL_TITULO_FECHAR, '310,00')

    const motivo = page.getByRole('dialog', { name: MODAL_TITULO_MOTIVO_DIF })
    if (await motivo.isVisible().catch(() => false)) {
      await confirmarModalMotivoMin(page, MODAL_TITULO_MOTIVO_DIF, 'Smoke homologação Fase 1')
    }

    await expect(page.getByRole('status')).toContainText(/Caixa fechado|fechado|已结|已關/i, {
      timeout: 30_000,
    })
  })

  test('4 — Confirmar dashboard do DONO', async ({ page }) => {
    await loginAs(page, DONO_EMAIL, DONO_PASSWORD, /\/(admin|gerente)/)
    await gotoApp(page, '/admin/dashboard', E2E_GOTO_DOMCONTENTLOADED)

    await expect(
      page.getByRole('heading', { name: /Painel|Dashboard|Visão|看板|主控/i }).first(),
    ).toBeVisible({ timeout: 60_000 })

    // Evidência de operação: KPI ou texto de vendas do dia
    const evidencia = page
      .getByText(/Vendas|Total|Ticket|销售|营业/i)
      .first()
    await expect(evidencia).toBeVisible({ timeout: 30_000 })
  })
})

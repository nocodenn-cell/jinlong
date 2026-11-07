/**
 * Smoke homologação Fase 1 — fluxo único sem intervenção manual:
 * DONO (seed) → checklist → produto → abrir caixa → venda → fechar caixa → dashboard.
 * Sem perfil ADMIN: descontinuado pelo corte de papéis (20261028110000).
 */
import { createClient } from '@supabase/supabase-js'
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loginWithRetry } from './helpers/login'
import { gotoApp, E2E_GOTO_DOMCONTENTLOADED } from './helpers/url'
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

// Fixture oficial do E2E (scripts/seed-dev-users.mjs): DONO da loja Matriz.
// O provisionamento de lojas não existe mais no app das lojas e não há perfil ADMIN.
const DONO_EMAIL = process.env.SEED_DONO_EMAIL?.trim() || 'e2e-dono@localhost.test'
const DONO_PASSWORD =
  process.env.SEED_DEV_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD?.trim() ||
  process.env.PLAYWRIGHT_TEST_PASSWORD?.trim() ||
  ''

function hasSmokeEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      DONO_PASSWORD,
  )
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

async function loginAs(page: Page, email: string, password: string, post: RegExp): Promise<void> {
  await loginWithRetry(page, email, password, post, 90_000)
}

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('Smoke Fase 1 — DONO → produto → caixa → dashboard', () => {
  const stamp = Date.now()
  const produtoNome = `Produto Smoke ${stamp}`
  const produtoCodigo = `SMK${String(stamp).slice(-10)}`
  const produtoPreco = '10,00'

  test.beforeAll(() => {
    test.skip(!hasSmokeEnv(), 'Exige SUPABASE + senha da seed (SEED_DEV_PASSWORD) no .env.local')
  })

  // Regra atual: provisionar loja é tarefa da equipe da plataforma, fora do app das lojas.
  // O banco bloqueia `plataforma_provisionar_empresa` sem habilitação ou contingência
  // registrada (20261028121000). O smoke não cria loja: usa a Matriz da seed.
  test('1 — Provisionamento fechado no banco (sem ADMIN e sem wizard)', async () => {
    const { error } = await adminClient().rpc('plataforma_provisionar_empresa', { p: {}, p_ator: null })
    expect(error?.message ?? '').toContain('PROVISIONAMENTO_AUTOMATICO_BLOQUEADO')
  })

  test('2 — Checklist de implantação da loja do DONO', async ({ page }) => {
    await loginAs(page, DONO_EMAIL, DONO_PASSWORD, /\/(admin|gerente|caixa)/)
    await gotoApp(page, '/admin/implantacao', E2E_GOTO_DOMCONTENTLOADED)
    await expect(page.getByRole('heading', { name: /Implantação|GO-LIVE|上线/i })).toBeVisible({
      timeout: 60_000,
    })
  })

  test('3 — Login DONO → cadastrar produto', async ({ page }) => {
    await loginAs(page, DONO_EMAIL, DONO_PASSWORD, /\/(admin|gerente)/)
    await gotoApp(page, '/admin/catalogo', E2E_GOTO_DOMCONTENTLOADED)
    await expect(page.getByRole('heading', { name: /Catálogo|Produtos|商品/i }).first()).toBeVisible({
      timeout: 60_000,
    })
    // Hidratação antes do clique: com `domcontentloaded` o botão existe, mas o React ainda
    // não ligou o onClick, e o modal de cadastro não abre (confirmado no ambiente local).
    await page.waitForLoadState('networkidle')

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

  // Depende das formas de pagamento da loja Matriz (seed): sem elas a RPC de venda recusa a loja
  // (FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA, achado no CI do #556).
  test('4 — Abrir caixa → venda → fechar caixa', async ({ page }) => {
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

  test('5 — Confirmar dashboard do DONO', async ({ page }) => {
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

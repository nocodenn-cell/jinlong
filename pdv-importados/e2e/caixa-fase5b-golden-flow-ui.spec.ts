/**
 * Fase 5b — Golden Flow oficial (browser, ponta a ponta).
 *
 * Abrir caixa → produto → pagamento parcial → selecionar cliente →
 * Contas a Receber → recibo → limpeza do carrinho → assert no banco.
 *
 * Referência única da lacuna conhecida "parcial + cliente + CR via UI".
 */
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
import {
  assertFase5bGoldenFlowEnvInCi,
  caixaOperadorEmail,
  e2eProdutoCodigoBarras,
  hasFase5bGoldenFlowEnv,
} from './helpers/env'
import { loginCaixaOperador } from './helpers/login'
import { expectCaixaShellVisible } from './helpers/caixaShell'
import { ensureCaixaAberto } from './helpers/ensureCaixaAberto'
import {
  adicionarProdutoDemo,
  dismissReciboSeAberto,
  finalizarVenda,
  irParaAbaPgto,
  parcelasNoPainel,
  readTotalLiquidoFooter,
  round2,
} from './helpers/caixaPagamento'
import { gotoApp } from './helpers/url'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'

test.describe.configure({ mode: 'serial' })

type ClienteSeed = {
  id: string
  nome: string
  lojaId: string
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  return createClient(url, serviceRole)
}

async function seedClienteOperadorLoja(): Promise<ClienteSeed> {
  const admin = adminClient()
  const email = caixaOperadorEmail()

  const { data: authUser, error: authErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (authErr) throw new Error(`Fase5b seed: listUsers (${authErr.message})`)

  const user = authUser.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`Fase5b seed: operador ${email} não encontrado no Auth.`)

  const { data: row, error: lojaErr } = await admin
    .from('usuarios')
    .select('loja_id')
    .eq('id', user.id)
    .maybeSingle()
  if (lojaErr) throw new Error(`Fase5b seed: usuarios (${lojaErr.message})`)

  const lojaId = (row?.loja_id as string | null) ?? LOJA_MATRIZ_ID
  const sufixo = Date.now()
  const nome = `E2E Fase5b ${sufixo}`
  const documento = `9${String(sufixo).slice(-10)}`

  const { data: cliente, error: cliErr } = await admin
    .from('clientes')
    .insert({
      nome,
      documento,
      loja_id: lojaId,
      ativo: true,
      tipo: 'PF',
      limite_credito: 9999,
    })
    .select('id, nome')
    .single()

  if (cliErr || !cliente) {
    throw new Error(`Fase5b seed: insert cliente (${cliErr?.message ?? 'sem retorno'})`)
  }

  return { id: String(cliente.id), nome: String(cliente.nome), lojaId }
}

async function assertContasReceber(
  clienteId: string,
  esperadoAberto: number,
): Promise<void> {
  const admin = adminClient()
  const snapshot = await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('contas_receber')
          .select('id, venda_id, valor_aberto, status')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) throw new Error(error.message)
        const cr = data?.[0]
        if (!cr?.venda_id) return null
        return {
          valorAberto: round2(Number(cr.valor_aberto)),
          status: String(cr.status ?? ''),
          vendaId: String(cr.venda_id),
        }
      },
      { timeout: 20_000 },
    )
    .not.toBeNull()

  expect(snapshot).toMatchObject({
    valorAberto: esperadoAberto,
    status: 'ABERTO',
  })
  expect(snapshot!.vendaId.length).toBeGreaterThan(10)
}

test.describe('Caixa — Golden Flow Fase 5b (parcial + cliente + CR)', () => {
  test.beforeAll(() => {
    assertFase5bGoldenFlowEnvInCi()
  })

  test('ponta a ponta: parcial, cliente, CR, recibo e carrinho limpo', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    if (!hasFase5bGoldenFlowEnv()) {
      testInfo.skip(
        true,
        'Local: PLAYWRIGHT_CAIXA_TEST_*, NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      )
      return
    }

    const cliente = await seedClienteOperadorLoja()

    await loginCaixaOperador(page)
    await gotoApp(page, '/caixa')
    await expectCaixaShellVisible(page)

    const turno = await ensureCaixaAberto(page, '300')
    expect(['ja_aberto', 'abriu']).toContain(turno)

    await adicionarProdutoDemo(page, e2eProdutoCodigoBarras())
    await irParaAbaPgto(page)

    const total = await readTotalLiquidoFooter(page)
    expect(total).toBeGreaterThan(0)

    const pago = round2(Math.max(0.01, total * 0.4))
    const saldoEsperado = round2(total - pago)
    expect(saldoEsperado).toBeGreaterThan(0)

    const { inputs } = parcelasNoPainel(page)
    await inputs.nth(0).fill(String(pago))

    await expect(page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i })).toBeEnabled({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /Finalizar venda|完成销售|完成銷售/i }).click()

    const modal = page.getByRole('heading', { name: /Selecionar Cliente/i })
    await expect(modal).toBeVisible({ timeout: 15_000 })

    const busca = page.locator('#busca-cliente')
    await busca.fill(cliente.nome)
    await page.getByRole('button', { name: /^Buscar$/i }).click()
    await expect(page.getByRole('button', { name: new RegExp(cliente.nome, 'i') }).first()).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: new RegExp(cliente.nome, 'i') }).first().click()
    await expect(modal).toBeHidden({ timeout: 10_000 })

    await finalizarVenda(page)
    await dismissReciboSeAberto(page)

    await expect(page.getByTestId('caixa-total-liquido')).toHaveAttribute(
      'data-total-liquido',
      '0.00',
      { timeout: 15_000 },
    )

    await assertContasReceber(cliente.id, saldoEsperado)
  })
})

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'

const LOGIN_PATH = '/login'

function hasTransferenciaE2eEnv() {
  return (
    hasGerenteTestUser() &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

async function prepararDadosTransferenciaE2E() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  const admin = createClient(url, serviceRole)

  const { data: lojas, error: lojasErr } = await admin
    .from('lojas')
    .select('id, nome, codigo')
    .eq('ativo', true)
    .order('nome')
    .limit(2)

  if (lojasErr || !lojas || lojas.length < 2) {
    throw new Error(`E2E transferência: sem lojas suficientes (${lojasErr?.message ?? 'dados insuficientes'}).`)
  }

  const origem = lojas[0]
  const destino = lojas[1]
  const sufixo = Date.now()
  const nome = `Produto E2E Transfer ${sufixo}`
  const codigo = `E2E-TRANSF-${sufixo}`

  const { data: produto, error: produtoErr } = await admin
    .from('produtos')
    .insert({
      nome,
      codigo_barras: codigo,
      preco_varejo: 1,
      origem: 'china_manual',
      tem_nf: false,
      unidade_medida: 'UN',
      ativo: true,
      limite_transferencia_sem_observacao: 50,
    })
    .select('id, nome')
    .single()

  if (produtoErr || !produto) {
    throw new Error(`E2E transferência: falha ao criar produto (${produtoErr?.message ?? 'sem retorno'}).`)
  }

  const { error: estoqueErr } = await admin.from('estoque').upsert({
    loja_id: origem.id,
    produto_id: produto.id,
    quantidade_atual: 120,
    estoque_minimo: 0,
  })
  if (estoqueErr) {
    throw new Error(`E2E transferência: falha ao preparar estoque (${estoqueErr.message}).`)
  }

  return {
    origem,
    destino,
    produto,
  }
}

test.describe('Gerente transferências - feedback visual crítico', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test('modal + botão desabilitado + Processando... + toast de sucesso', async ({ page }, testInfo) => {
    if (!hasTransferenciaE2eEnv()) {
      testInfo.skip(
        true,
        'Local: defina PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD, NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      )
      return
    }

    const { origem, destino, produto } = await prepararDadosTransferenciaE2E()

    await page.goto(LOGIN_PATH)
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
    await page.getByPlaceholder('Senha').fill(process.env.PLAYWRIGHT_TEST_PASSWORD!)
    await page.getByRole('button', { name: /^Entrar$/ }).click()
    await page.waitForURL(/\/(caixa|gerente)/, { timeout: 20_000 })

    // Atraso artificial da action para estabilizar verificação do estado "Processando...".
    await page.route('**/gerente/transferencias**', async (route) => {
      await page.waitForTimeout(450)
      await route.continue()
    })

    await page.goto('/gerente/transferencias')
    await expect(page.getByRole('heading', { name: /Transferências|调拨/ })).toBeVisible()

    await page.locator('select[name="origem"]').selectOption(origem.id)
    await page.locator('select[name="destino"]').selectOption(destino.id)
    await page.locator('select[name="produto_id"]').selectOption(produto.id)
    await page.locator('input[name="quantidade"]').fill('10')
    await page.locator('input[name="quantidade"]').blur()

    await page.getByRole('button', { name: /^Transferir$|^调拨$/ }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Você está movendo|你将把/)).toBeVisible()

    const btnConfirmar = page.getByRole('button', { name: /^Confirmar$/ })
    await btnConfirmar.click()

    await expect(btnConfirmar).toBeDisabled()
    await expect(page.getByRole('button', { name: /Processando\.\.\.|处理中\.\.\./ })).toBeVisible()

    await expect(page.getByText(/Transferência concluída\. ID:/)).toBeVisible({ timeout: 15_000 })
  })
})

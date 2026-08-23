import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  hasGerenteTestUser,
} from './helpers/env'
import { garantirIdiomaPt } from './helpers/idioma'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

/** Loja canônica de fixture (`032_lojas_estoque_por_loja.sql`) — mesma usada em outros helpers E2E. */
const LOJA_MATRIZ_ID = 'a0000001-0000-4000-8000-000000000001'
/**
 * Segunda loja fixa e idempotente, só para este teste. O seed local
 * (`backend/supabase/seed.sql`) cria uma única loja (Matriz) — sem uma
 * segunda, `prepararDadosTransferenciaE2E` sempre lançava "sem lojas
 * suficientes" antes de a UI sequer carregar. UUID fixo + `ON CONFLICT` (não
 * `Date.now()` no id) para não acumular lojas fantasma a cada rerun.
 */
const LOJA_DESTINO_TRANSFERENCIA_E2E_ID = 'a0000001-0000-4000-8000-0000000000e2'

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

  const { data: origemRow, error: origemErr } = await admin
    .from('lojas')
    .select('id, nome, codigo')
    .eq('id', LOJA_MATRIZ_ID)
    .maybeSingle()
  if (origemErr || !origemRow) {
    throw new Error(`E2E transferência: loja Matriz ausente (${origemErr?.message ?? 'sem linha'}).`)
  }

  const { data: destinoRow, error: destinoErr } = await admin
    .from('lojas')
    .upsert(
      {
        id: LOJA_DESTINO_TRANSFERENCIA_E2E_ID,
        // Prefixo "Z" de propósito: a página ordena lojas por nome e o
        // <select> usa a 1ª opção como default do DOM antes de qualquer
        // `selectOption` explícito. "Matriz" (origem) tem que continuar
        // sendo essa 1ª opção — comprovado em CI: com um nome que ordena
        // ANTES de "Matriz", os dois selects (origem e destino) acabavam
        // ambos nesta loja nova, disparando "origem e destino não podem
        // ser a mesma loja" e travando o botão Transferir.
        nome: 'Z-E2E Transferências — Filial',
        codigo: 'E2E-TRANSF',
        ativo: true,
      },
      { onConflict: 'id' },
    )
    .select('id, nome, codigo')
    .single()
  if (destinoErr || !destinoRow) {
    throw new Error(`E2E transferência: falha ao garantir loja destino (${destinoErr?.message ?? 'sem retorno'}).`)
  }

  const origem = origemRow
  const destino = destinoRow
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

  test.afterEach(async ({ page }) => {
    // Defesa adicional: este teste não troca de idioma, mas se algo o levar
    // a fazê-lo no futuro (ou se um teste concorrente em outro worker
    // deixar "zh" no meio da execução), o próximo teste com esta conta não
    // deve herdar o estado.
    await garantirIdiomaPt(page)
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

    // Sem override: GERENTE sempre cai em /admin/dashboard, nunca /gerente.
    await loginGerente(page)
    // Baseline determinística: este teste assume PT (só o botão "Confirmar"
    // é testado, não bilíngue por padrão de projeto). Sem isso, herdar "zh"
    // de uma falha anterior em `gerente.spec.ts` (mesma conta compartilhada)
    // faz o modal renderizar "确认" — comprovado ao vivo antes desta guarda.
    await garantirIdiomaPt(page)

    // Atraso artificial da action para estabilizar verificação do estado "Processando...".
    await page.route('**/gerente/transferencias**', async (route) => {
      await page.waitForTimeout(450)
      await route.continue()
    })

    await gotoApp(page, '/gerente/transferencias')
    await expect(page.getByRole('heading', { name: /Transferências|调拨/ })).toBeVisible()

    await page.locator('select[name="origem"]').selectOption(origem.id)
    await page.locator('select[name="destino"]').selectOption(destino.id)
    await page.locator('select[name="produto_id"]').selectOption(produto.id)
    await page.locator('input[name="quantidade"]').fill('10')
    await page.locator('input[name="quantidade"]').blur()

    await page.getByRole('button', { name: /^Transferir$|^调拨$/ }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Você está movendo|你将把/)).toBeVisible()

    // Bilíngue como o botão "Transferir/调拨" acima: o idioma do GERENTE é
    // persistido no perfil (compartilhado entre specs) — se um teste anterior
    // (ex.: `gerente.spec.ts`, fluxo crítico em chinês) falhou antes de
    // reverter para PT, este spec herda "zh" e o modal renderiza "确认", não
    // "Confirmar". Comprovado ao vivo: `getByRole('button', {name:/^Confirmar$/})`
    // estourou 90s com o diálogo "确认调拨" já visível e um botão "确认" nele.
    const btnConfirmar = page.getByRole('button', { name: /^Confirmar$|^确认$/ })
    await btnConfirmar.click()

    // É o MESMO <button> — `loading ? t.btn_processando : m.comum.confirmar`
    // (TransferenciasGerentePageClient.tsx) — não um elemento separado, nem
    // "Confirmar" desabilitado mantendo o rótulo. Assim que `loading` vira
    // true o texto já é "Processando...", então `btnConfirmar` (locator por
    // nome "Confirmar") passa a não casar mais NADA — checar `.toBeDisabled()`
    // nele depois do clique sempre falha com "element(s) not found", não com
    // "not disabled". A prova de loading é o botão "Processando..." mesmo.
    const btnProcessando = page.getByRole('button', {
      name: /Processando\.\.\.|处理中\.\.\./,
    })
    await expect(btnProcessando).toBeVisible()
    await expect(btnProcessando).toBeDisabled()

    await expect(page.getByText(/Transferência concluída\. ID:/)).toBeVisible({ timeout: 15_000 })
  })
})

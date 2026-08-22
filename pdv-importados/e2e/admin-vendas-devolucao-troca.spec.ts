import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
import {
  assertGerenteCredentialsInCi,
  assertSupabasePublicEnvInCi,
  caixaOperadorEmail,
  hasCaixaOperadorUser,
  hasGerenteTestUser,
} from './helpers/env'
import { loginGerente } from './helpers/login'
import { gotoApp } from './helpers/url'

/**
 * Sprint B — Devolução/Troca em /admin/vendas
 *
 * Pré-requisitos:
 * - Migration 248 aplicada no ambiente alvo (homolog local ou staging)
 * - Pelo menos uma venda CONCLUIDA com itens
 * - Credenciais PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD (gerente)
 *
 * CI: falha se secrets ausentes (não skip silencioso).
 *
 * `?status=CONCLUIDA` é obrigatório na navegação: `VendaDetailSheet.tsx` só
 * renderiza "Devolver / trocar" quando `venda.status === 'CONCLUIDA'`
 * (confirmado no componente), e `/admin/vendas` sem filtro de status lista
 * TODAS as vendas do dia. Em CI, outros specs de E2E rodam em workers
 * paralelos contra o MESMO Supabase local e criam vendas concorrentemente
 * (em espera, canceladas, etc.) — "a primeira linha" da lista sem filtro não é
 * determinística. Não era o locator nem o timeout: a linha clicada existia,
 * só não era necessariamente uma venda concluída.
 *
 * Filtrar por status sozinho não bastava: rodando este arquivo isolado (sem
 * nenhum outro spec criando vendas em paralelo), a lista filtrada podia ficar
 * vazia. Por isso o `beforeAll` abaixo garante sua PRÓPRIA venda concluída,
 * chamando a RPC canônica real (mesmo caminho de escrita da UI) via
 * service_role — não é um insert bruto simulando o estado, é o mesmo
 * `finalizar_venda_transacional_canonica_v4` que o caixa usa.
 */
test.describe('Sprint B: Devolução/Troca em /admin/vendas', () => {
  test.beforeAll(() => {
    assertSupabasePublicEnvInCi()
    assertGerenteCredentialsInCi()
  })

  test.skip(!hasGerenteTestUser(), 'PLAYWRIGHT_TEST_EMAIL/PASSWORD ausentes (local)')

  test.beforeAll(async () => {
    if (!hasCaixaOperadorUser()) return // ambiente local sem operador: segue só com o que já existir

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !serviceRole) return // sem service_role: não seeda, testa com o que já existir no banco

    const supabase: SupabaseClient = createClient(url, serviceRole)

    const email = caixaOperadorEmail()
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    if (authErr) throw new Error(`Fixture ausente: admin.listUsers falhou (${authErr.message})`)
    const user = authUsers.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      throw new Error(`Fixture ausente: operador ${email} não existe no Auth local.`)
    }

    const { data: usuarioRow, error: usuarioErr } = await supabase
      .from('usuarios')
      .select('loja_id')
      .eq('id', user.id)
      .maybeSingle()
    if (usuarioErr || !usuarioRow?.loja_id) {
      throw new Error(`Fixture ausente: usuarios.loja_id para ${user.id} (${usuarioErr?.message}).`)
    }
    const lojaId = String(usuarioRow.loja_id)

    const { data: caixaAberto } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .maybeSingle()
    let caixaId = caixaAberto?.id ? String(caixaAberto.id) : null
    if (!caixaId) {
      const { data: novoCaixa, error: caixaErr } = await supabase
        .from('caixas')
        .insert({ operador_id: user.id, loja_id: lojaId, valor_inicial: 100, status: 'ABERTO' })
        .select('id')
        .single()
      if (caixaErr || !novoCaixa) {
        throw new Error(`Fixture ausente: não foi possível abrir caixa (${caixaErr?.message}).`)
      }
      caixaId = String(novoCaixa.id)
    }

    const { data: produtoRow, error: produtoErr } = await supabase
      .from('produtos')
      .select('id, preco_varejo')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()
    if (produtoErr || !produtoRow?.id) {
      throw new Error(`Fixture ausente: nenhum produto ativo na loja ${lojaId} (${produtoErr?.message}).`)
    }
    const preco = Number(produtoRow.preco_varejo)

    // A versão vigente da RPC exige p_total_bruto/p_total_desconto/
    // p_total_liquido não-nulos e batendo com o calculado internamente
    // (`FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES` se omitidos ou
    // divergentes) — sem desconto, os três equivalem ao preço do item.
    const { error: rpcErr } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', {
      p_venda_id: crypto.randomUUID(),
      p_caixa_id: caixaId,
      p_operador_id: user.id,
      p_loja_id: lojaId,
      p_total_bruto: preco,
      p_total_desconto: 0,
      p_total_liquido: preco,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: preco }],
      p_cliente_id: null,
      p_itens: [
        {
          item_id: crypto.randomUUID(),
          produto_id: produtoRow.id,
          quantidade: 1,
          preco_original: preco,
          preco_unitario: preco,
          desconto_unitario: 0,
          tipo_preco: 'VAREJO',
        },
      ],
    })
    if (rpcErr) {
      throw new Error(`Fixture ausente: não foi possível criar venda concluída (${rpcErr.message}).`)
    }
  })

  test('abre detalhe de venda concluída e exibe ação Devolver / trocar', async ({ page }) => {
    await loginGerente(page, { postLoginUrl: /\/(admin|gerente|caixa)/ })
    await gotoApp(page, '/admin/vendas?status=CONCLUIDA')

    await expect(page.getByText(/Vendas|vendas/i).first()).toBeVisible({ timeout: 30_000 })

    // Clica na primeira linha da tabela (venda)
    const firstRow = page.locator('table tbody tr, [data-row-key]').first()
    await expect(firstRow).toBeVisible({ timeout: 30_000 })
    await firstRow.click()

    const devolverBtn = page.getByRole('button', { name: /Devolver\s*\/\s*trocar/i })
    await expect(devolverBtn).toBeVisible({ timeout: 15_000 })
  })

  test('fluxo modal: selecionar item, motivo e confirmar devolução', async ({ page }) => {
    await loginGerente(page, { postLoginUrl: /\/(admin|gerente|caixa)/ })
    await gotoApp(page, '/admin/vendas?status=CONCLUIDA')

    const firstRow = page.locator('table tbody tr, [data-row-key]').first()
    await expect(firstRow).toBeVisible({ timeout: 30_000 })
    await firstRow.click()

    await page.getByRole('button', { name: /Devolver\s*\/\s*trocar/i }).click()

    // `getByRole('dialog')` sozinho casa DOIS elementos: o próprio
    // `VendaDetailSheet` (o painel de detalhe é role=dialog) e o modal de
    // devolução aberto por cima dele — strict mode violation comprovada em
    // execução isolada. Escopar pelo título resolve para o modal específico.
    const dialog = page.getByRole('dialog', { name: /Devolução parcial|Troca de itens/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Devolução parcial|Troca de itens/i)).toBeVisible()

    // Incrementa quantidade do primeiro item disponível (+)
    const plusBtn = dialog.locator('button', { hasText: '+' }).first()
    if (await plusBtn.isEnabled()) {
      await plusBtn.click()
    }

    await dialog.getByLabel(/Motivo/i).fill('E2E homolog: devolução parcial smoke')
    await dialog.getByRole('button', { name: /Confirmar devolução/i }).click()

    // Sucesso: modal fecha ou toast de sucesso
    await expect(dialog).toBeHidden({ timeout: 30_000 })
  })
})

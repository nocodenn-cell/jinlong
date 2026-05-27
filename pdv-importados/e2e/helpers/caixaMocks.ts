/**
 * Helpers para smoke test determinístico do PDV.
 *
 * Intercepta todas as chamadas Supabase com respostas fixas.
 * O teste roda sem nenhum secret, sem rede real, 100% determinístico.
 *
 * Uso:
 *   import { setupCaixaMocks, MOCK_CAIXA_ID } from './helpers/caixaMocks'
 *   await setupCaixaMocks(page)
 */
import type { Page } from '@playwright/test'

// IDs fixos para assertivas determinísticas
export const MOCK_CAIXA_ID = 'a0000001-0000-4000-8000-0000000000ca'
export const MOCK_VENDA_ID = 'b0000002-0000-4000-8000-0000000000ca'
export const MOCK_OPERADOR_ID = 'c0000003-0000-4000-8000-0000000000ca'
export const MOCK_LOJA_ID = 'd0000004-0000-4000-8000-0000000000ca'
export const MOCK_PRODUTO_ID = 'e0000005-0000-4000-8000-0000000000ca'
export const MOCK_CODIGO_BARRAS = '7898512340003'

// ── resposta base Supabase ────────────────────────────────────────────────────

function ok(data: unknown) {
  return { body: JSON.stringify(data), status: 200, contentType: 'application/json' }
}

function supabaseRpc(data: unknown) {
  return ok(Array.isArray(data) ? data : [data])
}

// ── setup principal ────────────────────────────────────────────────────────────

export async function setupCaixaMocks(page: Page): Promise<void> {
  const SB = '**/supabase.co/**'
  const SB2 = '**/supabase.io/**'

  // Auth — retorna usuário operador válido
  const authHandler = (route: Parameters<Parameters<typeof page.route>[1]>[0]) => {
    const url = route.request().url()
    if (url.includes('/token') || url.includes('/session')) {
      return route.fulfill(ok({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: MOCK_OPERADOR_ID,
          email: 'operador@teste.local',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
        },
      }))
    }
    return route.continue()
  }
  await page.route(`${SB}auth/**`, authHandler)
  await page.route(`${SB2}auth/**`, authHandler)

  // Tabela: usuarios (perfil do operador)
  await page.route('**/rest/v1/usuarios*', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(ok([{ perfil: 'OPERADOR', idioma_preferido: 'pt' }]))
    }
    return route.continue()
  })

  // Tabela: caixas (caixa aberto)
  await page.route('**/rest/v1/caixas*', (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill(ok([{
        id: MOCK_CAIXA_ID,
        status: 'ABERTO',
        data_abertura: new Date().toISOString(),
        valor_inicial: 500,
      }]))
    }
    if (method === 'POST') {
      return route.fulfill(ok([{ id: MOCK_CAIXA_ID }]))
    }
    if (method === 'PATCH') {
      return route.fulfill(ok([{ id: MOCK_CAIXA_ID }]))
    }
    return route.continue()
  })

  // Tabela: produtos (busca por código de barras e nome)
  await page.route('**/rest/v1/produtos*', (route) => {
    return route.fulfill(ok([{
      id: MOCK_PRODUTO_ID,
      nome: 'Produto Demo Teste',
      codigo_barras: MOCK_CODIGO_BARRAS,
      preco_varejo: 29.90,
      preco_atacado: 24.90,
      categoria_id: null,
      origem: 'IMPORTADO',
      tem_nf: false,
      observacao: null,
      ativo: true,
    }]))
  })

  // Tabela: categorias
  await page.route('**/rest/v1/categorias*', (route) => {
    return route.fulfill(ok([]))
  })

  // Tabela: regras_preco
  await page.route('**/rest/v1/regras_preco*', (route) => {
    return route.fulfill(ok([]))
  })

  // Tabela: movimentacoes_caixa
  await page.route('**/rest/v1/movimentacoes_caixa*', (route) => {
    return route.fulfill(ok([]))
  })

  // Tabela: estoque
  await page.route('**/rest/v1/estoque*', (route) => {
    return route.fulfill(ok([{ quantidade_atual: 50, estoque_minimo: 5 }]))
  })

  // RPC: pdv_config_para_caixa_web
  await page.route('**/rest/v1/rpc/pdv_config_para_caixa_web*', (route) => {
    return route.fulfill(supabaseRpc({
      quantidade_minima_atacado_padrao: 3,
      blind_closure: false,
    }))
  })

  // RPC: calcular_preco_produto
  await page.route('**/rest/v1/rpc/calcular_preco_produto*', (route) => {
    return route.fulfill(supabaseRpc({ preco: 29.90, tipo: 'VAREJO', erro: null }))
  })

  // RPC: calcular_valor_sistema_dinheiro_caixa
  await page.route('**/rest/v1/rpc/calcular_valor_sistema_dinheiro_caixa*', (route) => {
    return route.fulfill(supabaseRpc(1250.50))
  })

  // RPC: finalizar_venda_transacional_canonica_v3 — resposta de sucesso
  await page.route('**/rest/v1/rpc/finalizar_venda_transacional_canonica_v3*', (route) => {
    return route.fulfill(supabaseRpc({
      venda_id: MOCK_VENDA_ID,
      status: 'CONCLUIDA',
      mensagem: 'Venda finalizada com sucesso',
      dados_fiscais: null,
      itens_atualizados: [],
      estoque_baixado: [],
    }))
  })

  // RPC: obter_limite_sangria_sem_gerente
  await page.route('**/rest/v1/rpc/obter_limite_sangria_sem_gerente*', (route) => {
    return route.fulfill(supabaseRpc(200))
  })

  // RPC: registrar_movimentacao
  await page.route('**/rest/v1/rpc/registrar_movimentacao*', (route) => {
    return route.fulfill(supabaseRpc({
      movimentacao_id: 'f0000006-0000-4000-8000-0000000000ca',
      status_movimentacao: 'CONFIRMADA',
      saldo_atual: 1150.50,
    }))
  })

  // RPC: vendas (tabela direta)
  await page.route('**/rest/v1/vendas*', (route) => {
    return route.fulfill(ok([{ id: MOCK_VENDA_ID, total_liquido: 29.90 }]))
  })

  // Next.js API routes e server actions — deixa passar (processados localmente)
  // Qualquer rota não interceptada continua normalmente
}

// ── mock de falha (para testar error states) ─────────────────────────────────

export async function setupFinalizarFalha(page: Page, mensagem = 'Erro de conexão simulado'): Promise<void> {
  await page.route('**/rest/v1/rpc/finalizar_venda_transacional_canonica_v3*', (route) => {
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: mensagem, code: 'MOCK_ERROR' }),
    })
  })
}

export async function setupFinalizarTimeout(page: Page, delayMs = 35_000): Promise<void> {
  await page.route('**/rest/v1/rpc/finalizar_venda_transacional_canonica_v3*', async (route) => {
    await new Promise((r) => setTimeout(r, delayMs))
    await route.continue()
  })
}

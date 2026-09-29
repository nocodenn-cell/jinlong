'use server'

/**
 * S9 (G-01) — histórico de fechamento de caixa. SOMENTE LEITURA.
 *
 * NÃO cria tabela/RPC nova. Lê `caixas` (já filtrada por `status = 'FECHADO'`)
 * e, sob demanda, `movimentacoes_caixa` do turno selecionado — ambas já
 * existentes, com RLS por loja já vigente (057_caixas_rls_consolidate_
 * permissive.sql: GERENTE/ADMIN restritos à mesma loja, DONO vê todas).
 *
 * Auth guard e escopo de loja seguem exatamente essa mesma regra (achado da
 * certificação pré-go-live: este arquivo usava assertAdminSession com uma
 * action não registrada, e restringia DONO à loja da sessão — RLS já
 * corrigia o vazamento, mas a app sub-restringia DONO indevidamente).
 *
 * `valor_sistema` nunca é recalculado aqui — vem derivado dos campos
 * persistidos no fechamento (`caixasHistorico.ts`), nunca de
 * `calcular_valor_sistema_dinheiro_caixa`.
 */

import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import {
  mapCaixaHistoricoLinha,
  mapCaixaMovimentacaoLinha,
  type CaixaHistoricoLinha,
  type CaixaHistoricoRaw,
  type CaixaMovimentacaoLinha,
  type CaixaMovimentacaoRaw,
} from './caixasHistorico'

type R<T> = { ok: true; data: T } | { ok: false; error: string }

const CAIXA_HISTORICO_SELECT = `
  id, operador_id, data_abertura, data_fechamento,
  valor_inicial, valor_fechamento, fechamento_diferenca, fechamento_observacao,
  operador:usuarios!caixas_operador_id_fkey ( nome )
`

const LIMITE = 100

export async function listarHistoricoCaixas(): Promise<R<CaixaHistoricoLinha[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  // Mesma regra de 057_caixas_rls_consolidate_permissive.sql: DONO vê todas
  // as lojas (sem filtro); GERENTE/ADMIN ficam restritos à própria loja.
  const loja = auth.session.perfil === 'DONO' ? null : (auth.session.lojaId ?? LOJA_MATRIZ_ID)
  const supabase = await createClient()

  let query = supabase
    .from('caixas')
    .select(CAIXA_HISTORICO_SELECT)
    .eq('status', 'FECHADO')
  if (loja !== null) query = query.eq('loja_id', loja)

  const { data, error } = await query
    .order('data_fechamento', { ascending: false })
    .limit(LIMITE)

  if (error) return { ok: false, error: 'Não foi possível carregar o histórico de caixas.' }

  const linhas = (data as unknown as CaixaHistoricoRaw[])
    .map(mapCaixaHistoricoLinha)
    .filter((l): l is NonNullable<typeof l> => l !== null)

  return { ok: true, data: linhas }
}

export async function listarMovimentacoesCaixa(caixaId: string): Promise<R<CaixaMovimentacaoLinha[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  // Mesma regra de 057_caixas_rls_consolidate_permissive.sql: DONO vê todas
  // as lojas (sem filtro); GERENTE/ADMIN ficam restritos à própria loja.
  const loja = auth.session.perfil === 'DONO' ? null : (auth.session.lojaId ?? LOJA_MATRIZ_ID)
  const supabase = await createClient()

  // Confirma que o caixa pertence à loja do ator (quando restrito) antes de
  // listar suas movimentações — RLS já barra, este é o mesmo padrão
  // defensivo (checar tenant na app) usado em todo o resto do produto.
  let caixaQuery = supabase.from('caixas').select('id').eq('id', caixaId)
  if (loja !== null) caixaQuery = caixaQuery.eq('loja_id', loja)
  const { data: caixa, error: caixaError } = await caixaQuery.maybeSingle()
  if (caixaError) return { ok: false, error: 'Não foi possível confirmar o caixa selecionado.' }
  if (!caixa) return { ok: false, error: 'Caixa não encontrado.' }

  const [movimentacoes, liquidacoes] = await Promise.all([
    supabase
      .from('movimentacoes_caixa')
      .select('id, tipo, valor, motivo, status, created_at')
      .eq('caixa_id', caixaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    // Recebimento/estorno de contas a receber em DINHEIRO credita/debita
    // `caixas.saldo_atual` diretamente (`registrar_liquidacao_receber`), sem
    // passar por `movimentacoes_caixa` — sem isto, esse dinheiro afeta o
    // saldo de fechamento mas nunca aparece no extrato do turno para o
    // gerente conferir. `caixa_id` só vem preenchido quando a forma foi
    // DINHEIRO (ver migration 20260813231034), então nenhum filtro extra é
    // necessário aqui.
    supabase
      .from('liquidacoes_receber')
      .select('id, valor, operacao_tipo, created_at')
      .eq('caixa_id', caixaId)
      .order('created_at', { ascending: true }),
  ])

  if (movimentacoes.error) {
    return { ok: false, error: 'Não foi possível carregar as movimentações do turno.' }
  }
  // Leitura complementar — uma falha aqui não deve impedir a exibição do
  // extrato principal (mesma fonte oficial, sem lógica financeira paralela:
  // só não conseguimos enriquecer o extrato desta vez).
  const liquidacoesRows = liquidacoes.error ? [] : (liquidacoes.data ?? [])

  const linhasMovimentacao = (movimentacoes.data as unknown as CaixaMovimentacaoRaw[]).map(
    mapCaixaMovimentacaoLinha,
  )
  const linhasLiquidacao = liquidacoesRows.map(
    (row): CaixaMovimentacaoLinha => ({
      id: row.id,
      // Sinal segue o padrão de `movimentacoes_caixa` (valor sempre positivo,
      // direção comunicada só pelo tipo/motivo — não por número negativo).
      // `rotuloTipoMovimentacao` (CaixasHistoricoTable) só mapeia SANGRIA/
      // SUPRIMENTO para um rótulo traduzido e devolve o resto cru — por isso
      // o texto aqui já vem pronto para exibição, não uma chave de tipo.
      tipo: row.operacao_tipo === 'ESTORNO' ? 'Estorno de recebimento' : 'Recebimento (conta a receber)',
      valor: Math.abs(Number(row.valor)),
      motivo:
        row.operacao_tipo === 'ESTORNO'
          ? 'Estorno de recebimento de conta a receber (dinheiro)'
          : 'Recebimento de conta a receber (dinheiro)',
      status: 'aprovada',
      criadaEm: row.created_at,
    }),
  )

  const data = [...linhasMovimentacao, ...linhasLiquidacao].sort((a, b) =>
    a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : 0,
  )

  return { ok: true, data }
}

'use server'

/**
 * S9 (G-01) — leitura de caixas para `/admin/caixas`. SOMENTE LEITURA.
 *
 * NÃO cria tabela/RPC nova. Lê `caixas` e, sob demanda, `movimentacoes_caixa`
 * — ambas já existentes, com RLS por loja já vigente (057_caixas_rls_consolidate_
 * permissive.sql: GERENTE/ADMIN restritos à mesma loja, DONO vê todas).
 *
 * Auth guard e escopo de loja seguem exatamente essa mesma regra (achado da
 * certificação pré-go-live: este arquivo usava assertAdminSession com uma
 * action não registrada, e restringia DONO à loja da sessão — RLS já
 * corrigia o vazamento, mas a app sub-restringia DONO indevidamente).
 *
 * `valor_sistema` nunca é recalculado aqui — vem derivado dos campos
 * persistidos no fechamento (`caixasHistorico.ts`), nunca de
 * `calcular_valor_sistema_dinheiro_caixa`. Abrir/fechar/sangria/suprimento
 * continuam sendo writers exclusivos do PDV (`/caixa`).
 */

import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import {
  agregarMovimentosPorCaixa,
  mapCaixaAbertoLinha,
  mapCaixaHistoricoLinha,
  mapCaixaMovimentacaoLinha,
  type CaixaAbertoLinha,
  type CaixaAbertoRaw,
  type CaixaHistoricoLinha,
  type CaixaHistoricoRaw,
  type CaixaMovimentacaoLinha,
  type CaixaMovimentacaoRaw,
  type CaixaMovimentoAgregavelRaw,
} from './caixasHistorico'
import { CAIXAS_FILTRO_VAZIO, periodoInicio, type CaixasFiltro } from './caixasFiltros'

type R<T> = { ok: true; data: T } | { ok: false; error: string }

const CAIXA_HISTORICO_SELECT = `
  id, operador_id, data_abertura, data_fechamento,
  valor_inicial, valor_fechamento, fechamento_diferenca, fechamento_observacao,
  turno_anterior_id, motivo_retomada,
  operador:usuarios!caixas_operador_id_fkey ( nome )
`

const CAIXA_ABERTO_SELECT = `
  id, operador_id, data_abertura, valor_inicial,
  turno_anterior_id, motivo_retomada,
  operador:usuarios!caixas_operador_id_fkey ( nome )
`

/** Paginação por cursor (Anterior/Próxima), como `/admin/vendas`: busca PAGE_SIZE+1 para saber `hasMore`. */
const PAGE_SIZE = 25
/** Teto defensivo de turnos abertos simultâneos exibidos. */
const LIMITE_ABERTOS = 200
const LIMITE_OPERADORES = 200

export type HistoricoCaixasPagina = { linhas: CaixaHistoricoLinha[]; hasMore: boolean }
export type ResumoCaixas = { fechadosHoje: number; comDiferenca: number; fechadosIncompletos: number }
export type OperadorCaixaOpcao = { id: string; nome: string }

/**
 * Mesma regra de 057_caixas_rls_consolidate_permissive.sql: DONO vê todas as
 * lojas (sem filtro); GERENTE/ADMIN ficam restritos à própria loja.
 */
function lojaDoAtor(session: { perfil: string; lojaId: string | null }): string | null {
  return session.perfil === 'DONO' ? null : (session.lojaId ?? LOJA_MATRIZ_ID)
}

export async function listarHistoricoCaixas(
  filtro: CaixasFiltro = CAIXAS_FILTRO_VAZIO,
  page = 1,
): Promise<R<HistoricoCaixasPagina>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const loja = lojaDoAtor(auth.session)
  const supabase = await createClient()

  let query = supabase
    .from('caixas')
    .select(CAIXA_HISTORICO_SELECT)
    .eq('status', 'FECHADO')
    // Só turnos com fechamento completo (o que `fechar_caixa_*` sempre persiste).
    // Filtrar NA QUERY (e não descartar depois no mapper) mantém `range`/`hasMore`
    // coerentes com as linhas exibidas; os incompletos são contados em `resumoCaixas`.
    .not('data_fechamento', 'is', null)
    .not('valor_fechamento', 'is', null)
    .not('fechamento_diferenca', 'is', null)
  if (loja !== null) query = query.eq('loja_id', loja)
  if (filtro.inicio) query = query.gte('data_fechamento', filtro.inicio)
  if (filtro.fim) query = query.lte('data_fechamento', filtro.fim)
  if (filtro.operadorId) query = query.eq('operador_id', filtro.operadorId)
  if (filtro.status === 'divergencia') query = query.neq('fechamento_diferenca', 0)
  // `.or(string)` (e não `.not`) evita "Type instantiation is excessively deep" (TS2589)
  // nos genéricos do postgrest-js, já que a query acima acumula vários filtros.
  if (filtro.status === 'retomado') query = query.or('turno_anterior_id.not.is.null')

  const de = (Math.max(1, page) - 1) * PAGE_SIZE
  const { data, error } = await query
    .order('data_fechamento', { ascending: false })
    .range(de, de + PAGE_SIZE)

  if (error) return { ok: false, error: 'Não foi possível carregar o histórico de caixas.' }

  const raws = data as unknown as CaixaHistoricoRaw[]
  const linhas = raws
    .slice(0, PAGE_SIZE)
    .map(mapCaixaHistoricoLinha)
    .filter((l): l is NonNullable<typeof l> => l !== null)

  return { ok: true, data: { linhas, hasMore: raws.length > PAGE_SIZE } }
}

/**
 * Turnos ABERTOS agora + totais informativos de sangria/suprimento. Duas
 * consultas no total (turnos e movimentações em lote) — sem N+1. Não calcula
 * "esperado": isso exigiria `calcular_valor_sistema_dinheiro_caixa` por turno.
 */
export async function listarCaixasAbertos(): Promise<R<CaixaAbertoLinha[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const loja = lojaDoAtor(auth.session)
  const supabase = await createClient()

  let query = supabase.from('caixas').select(CAIXA_ABERTO_SELECT).eq('status', 'ABERTO')
  if (loja !== null) query = query.eq('loja_id', loja)
  const { data, error } = await query.order('data_abertura', { ascending: false }).limit(LIMITE_ABERTOS)
  if (error) return { ok: false, error: 'Não foi possível carregar os caixas abertos.' }

  const abertos = data as unknown as CaixaAbertoRaw[]
  if (abertos.length === 0) return { ok: true, data: [] }

  const { data: movs, error: movError } = await supabase
    .from('movimentacoes_caixa')
    .select('caixa_id, tipo, valor, status')
    .in('caixa_id', abertos.map((c) => c.id))
    .is('deleted_at', null)
  if (movError) return { ok: false, error: 'Não foi possível carregar as movimentações dos caixas abertos.' }

  const totais = agregarMovimentosPorCaixa(movs as unknown as CaixaMovimentoAgregavelRaw[])
  return { ok: true, data: abertos.map((c) => mapCaixaAbertoLinha(c, totais.get(c.id))) }
}

/**
 * KPIs de contagem do topo da tela (2 consultas `count`, sem trazer linhas):
 * fechamentos de hoje e fechamentos com diferença no período filtrado.
 */
export async function resumoCaixas(filtro: CaixasFiltro = CAIXAS_FILTRO_VAZIO): Promise<R<ResumoCaixas>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const loja = lojaDoAtor(auth.session)
  const supabase = await createClient()

  let hoje = supabase
    .from('caixas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'FECHADO')
    .gte('data_fechamento', periodoInicio('hoje') as string)
  if (loja !== null) hoje = hoje.eq('loja_id', loja)

  let divergentes = supabase
    .from('caixas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'FECHADO')
    .neq('fechamento_diferenca', 0)
  if (loja !== null) divergentes = divergentes.eq('loja_id', loja)
  if (filtro.inicio) divergentes = divergentes.gte('data_fechamento', filtro.inicio)
  if (filtro.fim) divergentes = divergentes.lte('data_fechamento', filtro.fim)
  if (filtro.operadorId) divergentes = divergentes.eq('operador_id', filtro.operadorId)

  // Integridade: FECHADO sem dados de fechamento não é produzido pelo PDV
  // (`fechar_caixa_atomico`/`_pdv_atomico` sempre gravam os três campos) — só por
  // escrita direta em `caixas.status`. Não entra no histórico; é sinalizado à parte.
  let incompletos = supabase
    .from('caixas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'FECHADO')
    .or('data_fechamento.is.null,valor_fechamento.is.null,fechamento_diferenca.is.null')
  if (loja !== null) incompletos = incompletos.eq('loja_id', loja)

  const [rHoje, rDiv, rInc] = await Promise.all([hoje, divergentes, incompletos])
  if (rHoje.error || rDiv.error || rInc.error) {
    return { ok: false, error: 'Não foi possível carregar o resumo de caixas.' }
  }

  return {
    ok: true,
    data: {
      fechadosHoje: rHoje.count ?? 0,
      comDiferenca: rDiv.count ?? 0,
      fechadosIncompletos: rInc.count ?? 0,
    },
  }
}

/** Opções do filtro "Operador" (mesma regra de loja das demais leituras). */
export async function listarOperadoresCaixa(): Promise<R<OperadorCaixaOpcao[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const loja = lojaDoAtor(auth.session)
  const supabase = await createClient()

  let query = supabase.from('usuarios').select('id, nome')
  if (loja !== null) query = query.eq('loja_id', loja)
  const { data, error } = await query.order('nome', { ascending: true }).limit(LIMITE_OPERADORES)
  if (error) return { ok: false, error: 'Não foi possível carregar os operadores.' }

  return { ok: true, data: (data ?? []).map((u) => ({ id: u.id, nome: u.nome })) }
}

export async function listarMovimentacoesCaixa(caixaId: string): Promise<R<CaixaMovimentacaoLinha[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const loja = lojaDoAtor(auth.session)
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
      categoria: row.operacao_tipo === 'ESTORNO' ? 'ESTORNO_AR' : 'RECEBIMENTO_AR',
    }),
  )

  const data = [...linhasMovimentacao, ...linhasLiquidacao].sort((a, b) =>
    a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : 0,
  )

  return { ok: true, data }
}

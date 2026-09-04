'use server'

/**
 * FastProduct Admin — Auditoria Visual (Fase 2 · item 1) · actions
 *
 * Timeline unificada SOMENTE-LEITURA sobre os ledgers que JÁ EXISTEM e JÁ são
 * gravados pelo núcleo (Fase 1). Esta action:
 *   - NÃO cria/altera tabela alguma;
 *   - NÃO cria/altera RPC alguma;
 *   - NÃO toca em venda/estoque/caixa/financeiro;
 *   - apenas faz SELECT nos ledgers já existentes, respeitando a RLS por loja.
 *
 * Fontes consumidas (todas com policy de SELECT por loja/perfil já vigente):
 *   - venda_eventos            (vendas registradas)          → occurred_at
 *   - vendas_canceladas_auditoria (cancelamentos + motivo)   → created_at
 *   - movimentos_estoque_log   (ajustes/movimentos)          → created_at
 *   - system_alerts            (anomalias margem/preço/estq) → criado_em
 *   - descontos_venda          (desconto gerente aplicado)   → aplicado_em
 *     Isolamento por loja via RLS (migration 20260811110000: vendas→caixas),
 *     não há coluna loja_id na tabela — igual ao padrão de DEVOLUCAO.
 *
 * Estratégia anti-duplicação: o cancelamento vem APENAS de
 * `vendas_canceladas_auditoria` (mais rico: traz `motivo`), e de `venda_eventos`
 * lemos apenas `SALE_REGISTERED`.
 */

import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { ROUTES } from '@shared-core/navigation/routes'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Teto final exibido após mesclar e ordenar por data desc. */
const LIMITE_FINAL = 150
/**
 * Limite por fonte antes da mesclagem (proteção contra varredura larga).
 * Igual ao teto final para que uma única fonte dominante ainda consiga
 * preencher a janela dos "mais recentes" sem perder eventos.
 */
const LIMITE_POR_FONTE = LIMITE_FINAL

export type AuditoriaTipo =
  | 'VENDA'
  | 'CANCELAMENTO'
  | 'AJUSTE_ESTOQUE'
  | 'ALERTA'
  | 'DESCONTO'
  | 'DEVOLUCAO'

/**
 * Item 16 do Plano Mestre: `resumo` deixou de ser uma frase pronta em PT.
 * `resumoCodigo` é uma chave estável resolvida para i18n no client
 * (`AuditoriaTimeline`); `resumoParams` traz só os valores de interpolação
 * (incluindo, quando aplicável, texto livre do operador como `motivo` —
 * texto livre digitado pelo usuário não é traduzível por chave de i18n,
 * mesma limitação de qualquer campo de observação no sistema).
 */
export type AuditoriaEvento = Readonly<{
  /** Chave única (prefixada pela fonte para evitar colisão entre tabelas). */
  id: string
  tipo: AuditoriaTipo
  /** ISO timestamp do evento. */
  ocorridoEm: string
  operadorId: string | null
  operadorNome: string | null
  /** Chave i18n do resumo — ver AUDITORIA_RESUMO_LABELS em AuditoriaTimeline.tsx. */
  resumoCodigo: string
  /** Valores de interpolação do template de resumo (nunca prosa pronta). */
  resumoParams: Record<string, string | number>
  /** Valor monetário associado (quando aplicável). */
  valor: number | null
  /** Payload normalizado para o painel de detalhe (read-only). */
  detalhe: Record<string, string | number | null>
}>

export type AuditoriaFiltro = Readonly<{
  inicio: string | null
  fim: string | null
  tipos: readonly AuditoriaTipo[]
  operadorId: string | null
}>

export type ListarEventosResult =
  | { ok: true; eventos: AuditoriaEvento[]; truncado: boolean }
  | { ok: false; error: string }

function wantsTipo(filtro: AuditoriaFiltro, tipo: AuditoriaTipo): boolean {
  return filtro.tipos.length === 0 || filtro.tipos.includes(tipo)
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string | null {
  return v == null ? null : String(v)
}

/**
 * Lista os eventos de auditoria mesclados das fontes existentes, na loja do
 * usuário logado (RLS). Read-only; em erro de autorização retorna `ok:false`.
 */
export async function listarEventosAuditoria(
  filtro: AuditoriaFiltro
): Promise<ListarEventosResult> {
  const auth = await assertAdminSession('auditoria:listar', {
    pathname: ROUTES.admin.auditoria,
    resource: `route:${ROUTES.admin.auditoria}`,
  })
  if (!auth.ok) return { ok: false, error: auth.error }

  const supabase = await createClient()
  const loja = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const operadorFiltro =
    filtro.operadorId && UUID_RE.test(filtro.operadorId) ? filtro.operadorId : null

  const eventos: AuditoriaEvento[] = []
  const operadorIds = new Set<string>()
  const produtoIds = new Set<string>()

  // ── 1. Vendas registradas (venda_eventos · SALE_REGISTERED) ───────────────
  if (wantsTipo(filtro, 'VENDA')) {
    let q = supabase
      .from('venda_eventos')
      .select('id, operador_id, total, total_bruto, forma_pagamento, items, occurred_at')
      .eq('event_type', 'SALE_REGISTERED')
      .eq('loja_id', loja)
      .order('occurred_at', { ascending: false })
      .limit(LIMITE_POR_FONTE)
    if (filtro.inicio) q = q.gte('occurred_at', filtro.inicio)
    if (filtro.fim) q = q.lte('occurred_at', filtro.fim)
    if (operadorFiltro) q = q.eq('operador_id', operadorFiltro)

    const { data, error } = await q
    // Resiliência: uma fonte indisponível (ex.: ledger ainda não migrado neste
    // ambiente) é ignorada — a timeline segue com as demais fontes.
    const rows = error ? [] : (data ?? [])
    for (const r of rows) {
      const itensCount = Array.isArray(r.items) ? r.items.length : 0
      const opId = str(r.operador_id)
      if (opId) operadorIds.add(opId)
      eventos.push({
        id: `venda:${r.id}`,
        tipo: 'VENDA',
        ocorridoEm: String(r.occurred_at),
        operadorId: opId,
        operadorNome: null,
        resumoCodigo: itensCount === 1 ? 'venda_1' : 'venda_n',
        resumoParams: { n: itensCount },
        valor: num(r.total),
        detalhe: {
          forma_pagamento: str(r.forma_pagamento),
          total_bruto: num(r.total_bruto),
          total_liquido: num(r.total),
          itens: itensCount,
        },
      })
    }
  }

  // ── 2. Cancelamentos ──────────────────────────────────────────────────────
  // Fonte canônica: venda_eventos (event_type='SALE_CANCELLED'), sempre gravada
  // pelo RPC de cancelamento do núcleo. O `motivo` é ENRIQUECIDO a partir de
  // `vendas_canceladas_auditoria` (quando existir) via lookup batched por sale_id.
  if (wantsTipo(filtro, 'CANCELAMENTO')) {
    let q = supabase
      .from('venda_eventos')
      .select('id, sale_id, operador_id, total, forma_pagamento, occurred_at')
      .eq('event_type', 'SALE_CANCELLED')
      .eq('loja_id', loja)
      .order('occurred_at', { ascending: false })
      .limit(LIMITE_POR_FONTE)
    if (filtro.inicio) q = q.gte('occurred_at', filtro.inicio)
    if (filtro.fim) q = q.lte('occurred_at', filtro.fim)
    if (operadorFiltro) q = q.eq('operador_id', operadorFiltro)

    const { data, error } = await q
    const rows = error ? [] : (data ?? [])

    // Enriquecimento opcional de motivo/valor estornado (batched, 1 query).
    const saleIds = rows.map((r) => str(r.sale_id)).filter((v): v is string => v != null)
    const motivoPorVenda = new Map<string, { motivo: string | null; valor: number | null }>()
    if (saleIds.length > 0) {
      const { data: aud } = await supabase
        .from('vendas_canceladas_auditoria')
        .select('venda_id, motivo, valor_estornado')
        .in('venda_id', saleIds)
      for (const a of aud ?? []) {
        motivoPorVenda.set(String(a.venda_id), {
          motivo: str(a.motivo),
          valor: a.valor_estornado == null ? null : num(a.valor_estornado),
        })
      }
    }

    for (const r of rows) {
      const opId = str(r.operador_id)
      if (opId) operadorIds.add(opId)
      const saleId = str(r.sale_id)
      const enriquecimento = saleId ? motivoPorVenda.get(saleId) : undefined
      const motivo = enriquecimento?.motivo ?? null
      const valorEstornado = enriquecimento?.valor ?? num(r.total)
      eventos.push({
        id: `cancel:${r.id}`,
        tipo: 'CANCELAMENTO',
        ocorridoEm: String(r.occurred_at),
        operadorId: opId,
        operadorNome: null,
        resumoCodigo: motivo ? 'cancelada_motivo' : 'cancelada',
        resumoParams: motivo ? { motivo } : {},
        valor: valorEstornado,
        detalhe: {
          venda_id: saleId,
          motivo,
          forma_pagamento: str(r.forma_pagamento),
          valor_estornado: valorEstornado,
        },
      })
    }
  }

  // ── 3. Movimentos de estoque (movimentos_estoque_log) ─────────────────────
  if (wantsTipo(filtro, 'AJUSTE_ESTOQUE')) {
    let q = supabase
      .from('movimentos_estoque_log')
      .select('id, produto_id, tipo_codigo, quantidade_delta, observacao, usuario_id, created_at')
      .eq('loja_id', loja)
      .order('created_at', { ascending: false })
      .limit(LIMITE_POR_FONTE)
    if (filtro.inicio) q = q.gte('created_at', filtro.inicio)
    if (filtro.fim) q = q.lte('created_at', filtro.fim)
    // `movimentos_estoque_log` registra `usuario_id` (quem executou o movimento).
    if (operadorFiltro) q = q.eq('usuario_id', operadorFiltro)

    const { data, error } = await q
    const rows = error ? [] : (data ?? [])
    for (const r of rows) {
      const opId = str(r.usuario_id)
      if (opId && UUID_RE.test(opId)) operadorIds.add(opId)
      const prodId = str(r.produto_id)
      if (prodId) produtoIds.add(prodId)
      const codigo = String(r.tipo_codigo ?? '')
      const delta = num(r.quantidade_delta)
      eventos.push({
        id: `estoque:${r.id}`,
        tipo: 'AJUSTE_ESTOQUE',
        ocorridoEm: String(r.created_at),
        operadorId: opId && UUID_RE.test(opId) ? opId : null,
        operadorNome: null,
        resumoCodigo: 'ajuste_estoque',
        resumoParams: { codigo, delta: `${delta >= 0 ? '+' : ''}${delta}` },
        valor: null,
        detalhe: {
          produto_id: prodId,
          tipo_codigo: codigo,
          quantidade_delta: delta,
          observacao: str(r.observacao),
        },
      })
    }
  }

  // ── 4. Alertas do sistema (system_alerts) — sem operador associado ────────
  if (wantsTipo(filtro, 'ALERTA') && !operadorFiltro) {
    let q = supabase
      .from('system_alerts')
      .select('id, tipo, produto_id, venda_id, detalhe, criado_em')
      .eq('loja_id', loja)
      .order('criado_em', { ascending: false })
      .limit(LIMITE_POR_FONTE)
    if (filtro.inicio) q = q.gte('criado_em', filtro.inicio)
    if (filtro.fim) q = q.lte('criado_em', filtro.fim)

    const { data, error } = await q
    const rows = error ? [] : (data ?? [])
    for (const r of rows) {
      const prodId = str(r.produto_id)
      if (prodId) produtoIds.add(prodId)
      const tipo = String(r.tipo ?? '')
      eventos.push({
        id: `alerta:${r.id}`,
        tipo: 'ALERTA',
        ocorridoEm: String(r.criado_em),
        operadorId: null,
        operadorNome: null,
        resumoCodigo: 'alerta',
        resumoParams: { tipo },
        valor: null,
        detalhe: {
          tipo,
          produto_id: prodId,
          venda_id: str(r.venda_id),
        },
      })
    }
  }

  // ── 5. Descontos de gerente (descontos_venda) ─────────────────────────────
  if (wantsTipo(filtro, 'DESCONTO')) {
    let q = supabase
      .from('descontos_venda')
      .select('venda_id, gerente_id, operador_id, desconto_percentual, desconto_valor, aplicado_em')
      .order('aplicado_em', { ascending: false })
      .limit(LIMITE_POR_FONTE)
    if (filtro.inicio) q = q.gte('aplicado_em', filtro.inicio)
    if (filtro.fim) q = q.lte('aplicado_em', filtro.fim)
    if (operadorFiltro) q = q.eq('operador_id', operadorFiltro)

    const { data, error } = await q
    const rows = error ? [] : (data ?? [])
    for (const r of rows) {
      const opId = str(r.operador_id)
      if (opId) operadorIds.add(opId)
      const pct = num(r.desconto_percentual)
      eventos.push({
        id: `desconto:${r.venda_id}`,
        tipo: 'DESCONTO',
        ocorridoEm: String(r.aplicado_em),
        operadorId: opId,
        operadorNome: null,
        resumoCodigo: 'desconto',
        resumoParams: { pct },
        valor: num(r.desconto_valor),
        detalhe: {
          venda_id: str(r.venda_id),
          gerente_id: str(r.gerente_id),
          desconto_percentual: pct,
          desconto_valor: num(r.desconto_valor),
        },
      })
    }
  }

  // ── 6. Devoluções/Trocas (venda_pos_venda_operacoes) ──────────────────────
  // FIN-001: fonte somente-leitura, sem tabela/RPC nova. `venda_pos_venda_operacoes`
  // não tem coluna loja_id própria — o isolamento por loja vem da RLS existente
  // (policy `venda_pos_venda_operacoes_select_loja`, migration 248), que já
  // restringe exatamente à loja do usuário via join com `caixas`.
  if (wantsTipo(filtro, 'DEVOLUCAO')) {
    let q = supabase
      .from('venda_pos_venda_operacoes')
      .select(
        'id, venda_id, tipo, motivo, valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(LIMITE_POR_FONTE)
    if (filtro.inicio) q = q.gte('created_at', filtro.inicio)
    if (filtro.fim) q = q.lte('created_at', filtro.fim)
    if (operadorFiltro) q = q.eq('operador_id', operadorFiltro)

    const { data, error } = await q
    const rows = error ? [] : (data ?? [])
    for (const r of rows) {
      const opId = str(r.operador_id)
      if (opId) operadorIds.add(opId)
      const tipoOperacao = String(r.tipo ?? '')
      const forma = String(r.forma_estorno ?? '')
      eventos.push({
        id: `devolucao:${r.id}`,
        tipo: 'DEVOLUCAO',
        ocorridoEm: String(r.created_at),
        operadorId: opId,
        operadorNome: null,
        resumoCodigo: tipoOperacao === 'TROCA' ? 'troca' : 'devolucao',
        resumoParams: { forma },
        valor: num(r.valor_estornado),
        detalhe: {
          venda_id: str(r.venda_id),
          tipo_operacao: tipoOperacao,
          motivo: str(r.motivo),
          forma_estorno: forma,
          valor_estornado: num(r.valor_estornado),
          valor_caixa_estornado: num(r.valor_caixa_estornado),
        },
      })
    }
  }

  // ── Resolução de nomes (operador + produto) em lotes únicos ───────────────
  const nomeOperador = new Map<string, string>()
  if (operadorIds.size > 0) {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nome')
      .in('id', Array.from(operadorIds))
    for (const u of data ?? []) {
      if (u.nome != null) nomeOperador.set(String(u.id), String(u.nome))
    }
  }

  const nomeProduto = new Map<string, string>()
  if (produtoIds.size > 0) {
    const { data } = await supabase
      .from('produtos')
      .select('id, nome')
      .in('id', Array.from(produtoIds))
    for (const p of data ?? []) {
      if (p.nome != null) nomeProduto.set(String(p.id), String(p.nome))
    }
  }

  // Enriquecer com nomes resolvidos.
  const enriquecidos = eventos.map((e) => {
    const operadorNome = e.operadorId ? (nomeOperador.get(e.operadorId) ?? null) : null
    const produtoId = typeof e.detalhe.produto_id === 'string' ? e.detalhe.produto_id : null
    const detalhe = produtoId
      ? { ...e.detalhe, produto_nome: nomeProduto.get(produtoId) ?? null }
      : e.detalhe
    return { ...e, operadorNome, detalhe }
  })

  // Mesclar: ordenar por data desc e aplicar teto final.
  enriquecidos.sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm))
  const truncado = enriquecidos.length > LIMITE_FINAL
  return { ok: true, eventos: enriquecidos.slice(0, LIMITE_FINAL), truncado }
}

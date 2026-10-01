/**
 * FastProduct Admin — Auditoria Visual (Fase 2 · item 1)
 *
 * Server Component. Timeline unificada SOMENTE-LEITURA sobre os ledgers que JÁ
 * existem (venda_eventos, vendas_canceladas_auditoria, movimentos_estoque_log,
 * system_alerts, descontos_venda). Nenhuma tabela/RPC nova; nenhuma escrita.
 *
 * Estrutura espelhada de /admin/vendas: PageHeader (period pills) + MetricCards
 * + SectionCard com chips de tipo + timeline (client) com Sheet de detalhe.
 */

import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatNumberLocale } from '@/lib/format/money'
import { getMessages } from '@/i18n/getMessages'
import { tipoMovimentoEstoqueLabels } from '@/lib/format/vendaLabels'
import {
  listarEventosAuditoria,
  type AuditoriaFiltro,
  type AuditoriaTipo,
} from './actions'
import { AuditoriaTimeline, type AuditoriaTimelineLabels } from './_components/AuditoriaTimeline'

type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | 'mes'
type TipoFiltro = 'all' | AuditoriaTipo

const DIA_MS = 86_400_000

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

function periodoInicio(periodo: Periodo): string | null {
  const now = new Date()
  if (periodo === 'hoje') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === 'ontem') {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === '7d') return new Date(now.getTime() - 7 * DIA_MS).toISOString()
  if (periodo === 'mes') {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  return null
}

function periodoFim(periodo: Periodo): string | null {
  if (periodo !== 'ontem') return null
  const now = new Date()
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

type SearchParams = { periodo?: string; tipo?: string }
type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminAuditoriaPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.auditoria,
    resource: `route:${ROUTES.admin.auditoria}`,
  })
  const locale = localeFromIdioma(session.idioma)
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const PERIODO_LABEL: Record<Periodo, string> = {
    hoje: ui.auditoria_periodo_hoje,
    ontem: ui.auditoria_periodo_ontem,
    '7d': ui.auditoria_periodo_7d,
    mes: ui.auditoria_periodo_mes,
    tudo: ui.auditoria_periodo_tudo,
  }

  const TIPO_OPTIONS: Array<{ id: TipoFiltro; label: string }> = [
    { id: 'all', label: ui.auditoria_tipo_all },
    { id: 'VENDA', label: ui.auditoria_tipo_venda },
    { id: 'CANCELAMENTO', label: ui.auditoria_tipo_cancelamento },
    { id: 'AJUSTE_ESTOQUE', label: ui.auditoria_tipo_estoque },
    { id: 'ALERTA', label: ui.auditoria_tipo_alerta },
    { id: 'DESCONTO', label: ui.auditoria_tipo_desconto },
    { id: 'DEVOLUCAO', label: ui.auditoria_tipo_devolucao },
  ]

  const timelineLabels: AuditoriaTimelineLabels = {
    locale,
    chipVenda: ui.auditoria_chip_venda,
    chipCancelamento: ui.auditoria_chip_cancelamento,
    chipEstoque: ui.auditoria_chip_estoque,
    chipAlerta: ui.auditoria_chip_alerta,
    chipDesconto: ui.auditoria_chip_desconto,
    chipDevolucao: ui.auditoria_chip_devolucao,
    detalheLabels: {
      forma_pagamento: ui.auditoria_detalhe_forma_pagamento,
      total_bruto: ui.auditoria_detalhe_total_bruto,
      total_liquido: ui.auditoria_detalhe_total_liquido,
      itens: ui.auditoria_detalhe_itens,
      venda_id: ui.auditoria_detalhe_venda_id,
      motivo: ui.auditoria_detalhe_motivo,
      valor_estornado: ui.auditoria_detalhe_valor_estornado,
      produto_id: ui.auditoria_detalhe_produto_id,
      produto_nome: ui.auditoria_detalhe_produto_nome,
      tipo_codigo: ui.auditoria_detalhe_tipo_codigo,
      quantidade_delta: ui.auditoria_detalhe_quantidade_delta,
      observacao: ui.auditoria_detalhe_observacao,
      tipo: ui.auditoria_detalhe_tipo,
      gerente_id: ui.auditoria_detalhe_gerente_id,
      desconto_percentual: ui.auditoria_detalhe_desconto_percentual,
      desconto_valor: ui.auditoria_detalhe_desconto_valor,
      tipo_operacao: ui.auditoria_detalhe_tipo_operacao,
      forma_estorno: ui.auditoria_detalhe_forma_estorno,
      valor_caixa_estornado: ui.auditoria_detalhe_valor_caixa_estornado,
      valor_abatido_ar: ui.auditoria_detalhe_valor_abatido_ar,
      caixa_desembolso_id: ui.auditoria_detalhe_caixa_desembolso_id,
    },
    vazioTitulo: ui.auditoria_vazio_titulo,
    vazioSub: ui.auditoria_vazio_sub,
    fecharAria: ui.auditoria_fechar_aria,
    valorLabel: ui.auditoria_valor_label,
    semDetalhes: ui.auditoria_sem_detalhes,
    resumoTemplates: {
      venda_1: ui.auditoria_resumo_venda_1,
      venda_n: ui.auditoria_resumo_venda_n,
      cancelada: ui.auditoria_resumo_cancelada,
      cancelada_motivo: ui.auditoria_resumo_cancelada_motivo,
      ajuste_estoque: ui.auditoria_resumo_ajuste_estoque,
      alerta: '{{tipo}}',
      desconto: ui.auditoria_resumo_desconto,
      troca: ui.auditoria_resumo_troca,
      devolucao: ui.auditoria_resumo_devolucao,
    },
    ajusteLabels: {
      ...tipoMovimentoEstoqueLabels(m),
      ENTRADA_VENDA: ui.auditoria_ajuste_entrada_venda,
      SAIDA_VENDA: ui.auditoria_ajuste_saida_venda,
      SAIDA_AJUSTE: ui.auditoria_ajuste_saida_ajuste,
      ENTRADA_AJUSTE: ui.auditoria_ajuste_entrada_ajuste,
      COMPRA: ui.auditoria_ajuste_compra,
      PERDA: ui.auditoria_ajuste_perda,
      QUEBRA: ui.auditoria_ajuste_quebra,
      ACERTO_INVENTARIO: ui.auditoria_ajuste_acerto_inventario,
      OUTRO: ui.auditoria_ajuste_outro,
    },
    alertaLabels: {
      margem_negativa: ui.auditoria_alerta_margem_negativa,
      preco_fora_padrao: ui.auditoria_alerta_preco_fora_padrao,
      estoque_inconsistente: ui.auditoria_alerta_estoque_inconsistente,
    },
    formaLabels: {
      DINHEIRO: ui.auditoria_forma_dinheiro,
      PIX: ui.auditoria_forma_pix,
      CARTAO_DEBITO: ui.auditoria_forma_cartao_debito,
      CARTAO_CREDITO: ui.auditoria_forma_cartao_credito,
      CREDITO_CLIENTE: ui.auditoria_forma_credito_cliente,
    },
    verKardex: ui.auditoria_ver_kardex,
    kardex: {
      titulo: ui.estoque_kardex_titulo,
      semMovimentos: ui.estoque_sem_movimentos,
      semMovimentosSub: ui.estoque_sem_movimentos_sub,
      verAuditoria: ui.estoque_kardex_ver_auditoria,
      tipoMap: tipoMovimentoEstoqueLabels(m),
    },
  }

  const periodo = oneOf<Periodo>(sp.periodo, ['tudo', 'hoje', 'ontem', '7d', 'mes'], '7d')
  const tipo = oneOf<TipoFiltro>(
    sp.tipo,
    ['all', 'VENDA', 'CANCELAMENTO', 'AJUSTE_ESTOQUE', 'ALERTA', 'DESCONTO', 'DEVOLUCAO'],
    'all'
  )

  const filtro: AuditoriaFiltro = {
    inicio: periodoInicio(periodo),
    fim: periodoFim(periodo),
    tipos: tipo === 'all' ? [] : [tipo],
    operadorId: null,
  }

  const res = await listarEventosAuditoria(filtro)
  const eventos = res.ok ? res.eventos : []
  const truncado = res.ok ? res.truncado : false
  const loadError = res.ok ? null : res.error

  const contagem = eventos.reduce<Record<AuditoriaTipo, number>>(
    (acc, e) => {
      acc[e.tipo] += 1
      return acc
    },
    { VENDA: 0, CANCELAMENTO: 0, AJUSTE_ESTOQUE: 0, ALERTA: 0, DESCONTO: 0, DEVOLUCAO: 0 }
  )

  const metricCards: Array<{
    label: string
    value: string
    icon: MetricCardIconKey
    tone: 'gold' | 'success' | 'warning'
    hint?: string
  }> = [
    {
      label: ui.auditoria_kpi_eventos,
      value: formatNumberLocale(eventos.length, locale),
      icon: 'list-filter',
      tone: 'gold',
      hint: truncado ? ui.auditoria_kpi_hint_truncado : undefined,
    },
    {
      label: ui.auditoria_kpi_vendas,
      value: formatNumberLocale(contagem.VENDA, locale),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      label: ui.auditoria_kpi_cancelamentos,
      value: formatNumberLocale(contagem.CANCELAMENTO, locale),
      icon: 'x-circle',
      tone: 'warning',
    },
    {
      label: ui.auditoria_kpi_alertas,
      value: formatNumberLocale(contagem.ALERTA, locale),
      icon: 'alert-circle',
      tone: 'warning',
    },
  ]

  const activeParams: Record<string, string> = {}
  if (periodo !== '7d') activeParams.periodo = periodo
  if (tipo !== 'all') activeParams.tipo = tipo

  const periodHref = (next: Periodo) => {
    const p = new URLSearchParams(activeParams)
    if (next === '7d') p.delete('periodo')
    else p.set('periodo', next)
    return pathWithQuery(ROUTES.admin.auditoria, p)
  }
  const tipoHref = (next: TipoFiltro) => {
    const p = new URLSearchParams(activeParams)
    if (next === 'all') p.delete('tipo')
    else p.set('tipo', next)
    return pathWithQuery(ROUTES.admin.auditoria, p)
  }

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title={ui.auditoria_titulo}
        subtitle={ui.auditoria_subtitulo}
        filters={(
          <div className="admin-v2-segmented">
            {(['hoje', 'ontem', '7d', 'mes', 'tudo'] as Periodo[]).map((option) => (
              <Link
                key={option}
                href={periodHref(option)}
                data-active={periodo === option}
                className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {PERIODO_LABEL[option]}
              </Link>
            ))}
          </div>
        )}
      />

      <div className="admin-v2-grid-kpi">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            hint={card.hint}
          />
        ))}
      </div>

      <SectionCard
        title={ui.auditoria_sec_trilha}
        action={
          <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-[11px] text-jl-fg-3">
            {eventos.length} {eventos.length === 1 ? ui.auditoria_evento_singular : ui.auditoria_evento_plural}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {TIPO_OPTIONS.map((option) => (
            <Link
              key={option.id}
              href={tipoHref(option.id)}
              data-active={tipo === option.id}
              className="admin-v2-filter-pill rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
            >
              {option.label}
            </Link>
          ))}
        </div>

        {loadError ? (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
            {loadError}
          </div>
        ) : null}

        <AuditoriaTimeline eventos={eventos} labels={timelineLabels} />

        {truncado ? (
          <p className="mt-4 text-[11px] text-jl-fg-3">
            {ui.auditoria_truncado_hint.replace('{{n}}', '150')}
          </p>
        ) : null}
      </SectionCard>
    </div>
  )
}

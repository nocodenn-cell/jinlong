/**
 * FastProduct Admin — Vendas (Fase 5 · Sprint 1)
 *
 * Server Component. Reusa `buscarVendasPaginadasAction` — nenhuma query nova.
 * Sprint 1: PageShell + FilterBar (periodo/status/pagamento) + ErrorState.
 * Paginação cursor (`hasMore`). Detalhe: VendaDetailSheet.
 */

import { Suspense } from 'react'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { createClient } from '@/lib/supabase/server'
import { MetricCard, PageShell, SectionCard } from '@/components/ui/admin-v2'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PaginationBar, clampPage } from '@/components/ui/PaginationBar'
import { ErrorState } from '@/components/ui/feedback'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import {
  buscarVendasPaginadasAction,
  obterKpisVendas,
  type VendasFiltro,
} from '@/app/gerente/vendas/actions'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { VendasTable, type VendaLinha } from './_components/VendasTable'

type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | 'mes'
type StatusFiltro = 'all' | 'CONCLUIDA' | 'CANCELADA'
type PagamentoFiltro = 'all' | 'DINHEIRO' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'CARTAO'

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

const DIA_MS = 86_400_000

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
  const now = new Date()
  if (periodo !== 'ontem') return null
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

type SearchParams = {
  periodo?: string
  status?: string
  pagamento?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminVendasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.vendas,
    resource: `route:${ROUTES.admin.vendas}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const periodo = oneOf<Periodo>(sp.periodo, ['tudo', 'hoje', 'ontem', '7d', 'mes'], 'hoje')
  const status = oneOf<StatusFiltro>(sp.status, ['all', 'CONCLUIDA', 'CANCELADA'], 'all')
  const pagamento = oneOf<PagamentoFiltro>(
    sp.pagamento,
    ['all', 'DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CARTAO'],
    'all'
  )
  const page = clampPage(sp.page)

  const filtros: VendasFiltro = {
    inicio: periodoInicio(periodo),
    fim: periodoFim(periodo),
    status: status === 'all' ? [] : [status],
    formaPagamento: pagamento === 'all' ? [] : [pagamento],
  }

  const [res, kpis] = await Promise.all([
    buscarVendasPaginadasAction(page, filtros),
    obterKpisVendas(filtros),
  ])
  const vendasRes = res.ok ? res.vendas : []

  const operadorIds = Array.from(
    new Set(vendasRes.map((v) => v.operador_id).filter((id): id is string => Boolean(id))),
  )
  const nomeOperadorPorId = new Map<string, string>()
  if (operadorIds.length > 0) {
    const supabase = await createClient()
    const { data: usuariosRaw } = await supabase.from('usuarios').select('id, nome').in('id', operadorIds)
    for (const u of usuariosRaw ?? []) nomeOperadorPorId.set(u.id, u.nome)
  }

  const vendas: VendaLinha[] = vendasRes.map((v) => ({
    id: v.id,
    data: v.data,
    total_liquido: v.total_liquido,
    total_bruto: v.total_bruto,
    forma_pagamento: v.forma_pagamento,
    status: v.status,
    caixa_id: v.caixa_id,
    operador_id: v.operador_id,
    qtd_itens_total: v.qtd_itens_total,
    qtd_itens_distintos: v.qtd_itens_distintos,
    primeiro_produto: v.primeiro_produto,
    vendedor_nome: v.operador_id ? nomeOperadorPorId.get(v.operador_id) ?? null : null,
  }))
  const hasMore = res.ok ? res.hasMore : false
  const loadError = res.ok ? null : res.error
  const ticketMedio = kpis.ticketMedio

  const activeParams: Record<string, string> = {}
  if (periodo !== 'hoje') activeParams.periodo = periodo
  if (status !== 'all') activeParams.status = status
  if (pagamento !== 'all') activeParams.pagamento = pagamento

  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    return pathWithQuery(ROUTES.admin.vendas, p)
  }

  const PERIODO_LABEL_I18N: Record<Periodo, string> = {
    tudo: ui.filtro_todos,
    hoje: ui.vendas_periodo_label_hoje,
    ontem: ui.vendas_periodo_label_ontem,
    '7d': ui.vendas_periodo_label_7d,
    mes: ui.vendas_periodo_label_mes,
  }

  const filters: FilterDef[] = [
    {
      type: 'pills',
      key: 'periodo',
      defaultValue: 'hoje',
      options: [
        { value: 'hoje', label: ui.vendas_periodo_label_hoje },
        { value: 'ontem', label: ui.vendas_periodo_label_ontem },
        { value: '7d', label: ui.vendas_periodo_label_7d },
        { value: 'mes', label: ui.vendas_periodo_label_mes },
        { value: 'tudo', label: ui.filtro_todos },
      ],
    },
    {
      type: 'select',
      key: 'status',
      label: m.gerente.col_status,
      defaultValue: 'all',
      options: [
        { value: 'all', label: ui.filtro_todos },
        { value: 'CONCLUIDA', label: ui.vendas_concluidas },
        { value: 'CANCELADA', label: ui.vendas_canceladas },
      ],
    },
    {
      type: 'select',
      key: 'pagamento',
      label: m.gerente.col_forma,
      defaultValue: 'all',
      options: [
        { value: 'all', label: ui.filtro_todos },
        { value: 'DINHEIRO', label: m.gerente.pagamento_dinheiro },
        { value: 'PIX', label: m.gerente.pagamento_pix },
        { value: 'CARTAO_CREDITO', label: m.gerente.forma_cartao_credito },
        { value: 'CARTAO_DEBITO', label: m.gerente.forma_cartao_debito },
        { value: 'CARTAO', label: m.gerente.pagamento_cartao },
      ],
    },
  ]

  const metricCards: Array<{
    label: string
    value: string
    icon: MetricCardIconKey
    tone: 'gold' | 'success' | 'warning'
    hint?: string
  }> = [
    {
      label: ui.vendas_faturado,
      value: formatBRL(kpis.faturado),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      label: ui.vendas_concluidas,
      value: formatNumberLocale(kpis.qtdConcluidas, locale),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      label: m.gerente.ticket_medio,
      value: formatBRL(ticketMedio),
      icon: 'package',
      tone: 'gold',
    },
    {
      label: ui.vendas_canceladas,
      value: formatNumberLocale(kpis.qtdCanceladas, locale),
      icon: 'x-circle',
      tone: 'warning',
      hint: formatBRL(kpis.valorCanceladas),
    },
  ]

  const listaTitulo = ui.vendas_lista_titulo.replace('{{periodo}}', PERIODO_LABEL_I18N[periodo])

  return (
    <PageShell
      title={m.gerente.nav_topico_vendas_caixa}
      subtitle={ui.vendas_subtitulo}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
      kpi={metricCards.map((card) => (
        <MetricCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          tone={card.tone}
          hint={card.hint}
        />
      ))}
    >
      <SectionCard
        title={listaTitulo}
        action={
          <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-[11px] text-jl-fg-3">
            {vendas.length} {vendas.length === 1 ? ui.vendas_nesta_pag_sg : ui.vendas_nesta_pag_pl}
          </span>
        }
      >
        {loadError ? (
          <div className="mb-3 px-1">
            <ErrorState dense title={loadError} />
          </div>
        ) : null}

        <VendasTable
          vendas={vendas}
          m={m}
          locale={locale}
          labels={{
            colVenda: ui.vendas_col_venda,
            colHora: ui.vendas_col_hora,
            colItens: ui.vendas_col_itens,
            colPagamento: m.gerente.col_forma,
            colTotal: m.gerente.col_total,
            colStatus: m.gerente.col_status,
            colVendedor: ui.vendas_col_vendedor,
            concluida: m.gerente.venda_status_concluida,
            cancelada: m.gerente.venda_status_cancelada,
            unidade: ui.vendas_unidade,
            unidades: ui.vendas_unidades,
            item: ui.vendas_item,
            itensPl: ui.vendas_itens_pl,
            pagDinheiro: m.gerente.pagamento_dinheiro,
            pagPix: m.gerente.pagamento_pix,
            pagCredito: ui.vendas_pag_label_credito,
            pagDebito: ui.vendas_pag_label_debito,
            pagCartao: ui.vendas_pag_label_cartao,
            pagOutro: ui.vendas_pag_label_outro,
            vazioTitulo: ui.vendas_vazio_titulo,
            vazioSub: ui.vendas_vazio_sub,
            detalheTitulo: m.gerente.venda_detalhe_titulo,
            detalheErroTitulo: ui.vendas_detalhe_erro_titulo,
            detalheErroSub: ui.vendas_detalhe_erro_sub,
            detalheData: ui.vendas_detalhe_data,
            detalheTipo: ui.vendas_detalhe_tipo,
            detalheOperador: ui.vendas_detalhe_operador,
            detalheNfe: ui.vendas_detalhe_nfe,
            detalheBruto: m.gerente.venda_bruto,
            detalheDesconto: m.gerente.venda_desconto,
            detalheLiquido: ui.vendas_detalhe_liquido,
            detalheItens: m.gerente.sec_itens_venda,
            detalheNenhumItem: ui.vendas_detalhe_nenhum_item,
            cancelarAcao: ui.vendas_acao_cancelar,
            devolverAcao: ui.vendas_acao_devolver,
          }}
        />

        <PaginationBar
          className="mt-4"
          mode="cursor"
          page={page}
          hasMore={hasMore}
          pageHref={pageHref}
          label={m.produtos.pag_info
            .replace('{{atual}}', String(page))
            .replace('{{total}}', '…')}
          anteriorLabel={ui.paginacao_anterior}
          proximaLabel={ui.paginacao_proxima}
        />
      </SectionCard>
    </PageShell>
  )
}

/**
 * FastProduct Admin — Financeiro (Fase 6)
 *
 * Server Component. Reusa `fetchContasReceberListagem` e `fetchFinanceiroTitulosKpis`
 * (`@/lib/gerente/financeiroTitulosServer`) — nenhuma query nova. Os searchParams da
 * URL viram os filtros (status, cliente, busca, período).
 *
 * Estrutura espelhada do Estoque/Vendas: FilterBar + DataTable + chips removíveis.
 * Sem paginação numerada (a query é limitada a `limite`); reutiliza a API de filtros
 * existente. KPIs no topo.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { createClient } from '@/lib/supabase/server'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { MetricCard, PageHeader } from '@/components/ui/admin-v2'
import {
  fetchContasReceberListagem,
  fetchFinanceiroTitulosKpis,
  parseTituloFiltersFromSearchParams,
} from '@/lib/gerente/financeiroTitulosServer'
import { formatBRL } from '@/lib/format/money'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { type ContaLinha } from './_components/ContasReceberTable'
import { FinanceiroPanels } from './_components/FinanceiroPanels'

type SearchParams = {
  opcao?: string
  cliente?: string
  q?: string
  de?: string
  ate?: string
  limite?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminFinanceiroPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.financeiro,
    resource: `route:${ROUTES.admin.financeiro}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const parsed = parseTituloFiltersFromSearchParams(sp as Record<string, string | string[] | undefined>)
  const { limite, ...filters } = parsed

  const supabase = await createClient()
  const [listaRes, kpisRes] = await Promise.all([
    fetchContasReceberListagem(supabase, filters, limite),
    fetchFinanceiroTitulosKpis(supabase),
  ])

  const contas: ContaLinha[] = listaRes.titulos.map((t) => ({
    id: t.id,
    cliente_nome: t.cliente_nome ?? '—',
    valor_total: t.valor_total,
    valor_aberto: t.valor_aberto,
    valor_pago: t.valor_total - t.valor_aberto,
    status: t.status,
    vencimento: t.vencimento,
    descricao: t.descricao,
  }))

  const filterDefs: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: ui.financeiro_filtro_placeholder,
    },
    {
      type: 'pills',
      key: 'opcao',
      defaultValue: 'mix',
      options: [
        { value: 'mix', label: ui.financeiro_filtro_mix },
        { value: 'ABERTO', label: ui.financeiro_filtro_so_aberto },
        { value: 'PARCIAL', label: ui.financeiro_filtro_so_parcial },
      ],
    },
  ]

  const activeParams: Record<string, string> = {}
  if (filters.q) activeParams.q = filters.q
  if (filters.opcao !== 'mix') activeParams.opcao = filters.opcao
  if (filters.nomeCliente) activeParams.cliente = filters.nomeCliente
  if (filters.de) activeParams.de = filters.de
  if (filters.ate) activeParams.ate = filters.ate

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    return pathWithQuery(ROUTES.admin.financeiro, p)
  }

  const statusChipLabel: Record<string, string> = {
    ABERTO: ui.financeiro_filtro_so_aberto,
    PARCIAL: ui.financeiro_filtro_so_parcial,
  }

  const chips: Array<{ key: string; label: string }> = []
  if (filters.nomeCliente) chips.push({ key: 'cliente', label: ui.financeiro_chip_cliente.replace('{{nome}}', filters.nomeCliente) })
  if (filters.de) chips.push({ key: 'de', label: ui.financeiro_chip_de.replace('{{data}}', filters.de) })
  if (filters.ate) chips.push({ key: 'ate', label: ui.financeiro_chip_ate.replace('{{data}}', filters.ate) })
  if (filters.opcao !== 'mix') chips.push({ key: 'opcao', label: statusChipLabel[filters.opcao] ?? filters.opcao })

  return (
    <div className="admin-v2-page">
      <PageHeader
        title={ui.financeiro_titulo}
        subtitle={ui.financeiro_subtitulo}
      />

      <div className="admin-v2-stack">
        <div className="admin-v2-grid-kpi">
          <MetricCard
            label={ui.financeiro_kpi_titulos}
            value={String(kpisRes.titulosAbertosCount)}
            icon="wallet-cards"
            tone="gold"
          />
          <MetricCard
            label={ui.financeiro_kpi_valor_aberto}
            value={formatBRL(kpisRes.valorAbertoTotal)}
            icon="dollar-sign"
            tone="gold"
            hint={
              kpisRes.kpiValorTruncado
                ? ui.financeiro_kpi_hint_capped.replace('{{n}}', String(kpisRes.titulosAbertosCount))
                : undefined
            }
          />
          <MetricCard
            label={ui.financeiro_kpi_registros}
            value={listaRes.capped ? `${contas.length}+` : String(contas.length)}
            icon="list-filter"
            tone="gold"
            hint={listaRes.capped ? ui.financeiro_kpi_truncado : undefined}
          />
          <MetricCard
            label={ui.financeiro_kpi_docs_fiscais}
            value="3"
            icon="file-check-2"
            tone="warning"
          />
        </div>

        <div className="border-b border-[var(--color-border-secondary)] pb-3">
          <Suspense fallback={<div className="h-9" />}>
            <FilterBar filters={filterDefs} />
          </Suspense>

          {chips.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <Link key={chip.key} href={hrefWithout(chip.key)} className="admin-v2-chip">
                  {chip.label}
                  <span aria-hidden className="text-jl-fg-3">
                    ✕
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <FinanceiroPanels
          contas={contas}
          labels={{
            titulosEmAberto: ui.financeiro_section_titulos,
            filaFiscal: ui.financeiro_section_fila,
            documentosFiscais: ui.financeiro_section_docs,
            emitirSelecionados: ui.financeiro_emitir_selecionados,
            colDocumento: ui.financeiro_col_documento,
            colSerie: ui.financeiro_col_serie,
            colValor: m.gerente.col_total,
            colSituacao: ui.financeiro_col_situacao,
            contas: {
              colCliente: ui.financeiro_col_cliente,
              colVencimento: ui.financeiro_col_vencimento,
              colTotal: m.gerente.col_total,
              colPago: ui.financeiro_col_pago,
              colAberto: ui.financeiro_col_aberto,
              colStatus: m.gerente.col_status,
              statusAberto: ui.financeiro_status_aberto,
              statusParcial: ui.financeiro_status_parcial,
              statusQuitado: ui.financeiro_status_quitado,
              vazioTitulo: ui.financeiro_vazio_titulo,
              vazioSub: ui.financeiro_vazio_sub,
              locale,
            },
          }}
        />
      </div>
    </div>
  )
}

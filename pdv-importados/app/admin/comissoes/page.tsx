/**
 * FastProduct Admin — Comissões (Sprint 3 / RFC-UX-012)
 * FilterBar daterange + status URL-driven.
 */

import { Suspense } from 'react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageShell } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { carregarResumoComissoes } from '@/app/gerente/comissoes/actions'
import { ROUTES } from '@shared-core/navigation/routes'
import { ComissoesContent } from './_components/ComissoesContent'

type SearchParams = {
  de?: string
  ate?: string
  status?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

const TODAY = new Date().toISOString().slice(0, 10)
const TRINTA_DIAS_ATRAS = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

export default async function AdminComissoesPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.comissoes,
    resource: `route:${ROUTES.admin.comissoes}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)

  const sp = (await searchParams) ?? {}
  const de = sp.de ?? TRINTA_DIAS_ATRAS
  const ate = sp.ate ?? TODAY
  const status = oneOf(sp.status, ['todos', 'pendente', 'pago'] as const, 'todos')

  const res = await carregarResumoComissoes({ de, ate, status })
  const dados = res.success ? res.data : []

  const filters: FilterDef[] = [
    {
      type: 'daterange',
      keyFrom: 'de',
      keyTo: 'ate',
      label: ui.comissoes_periodo_label,
      fromLabel: ui.comissoes_periodo_label,
      toLabel: ui.comissoes_a_separator,
    },
    {
      type: 'pills',
      key: 'status',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: ui.comissoes_status_todos },
        { value: 'pendente', label: ui.comissoes_status_pendente },
        { value: 'pago', label: ui.comissoes_status_pago },
      ],
    },
  ]

  return (
    <PageShell
      title={ui.comissoes_titulo}
      subtitle={ui.comissoes_subtitulo}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <ComissoesContent
          dados={dados}
          filtroInicial={{ de, ate, status }}
          labels={{
            colOperador: ui.comissoes_col_operador,
            colVendas: ui.comissoes_col_vendas,
            colTotal: ui.comissoes_col_total,
            colPago: ui.comissoes_col_pago,
            colPendente: ui.comissoes_col_pendente,
            operadoresTitulo: ui.comissoes_operadores_titulo,
            periodoLabel: ui.comissoes_periodo_label,
            aSeparator: ui.comissoes_a_separator,
            statusLabel: ui.comissoes_status_label,
            statusTodos: ui.comissoes_status_todos,
            statusPendente: ui.comissoes_status_pendente,
            statusPago: ui.comissoes_status_pago,
            vazioComissoes: ui.comissoes_vazio,
            emPendenciaSuffix: ui.comissoes_em_pendencia_suffix,
            fecharDetalhe: ui.comissoes_fechar_detalhe,
            metricTotal: ui.comissoes_metric_total,
            metricPago: ui.comissoes_metric_pago,
            metricPendente: ui.comissoes_metric_pendente,
            carregando: ui.comissoes_carregando,
            desselecionarTodas: ui.comissoes_desselecionar_todas,
            selecionarPendentes: ui.comissoes_selecionar_pendentes,
            marcarComoPagoBtn: ui.comissoes_marcar_pago_btn,
            vendaPrefix: ui.comissoes_venda_prefix,
            semComissoes: ui.comissoes_sem_comissoes,
            erroPagarFallback: ui.comissoes_erro_marcar,
            locale,
          }}
        />
      </Suspense>
    </PageShell>
  )
}

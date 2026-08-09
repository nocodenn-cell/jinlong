/**
 * FastProduct Admin — Comissões
 *
 * Server Component. Reutiliza action `carregarResumoComissoes` de /gerente/comissoes.
 * UI local: filtros URL + KPIs + tabela + sheet de detalhe.
 */

import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { carregarResumoComissoes } from '@/app/gerente/comissoes/actions'
import { ROUTES } from '@shared-core/navigation/routes'
import { ComissoesContent } from './_components/ComissoesContent'
import {
  ComissoesFilters,
  type PeriodoPreset,
} from './_components/ComissoesFilters'

type SearchParams = {
  de?: string
  ate?: string
  status?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const TODAY = isoDay(Date.now())
const DIA_MS = 24 * 60 * 60 * 1000
const DE_7D = isoDay(Date.now() - 7 * DIA_MS)
const DE_30D = isoDay(Date.now() - 30 * DIA_MS)

function mesInicioIso(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function resolveActivePreset(
  de: string,
  ate: string,
  presets: PeriodoPreset[],
): PeriodoPreset['id'] | null {
  const hit = presets.find((p) => p.de === de && p.ate === ate)
  return hit?.id ?? null
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
  const de = sp.de ?? DE_30D
  const ate = sp.ate ?? TODAY
  const status = (sp.status as 'todos' | 'pendente' | 'pago' | undefined) ?? 'todos'
  const filtro = { de, ate, status }

  const res = await carregarResumoComissoes(filtro)
  const dados = res.success ? res.data : []

  const presets: PeriodoPreset[] = [
    { id: '7d', label: ui.comissoes_periodo_7d, de: DE_7D, ate: TODAY },
    { id: '30d', label: ui.comissoes_periodo_30d, de: DE_30D, ate: TODAY },
    { id: 'mes', label: ui.comissoes_periodo_mes, de: mesInicioIso(), ate: TODAY },
  ]
  const activePresetId = resolveActivePreset(de, ate, presets)

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title={ui.comissoes_titulo}
        subtitle={ui.comissoes_subtitulo}
      />

      <ComissoesFilters
        filtro={filtro}
        presets={presets}
        activePresetId={activePresetId}
        labels={{
          de: ui.comissoes_filtro_de,
          ate: ui.comissoes_filtro_ate,
          status: ui.comissoes_status_label,
          aplicar: ui.comissoes_aplicar,
          statusTodos: ui.comissoes_status_todos,
          statusPendente: ui.comissoes_status_pendente,
          statusPago: ui.comissoes_status_pago,
        }}
      />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <ComissoesContent
          dados={dados}
          filtroInicial={filtro}
          labels={{
            colOperador: ui.comissoes_col_operador,
            colVendas: ui.comissoes_col_vendas,
            colTotal: ui.comissoes_col_total,
            colPago: ui.comissoes_col_pago,
            colPendente: ui.comissoes_col_pendente,
            colAcoes: ui.comissoes_col_acoes,
            verDetalhes: ui.comissoes_ver_detalhes,
            operadoresTitulo: ui.comissoes_operadores_titulo,
            periodoLabel: ui.comissoes_periodo_label,
            aSeparator: ui.comissoes_a_separator,
            statusLabel: ui.comissoes_status_label,
            statusTodos: ui.comissoes_status_todos,
            statusPendente: ui.comissoes_status_pendente,
            statusPago: ui.comissoes_status_pago,
            vazioComissoes: ui.comissoes_vazio,
            vazioComissoesSub: ui.comissoes_vazio_sub,
            vazioCta: ui.comissoes_vazio_cta,
            emPendenciaSuffix: ui.comissoes_em_pendencia_suffix,
            fecharDetalhe: ui.comissoes_fechar_detalhe,
            metricTotal: ui.comissoes_metric_total,
            metricPago: ui.comissoes_metric_pago,
            metricPendente: ui.comissoes_metric_pendente,
            carregando: ui.comissoes_carregando,
            desselecionarTodas: ui.comissoes_desselecionar_todas,
            selecionarPendentes: ui.comissoes_selecionar_pendentes,
            selecionarItem: ui.comissoes_selecionar_item,
            marcarComoPagoBtn: ui.comissoes_marcar_pago_btn,
            marcadoSucesso: ui.comissoes_marcado_sucesso,
            vendaPrefix: ui.comissoes_venda_prefix,
            semComissoes: ui.comissoes_sem_comissoes,
            erroPagarFallback: ui.comissoes_erro_marcar,
            locale,
          }}
        />
      </Suspense>
    </div>
  )
}

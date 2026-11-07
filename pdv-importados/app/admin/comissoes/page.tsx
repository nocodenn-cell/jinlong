/**
 * FastProduct Admin — Comissões
 *
 * Server Component. Reutiliza action `carregarResumoComissoes` de /gerente/comissoes.
 * UI local: filtros URL + KPIs + tabela + sheet de detalhe.
 */

import { bloqueioPorPlano } from '@/lib/cobranca/bloqueioPorPlano'
import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { FinanceiroHubNavShell } from '@/components/ui/admin-v2/FinanceiroHubNavShell'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { carregarResumoComissoes } from '@/app/gerente/comissoes/actions'
import { ROUTES } from '@/lib/navigation/routes'
import { ComissoesContent } from './_components/ComissoesContent'
import { ComissoesModuloNav } from './_modulo/ComissoesModuloNav'
import { rotulosAbasComissao } from './_modulo/abas'
import {
  ComissoesFilters,
  type PeriodoPreset,
} from './_components/ComissoesFilters'

type SearchParams = {
  de?: string
  ate?: string
  status?: string
  /** Deep-link (ex.: Funcionários) — abre o detalhe deste operador ao carregar. */
  operador?: string
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
  const bloqueio = await bloqueioPorPlano('comissoes')
  if (bloqueio) return bloqueio
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

      <FinanceiroHubNavShell />
      <ComissoesModuloNav ativa="resumo" rotulos={rotulosAbasComissao(m)} />

      <ComissoesFilters
        filtro={filtro}
        presets={presets}
        activePresetId={activePresetId}
        labels={{
          de: ui.comissoes_filtro_de,
          ate: ui.comissoes_filtro_ate,
          status: ui.comissoes_status_label,
          aplicar: ui.comissoes_aplicar,
          limpar: m.comum.limpar_filtros,
          statusTodos: ui.comissoes_status_todos,
          statusPendente: ui.comissoes_status_pendente,
          statusPago: ui.comissoes_status_pago,
        }}
      />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <ComissoesContent
          dados={dados}
          filtroInicial={filtro}
          operadorInicialId={sp.operador ?? null}
          labels={{
            colOperador: ui.comissoes_col_operador,
            colVendas: ui.comissoes_col_vendas,
            colBruto: ui.comissoes_col_bruto,
            colAjustes: ui.comissoes_col_ajustes,
            colLiquidoPago: ui.comissoes_col_liquido_pago,
            colSaldoResidual: ui.comissoes_col_saldo_residual,
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
            saldoResidualSuffix: ui.comissoes_saldo_residual_suffix,
            fecharDetalhe: ui.comissoes_fechar_detalhe,
            metricBruto: ui.comissoes_metric_bruto,
            metricAjustes: ui.comissoes_metric_ajustes,
            metricLiquidoPago: ui.comissoes_metric_liquido_pago,
            metricSaldoResidual: ui.comissoes_metric_saldo_residual,
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
            detalheOriginal: ui.comissoes_detalhe_original,
            detalheAjustado: ui.comissoes_detalhe_ajustado,
            detalheLiquidoApurado: ui.comissoes_detalhe_liquido_apurado,
            detalhePago: ui.comissoes_detalhe_pago,
            detalheSaldo: ui.comissoes_detalhe_saldo,
            ajustesTitulo: ui.comissoes_ajustes_titulo,
            ajustesVazio: ui.comissoes_ajustes_vazio,
            ajusteConsumido: ui.comissoes_ajuste_consumido,
            ajustePendente: ui.comissoes_ajuste_pendente,
            ajusteOrigemVenda: ui.comissoes_ajuste_origem_venda,
            ajusteOrigemPosVenda: ui.comissoes_ajuste_origem_pos_venda,
            tipoCancelamento: ui.comissoes_tipo_cancelamento,
            tipoDevolucao: ui.comissoes_tipo_devolucao,
            tipoTroca: ui.comissoes_tipo_troca,
            liquidacaoTitulo: ui.comissoes_liquidacao_titulo,
            liquidacaoBruto: ui.comissoes_liquidacao_bruto,
            liquidacaoCompensado: ui.comissoes_liquidacao_compensado,
            liquidacaoLiquido: ui.comissoes_liquidacao_liquido,
            liquidacaoPagamentoId: ui.comissoes_liquidacao_pagamento_id,
            liquidacaoReplay: ui.comissoes_liquidacao_replay,
            liquidacaoFechar: ui.comissoes_liquidacao_fechar,
          }}
        />
      </Suspense>
    </div>
  )
}

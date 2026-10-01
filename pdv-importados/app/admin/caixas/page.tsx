/**
 * FastProduct Admin — Caixas (S9, G-01)
 *
 * Server Component. SOMENTE-LEITURA sobre `caixas`/`movimentacoes_caixa` —
 * nenhuma tabela/RPC nova, nenhum writer. Abrir/fechar caixa, sangria e
 * suprimento continuam exclusivos do PDV (`/caixa`); aqui só há o atalho
 * "Ir para PDV". Estrutura espelhada de `/admin/vendas`: período nos pills do
 * header, FilterBar (status/operador), chips removíveis e paginação por cursor.
 *
 * Duas seções: "Caixas em operação" (ABERTO) e "Histórico de caixas" (FECHADO,
 * filtrável). Cards de resumo: abertos agora, fechados hoje e fechamentos com
 * diferença no período.
 */

import Link from 'next/link'
import { Suspense } from 'react'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { MetricCard, PageActions, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { formatNumberLocale } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import {
  listarCaixasAbertos,
  listarHistoricoCaixas,
  listarOperadoresCaixa,
  resumoCaixas,
} from '@/app/gerente/caixas/actions'
import {
  CAIXAS_PERIODOS,
  CAIXAS_PERIODO_PADRAO,
  CAIXAS_STATUS,
  clampPage,
  oneOf,
  periodoFim,
  periodoInicio,
  rotulosOperadores,
  type CaixasFiltro,
  type CaixasPeriodo,
  type CaixasStatusFiltro,
} from '@/app/gerente/caixas/caixasFiltros'
import { CaixasAbertosTable } from './_components/CaixasAbertosTable'
import { CaixasHistoricoTable } from './_components/CaixasHistoricoTable'

type SearchParams = {
  periodo?: string
  status?: string
  operador?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminCaixasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.caixas,
    resource: `route:${ROUTES.admin.caixas}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const periodo = oneOf<CaixasPeriodo>(sp.periodo, CAIXAS_PERIODOS, CAIXAS_PERIODO_PADRAO)
  const status = oneOf<CaixasStatusFiltro>(sp.status, CAIXAS_STATUS, 'all')
  const operadorParam = sp.operador && sp.operador !== 'all' ? sp.operador : null
  const page = clampPage(sp.page)

  const [operadoresRes, abertosRes] = await Promise.all([listarOperadoresCaixa(), listarCaixasAbertos()])
  const operadores = operadoresRes.ok ? operadoresRes.data : []
  // Só aceita operador que exista na lista da loja (evita filtro por id arbitrário na URL).
  const operadorId = operadorParam && operadores.some((o) => o.id === operadorParam) ? operadorParam : null

  const filtro: CaixasFiltro = {
    inicio: periodoInicio(periodo),
    fim: periodoFim(periodo),
    status,
    operadorId,
  }

  const [historicoRes, resumoRes] = await Promise.all([listarHistoricoCaixas(filtro, page), resumoCaixas(filtro)])

  const abertos = abertosRes.ok ? abertosRes.data : []
  const linhas = historicoRes.ok ? historicoRes.data.linhas : []
  const hasMore = historicoRes.ok ? historicoRes.data.hasMore : false

  const activeParams: Record<string, string> = {}
  if (periodo !== CAIXAS_PERIODO_PADRAO) activeParams.periodo = periodo
  if (status !== 'all') activeParams.status = status
  if (operadorId) activeParams.operador = operadorId

  const hrefWith = (overrides: Record<string, string | null>) => {
    const p = new URLSearchParams(activeParams)
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    p.delete('page')
    return pathWithQuery(ROUTES.admin.caixas, p)
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    return pathWithQuery(ROUTES.admin.caixas, p)
  }

  const PERIODO_LABEL: Record<CaixasPeriodo, string> = {
    hoje: ui.vendas_periodo_label_hoje,
    ontem: ui.vendas_periodo_label_ontem,
    '7d': ui.vendas_periodo_label_7d,
    mes: ui.vendas_periodo_label_mes,
    tudo: ui.filtro_todos,
  }
  const STATUS_LABEL: Record<Exclude<CaixasStatusFiltro, 'all'>, string> = {
    divergencia: ui.caixas_filtro_divergencia,
    retomado: ui.caixas_filtro_retomado,
  }

  const chips: Array<{ key: string; label: string; href: string }> = []
  if (periodo !== 'tudo') chips.push({ key: 'periodo', label: PERIODO_LABEL[periodo], href: hrefWith({ periodo: 'tudo' }) })
  if (status !== 'all') chips.push({ key: 'status', label: STATUS_LABEL[status], href: hrefWith({ status: null }) })
  if (operadorId) {
    const nome = rotulosOperadores(operadores).find((o) => o.value === operadorId)?.label ?? operadorId
    chips.push({ key: 'operador', label: `${ui.caixas_filtro_operador}: ${nome}`, href: hrefWith({ operador: null }) })
  }

  const filtrosSelect: FilterDef[] = [
    {
      type: 'select',
      key: 'status',
      label: ui.caixas_filtro_status,
      showLabel: true,
      defaultValue: 'all',
      options: [
        { value: 'all', label: ui.filtro_todos },
        { value: 'divergencia', label: STATUS_LABEL.divergencia },
        { value: 'retomado', label: STATUS_LABEL.retomado },
      ],
    },
    {
      type: 'select',
      key: 'operador',
      label: ui.caixas_filtro_operador,
      showLabel: true,
      defaultValue: 'all',
      options: [{ value: 'all', label: ui.filtro_todos }, ...rotulosOperadores(operadores)],
    },
  ]

  const periodOptions: CaixasPeriodo[] = ['hoje', 'ontem', '7d', 'mes', 'tudo']

  const resumo = resumoRes.ok ? resumoRes.data : null
  const metricCards: Array<{ label: string; value: string; icon: MetricCardIconKey; tone: 'gold' | 'success' | 'warning' }> = [
    {
      label: ui.caixas_kpi_abertos,
      value: abertosRes.ok ? formatNumberLocale(abertos.length, locale) : '—',
      icon: 'wallet-cards',
      tone: 'success',
    },
    {
      label: ui.caixas_kpi_fechados_hoje,
      value: resumo ? formatNumberLocale(resumo.fechadosHoje, locale) : '—',
      icon: 'file-check-2',
      tone: 'gold',
    },
    {
      label: ui.caixas_kpi_com_diferenca,
      value: resumo ? formatNumberLocale(resumo.comDiferenca, locale) : '—',
      icon: 'alert-circle',
      tone: 'warning',
    },
  ]

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title={ui.caixas_titulo}
        subtitle={ui.caixas_subtitulo}
        filters={(
          <div className="admin-v2-segmented">
            {periodOptions.map((option) => (
              <Link
                key={option}
                href={hrefWith({ periodo: option === CAIXAS_PERIODO_PADRAO ? null : option })}
                data-active={periodo === option}
                className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {PERIODO_LABEL[option]}
              </Link>
            ))}
          </div>
        )}
        actions={(
          <PageActions>
            <Link
              href={ROUTES.caixa.home}
              className="rounded-lg border border-[var(--color-border-secondary)] px-3 py-1.5 text-caption font-medium text-jl-fg-2 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
            >
              {ui.caixas_ir_pdv}
            </Link>
          </PageActions>
        )}
      />

      <div className="admin-v2-grid-kpi">
        {metricCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.tone} labelWrap />
        ))}
      </div>

      <SectionCard title={ui.caixas_secao_abertos}>
        {abertosRes.ok ? (
          <CaixasAbertosTable
            linhas={abertos}
            locale={locale}
            labels={{
              colOperador: ui.caixas_col_operador,
              colAbertura: ui.caixas_col_abertura,
              colValorInicial: ui.caixas_col_valor_inicial,
              colSangrias: ui.caixas_col_sangrias,
              colSuprimentos: ui.caixas_col_suprimentos,
              colStatus: ui.caixas_col_status,
              statusAberto: ui.caixas_status_aberto,
              statusRetomado: ui.caixas_status_retomado,
              vazioTitulo: ui.caixas_abertos_vazio_titulo,
              vazioSub: ui.caixas_abertos_vazio_sub,
            }}
          />
        ) : (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-small text-destructive">
            {abertosRes.error}
          </div>
        )}
      </SectionCard>

      <SectionCard title={ui.caixas_secao_historico}>
        <div className="mb-3">
          <Suspense fallback={<div className="h-8" />}>
            <FilterBar filters={filtrosSelect} clearable={false} resetPageOnChange />
          </Suspense>
        </div>

        {resumo && resumo.fechadosIncompletos > 0 ? (
          <div
            role="status"
            className="mb-3 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-small text-[var(--color-warning-strong)]"
          >
            {ui.caixas_aviso_incompletos.replace('{{n}}', formatNumberLocale(resumo.fechadosIncompletos, locale))}
          </div>
        ) : null}

        {chips.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Link key={chip.key} href={chip.href} className="admin-v2-chip">
                {chip.label}
                <span aria-hidden className="text-jl-fg-3">
                  ✕
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <CaixasHistoricoTable
          linhas={linhas}
          erro={historicoRes.ok ? null : historicoRes.error}
          locale={locale}
          labels={{
            colOperador: ui.caixas_col_operador,
            colAbertura: ui.caixas_col_abertura,
            colFechamento: ui.caixas_col_fechamento,
            colValorSistema: ui.caixas_col_valor_sistema,
            colValorContado: ui.caixas_col_valor_contado,
            colDiferenca: ui.caixas_col_diferenca,
            colMotivo: ui.caixas_col_motivo,
            colStatus: ui.caixas_col_status,
            statusFechado: ui.caixas_status_fechado,
            statusDivergencia: ui.caixas_status_divergencia,
            statusRetomado: ui.caixas_status_retomado,
            semMotivo: ui.caixas_sem_motivo,
            vazioTitulo: ui.caixas_vazio_titulo,
            vazioSub: ui.caixas_vazio_sub,
            detalheTitulo: ui.caixas_detalhe_titulo,
            detalheValorInicial: ui.caixas_detalhe_valor_inicial,
            detalheMovimentacoes: ui.caixas_detalhe_movimentacoes,
            composicaoTitulo: ui.caixas_composicao_titulo,
            composicaoSuprimentos: ui.caixas_composicao_suprimentos,
            composicaoSangrias: ui.caixas_composicao_sangrias,
            composicaoRecebimentos: ui.caixas_composicao_recebimentos,
            composicaoOutros: ui.caixas_composicao_outros,
            composicaoNota: ui.caixas_composicao_nota,
            detalheSemMovimentacoes: ui.caixas_detalhe_sem_movimentacoes,
            movTipoSangria: ui.caixas_mov_tipo_sangria,
            movTipoSuprimento: ui.caixas_mov_tipo_suprimento,
            fecharAria: ui.caixas_fechar_aria,
            erroTitulo: ui.caixas_erro_titulo,
          }}
        />

        {page > 1 || hasMore ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-caption text-jl-fg-3">
              {m.produtos.pag_info.replace('{{atual}}', String(page)).replace('{{total}}', '…')}
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                {ui.paginacao_anterior}
              </PageLink>
              <PageLink href={pageHref(page + 1)} disabled={!hasMore}>
                {ui.paginacao_proxima}
              </PageLink>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-jl-fg-3 opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-jl-fg-2 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
}

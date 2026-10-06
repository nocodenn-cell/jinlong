/**
 * FastProduct Admin — Financeiro unificado (Receber + Pagar + Fiscal)
 */

import { Suspense } from 'react'
import { carregarFinanceiroLoja } from './financeiroLojaActions'
import { FinanceiroHubNavShell } from '@/components/ui/admin-v2/FinanceiroHubNavShell'
import { FinanceiroWorkspace, type FinanceiroWorkspaceTab } from './_components/FinanceiroWorkspace'
import { createClient } from '@/lib/supabase/server'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { MetricCard, PageHeader } from '@/components/ui/admin-v2'
import {
  fetchContasReceberListagem,
  fetchFinanceiroTitulosKpis,
  parseTituloFiltersFromSearchParams,
} from '@/lib/gerente/financeiroTitulosServer'
import { buscarClientesPaginadosAction } from '@/app/gerente/clientes/actions'
import { buscarContasPagarAction } from '@/app/gerente/financeiro/contas-pagar/actions'
import { buscarFornecedoresPaginadosAction } from '@/app/gerente/fornecedores/actions'
import { formatBRL } from '@/lib/format/money'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import Link from 'next/link'
import { type ContaLinha } from './_components/ContasReceberTable'
import { FinanceiroContent } from './_components/FinanceiroContent'
import { parseFinanceiroTab } from './_components/financeiroTabs'

type SearchParams = {
  pagina?: string
  tab?: string
  opcao?: string
  cliente_id?: string
  cliente?: string
  q?: string
  de?: string
  ate?: string
  limite?: string
  status?: string
  periodo?: string
  fornecedor_id?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const activeTab = parseFinanceiroTab(sp.tab)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
  const de = sp.de || today.slice(0,7) + '-01'
  const ate = sp.ate || today
  const pagina = Number(sp.pagina || 1)
  const financeiro = activeTab === 'fiscal' ? null : await carregarFinanceiroLoja(de, ate, pagina)
  if (['resumo','contas','recebiveis','conciliacao','resultado'].includes(activeTab)) {
    return <div className="admin-v2-page"><PageHeader title={ui.financeiro_titulo} subtitle={ui.financeiro_subtitulo} /><FinanceiroHubNavShell activeTab={activeTab} />{financeiro?.ok ? <FinanceiroWorkspace data={financeiro.data} tab={activeTab as FinanceiroWorkspaceTab} de={de} ate={ate} /> : <p role="alert">{financeiro && !financeiro.ok ? financeiro.error : 'Não foi possível carregar o financeiro.'}</p>}</div>
  }
  const parsed = parseTituloFiltersFromSearchParams(sp as Record<string, string | string[] | undefined>)
  const { limite, ...filters } = parsed

  const supabase = await createClient()
  const statusPagar = sp.status ?? 'todos'
  const periodoPagar = sp.periodo ?? ''
  // Deep-link `?fornecedor_id=` (ex.: NF-e concluída, ficha de Fornecedores):
  // id que não é UUID é ignorado em vez de virar erro de query.
  const fornecedorIdPagar =
    sp.fornecedor_id && UUID_RE.test(sp.fornecedor_id.trim()) ? sp.fornecedor_id.trim() : ''

  const [listaRes, kpisRes, fiscalRes, clientesRes, pagarRes, fornRes, caixasRes] = await Promise.all([
    fetchContasReceberListagem(supabase, filters, limite),
    fetchFinanceiroTitulosKpis(supabase),
    supabase
      .from('documentos_fiscais_pendentes')
      .select('id, venda_id, tipo_doc, status, tentativas, ultimo_erro, created_at')
      .in('status', ['PENDENTE', 'ERRO'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    buscarClientesPaginadosAction(1),
    buscarContasPagarAction(1, {
      status: statusPagar,
      periodo: periodoPagar || undefined,
      fornecedor_id: fornecedorIdPagar || undefined,
    }),
    buscarFornecedoresPaginadosAction(1),
    supabase.from('caixas').select('id, loja_id, operador_id, usuarios!caixas_operador_id_fkey(nome)').eq('status', 'ABERTO'),
  ])

  const fiscal = (fiscalRes.data ?? []).map((row) => ({
    id: row.id,
    vendaId: row.venda_id,
    tipoDoc: row.tipo_doc,
    status: row.status,
    tentativas: row.tentativas ?? 0,
    ultimoErro: row.ultimo_erro,
    criadoEm: row.created_at,
  }))

  const contas: ContaLinha[] = listaRes.titulos.map((t) => ({
    id: t.id,
    cliente_nome: t.cliente_nome ?? '—',
    valor_total: t.valor_total,
    valor_aberto: t.valor_aberto,
    valor_pago: t.valor_total - t.valor_aberto,
    status: t.status,
    vencimento: t.vencimento,
    descricao: t.descricao,
    loja_id: t.loja_id,
    venda_id: t.venda_id,
  }))

  const clientesOpts = clientesRes.ok ? clientesRes.clientes.map((c) => ({ id: c.id, nome: c.nome })) : []

  // `buscarFornecedoresPaginadosAction(1)` traz só a 1ª página: o fornecedor do
  // deep-link pode não estar nela, e sem a opção o filtro ficaria ativo com o
  // <select> em branco.
  let fornecedoresOptsPagar = fornRes.ok
    ? fornRes.fornecedores.map((f) => ({ id: f.id, nome: f.nome }))
    : []
  if (fornecedorIdPagar && !fornecedoresOptsPagar.some((f) => f.id === fornecedorIdPagar)) {
    const nomeDosTitulos = pagarRes.ok
      ? pagarRes.contas.find((c) => c.fornecedor_id === fornecedorIdPagar)?.fornecedor_nome
      : null
    const nome =
      nomeDosTitulos ??
      (await supabase.from('fornecedores').select('nome').eq('id', fornecedorIdPagar).maybeSingle())
        .data?.nome
    if (nome) fornecedoresOptsPagar = [{ id: fornecedorIdPagar, nome }, ...fornecedoresOptsPagar]
  }

  const filterDefs: FilterDef[] = [
    { type: 'search', key: 'q', placeholder: ui.financeiro_filtro_placeholder },
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

  const activeParams: Record<string, string> = { tab: activeTab }
  if (filters.q) activeParams.q = filters.q
  if (filters.opcao !== 'mix') activeParams.opcao = filters.opcao
  if (filters.clienteId) activeParams.cliente_id = filters.clienteId
  if (filters.nomeCliente) activeParams.cliente = filters.nomeCliente
  if (filters.de) activeParams.de = filters.de
  if (filters.ate) activeParams.ate = filters.ate

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    // cliente_id/cliente sempre andam juntos (id filtra, nome só rotula o chip).
    if (key === 'cliente_id') p.delete('cliente')
    return pathWithQuery(ROUTES.admin.financeiro, p)
  }

  const statusChipLabel: Record<string, string> = {
    ABERTO: ui.financeiro_filtro_so_aberto,
    PARCIAL: ui.financeiro_filtro_so_parcial,
  }

  const chips: Array<{ key: string; label: string }> = []
  if (filters.clienteId) {
    chips.push({
      key: 'cliente_id',
      label: ui.financeiro_chip_cliente.replace('{{nome}}', filters.nomeCliente || '—'),
    })
  }
  if (filters.de) chips.push({ key: 'de', label: ui.financeiro_chip_de.replace('{{data}}', filters.de) })
  if (filters.ate) chips.push({ key: 'ate', label: ui.financeiro_chip_ate.replace('{{data}}', filters.ate) })
  if (filters.opcao !== 'mix') chips.push({ key: 'opcao', label: statusChipLabel[filters.opcao] ?? filters.opcao })

  const kpiSection = (
    <div className="admin-v2-grid-kpi">
      <MetricCard label={ui.financeiro_kpi_titulos} value={String(kpisRes.titulosAbertosCount)} icon="wallet-cards" tone="gold" />
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
        label={ui.financeiro_kpi_vencidos}
        value={formatBRL(kpisRes.valorVencidoTotal)}
        icon="alert-circle"
        tone="danger"
        hint={
          kpisRes.titulosVencidosCount > 0
            ? ui.financeiro_kpi_hint_vencidos.replace('{{n}}', String(kpisRes.titulosVencidosCount))
            : undefined
        }
      />
      <MetricCard label={ui.financeiro_kpi_docs_fiscais} value={String(fiscal.length)} icon="file-check-2" tone="warning" />
    </div>
  )

  const filterSection = (
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
  )

  return (
    <div className="admin-v2-page">
      <PageHeader title={ui.financeiro_titulo} subtitle={ui.financeiro_subtitulo} />

      <div className="admin-v2-stack">
        <FinanceiroContent
          financeiroData={financeiro?.ok ? financeiro.data : undefined}
          activeTab={activeTab}
          contas={contas}
          fiscal={fiscal}
          actorLojaId={session.lojaId}
          clientesOpts={clientesOpts}
          caixasAbertos={(caixasRes.data ?? []).map((c) => ({
            id: c.id,
            loja_id: c.loja_id,
            operador: (c.usuarios as { nome?: string } | null)?.nome ?? c.id.slice(0, 8),
          }))}
          filterSection={filterSection}
          kpiSection={kpiSection}
          panelLabels={{
            titulosEmAberto: ui.financeiro_section_titulos,
            filaFiscal: ui.financeiro_section_fila,
            filaFiscalVazioTitulo: ui.financeiro_fila_fiscal_vazio_titulo,
            filaFiscalVazioSub: ui.financeiro_fila_fiscal_vazio_sub,
            fiscalStubTitulo: ui.financeiro_fiscal_stub_titulo,
            fiscalStubSub: ui.financeiro_fiscal_stub_sub,
            locale,
          }}
          contasLabels={{
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
            verVenda: ui.financeiro_ver_venda,
            receber: ui.financeiro_acao_receber,
            locale,
          }}
          contasPagar={{
            idioma: session.idioma,
            locale,
            contasIniciais: pagarRes.ok ? pagarRes.contas : [],
            hasMoreInicial: pagarRes.ok ? pagarRes.hasMore : false,
            fornecedoresOpts: fornecedoresOptsPagar,
            statusInicial: statusPagar,
            periodoInicial: periodoPagar,
            fornecedorInicial: fornecedorIdPagar,
          }}
        />
      </div>
    </div>
  )
}

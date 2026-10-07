'use client'

import { Suspense, useState } from 'react'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroTitulosOperations } from './FinanceiroTitulosOperations'
import { FinanceiroPaginacao } from './FinanceiroWorkspace'
import { FinanceiroPrimeiroUso } from './FinanceiroPrimeiroUso'
import { FinanceiroAcoesRapidas } from './FinanceiroAcoesRapidas'
import { SectionCard } from '@/components/ui/admin-v2'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { ContasReceberTable, type ContaLinha, type ContasLabels } from './ContasReceberTable'
import { FinanceiroReceberExtras } from './FinanceiroReceberExtras'
import { FinanceiroHubNavShell } from '@/components/ui/admin-v2/FinanceiroHubNavShell'
import type { FinanceiroTabId } from './financeiroTabs'
import { DocumentoFiscalDetailSheet } from './DocumentoFiscalDetailSheet'
import { FiscalStubNotice } from './FiscalStubNotice'
import { ContasPagarListClient } from '@/app/gerente/financeiro/contas-pagar/ContasPagarListClient'
import type { ContaPagarRow } from '@/app/gerente/financeiro/contas-pagar/actions'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { ReactNode } from 'react'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'

export type DocumentoFiscalPendenteRow = {
  id: string
  tipoDoc: string
  status: string
  criadoEm: string | null
}

type ClienteOpt = { id: string; nome: string }

type Props = {
  financeiroData?: FinanceiroPainel
  activeTab: FinanceiroTabId
  contas: ContaLinha[]
  fiscal: DocumentoFiscalPendenteRow[]
  contasLabels: ContasLabels
  panelLabels: {
    titulosEmAberto: string
    filaFiscal: string
    filaFiscalVazioTitulo: string
    filaFiscalVazioSub: string
    fiscalStubTitulo: string
    fiscalStubSub: string
    locale: string
  }
  clientesOpts: ClienteOpt[]
  /** Loja do ator autenticado — `registrar_liquidacao_receber` rejeita liquidação cross-loja para todos os perfis. */
  actorLojaId: string | null
  caixasAbertos: Array<{ id: string; loja_id: string; operador: string }>
  contasPagar: {
    idioma: Idioma
    locale: string
    contasIniciais: ContaPagarRow[]
    hasMoreInicial: boolean
    fornecedoresOpts: Array<{ id: string; nome: string }>
    statusInicial: string
    periodoInicial: string
    /** Deep-link `?fornecedor_id=`: fornecedor já filtrado ao abrir a aba "A pagar". */
    fornecedorInicial?: string
  }
  filterSection: ReactNode
  kpiSection: ReactNode
}

function FiscalList({
  fiscal,
  labels,
  onSelect,
}: {
  fiscal: DocumentoFiscalPendenteRow[]
  labels: Props['panelLabels']
  onSelect: (id: string) => void
}) {
  if (fiscal.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="text-3xl text-jl-fg-3" aria-hidden>
          🧾
        </span>
        <p className="text-subtitle font-medium text-jl-fg-2">{labels.filaFiscalVazioTitulo}</p>
        <p className="text-caption text-jl-fg-3">{labels.filaFiscalVazioSub}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {fiscal.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft px-3 py-2 text-left transition hover:bg-jl-surface-elev focus-visible:outline-none focus-visible:shadow-focus"
          >
            <div>
              <p className="text-small font-medium text-jl-fg-1">{item.tipoDoc}</p>
              <p className="text-caption text-jl-fg-3">{formatDateTimeOrDash(item.criadoEm, labels.locale)}</p>
            </div>
            <span className="admin-v2-badge-muted rounded-full px-2 py-1 text-caption">{item.status}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function FinanceiroContent({
  financeiroData,
  activeTab,
  contas,
  fiscal,
  contasLabels,
  panelLabels,
  clientesOpts,
  actorLojaId,
  caixasAbertos,
  contasPagar,
  filterSection,
  kpiSection,
}: Props) {
  const [fiscalDetalheId, setFiscalDetalheId] = useState<string | null>(null)
  const { idioma } = useAdminV2Session()
  const ui = getMessages(idioma).admin_ui
  const acoesLabels = {
    faixaAria: ui.financeiro_acoes_aria,
    registrarVenda: ui.financeiro_acao_registrar_venda,
    receber: ui.financeiro_acao_receber,
    pagar: ui.financeiro_acao_pagar,
    transferir: ui.financeiro_acao_transferir,
    vendaTitulo: ui.financeiro_acao_venda_titulo,
    vendaTexto: ui.financeiro_acao_venda_texto,
    vendaPdv: ui.financeiro_acao_venda_pdv,
    vendaBuscar: ui.financeiro_acao_venda_buscar,
    receberTitulo: ui.financeiro_acao_receber_titulo,
    pagarTitulo: ui.financeiro_acao_pagar_titulo,
    transferirTitulo: ui.financeiro_acao_transferir_titulo,
    avulsoHint: ui.financeiro_acao_avulso_hint,
    confirmarReceber: ui.financeiro_acao_confirmar_receber,
    confirmarPagar: ui.financeiro_acao_confirmar_pagar,
    confirmarTransferir: ui.financeiro_acao_confirmar_transferir,
    saldoRegistrado: ui.financeiro_saldo_registrado_hint,
  }

  return (
    <>
      <Suspense fallback={<div className="h-9" />}>
        <FinanceiroHubNavShell activeTab={activeTab} />
      </Suspense>

      <FinanceiroAcoesRapidas data={financeiroData} labels={acoesLabels} />

      {activeTab === 'receber' ? (
        <>
          {financeiroData ? <FinanceiroPrimeiroUso semContas={financeiroData.contas.length === 0} /> : null}
          {kpiSection}
          {filterSection}
          <div className="admin-v2-stack">
            <SectionCard title={panelLabels.titulosEmAberto}>
              <ContasReceberTable contas={contas} labels={contasLabels} />
              <FinanceiroReceberExtras
                financeiroData={financeiroData}
                contas={contas}
                clientesIniciais={clientesOpts}
                caixasAbertos={caixasAbertos}
                actorLojaId={actorLojaId}
              />
            </SectionCard>
          </div>
        </>
      ) : null}

      {activeTab === 'pagar' ? (
        <ContasPagarListClient
          somenteCaixa
          idioma={contasPagar.idioma}
          locale={contasPagar.locale}
          contasIniciais={contasPagar.contasIniciais}
          hasMoreInicial={contasPagar.hasMoreInicial}
          fornecedoresOpts={contasPagar.fornecedoresOpts}
          statusInicial={contasPagar.statusInicial}
          periodoInicial={contasPagar.periodoInicial}
          fornecedorInicial={contasPagar.fornecedorInicial}
          actorLojaId={actorLojaId}
        />
      ) : null}

      {activeTab === 'fiscal' ? (
        <SectionCard title={panelLabels.filaFiscal}>
          <FiscalStubNotice
            titulo={panelLabels.fiscalStubTitulo}
            subtitulo={panelLabels.fiscalStubSub}
          />
          <FiscalList fiscal={fiscal} labels={panelLabels} onSelect={setFiscalDetalheId} />
        </SectionCard>
      ) : null}

      {financeiroData && (activeTab === 'pagar' || activeTab === 'receber') ? <><FinanceiroTitulosOperations data={financeiroData} tipo={activeTab === 'pagar' ? 'AP' : 'AR'} /><FinanceiroPaginacao data={financeiroData} countKey={activeTab} /></> : null}
      <DocumentoFiscalDetailSheet
        documentoId={fiscalDetalheId}
        onClose={() => setFiscalDetalheId(null)}
        locale={panelLabels.locale}
      />
    </>
  )
}

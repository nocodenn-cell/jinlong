'use client'

import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { SectionCard } from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'
import { EntityTable, type EntityColumn } from '@/components/ui/EntityTable'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { ContasReceberTable, type ContaLinha, type ContasLabels } from './ContasReceberTable'
import { FinanceiroReceberExtras } from './FinanceiroReceberExtras'
import { FinanceiroTabNav, type FinanceiroTabId } from './FinanceiroTabNav'
import { DocumentoFiscalDetailSheet } from './DocumentoFiscalDetailSheet'
import { FiscalStubNotice } from './FiscalStubNotice'
import { ContasPagarListClient } from '@/app/gerente/financeiro/contas-pagar/ContasPagarListClient'
import type { ContaPagarRow } from '@/app/gerente/financeiro/contas-pagar/actions'
import type { Idioma } from '@/idioma/normalizeIdioma'

export type DocumentoFiscalPendenteRow = {
  id: string
  tipoDoc: string
  status: string
  criadoEm: string | null
  tentativas?: number
  ultimoErro?: string | null
}

type ClienteOpt = { id: string; nome: string }

type Props = {
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
    fiscalColTipo: string
    fiscalColStatus: string
    fiscalColQuando: string
    locale: string
  }
  clientesOpts: ClienteOpt[]
  contasPagar: {
    idioma: Idioma
    locale: string
    contasIniciais: ContaPagarRow[]
    hasMoreInicial: boolean
    fornecedoresOpts: Array<{ id: string; nome: string }>
    statusInicial: string
    periodoInicial: string
  } | null
  filterSection: ReactNode
  kpiSection: ReactNode
}

function FiscalTable({
  fiscal,
  labels,
  onSelect,
}: {
  fiscal: DocumentoFiscalPendenteRow[]
  labels: Props['panelLabels']
  onSelect: (id: string) => void
}) {
  const columns: EntityColumn<DocumentoFiscalPendenteRow>[] = [
    {
      key: 'tipo',
      header: labels.fiscalColTipo,
      cell: (r) => <span className="text-body font-medium text-fg">{r.tipoDoc}</span>,
    },
    {
      key: 'quando',
      header: labels.fiscalColQuando,
      cell: (r) => (
        <span className="text-caption text-fg-muted">
          {formatDateTimeOrDash(r.criadoEm, labels.locale)}
        </span>
      ),
    },
    {
      key: 'status',
      header: labels.fiscalColStatus,
      status: (r) => ({ status: r.status }),
    },
  ]

  return (
    <EntityTable
      data={fiscal}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => onSelect(r.id)}
      emptyState={
        <EmptyState title={labels.filaFiscalVazioTitulo} description={labels.filaFiscalVazioSub} />
      }
    />
  )
}

export function FinanceiroContent({
  activeTab,
  contas,
  fiscal,
  contasLabels,
  panelLabels,
  clientesOpts,
  contasPagar,
  filterSection,
  kpiSection,
}: Props) {
  const [fiscalDetalheId, setFiscalDetalheId] = useState<string | null>(null)

  return (
    <>
      <Suspense fallback={<div className="h-9" />}>
        <FinanceiroTabNav activeTab={activeTab} />
      </Suspense>

      {activeTab === 'receber' ? (
        <>
          {kpiSection}
          {filterSection}
          <SectionCard title={panelLabels.titulosEmAberto}>
            <ContasReceberTable contas={contas} labels={contasLabels} />
            <FinanceiroReceberExtras contas={contas} clientesIniciais={clientesOpts} />
          </SectionCard>
        </>
      ) : null}

      {activeTab === 'pagar' && contasPagar ? (
        <ContasPagarListClient
          idioma={contasPagar.idioma}
          locale={contasPagar.locale}
          contasIniciais={contasPagar.contasIniciais}
          hasMoreInicial={contasPagar.hasMoreInicial}
          fornecedoresOpts={contasPagar.fornecedoresOpts}
          statusInicial={contasPagar.statusInicial}
          periodoInicial={contasPagar.periodoInicial}
          embedded
        />
      ) : null}

      {activeTab === 'fiscal' ? (
        <SectionCard title={panelLabels.filaFiscal}>
          <FiscalStubNotice
            titulo={panelLabels.fiscalStubTitulo}
            subtitulo={panelLabels.fiscalStubSub}
          />
          <FiscalTable fiscal={fiscal} labels={panelLabels} onSelect={setFiscalDetalheId} />
        </SectionCard>
      ) : null}

      <DocumentoFiscalDetailSheet
        documentoId={fiscalDetalheId}
        onClose={() => setFiscalDetalheId(null)}
        locale={panelLabels.locale}
      />
    </>
  )
}

import Link from 'next/link'
import { SectionCard } from '@/components/ui/admin-v2'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { adminFinanceiroDocumentoHref } from '@shared-core/navigation/routes'
import { ReprocessarDocumentoButton } from './ReprocessarDocumentoButton'
import { ContasReceberTable, type ContaLinha, type ContasLabels } from './ContasReceberTable'

export type DocumentoFiscalPendenteRow = {
  id: string
  vendaId: string
  tipoDoc: string
  status: string
  tentativas: number
  ultimoErro: string | null
  criadoEm: string | null
}

type FinanceiroPanelsLabels = {
  titulosEmAberto: string
  filaFiscal: string
  filaFiscalVazioTitulo: string
  filaFiscalVazioSub: string
  filaFiscalLinkTimeline: string
  filaFiscalBtnReprocessar: string
  filaFiscalBtnReprocessando: string
  filaFiscalConfirmReprocessar: string
  filaFiscalToastReprocessarOk: string
  contas: ContasLabels
  locale: string
}

type FinanceiroPanelsProps = {
  contas: ContaLinha[]
  fiscal: DocumentoFiscalPendenteRow[]
  labels: FinanceiroPanelsLabels
}

export function FinanceiroPanels({ contas, fiscal, labels }: FinanceiroPanelsProps) {
  return (
    <div className="admin-v2-grid-2">
      <SectionCard title={labels.titulosEmAberto}>
        <ContasReceberTable contas={contas} labels={labels.contas} />
      </SectionCard>

      <SectionCard title={labels.filaFiscal}>
        {fiscal.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-3xl text-jl-fg-3" aria-hidden>
              🧾
            </span>
            <p className="text-[13px] font-medium text-jl-fg-2">{labels.filaFiscalVazioTitulo}</p>
            <p className="text-[11px] text-jl-fg-3">{labels.filaFiscalVazioSub}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {fiscal.map((item) => {
              const podeReprocessar = item.status === 'ERRO' || item.status === 'PENDENTE'
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-jl-fg-1">
                        {item.tipoDoc} · <span className="font-mono">{item.vendaId.slice(0, 8)}…</span>
                      </p>
                      <p className="text-[11px] text-jl-fg-3">{formatDateTimeOrDash(item.criadoEm, labels.locale)}</p>
                    </div>
                    <span className="admin-v2-badge-muted shrink-0 rounded-full px-2 py-1 text-[11px]">
                      {item.status}
                    </span>
                  </div>
                  {item.ultimoErro ? (
                    <p className="truncate text-[11px] text-[var(--color-danger)]" title={item.ultimoErro}>
                      {item.ultimoErro}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={adminFinanceiroDocumentoHref(item.id)}
                      className="text-[11px] font-medium text-jl-fg-2 hover:underline"
                    >
                      {labels.filaFiscalLinkTimeline}
                    </Link>
                    {podeReprocessar ? (
                      <ReprocessarDocumentoButton
                        documentoId={item.id}
                        label={labels.filaFiscalBtnReprocessar}
                        loadingLabel={labels.filaFiscalBtnReprocessando}
                        confirmMessage={labels.filaFiscalConfirmReprocessar.replace(
                          '{{id}}',
                          item.id.slice(0, 8),
                        )}
                        successMessage={labels.filaFiscalToastReprocessarOk}
                      />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

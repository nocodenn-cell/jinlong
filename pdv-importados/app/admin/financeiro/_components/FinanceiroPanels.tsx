import { SectionCard } from '@/components/ui/admin-v2'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { ContasReceberTable, type ContaLinha, type ContasLabels } from './ContasReceberTable'

export type DocumentoFiscalPendenteRow = {
  id: string
  tipoDoc: string
  status: string
  criadoEm: string | null
}

type FinanceiroPanelsLabels = {
  titulosEmAberto: string
  filaFiscal: string
  filaFiscalVazioTitulo: string
  filaFiscalVazioSub: string
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
            {fiscal.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-jl-fg-1">{item.tipoDoc}</p>
                  <p className="text-[11px] text-jl-fg-3">{formatDateTimeOrDash(item.criadoEm, labels.locale)}</p>
                </div>
                <span className="admin-v2-badge-muted rounded-full px-2 py-1 text-[11px]">{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

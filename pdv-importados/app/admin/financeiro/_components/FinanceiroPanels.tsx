import { SectionCard } from '@/components/ui/admin-v2'
import { ContasReceberTable, type ContaLinha, type ContasLabels } from './ContasReceberTable'

type FinanceiroPanelsLabels = {
  titulosEmAberto: string
  contas: ContasLabels
}

type FinanceiroPanelsProps = {
  contas: ContaLinha[]
  labels: FinanceiroPanelsLabels
}

export function FinanceiroPanels({ contas, labels }: FinanceiroPanelsProps) {
  return (
    <SectionCard title={labels.titulosEmAberto}>
      <ContasReceberTable contas={contas} labels={labels.contas} />
    </SectionCard>
  )
}

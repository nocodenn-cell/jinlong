import type { CaixaHistoricoLinha } from '@/app/gerente/caixas/caixasHistorico'
import type { ResumoCaixas } from '@/app/gerente/caixas/actions'
import type { FinanceiroPainel } from '@/app/admin/financeiro/financeiroLojaTypes'

/** Dados opcionais carregados no Server Component para abas executivas. */
export type ExecutiveExtras = {
  caixasResumo?: ResumoCaixas | null
  caixasLinhas?: readonly CaixaHistoricoLinha[]
  caixasErro?: string | null
  financeiro?: FinanceiroPainel | null
  financeiroErro?: string | null
}

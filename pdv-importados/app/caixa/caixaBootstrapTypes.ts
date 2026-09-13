import type {
  CaixaStatusOperadorResult,
  CarregarRegrasResult,
  ConfiguracoesCaixaWebResult,
  LimiteSangriaResult,
  ObterMovimentacoesCaixaResult,
} from '@/app/caixa/caixaActionTypes'
import type { VendaEmEsperaCard } from '@/app/caixa/actions'

/** Mesmo contrato de `listarVendasEmEsperaCaixa`. */
export type VendasEmEsperaInicialResult =
  | { ok: true; vendas: VendaEmEsperaCard[] }
  | { ok: false; error: string }

/**
 * Dados de abertura do PDV carregados no Server Component (`carregarBootstrapCaixa`).
 * Cada campo é exatamente o resultado da Server Action equivalente.
 */
export type CaixaBootstrapInicial = {
  regras: CarregarRegrasResult
  limiteSangria: LimiteSangriaResult
  configuracoes: ConfiguracoesCaixaWebResult
  status: CaixaStatusOperadorResult
  /** `null` quando o caixa não está aberto (nada a listar). */
  movimentacoes: ObterMovimentacoesCaixaResult | null
  vendasEmEspera: VendasEmEsperaInicialResult
}

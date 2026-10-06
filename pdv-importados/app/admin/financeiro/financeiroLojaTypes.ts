export type FinanceiroConta = {
  id: string
  nome: string
  tipo: string
  ativo: boolean
  saldo: number
  data_inicial?: string
  entradas_periodo?: number
  saidas_periodo?: number
}
export type FinanceiroCategoria = { id: string; nome: string; tipo: 'RECEITA' | 'DESPESA' | 'AMBOS'; ativo: boolean }
export type FinanceiroTitulo = { id: string; nome: string; descricao: string | null; valor_total: number; valor_pago?: number; valor_aberto?: number; vencimento: string | null; status: string; categoria_id: string | null }
export type FinanceiroMovimento = {
  id: string
  conta_financeira_id: string
  conta_nome: string
  categoria_nome: string | null
  data: string
  descricao: string
  valor: number
  origem: string
  origem_id?: string
  conciliacao_id: string | null
  estornado: boolean
  usuario_nome?: string | null
}
export type FinanceiroRecebivel = { id: string; venda_id: string; forma: string; parcela: number; parcelas: number; bruto: number; taxa: number | null; liquido: number; previsao: string | null; operadora: string | null; conta_financeira_id: string | null; status: string; devolucao: boolean }
export type FinanceiroExtrato = { id: string; conta_financeira_id: string; referencia: string; data: string; descricao: string; valor: number; conciliacao_id: string | null }
export type FinanceiroFormaPagamento = {
  id: string
  codigo: string
  nome: string
  ativo: boolean
  conta_financeira_id: string | null
  conta_nome: string | null
  conta_tipo: string | null
}
export type FinanceiroPainel = {
 hoje: string; saldo: number; saldo_pdv: number; pagina: number
 contas: FinanceiroConta[]; categorias: FinanceiroCategoria[]
 clientes: { id: string; nome: string }[]; fornecedores: { id: string; nome: string }[]
 pagar: FinanceiroTitulo[]; receber: FinanceiroTitulo[]; movimentos: FinanceiroMovimento[]
 recebiveis: FinanceiroRecebivel[]; extratos: FinanceiroExtrato[]
 formas_pagamento?: FinanceiroFormaPagamento[]
 movimentos_caixa: { id: string; tipo: string; valor: number; caixa_id: string }[]
 contagens: Record<'pagar' | 'receber' | 'recebiveis' | 'movimentos' | 'extratos', number>
 fluxo: { dia: string; entradas: number; saidas: number; saldo: number }[]
 alertas: { sem_previsao: number; ar_sem_vencimento: number; caixas_incompletos: number; sem_categoria: number }
 resultado_caixa: { categoria: string; entradas: number; saidas: number; resultado: number }[]
 resultado_gerencial: { receita_vendas: number; custo_conhecido: number; itens_sem_custo: number; despesas_manuais: number; taxas_conferidas: number; taxas_pendentes: number }
}
export const FINANCEIRO_OPERACOES = [
  'CRIAR_CONTA','CRIAR_AP','CRIAR_AR','BAIXAR_AP','BAIXAR_AR','TRANSFERIR','MOVIMENTO',
  'ESTORNAR_MOVIMENTO','CONFIGURAR_RECEBIVEL','RECEBER_VENDA','ESTORNAR_RECEBIVEL',
  'IMPORTAR_EXTRATO','CONCILIAR','DESCONCILIAR','CLASSIFICAR_TITULO','VINCULAR_CAIXA',
  'INATIVAR_CONTA','VINCULAR_FORMA_PAGAMENTO',
] as const
export type FinanceiroOperacao = typeof FINANCEIRO_OPERACOES[number]

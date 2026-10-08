/** Linha do snapshot auditável — consumida da RPC listar_caixas_fechamento_formas. */
export type FechamentoFormaLinha = {
  formaPagamento: 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO'
  metrica: 'E_C_AUTORIDADE' | 'REGISTRADO_JINLONG'
  valorSistemaSnapshot: number
  valorInformado: number | null
  diferenca: number | null
  origemRegra: string
}

export type FechamentoFormasResult =
  | { ok: true; linhas: FechamentoFormaLinha[] }
  | { ok: false; error: string }

/** Tipo de movimentação exibida no modal de sangria/suprimento (UI caixa). */
export type TipoMovimentacaoUi = 'suprimento' | 'sangria'

/** Ação na timeline (cancelar lançamento ou estornar). */
export type AcaoMovimentacaoTipo = 'cancelar' | 'estornar'

/** Domínio persistido em `movimentacoes_caixa` (inclui estorno). */
export type TipoMovimentacaoCaixa = 'suprimento' | 'sangria' | 'estorno'
export type FormaMovimentacaoCaixa =
  | 'dinheiro'
  | 'pix'
  | 'cartao_debito'
  | 'cartao_credito'
  | 'outro'
export type StatusMovimentacaoCaixa = 'pendente' | 'aprovado' | 'cancelado'

export type RegistrarMovimentacaoInput = {
  caixaId: string
  tipo: TipoMovimentacaoCaixa
  formaPagamento: FormaMovimentacaoCaixa
  valor: number
  motivo: string
  motivoCodigo?: string
  status?: StatusMovimentacaoCaixa
  movimentacaoOrigemId?: string
  idempotencyKey: string
  gerenteId?: string
  deviceId?: string
  terminalId?: string
}

export type RegistrarMovimentacaoResult =
  | { ok: true; movimentacaoId: string; status: StatusMovimentacaoCaixa; saldoAtual: number }
  | { ok: false; error: string }

export type AutorizarMovimentacaoGerenteResult =
  | { ok: true; movimentacaoId: string; status: StatusMovimentacaoCaixa; saldoAtual: number }
  | { ok: false; error: string; scope?: string; lockUntil?: string }

export type MovimentacaoCaixaDTO = {
  id: string
  numeroSequencial: number | null
  caixaId: string
  operadorId: string
  gerenteId: string | null
  tipo: TipoMovimentacaoCaixa
  formaPagamento: FormaMovimentacaoCaixa
  valor: number
  motivoCodigo: string
  motivo: string
  status: StatusMovimentacaoCaixa
  movimentacaoOrigemId: string | null
  saldoAntes: number
  saldoDepois: number
  createdAt: string
}

export type ObterMovimentacoesCaixaResult =
  | { ok: true; itens: MovimentacaoCaixaDTO[] }
  | { ok: false; error: string }

export type AcaoMovimentacaoCaixaResult =
  | { ok: true; movimentacaoId: string; status?: StatusMovimentacaoCaixa; saldoAtual?: number }
  | { ok: false; error: string }

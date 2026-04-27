import type { RegraPreco } from '@/core/pricing/types'
import type { PricingContext } from '@/core/pricing/types'

export type OrigemProdutoCaixa = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export type ProdutoCaixaDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  preco_atacado: number | null
  categoria_id: string | null
  origem: OrigemProdutoCaixa
  tem_nf: boolean
  observacao: string | null
  /** Estoque atual (se houver linha em `estoque`) */
  quantidade_estoque: number | null
  /** Mínimo cadastrado na mesma loja, quando houver linha de estoque */
  estoque_minimo: number | null
}

export type CategoriaAtalhoDTO = { id: string; nome: string }

export type ListarCategoriasCaixaResult =
  | { ok: true; categorias: CategoriaAtalhoDTO[] }
  | { ok: false; error: string }

export type CotacaoUsdBrlResult =
  | { ok: true; brlPorUsd: number; fonte: 'api' | 'fallback'; dataReferencia: string }
  | { ok: false }

export type CarregarRegrasResult =
  | { ok: true; regras: RegraPreco[]; pricingContext: PricingContext }
  | { ok: false; error: string }

export type BuscarProdutoResult =
  | { ok: true; status: 'encontrado'; produto: ProdutoCaixaDTO }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string }
  | { ok: false; error: string }

export type ValidarGerenteDescontoResult =
  | { ok: true; token: string; expiraEm: string; maxDescontoPercentual: number; gerenteId: string }
  | { ok: false; error: string; scope?: string; lockUntil?: string }

export type LimiteSangriaResult =
  | { ok: true; limite: number }
  | { ok: false; error: string }

export type FinalizarVendaCaixaResult =
  | { ok: true; vendaId: string }
  | { ok: false; error: string }

export type CancelarVendaResult =
  | { ok: true; vendaId: string; status: 'CANCELADA' }
  | { ok: false; error: string }

export type {
  CaixaStatusOperadorResult,
  AbrirCaixaOperadorResult,
  FecharCaixaOperadorResult,
} from '@/app/caixa/caixaOperadorTypes'

export type {
  TipoMovimentacaoCaixa,
  FormaMovimentacaoCaixa,
  StatusMovimentacaoCaixa,
  RegistrarMovimentacaoInput,
  RegistrarMovimentacaoResult,
  AutorizarMovimentacaoGerenteResult,
  MovimentacaoCaixaDTO,
  ObterMovimentacoesCaixaResult,
  AcaoMovimentacaoCaixaResult,
} from '@/app/caixa/caixaMovimentacaoTypes'

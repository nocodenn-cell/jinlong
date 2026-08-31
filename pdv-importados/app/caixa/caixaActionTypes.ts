import type { RegraPreco } from '@shared/pricing/types'
import type { PricingContext } from '@shared/pricing/types'

export type OrigemProdutoCaixa = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

export type ProdutoCaixaDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  /** Código interno (SKU) — segundo identificador para diferenciar candidatos sem código de barras. */
  codigo_interno: string | null
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

export type CotacaoUsdBrlResult =
  | { ok: true; brlPorUsd: number; fonte: 'api' | 'fallback'; dataReferencia: string }
  | { ok: false }

export type CarregarRegrasResult =
  | { ok: true; regras: RegraPreco[]; pricingContext: PricingContext }
  | { ok: false; error: string }

/**
 * `candidatos`: populado só na ambiguidade por nome/categoria — o operador escolhe
 * entre eles sem precisar refinar a digitação. Ambiguidade por código de barras
 * mantém `candidatos: []` de propósito (ver caixaCatalogo.impl.ts) — colisão de
 * barcode é sintoma do modelo produto↔loja/tenant ainda em decisão de domínio,
 * não uma ambiguidade de nome que o operador possa resolver visualmente.
 */
export type BuscarProdutoResult =
  | { ok: true; status: 'encontrado'; produto: ProdutoCaixaDTO }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string; candidatos: ProdutoCaixaDTO[] }
  | { ok: false; error: string }

export type BuscarProdutoComPrecoResult =
  | {
      ok: true
      status: 'encontrado'
      produto: ProdutoCaixaDTO
      precoCalculado: number
      tipoPrecoCalculado: 'VAREJO' | 'ATACADO'
    }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string; candidatos: ProdutoCaixaDTO[] }
  | { ok: false; error: string }

export type CalcularPrecoProdutoCaixaResult =
  | { ok: true; preco: number; tipo: 'VAREJO' | 'ATACADO' }
  | { ok: false; error: string }

export type ConsultaRapidaProdutoDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  precoCalculado: number
  tipoPreco: 'VAREJO' | 'ATACADO'
  quantidade_estoque: number | null
  estoque_minimo: number | null
  ultimaVendaEm: string | null
  ultimaCompraEm: string | null
  margemPercentual: number | null
  mostrarMargem: boolean
}

export type ConsultaRapidaResult =
  | { ok: true; status: 'encontrado'; produto: ConsultaRapidaProdutoDTO }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string }
  | { ok: false; error: string }

export type ValidarGerenteDescontoResult =
  | { ok: true; token: string; expiraEm: string; maxDescontoPercentual: number; gerenteId: string }
  | { ok: false; error: string; scope?: string; lockUntil?: string }

export type LimiteSangriaResult =
  | { ok: true; limite: number }
  | { ok: false; error: string }

export type ConfiguracoesCaixaWebResult =
  | { ok: true; mapa: Record<string, string> }
  | { ok: false; error: string }

export type FinalizarVendaCaixaResult =
  | {
      ok: true
      vendaId: string
      eventId: string
      documentoFiscal?: unknown
      itensAtualizados?: unknown
      estoqueBaixado?: unknown
      contasRecebeId?: string  // ✅ NOVO (Fase 5b - contas_receber automático)
    }
  | { ok: false; error: string }

export type CancelarVendaResult =
  | { ok: true; vendaId: string; status: 'CANCELADA'; valorEstornado: number }
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
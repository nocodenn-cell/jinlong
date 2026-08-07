import type { RegraPreco } from '@shared/pricing/types'
import type { PricingContext } from '@shared/pricing/types'

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

/**
 * Candidato de busca — payload mínimo para o operador escolher entre vários
 * produtos que casam com o mesmo termo. NÃO carrega preço calculado: o preço
 * autoritativo só é resolvido depois da escolha, pelo caminho normal de leitura
 * (`buscarProdutoComPrecoCaixa`). `preco_varejo` aqui é referência de vitrine.
 */
export type ProdutoCaixaResumoDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  quantidade_estoque: number | null
  estoque_minimo: number | null
}

export type CotacaoUsdBrlResult =
  | { ok: true; brlPorUsd: number; fonte: 'api' | 'fallback'; dataReferencia: string }
  | { ok: false }

export type CarregarRegrasResult =
  | { ok: true; regras: RegraPreco[]; pricingContext: PricingContext }
  | { ok: false; error: string }

/**
 * `ambiguo` vs `multiplos` — a distinção é intencional:
 *
 * - `ambiguo`: o **código de barras** lido bate com mais de um produto. Isso é
 *   erro de cadastro (código duplicado), não escolha do operador. Continua
 *   sendo um beco com orientação para corrigir o cadastro.
 * - `multiplos`: o **nome/categoria** digitado bate com vários produtos. Isso é
 *   busca normal; o operador escolhe na lista.
 */
export type BuscarProdutoResult =
  | { ok: true; status: 'encontrado'; produto: ProdutoCaixaDTO }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string }
  | { ok: true; status: 'multiplos'; produtos: ProdutoCaixaResumoDTO[] }
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
  | { ok: true; status: 'ambiguo'; mensagem: string }
  | { ok: true; status: 'multiplos'; produtos: ProdutoCaixaResumoDTO[] }
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
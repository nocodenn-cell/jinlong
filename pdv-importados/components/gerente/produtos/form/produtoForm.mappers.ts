import type { ProdutoFormBaseValues } from '@/app/gerente/produtos/produtoFormSchema'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import type { OrigemCode, UnidadeCode } from './produtoForm.types'

export function mapOrigemFromRow(origem: string): OrigemCode {
  if (origem === 'brasil_nf' || origem === 'brasil_sem_nf' || origem === 'china_manual') return origem
  return 'china_manual'
}

export function parseGatilhoDisplay(value: number | null | undefined): string {
  if (value == null || value <= 0) return ''
  return String(value)
}

export function parseGatilhoSubmit(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isInteger(n) && n >= 1 ? n : null
}

export function parseGatilhoSubmitNaoNegativo(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export function buildSubmitPayload(
  state: {
    nome: string
    codigoBarras: string
    codigoInterno: string
    referenciaFornecedor: string
    nomeReduzidoPdv: string
    localizacaoPrateleira: string
    estoqueMinimoInicial: string
    origem: OrigemCode
    unidadeMedida: UnidadeCode
    categoriaId: string
    marcaId: string
    fornecedorId: string
    observacao: string
    quantidadeGatilho: string
    permitirAbaixoCusto: boolean
    ncm: string
    cfopProduto: string
    csosn: string
    cest: string
    cstPis: string
    cstCofins: string
    precoVarejo: number
    precoAtacado: number | null
    precoCusto: number | null
    temNf: boolean
  },
): ProdutoFormBaseValues {
  return {
    nome: state.nome.trim(),
    codigo_barras: state.codigoBarras.trim() || null,
    codigo_interno: state.codigoInterno.trim() || null,
    referencia_fornecedor: state.referenciaFornecedor.trim() || null,
    nome_reduzido_pdv: state.nomeReduzidoPdv.trim() || null,
    localizacao_prateleira: state.localizacaoPrateleira.trim() || null,
    estoque_minimo: parseGatilhoSubmitNaoNegativo(state.estoqueMinimoInicial),
    preco_varejo: state.precoVarejo,
    preco_atacado: state.precoAtacado,
    preco_custo: state.precoCusto,
    permitir_abaixo_custo: state.permitirAbaixoCusto,
    quantidade_gatilho_atacado: parseGatilhoSubmit(state.quantidadeGatilho),
    origem: state.origem,
    tem_nf: state.temNf,
    unidade_medida: state.unidadeMedida,
    observacao: state.observacao.trim() || null,
    categoria_id: state.categoriaId || null,
    marca_id: state.marcaId || null,
    fornecedor_id: state.fornecedorId || null,
    ncm: state.ncm.trim() || null,
    cfop_produto: state.cfopProduto.trim() || null,
    csosn: state.csosn.trim() || null,
    cest: state.cest.trim() || null,
    cst_pis: state.cstPis.trim() || null,
    cst_cofins: state.cstCofins.trim() || null,
  }
}

export function readOnlyFromProduto(produto: ProdutoGerenteRow | null): {
  produtoId: string | null
  estoqueAtual: number | null
  estoqueMinimo: number | null
  custoMedio: number | null
  temNf: boolean
} {
  if (!produto) {
    return {
      produtoId: null,
      estoqueAtual: null,
      estoqueMinimo: null,
      custoMedio: null,
      temNf: false,
    }
  }
  return {
    produtoId: produto.id,
    estoqueAtual: produto.quantidade_atual,
    estoqueMinimo: produto.estoque_minimo,
    custoMedio: produto.preco_custo_medio,
    temNf: produto.tem_nf,
  }
}

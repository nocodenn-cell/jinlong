/**
 * Mapeia payload Zod (snake_case UI) → contratos shared-core (camelCase).
 * Missão Products 9 — borda; sem I/O.
 */

import type {
  CreateProductInput,
  OrigemProduto,
  StatusPublicacao,
  UnidadeMedida,
  UpdateProductInput,
} from '@shared-core/src/products'

/** Shape mínimo pós-Zod create (NovoProduto*). */
export type ProdutoFormCreateRow = {
  nome: string
  codigo_barras: string | null
  codigo_interno?: string | null
  referencia_fornecedor?: string | null
  nome_reduzido_pdv?: string | null
  localizacao_prateleira?: string | null
  preco_varejo: number
  preco_atacado?: number | null
  preco_custo?: number | null
  permitir_abaixo_custo?: boolean
  quantidade_gatilho_atacado?: number | null
  origem: OrigemProduto
  tem_nf: boolean
  unidade_medida?: UnidadeMedida
  observacao?: string | null
  categoria_id?: string | null
  marca_id?: string | null
  fornecedor_id?: string | null
  ncm?: string | null
  cfop_produto?: string | null
  csosn?: string | null
  cest?: string | null
  cst_pis?: string | null
  cst_cofins?: string | null
  icms_origem?: string | null
  status_publicacao?: StatusPublicacao
  ativo?: boolean
  estoque_inicial_quantidade?: number
  estoque_inicial_minimo?: number
  client_request_id?: string | null
}

/** Shape mínimo pós-Zod edit (EditarProduto*). */
export type ProdutoFormUpdateRow = Omit<
  ProdutoFormCreateRow,
  'estoque_inicial_quantidade' | 'estoque_inicial_minimo' | 'client_request_id'
> & {
  produto_id: string
}

function catalogFieldsFromForm(
  row: ProdutoFormCreateRow | ProdutoFormUpdateRow,
): Omit<UpdateProductInput, 'statusPublicacao' | 'ativo'> {
  return {
    nome: row.nome,
    codigoBarras: row.codigo_barras,
    codigoInterno: row.codigo_interno,
    referenciaFornecedor: row.referencia_fornecedor,
    nomeReduzidoPdv: row.nome_reduzido_pdv,
    localizacaoPrateleira: row.localizacao_prateleira,
    precoVarejo: row.preco_varejo,
    precoAtacado: row.preco_atacado,
    precoCusto: row.preco_custo,
    permitirAbaixoCusto: row.permitir_abaixo_custo,
    quantidadeGatilhoAtacado: row.quantidade_gatilho_atacado,
    origem: row.origem,
    temNf: row.tem_nf,
    unidadeMedida: row.unidade_medida,
    observacao: row.observacao,
    categoriaId: row.categoria_id,
    marcaId: row.marca_id,
    fornecedorId: row.fornecedor_id,
    ncm: row.ncm,
    cfopProduto: row.cfop_produto,
    csosn: row.csosn,
    cest: row.cest,
    cstPis: row.cst_pis,
    cstCofins: row.cst_cofins,
    icmsOrigem: row.icms_origem,
  }
}

/** UI create → CreateProductInput (+ lifecycle opcional). */
export function mapFormToCreateProductInput(
  row: ProdutoFormCreateRow,
  lifecycle?: { status_publicacao: StatusPublicacao; ativo: boolean },
): CreateProductInput {
  return {
    ...catalogFieldsFromForm(row),
    statusPublicacao: lifecycle?.status_publicacao ?? row.status_publicacao,
    ativo: lifecycle?.ativo ?? row.ativo,
    estoqueInicial: row.estoque_inicial_quantidade,
    estoqueInicialMinimo: row.estoque_inicial_minimo,
    clientRequestId: row.client_request_id,
  }
}

/** UI edit → UpdateProductInput (+ lifecycle opcional). */
export function mapFormToUpdateProductInput(
  row: ProdutoFormUpdateRow,
  lifecycle?: { status_publicacao: StatusPublicacao; ativo: boolean } | null,
): UpdateProductInput {
  const base = catalogFieldsFromForm(row)
  if (!lifecycle) return base
  return {
    ...base,
    statusPublicacao: lifecycle.status_publicacao,
    ativo: lifecycle.ativo,
  }
}

/** Linha CSV/lote → CreateProductInput (porta única ProductWriter). */
export function mapImportRowToCreateProductInput(row: {
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  preco_atacado?: number | null
  quantidade_gatilho_atacado?: number | null
  unidade_medida?: UnidadeMedida
  observacao?: string | null
  origem: OrigemProduto
  tem_nf: boolean
  ativo?: boolean
}): CreateProductInput {
  return mapFormToCreateProductInput({
    nome: row.nome,
    codigo_barras: row.codigo_barras,
    preco_varejo: row.preco_varejo,
    preco_atacado: row.preco_atacado,
    quantidade_gatilho_atacado: row.quantidade_gatilho_atacado,
    unidade_medida: row.unidade_medida,
    observacao: row.observacao,
    origem: row.origem,
    tem_nf: row.tem_nf,
    ativo: row.ativo,
  })
}

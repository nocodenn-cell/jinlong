/**
 * Mapeia ProductListFilteredRow (domínio) → ProdutoGerenteRow (contrato UI).
 * Missão Products 10 — sem I/O.
 */

import type { ProductListFilteredRow } from '@shared-core/src/products'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'

export function mapListRowToGerente(row: ProductListFilteredRow): ProdutoGerenteRow {
  return {
    id: row.id,
    nome: row.nome,
    codigo_barras: row.codigoBarras,
    codigo_interno: row.codigoInterno,
    referencia_fornecedor: row.referenciaFornecedor,
    nome_reduzido_pdv: row.nomeReduzidoPdv,
    localizacao_prateleira: row.localizacaoPrateleira,
    preco_varejo: row.precoVarejo,
    preco_atacado: row.precoAtacado,
    preco_custo: row.precoCusto,
    preco_custo_medio: row.precoCustoMedio,
    estoque_minimo: row.estoqueMinimo,
    permitir_abaixo_custo: row.permitirAbaixoCusto,
    quantidade_gatilho_atacado: row.quantidadeGatilhoAtacado,
    quantidade_atual: row.quantidadeAtual,
    origem: row.origem,
    tem_nf: row.temNf,
    ativo: row.ativo,
    status_publicacao: row.statusPublicacao,
    imagem_url: row.imagemUrl,
    categoria_id: row.categoriaId,
    marca_id: row.marcaId,
    fornecedor_id: row.fornecedorId,
    unidade_medida: row.unidadeMedida,
    observacao: row.observacao,
    tags: row.tags,
    ncm: row.ncm,
    cfop_produto: row.cfopProduto,
    csosn: row.csosn,
    cest: row.cest,
    cst_pis: row.cstPis,
    cst_cofins: row.cstCofins,
    icms_origem: row.icmsOrigem,
  }
}

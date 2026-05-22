/**
 * Types compartilhados para o módulo de impressão de etiquetas.
 */

import type { EtiquetaConfig } from './EtiquetaConfig'

/** Item no carrinho de impressão de etiquetas */
export interface ItemCarrinho {
  /** ID do produto */
  produtoId: string
  /** Nome do produto */
  nome: string
  /** Código de barras (EAN-13 ou interno) */
  codigoBarras: string
  /** Preço de varejo */
  precoVarejo: number
  /** Quantidade de etiquetas a imprimir */
  quantidade: number
  /** Atributo/grade opcional (ex: "Preto/G") */
  atributo?: string
}

/** Produto retornado do banco com dados de estoque */
export interface ProdutoComEstoqueDTO {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  unidade_medida: string
  quantidade_atual: number
  estoque_minimo: number
}

/** Opções para geração do PDF */
export interface GerarPdfOptions {
  /** Configuração da etiqueta (40x25 ou 60x40) */
  config: EtiquetaConfig
  /** Nome do arquivo PDF */
  nomeArquivo?: string
  /** Idioma para formatação de moeda */
  idioma?: 'pt' | 'zh' | 'zh-HK'
}

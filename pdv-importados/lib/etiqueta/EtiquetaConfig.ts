/**
 * Configurações centralizadas para geração de etiquetas térmicas.
 * Dragon Standard - Layout fixo para evitar "buraco negro" de customização.
 * 
 * Formato padrão: 40x25mm (comum em impressoras Zebra/Elgin)
 * Para mudar para 60x40mm, altere ETIQUETA_PADRAO para '60x40'
 */

export interface EtiquetaConfig {
  /** Largura da etiqueta em milímetros */
  largura: number
  /** Altura da etiqueta em milímetros */
  altura: number
  /** Margem interna em milímetros */
  margem: number
  /** Tamanho da fonte do nome do produto (pontos) */
  fontSizeNome: number
  /** Tamanho da fonte do preço (pontos) - maior e em negrito */
  fontSizePreco: number
  /** Tamanho da fonte do código de barras (pontos) */
  fontSizeCodigo: number
  /** Tamanho da fonte do atributo/grade (pontos) */
  fontSizeAtributo: number
  /** Limite máximo de caracteres para o nome do produto */
  maxCaracteresNome: number
  /** Limite máximo de etiquetas por geração de PDF */
  maxEtiquetasPorPdf: number
}

export const ETIQUETA_CONFIGS: Record<string, EtiquetaConfig> = {
  '40x25': {
    largura: 40,
    altura: 25,
    margem: 2,
    fontSizeNome: 6,
    fontSizePreco: 9,
    fontSizeCodigo: 5,
    fontSizeAtributo: 5,
    maxCaracteresNome: 25,
    maxEtiquetasPorPdf: 500,
  },
  '60x40': {
    largura: 60,
    altura: 40,
    margem: 3,
    fontSizeNome: 8,
    fontSizePreco: 12,
    fontSizeCodigo: 7,
    fontSizeAtributo: 6,
    maxCaracteresNome: 35,
    maxEtiquetasPorPdf: 500,
  },
}

/** Configuração padrão usada no sistema */
export const ETIQUETA_PADRAO: keyof typeof ETIQUETA_CONFIGS = '40x25'

/** Obtém a configuração ativa baseada na chave padrão */
export function getEtiquetaConfig(chave: keyof typeof ETIQUETA_CONFIGS = ETIQUETA_PADRAO): EtiquetaConfig {
  return ETIQUETA_CONFIGS[chave]
}

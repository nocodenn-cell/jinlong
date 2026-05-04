/**
 * Gera código de barras como imagem usando bwip-js.
 * Dynamic import para evitar bundle bloat no carregamento inicial.
 */

import type { EtiquetaConfig } from './EtiquetaConfig'

export interface BarcodeOptions {
  /** Código de barras (EAN-13 ou interno) */
  codigo: string
  /** Tipo de código de barras (padrão: EAN13) */
  tipo?: 'EAN13' | 'CODE128' | 'CODE39'
  /** Largura em pixels */
  largura?: number
  /** Altura em pixels */
  altura?: number
}

/**
 * Gera código de barras como data URL (base64).
 * Usa dynamic import do bwip-js para carregar sob demanda.
 */
export async function gerarBarcodeDataUrl(
  options: BarcodeOptions
): Promise<string> {
  // Dynamic import com any para evitar erros de tipo com biblioteca sem definições nativas
  // @ts-ignore - Ignorar erro de tipo para bwip-js que não tem definições TypeScript
  const bwipJs = await import('bwip-js') as any
  
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Não foi possível obter contexto 2D do canvas')
  }

  const _largura = options.largura || 200
  const altura = options.altura || 80
  const tipo = options.tipo || 'EAN13'

  try {
    await bwipJs.toCanvas(canvas, {
      bcid: tipo.toLowerCase(),
      text: options.codigo,
      scale: 2,
      height: altura,
      includetext: false,
    })

    return canvas.toDataURL('image/png')
  } catch (error) {
    throw new Error(`Erro ao gerar código de barras: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Gera código de barras como imagem para uso no PDF.
 * Retorna Promise com data URL base64.
 */
export async function gerarBarcodeParaPdf(
  codigo: string,
  _config: EtiquetaConfig
): Promise<string> {
  return gerarBarcodeDataUrl({
    codigo,
    tipo: 'EAN13',
    largura: 150,
    altura: 50,
  })
}

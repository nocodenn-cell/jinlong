/**
 * Gera código de barras como imagem usando bwip-js.
 * Dynamic import para evitar bundle bloat no carregamento inicial.
 */

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
  const bwipModule = await import('bwip-js')
  type BwipToCanvas = (
    canvas: HTMLCanvasElement,
    opts: Record<string, string | number | boolean>,
  ) => Promise<void>
  const mod = bwipModule as unknown as { default?: { toCanvas: BwipToCanvas }; toCanvas?: BwipToCanvas }
  const bwipJs = mod.default ?? mod
  if (typeof bwipJs.toCanvas !== 'function') {
    throw new Error('bwip-js: API toCanvas não disponível')
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Não foi possível obter contexto 2D do canvas')
  }

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
 * Detecta o tipo de código de barras mais adequado para o código fornecido.
 * EAN-13: exatamente 13 dígitos numéricos com checksum válido.
 * Caso contrário: CODE128 (aceita qualquer string ASCII).
 */
function detectarTipoBarcode(codigo: string): 'EAN13' | 'CODE128' {
  if (!/^\d{13}$/.test(codigo)) return 'CODE128'
  // Verificar checksum EAN-13
  let soma = 0
  for (let i = 0; i < 12; i++) {
    soma += parseInt(codigo[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (soma % 10)) % 10
  return check === parseInt(codigo[12]) ? 'EAN13' : 'CODE128'
}

/**
 * Gera código de barras como imagem para uso no PDF.
 * Detecta automaticamente EAN-13 ou CODE128 conforme o código.
 * Retorna Promise com data URL base64.
 */
export async function gerarBarcodeParaPdf(
  codigo: string
): Promise<string> {
  const tipo = detectarTipoBarcode(codigo)
  return gerarBarcodeDataUrl({
    codigo,
    tipo,
    largura: 150,
    altura: 50,
  })
}

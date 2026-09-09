/**
 * Gera código de barras como imagem usando bwip-js.
 * Dynamic import para evitar bundle bloat no carregamento inicial.
 */

export interface BarcodeOptions {
  /** Código de barras (EAN-13 ou interno) */
  codigo: string
  /** Tipo de código de barras (padrão: EAN13) */
  tipo?: 'EAN13' | 'EAN8' | 'CODE128' | 'CODE39'
  /** Largura em pixels */
  largura?: number
  /** Altura em pixels */
  altura?: number
}

/**
 * Dígito verificador EAN (mod-10, mesmo algoritmo para EAN-8 e EAN-13):
 * soma ponderada 3/1 da direita para a esquerda, complemento de 10.
 */
function digitoVerificadorEanOk(codigo: string): boolean {
  const d = codigo.split('').map(Number)
  const check = d[d.length - 1]
  const corpo = d.slice(0, -1).reverse()
  const soma = corpo.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === check
}

/**
 * Escolhe a simbologia que representa FIELMENTE o código do produto.
 *
 * O catálogo real é dominado por códigos INTERNOS (comprimento arbitrário,
 * às vezes não numéricos) — não por GTIN. Forçar `ean13` neles faz o bwip-js
 * recusar a codificação (`ean13badLength` / `ean13badCheckDigit` /
 * `ean13badCharacter`), e o chamador cai no fallback de texto: a etiqueta sai
 * SEM barras, portanto não escaneável, quebrando o ciclo
 * etiqueta → leitor → PDV.
 *
 * CODE128 codifica ASCII de qualquer comprimento e é lido por qualquer leitor
 * HID/keyboard-wedge, devolvendo exatamente o texto codificado — que é o mesmo
 * valor que o PDV procura em `produtos.codigo_barras`. EAN-13/EAN-8 continuam
 * preferidos quando o código É um GTIN válido (dígito verificador correto),
 * preservando a leitura de produtos de fornecedor.
 */
export type SimbologiaEtiqueta = 'ean13' | 'ean8' | 'code128'

export function escolherSimbologia(codigo: string): SimbologiaEtiqueta {
  const t = codigo.trim()
  if (/^\d{13}$/.test(t) && digitoVerificadorEanOk(t)) return 'ean13'
  if (/^\d{8}$/.test(t) && digitoVerificadorEanOk(t)) return 'ean8'
  return 'code128'
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
 * Gera código de barras como imagem para uso no PDF.
 * A simbologia é derivada do próprio código (ver `escolherSimbologia`).
 * Retorna Promise com data URL base64.
 */
export async function gerarBarcodeParaPdf(
  codigo: string
): Promise<string> {
  const porSimbologia = {
    ean13: 'EAN13',
    ean8: 'EAN8',
    code128: 'CODE128',
  } as const
  return gerarBarcodeDataUrl({
    codigo,
    tipo: porSimbologia[escolherSimbologia(codigo)],
    largura: 150,
    altura: 50,
  })
}

/**
 * Gera PDF de etiquetas térmicas usando jsPDF.
 * Dynamic import para evitar bundle bloat no carregamento inicial.
 * Limite de 500 etiquetas por PDF para evitar travamento do browser.
 */

import type { ItemCarrinho, GerarPdfOptions } from './types'
import { gerarBarcodeParaPdf } from './gerarBarcode'
import { getEtiquetaConfig } from './EtiquetaConfig'

/**
 * Trunca texto para um número máximo de caracteres.
 */
function truncarTexto(texto: string, max: number): string {
  if (texto.length <= max) return texto
  return texto.slice(0, max - 1) + '…'
}

/**
 * Formata preço para exibição (R$ 99,99).
 */
function formatarPreco(preco: number): string {
  return preco.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/**
 * Gera PDF de etiquetas térmicas.
 * Uma etiqueta por página do PDF com dimensões configuráveis.
 */
export async function gerarPdfEtiquetas(
  itens: ItemCarrinho[],
  options: GerarPdfOptions
): Promise<Blob> {
  const config = options.config || getEtiquetaConfig()
  
  // Validar limite de etiquetas
  if (itens.length > config.maxEtiquetasPorPdf) {
    throw new Error(
      `Máximo de ${config.maxEtiquetasPorPdf} etiquetas por PDF. Você tem ${itens.length} itens.`
    )
  }

  // Dynamic import do jsPDF
  const { default: jsPDF } = await import('jspdf')
  
  // Criar PDF com dimensões em mm
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [config.largura, config.altura],
  })

  // Gerar etiquetas
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]
    
    // Adicionar nova página para cada etiqueta (exceto a primeira)
    if (i > 0) {
      pdf.addPage([config.largura, config.altura])
    }

    // Nome do produto (truncado)
    const nomeTruncado = truncarTexto(item.nome, config.maxCaracteresNome)
    pdf.setFontSize(config.fontSizeNome)
    pdf.text(nomeTruncado, config.margem, config.margem + 2)

    // Preço (negrito e maior)
    pdf.setFontSize(config.fontSizePreco)
    pdf.setFont('helvetica', 'bold')
    const precoFormatado = formatarPreco(item.precoVarejo)
    pdf.text(precoFormatado, config.margem, config.margem + 8)
    pdf.setFont('helvetica', 'normal')

    // Atributo (opcional)
    if (item.atributo) {
      pdf.setFontSize(config.fontSizeAtributo)
      pdf.text(item.atributo, config.margem, config.margem + 12)
    }

    // Código de barras
    try {
      const barcodeDataUrl = await gerarBarcodeParaPdf(item.codigoBarras)
      pdf.addImage(
        barcodeDataUrl,
        'PNG',
        config.margem,
        config.altura - config.margem - 8,
        config.largura - config.margem * 2,
        6
      )
    } catch {
      // Fallback: mostrar código em texto se falhar
      pdf.setFontSize(config.fontSizeCodigo)
      pdf.text(item.codigoBarras, config.margem, config.altura - config.margem - 2)
    }
  }

  // Gerar blob do PDF
  return pdf.output('blob')
}

/**
 * Gera PDF e faz download automático.
 */
export async function baixarPdfEtiquetas(
  itens: ItemCarrinho[],
  options: GerarPdfOptions
): Promise<void> {
  const blob = await gerarPdfEtiquetas(itens, options)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = options.nomeArquivo || `etiquetas-${Date.now()}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

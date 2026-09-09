/**
 * Etiqueta → leitor → PDV: a etiqueta só fecha o ciclo se o código for
 * REALMENTE codificado em barras. Antes deste fix, `gerarBarcodeParaPdf`
 * forçava `ean13` em todo código; o catálogo real é dominado por códigos
 * internos (comprimento arbitrário / não numéricos), o bwip-js recusava a
 * codificação e `gerarPdfEtiquetas` caía no fallback de texto — etiqueta sem
 * barras, não escaneável.
 *
 * Estes testes provam a ESCOLHA de simbologia (unidade pura) e, no bloco
 * final, que o valor que o leitor devolve casa com a chave que o PDV procura
 * em `produtos.codigo_barras`.
 */
import { describe, expect, it } from 'vitest'
import { escolherSimbologia } from './gerarBarcode'
import { variantesChaveLeitura } from '@shared-core/src/caixa/variantesChaveLeitura'

describe('escolherSimbologia', () => {
  it('usa EAN-13 quando o código é um GTIN-13 com dígito verificador correto', () => {
    // 7891000315507 — GTIN real (Nescau 370g), dígito verificador válido.
    expect(escolherSimbologia('7891000315507')).toBe('ean13')
  })

  it('NÃO usa EAN-13 quando os 13 dígitos têm dígito verificador inválido', () => {
    // Formato de GTIN, checksum errado: o encoder EAN-13 recusaria.
    expect(escolherSimbologia('7898512340002')).toBe('code128')
    expect(escolherSimbologia('7891522748823')).toBe('code128')
  })

  it('usa EAN-8 quando o código é um GTIN-8 válido', () => {
    // 96385074 — EAN-8 canônico de referência.
    expect(escolherSimbologia('96385074')).toBe('ean8')
  })

  it('cai em CODE128 para códigos internos de comprimento arbitrário', () => {
    for (const codigo of ['123', '1234', '45645', '999999', '0000012', '12541254', '111111111', '1232223635']) {
      expect(escolherSimbologia(codigo)).toBe('code128')
    }
  })

  it('cai em CODE128 para códigos não numéricos', () => {
    expect(escolherSimbologia('zxczzxczx')).toBe('code128')
    expect(escolherSimbologia('camisa preta')).toBe('code128')
    expect(escolherSimbologia('62.62.62.2.62')).toBe('code128')
  })

  it('ignora espaços nas bordas ao classificar', () => {
    expect(escolherSimbologia('  7891000315507  ')).toBe('ean13')
  })
})

describe('ciclo fechado etiqueta → leitor → PDV', () => {
  /**
   * O leitor HID devolve exatamente o texto codificado. Para CODE128 e para
   * EAN-13/EAN-8 válidos isso é o próprio `codigo_barras` do produto — que
   * precisa estar entre as variantes que o lookup do PDV consulta.
   */
  const catalogoReal = [
    '123',
    '45645',
    '999999',
    '0000012',
    '12541254',
    '111111111',
    'zxczzxczx',
    'camisa preta',
    '1232223635',
    '7898512340002',
    '7891000315507',
    '96385074',
  ]

  it('o valor impresso na etiqueta é uma chave que o PDV procura', () => {
    for (const codigo of catalogoReal) {
      expect(variantesChaveLeitura(codigo)).toContain(codigo)
    }
  })

  it('toda entrada do catálogo real recebe uma simbologia codificável', () => {
    for (const codigo of catalogoReal) {
      expect(['ean13', 'ean8', 'code128']).toContain(escolherSimbologia(codigo))
    }
  })
})

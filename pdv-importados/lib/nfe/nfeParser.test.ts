import { describe, expect, it } from 'vitest'
import { parseNfeXml } from './nfeParser'

const xmlMinimal = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe35200114349292000184550010000000101234567890">
      <ide>
        <nNF>100</nNF>
      </ide>
      <emit>
        <CNPJ>14349292000184</CNPJ>
        <xNome>Fornecedor Teste LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>SKU-1</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>Produto A</xProd>
          <NCM>85444200</NCM>
          <uCom>UN</uCom>
          <qCom>10</qCom>
          <vUnCom>5.50</vUnCom>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>SKU-2</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>Produto B</xProd>
          <NCM>85444200</NCM>
          <uCom>CX</uCom>
          <qCom>2</qCom>
          <vUnCom>120</vUnCom>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`

describe('parseNfeXml', () => {
  it('extrai chave, emitente e itens', () => {
    const r = parseNfeXml(xmlMinimal)
    expect(r.chave_acesso).toBe('35200114349292000184550010000000101234567890')
    expect(r.emitente.cnpj).toBe('14349292000184')
    expect(r.emitente.nome).toContain('Fornecedor')
    expect(r.numero_nf).toBe('100')
    expect(r.itens).toHaveLength(2)
    expect(r.itens[0].gtin).toBe('7891234567890')
    expect(r.itens[1].gtin).toBeNull()
    expect(r.itens[1].ref_fornecedor).toBe('SKU-2')
    expect(r.itens[0].q_com).toBe(10)
    expect(r.itens[0].v_un_com).toBe(5.5)
  })
})

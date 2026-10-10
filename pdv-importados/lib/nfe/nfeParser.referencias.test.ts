import { describe, expect, it } from 'vitest'
import { parseNfeXml } from './nfeParser'

/** NF-e sintética: códigos com zeros à esquerda, CNPJ iniciado em zero, fatura e pagamento. */
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35200101234567000189550010000001231234567890">
      <ide><nNF>123</nNF></ide>
      <emit><CNPJ>01234567000189</CNPJ><xNome>Fornecedor Zero LTDA</xNome></emit>
      <det nItem="1">
        <prod>
          <cProd>000123</cProd>
          <cEAN>07891234567895</cEAN>
          <xProd>Parafuso</xProd>
          <NCM>01012100</NCM>
          <uCom>UN</uCom>
          <qCom>1000.0000</qCom>
          <vUnCom>0.0345000000</vUnCom>
          <cEANTrib>07891234567895</cEANTrib>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>ABC-01</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>Arruela</xProd>
          <NCM>73182200</NCM>
          <uCom>CX</uCom>
          <qCom>2</qCom>
          <vUnCom>12.5</vUnCom>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>59.50</vProd><vFrete>10.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
          <vII>0.00</vII><vIPI>3.20</vIPI><vOutro>0.00</vOutro><vNF>72.70</vNF>
        </ICMSTot>
      </total>
      <cobr>
        <fat><nFat>000123</nFat><vOrig>72.70</vOrig><vDesc>2.70</vDesc><vLiq>70.00</vLiq></fat>
        <dup><nDup>001</nDup><dVenc>2026-11-10</dVenc><vDup>35.00</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-12-10</dVenc><vDup>35.00</vDup></dup>
      </cobr>
      <pag><detPag><indPag>1</indPag><tPag>15</tPag><vPag>70.00</vPag></detPag></pag>
    </infNFe>
  </NFe>
</nfeProc>`

describe('parseNfeXml — referências textuais (D5)', () => {
  const nf = parseNfeXml(xml)
  const [a, b] = nf.itens

  it('preserva zeros à esquerda em cProd, cEAN, cEANTrib e NCM', () => {
    expect(a.ref_fornecedor).toBe('000123')
    expect(a.gtin).toBe('07891234567895')
    expect(a.gtin_tributavel).toBe('07891234567895')
    expect(a.ncm).toBe('01012100')
  })

  it('aceita CNPJ de emitente iniciado em zero (antes: perdia um dígito e a NF-e era recusada)', () => {
    expect(nf.emitente.cnpj).toBe('01234567000189')
  })

  it('expõe a referência como o parser anterior produzia, só para compatibilidade de vínculos', () => {
    expect(a.ref_fornecedor_legado).toBe('123')
    expect(a.gtin_legado).toBe('7891234567895')
    expect(b.ref_fornecedor_legado).toBe('ABC-01')
    expect(b.gtin_legado).toBeNull()
  })

  it('mantém os decimais exatamente como no XML, além do number legado', () => {
    expect(a.q_com_texto).toBe('1000.0000')
    expect(a.v_un_com_texto).toBe('0.0345000000')
    expect(a.q_com).toBe(1000)
    expect(a.v_un_com).toBeCloseTo(0.0345, 10)
  })

  it('SEM GTIN continua null', () => {
    expect(b.gtin).toBeNull()
    expect(b.gtin_tributavel).toBeNull()
  })

  it('lê fatura, pagamento e totais como texto (somente leitura)', () => {
    expect(nf.fatura).toEqual({ numero: '000123', valor_original: '72.70', valor_desconto: '2.70', valor_liquido: '70.00' })
    expect(nf.pagamentos).toEqual([{ ind_pag: '1', t_pag: '15', valor: '70.00' }])
    expect(nf.totais).toMatchObject({ vProd: '59.50', vFrete: '10.00', vIPI: '3.20', vNF: '72.70' })
    expect(nf.duplicatas).toEqual([
      { numero: '001', data_vencimento: '2026-11-10', valor: 35 },
      { numero: '002', data_vencimento: '2026-12-10', valor: 35 },
    ])
    expect(nf.numero_nf).toBe('123')
  })
})

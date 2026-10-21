import { describe, expect, it } from 'vitest'
import { centavos, conciliarObrigacoesNfe, type ConciliacaoEntrada } from './conciliacaoObrigacoes'

const dup = (valor: string, vencimento = '2026-11-10') => ({ numero: null, vencimento, valor })

describe('centavos', () => {
  it('converte texto de até 2 casas sem float', () => {
    expect(centavos('70.00')).toBe(7000n)
    expect(centavos('0.1')).toBe(10n)
    expect(centavos('12345678901234.99')).toBe(1234567890123499n)
  })
  it('rejeita mais de 2 casas, negativo, vírgula ou vazio', () => {
    for (const t of ['1.005', '-1.00', '1,00', '', 'abc', null]) expect(centavos(t)).toBeNull()
  })
})

describe('conciliarObrigacoesNfe (D6)', () => {
  it('parcelado com fatura: soma das duplicatas = vLiq exato → CONCILIADO', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '72.70',
      fatura: { valorOriginal: '72.70', valorDesconto: '2.70', valorLiquido: '70.00' },
      duplicatas: [dup('35.00'), dup('35.00', '2026-12-10')],
    })
    expect(r).toMatchObject({
      situacao: 'CONCILIADO', natureza: 'PARCELADO', referencia: 'FATURA_LIQUIDA',
      referenciaCentavos: '7000', descontoFinanceiroCentavos: '270', diferencaCentavos: '0',
      bloqueiaConfirmacaoFinanceira: false, motivos: ['DESCONTO_FINANCEIRO'],
    })
  })

  it('não presume soma = vNF: com desconto financeiro a soma bate com vLiq e não com vNF', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '100.00',
      fatura: { valorOriginal: '100.00', valorDesconto: '5.00', valorLiquido: '95.00' },
      duplicatas: [dup('95.00')],
    })
    expect(r.situacao).toBe('CONCILIADO')
  })

  it('um centavo de diferença é divergência material (sem tolerância) e bloqueia só o financeiro', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '70.00',
      fatura: { valorOriginal: '70.00', valorLiquido: '70.00' },
      duplicatas: [dup('35.00'), dup('34.99')],
    })
    expect(r).toMatchObject({
      situacao: 'DIVERGENTE', diferencaCentavos: '-1', bloqueiaConfirmacaoFinanceira: true,
      permiteRegistrarDocumento: true, motivos: ['DUPLICATAS_DIFEREM_DA_REFERENCIA'],
    })
  })

  it('fatura internamente inconsistente (vOrig − vDesc ≠ vLiq) é divergência documental', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '100.00',
      fatura: { valorOriginal: '100.00', valorDesconto: '5.00', valorLiquido: '96.00' },
      duplicatas: [dup('96.00')],
    })
    expect(r.situacao).toBe('DIVERGENTE')
    expect(r.motivos).toContain('FATURA_INCONSISTENTE')
  })

  it('pagamento imediato (à vista, sem duplicatas) igual à NF → CONCILIADO A_VISTA', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '50.00', duplicatas: [], pagamentos: [{ indPag: '0', tPag: '01', valor: '50.00' }],
    })
    expect(r).toMatchObject({ situacao: 'CONCILIADO', natureza: 'A_VISTA', diferencaCentavos: '0' })
  })

  it('à vista menor que a NF sem duplicatas para o resto → DIVERGENTE', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '50.00', duplicatas: [], pagamentos: [{ indPag: '0', tPag: '01', valor: '40.00' }],
    })
    expect(r.situacao).toBe('DIVERGENTE')
    expect(r.motivos).toEqual(['PAGAMENTO_A_VISTA_DIFERE_DA_NF'])
  })

  it('entrada à vista + parcelas → MISTO, conciliado quando parcelas = NF − entrada', () => {
    const r = conciliarObrigacoesNfe({
      valorNf: '300.00', duplicatas: [dup('100.00'), dup('100.00')],
      pagamentos: [{ indPag: '0', tPag: '01', valor: '100.00' }, { indPag: '1', tPag: '15', valor: '200.00' }],
    })
    expect(r).toMatchObject({ situacao: 'CONCILIADO', natureza: 'MISTO', referenciaCentavos: '20000' })
  })

  it('pagamento antecipado registrado no ERP cobre a NF → ANTECIPADO, sem nova obrigação', () => {
    const r = conciliarObrigacoesNfe({ valorNf: '500.00', duplicatas: [], adiantamentosRegistrados: ['500.00'] })
    expect(r).toMatchObject({ situacao: 'CONCILIADO', natureza: 'ANTECIPADO', referenciaCentavos: '0' })
  })

  it('adiantamento maior que a referência → DIVERGENTE', () => {
    const r = conciliarObrigacoesNfe({ valorNf: '100.00', duplicatas: [], adiantamentosRegistrados: ['150.00'] })
    expect(r.motivos).toContain('ADIANTAMENTO_EXCEDE_REFERENCIA')
    expect(r.bloqueiaConfirmacaoFinanceira).toBe(true)
  })

  it('NF sem pagamento (tPag 90) → obrigação não reconhecida: pendente de revisão, sem conta fictícia', () => {
    const r = conciliarObrigacoesNfe({ valorNf: '80.00', duplicatas: [], pagamentos: [{ indPag: '0', tPag: '90', valor: '0.00' }] })
    expect(r).toMatchObject({ situacao: 'PENDENTE_REVISAO', natureza: 'SEM_PAGAMENTO', bloqueiaConfirmacaoFinanceira: true })
    expect(r.motivos).toEqual(['OBRIGACAO_NAO_RECONHECIDA'])
  })

  it('sem fatura, sem duplicatas, sem pagamento informado → INDEFINIDO pendente de revisão', () => {
    const r = conciliarObrigacoesNfe({ valorNf: '80.00', duplicatas: [] })
    expect(r).toMatchObject({ situacao: 'PENDENTE_REVISAO', natureza: 'INDEFINIDO' })
  })

  it('valor com 3 casas é inválido (não arredonda em silêncio)', () => {
    const r = conciliarObrigacoesNfe({ valorNf: '10.005', duplicatas: [dup('10.00')] })
    expect(r.situacao).toBe('DIVERGENTE')
    expect(r.motivos).toContain('VALOR_INVALIDO')
  })

  it('não altera a entrada', () => {
    const e: ConciliacaoEntrada = { valorNf: '10.00', duplicatas: [dup('10.00')] }
    const copia = structuredClone(e)
    conciliarObrigacoesNfe(e)
    expect(e).toEqual(copia)
  })
})

import { describe, expect, it } from 'vitest'
import { gerarCsvRelatorio, totaisRelatorio, type LinhaRelatorio } from './relatorio'

const h = { vendedor: 'Vendedor', vendas: 'Vendas', base: 'Base', comissao: 'Comissão', ajustes: 'Ajustes', bonus: 'Bônus', total: 'Total' }
const linhas: LinhaRelatorio[] = [
  { operadorId: '1', nome: 'Ana; "Lojista"', vendas: 2, base: 199.99, comissao: 10, ajustes: -1.1, bonusMeta: 0, total: 8.9 },
  { operadorId: '2', nome: 'Bruno', vendas: 1, base: 0.1, comissao: 0.2, ajustes: 0, bonusMeta: 0.1, total: 0.3 },
]

describe('relatório de comissão', () => {
  it('totais em centavos sem erro de ponto flutuante', () => {
    expect(totaisRelatorio(linhas)).toEqual({ vendas: 3, base: 200.09, comissao: 10.2, ajustes: -1.1, bonusMeta: 0.1, total: 9.2 })
  })
  it('CSV com BOM, ; e escape', () => {
    const csv = gerarCsvRelatorio(linhas, h, 'Total geral')
    expect(csv.startsWith('\uFEFFVendedor;Vendas;')).toBe(true)
    expect(csv).toContain('"Ana; ""Lojista""";2;199,99;10,00;-1,10;0,00;8,90')
    expect(csv.trim().split('\r\n').at(-1)).toBe('Total geral;3;200,09;10,20;-1,10;0,10;9,20')
  })
})

describe('exportação contábil', () => {
  it('colunas fixas, decimal com vírgula', async () => {
    const { gerarCsvContabil } = await import('./relatorio')
    const csv = gerarCsvContabil([{ competencia: '2026-10', lojaCodigo: 'L1', lojaNome: 'Loja Centro', operadorId: 'u1', operadorNome: 'Ana', status: 'APROVADO',
      base: 1000, comissao: 50, ajustes: -5, bonusMeta: 10, total: 55, aprovadoEm: '2026-11-01T12:00:00Z' }])
    const [cab, l1] = csv.replace('\uFEFF', '').trim().split('\r\n')
    expect(cab).toBe('competencia;loja_codigo;loja;colaborador_id;colaborador;status;base;comissao;ajustes;bonus_meta;total_a_pagar;aprovado_em')
    expect(l1).toBe('2026-10;L1;Loja Centro;u1;Ana;APROVADO;1000,00;50,00;-5,00;10,00;55,00;2026-11-01T12:00:00Z')
  })
})

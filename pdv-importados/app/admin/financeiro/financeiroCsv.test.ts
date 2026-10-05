import { describe,expect,it } from 'vitest'
import { parseExtratoCsv,exportFinanceiroCsv } from './financeiroCsv'

describe('extrato financeiro CSV',() => {
 it('lê BOM, vírgula decimal, créditos e débitos preservando a referência',() => {
  expect(parseExtratoCsv('\uFEFFreferencia;data;descricao;valor\r\nREF1;2026-10-04;Depósito;100,50\r\nREF2;2026-10-04;Tarifa;-3.20')).toEqual([
   { referencia:'REF1',data:'2026-10-04',descricao:'Depósito',valor:'100.50' },
   { referencia:'REF2',data:'2026-10-04',descricao:'Tarifa',valor:'-3.20' },
  ])
 })
 it.each(['2026-02-30','2026-13-01','2026-01-32'])('recusa data civil inválida %s',data => {
  expect(() => parseExtratoCsv(`referencia;data;descricao;valor\nX;${data};Teste;1`)).toThrow('inválidos')
 })
 it.each(['0','NaN','Infinity','1.001','R$ 10','1.000,00'])('recusa valor não padronizado %s',valor => {
  expect(() => parseExtratoCsv(`referencia;data;descricao;valor\nX;2026-10-04;Teste;${valor}`)).toThrow('inválidos')
 })
 it('recusa arquivo vazio, referência ausente e mais de 500 linhas',() => {
  expect(() => parseExtratoCsv('')).toThrow('Cabeçalho')
  expect(() => parseExtratoCsv('referencia;data;descricao;valor\n;2026-10-04;Teste;1')).toThrow('inválidos')
  expect(() => parseExtratoCsv('referencia;data;descricao;valor\n'+'X;2026-10-04;Teste;1\n'.repeat(501))).toThrow('500')
 })
 it('exporta texto com proteção contra fórmula de planilha e mantém números negativos',() => {
  const csv=exportFinanceiroCsv([{ descricao:'  =HYPERLINK("x")',valor:-3.2 },{ descricao:'@SUM(A1)',valor:10 }])
  expect(csv).toContain('"\'  =HYPERLINK(""x"")"')
  expect(csv).toContain('"\'@SUM(A1)"')
  expect(csv).toContain('"-3.2"')
 })
})

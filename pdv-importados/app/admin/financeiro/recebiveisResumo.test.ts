import { describe, expect, it } from 'vitest'
import { linhasCsvRecebiveis, resumirRecebiveis, statusExibicaoRecebivel } from './recebiveisResumo'
import type { FinanceiroRecebivel } from './financeiroLojaTypes'

const hoje = '2026-10-20'
const r = (o: Partial<FinanceiroRecebivel>): FinanceiroRecebivel => ({ id: 'x', venda_id: 'v1', forma: 'PIX', parcela: 1, parcelas: 1, bruto: 100, taxa: 1, liquido: 99, previsao: '2026-10-25', operadora: null, conta_financeira_id: null, status: 'PENDENTE', devolucao: false, ...o })

describe('statusExibicaoRecebivel', () => {
 it('deriva vencido só para PENDENTE com previsão anterior a hoje', () => {
  expect(statusExibicaoRecebivel(r({ previsao: '2026-10-19' }), hoje)).toBe('vencido')
  expect(statusExibicaoRecebivel(r({ previsao: '2026-10-20' }), hoje)).toBe('pendente')
  expect(statusExibicaoRecebivel(r({ previsao: null }), hoje)).toBe('pendente')
  expect(statusExibicaoRecebivel(r({ status: 'RECEBIDO', previsao: '2026-01-01' }), hoje)).toBe('recebido')
  expect(statusExibicaoRecebivel(r({ status: 'CANCELADO', previsao: '2026-01-01' }), hoje)).toBe('cancelado')
 })
})

describe('resumirRecebiveis', () => {
 it('soma em centavos, ignora cancelados e conta vencidos dentro de em aberto', () => {
  const res = resumirRecebiveis([
   r({ liquido: 0.1 }), r({ liquido: 0.2, previsao: '2026-10-01' }), r({ liquido: 50, status: 'RECEBIDO' }), r({ liquido: 999, status: 'CANCELADO' }),
  ], hoje)
  expect(res).toEqual({ total: 50.3, recebido: 50, aberto: 0.3, vencido: 0.2, qtdTotal: 3, qtdRecebido: 1, qtdAberto: 2, qtdVencido: 1 })
 })
 it('conjunto vazio', () => {
  expect(resumirRecebiveis([], hoje).total).toBe(0)
 })
})

describe('linhasCsvRecebiveis', () => {
 it('exporta parcela, valores e status de exibição', () => {
  const [l] = linhasCsvRecebiveis([r({ previsao: '2026-10-01', taxa: null, parcela: 2, parcelas: 3 })], hoje, { pendente: 'Pendente', vencido: 'Vencido', recebido: 'Recebido', cancelado: 'Cancelado' })
  expect(l).toMatchObject({ parcela: '2/3', bruto: '100.00', taxa: '', liquido_estimado: '99.00', status: 'Vencido' })
 })
})

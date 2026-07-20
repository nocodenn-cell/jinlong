import { describe, expect, it } from 'vitest'
import {
  avaliarBloqueiosGo,
  calcularGateStatus,
  IMPLANTACAO_ITENS,
  type ItemStatus,
} from './implantacaoCatalog'

function allConcluido(): Record<string, ItemStatus> {
  const map: Record<string, ItemStatus> = {}
  for (const i of IMPLANTACAO_ITENS) map[i.key] = 'CONCLUIDO'
  return map
}

describe('implantacaoCatalog GO gate', () => {
  it('bloqueia GO com obrigatório pendente', () => {
    const map = allConcluido()
    map['operacao.venda'] = 'PENDENTE'
    expect(avaliarBloqueiosGo(map)).toContain('operacao.venda')
    expect(calcularGateStatus(false, map)).toBe('NAO_PRONTO')
  })

  it('exige um item do grupo fiscal', () => {
    const map = allConcluido()
    map['fiscal.stub'] = 'PENDENTE'
    map['fiscal.nfce'] = 'PENDENTE'
    expect(avaliarBloqueiosGo(map)).toContain('grupo:fiscal')
    map['fiscal.stub'] = 'CONCLUIDO'
    expect(avaliarBloqueiosGo(map)).not.toContain('grupo:fiscal')
  })

  it('GO_LIVE só com autorização explícita', () => {
    const map = allConcluido()
    expect(calcularGateStatus(false, map)).toBe('PRONTO_PENDENCIAS')
    expect(calcularGateStatus(true, map)).toBe('GO_LIVE')
  })

  it('opcional pendente não bloqueia autorização', () => {
    const map = allConcluido()
    map['ambiente.backup'] = 'PENDENTE'
    map['loja.impressora'] = 'PENDENTE'
    expect(avaliarBloqueiosGo(map)).toHaveLength(0)
  })

  it('P0-DADOS: homologacao.dados bloqueia GO se pendente', () => {
    const map = allConcluido()
    map['homologacao.dados'] = 'PENDENTE'
    expect(avaliarBloqueiosGo(map)).toContain('homologacao.dados')
    expect(calcularGateStatus(false, map)).toBe('NAO_PRONTO')
  })

  it('catálogo inclui homologacao.dados como obrigatório', () => {
    const item = IMPLANTACAO_ITENS.find((i) => i.key === 'homologacao.dados')
    expect(item?.obrigatorio).toBe(true)
    expect(item?.secao).toBe('homologacao')
  })

  it('War Room: execucao_1 e execucao_2 bloqueiam GO se pendentes', () => {
    const map = allConcluido()
    map['homologacao.execucao_1'] = 'PENDENTE'
    expect(avaliarBloqueiosGo(map)).toContain('homologacao.execucao_1')
    map['homologacao.execucao_1'] = 'CONCLUIDO'
    map['homologacao.execucao_2'] = 'PENDENTE'
    expect(avaliarBloqueiosGo(map)).toContain('homologacao.execucao_2')
  })
})


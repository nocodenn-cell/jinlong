import { describe, expect, it } from 'vitest'
import { SYSTEM_RULES, statusInicialProduto } from './systemRules'
import { isProdutoVendavel } from '../../shared-core/src/catalog/isProdutoVendavel'

describe('systemRules — constituição do sistema', () => {
  it('cadastro manual nasce PUBLICADO + ativo=true e é vendável no PDV', () => {
    const r = statusInicialProduto('human')
    expect(r).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    expect(isProdutoVendavel(r)).toBe(true)
  })

  it('importação nasce DRAFT + ativo=false e NÃO é vendável', () => {
    const r = statusInicialProduto('import')
    expect(r).toEqual({ status_publicacao: 'DRAFT', ativo: false })
    expect(isProdutoVendavel(r)).toBe(false)
  })

  it('requisito de vendabilidade do PDV é coerente com isProdutoVendavel', () => {
    const req = SYSTEM_RULES.pdv.vendavel.requires
    expect(req.ativo).toBe(true)
    expect(req.status_publicacao).toBe('PUBLICADO')
    expect(isProdutoVendavel({ ativo: req.ativo, status_publicacao: req.status_publicacao })).toBe(true)
  })

  it('fluxo de venda canônico mantém a ordem', () => {
    expect(SYSTEM_RULES.pdv.flow).toEqual([
      'adicionar_item',
      'validar_sku',
      'calcular_total',
      'finalizar_venda',
    ])
  })
})

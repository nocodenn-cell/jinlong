import { describe, expect, it } from 'vitest'
import { vendaEmEsperaRetomadaPresa, vendasEmEsperaVisiveis } from './vendasEmEsperaLista'

const espera = { id: 'espera', status: 'EM_ESPERA' as const }
const retomada = { id: 'retomada', status: 'RETOMADA' as const }

describe('vendas em espera visíveis no fechamento', () => {
  it('RETOMADA presa não é o cupom aberto nesta tela', () => {
    expect(vendaEmEsperaRetomadaPresa('RETOMADA')).toBe(true)
    expect(vendaEmEsperaRetomadaPresa('EM_ESPERA')).toBe(false)
    expect(vendaEmEsperaRetomadaPresa(undefined)).toBe(false)
  })

  it('esconde só o pedido que já está no carrinho', () => {
    const visiveis = vendasEmEsperaVisiveis([espera, retomada], 'retomada')
    expect(visiveis.map((v) => v.id)).toEqual(['espera'])
  })

  it('sem cupom de origem, a RETOMADA órfã continua na lista', () => {
    const visiveis = vendasEmEsperaVisiveis([espera, retomada], null)
    expect(visiveis.map((v) => v.id)).toEqual(['espera', 'retomada'])
  })
})

import { describe, expect, it } from 'vitest'
import { mensagemErroRetomarEmEspera } from '@/app/caixa/server/caixaVendaEspera.impl'

/**
 * Contrato do claim anti-duplicata (migration 20260808120000):
 * - retomar: EM_ESPERA → RETOMADA (2ª retomada → venda_em_espera_em_uso)
 * - devolver: RETOMADA → EM_ESPERA (abandono sem venda)
 * - converter: EM_ESPERA|RETOMADA → CONVERTIDA (após finalizar)
 *
 * Sem o claim, dois terminais retomam o mesmo id e finalizam com chaves
 * distintas → estoque e caixa em dobro.
 */
describe('venda em espera — mensagens de claim', () => {
  it('traduz venda_em_espera_em_uso para o operador', () => {
    expect(mensagemErroRetomarEmEspera('venda_em_espera_em_uso')).toBe(
      'Este pedido em espera já está em uso em outro terminal.',
    )
    expect(
      mensagemErroRetomarEmEspera('ERROR: venda_em_espera_em_uso'),
    ).toBe('Este pedido em espera já está em uso em outro terminal.')
  })

  it('repassa demais erros ao tradutor genérico', () => {
    expect(mensagemErroRetomarEmEspera('venda_em_espera_nao_encontrada')).toBe(
      'venda_em_espera_nao_encontrada',
    )
  })
})

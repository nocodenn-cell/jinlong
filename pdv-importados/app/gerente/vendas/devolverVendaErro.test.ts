import { describe, expect, it } from 'vitest'
import { mensagemErroDevolverVenda } from './devolverVendaErro'

describe('mensagemErroDevolverVenda', () => {
  it('mapeia código conhecido para mensagem específica', () => {
    expect(mensagemErroDevolverVenda('DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA')).toBe(
      'Quantidade devolvida excede o vendido.',
    )
  })

  it('RPC ausente (migration pendente) não sugere "tentar novamente" — recurso indisponível', () => {
    const msg = mensagemErroDevolverVenda(
      'Could not find the function public.devolver_ou_trocar_venda in the schema cache',
    )
    expect(msg).toContain('indisponível')
    expect(msg).not.toMatch(/tente novamente/i)
  })

  it('erro totalmente desconhecido cai no fallback genérico de retry', () => {
    expect(mensagemErroDevolverVenda('ALGO_TOTALMENTE_INESPERADO')).toBe(
      'Não foi possível registrar a devolução. Tente novamente.',
    )
  })
})

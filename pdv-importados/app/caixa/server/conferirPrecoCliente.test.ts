import { describe, expect, it } from 'vitest'
import {
  divergenciaPrecoAutomatico,
  divergenciaPrecoDiscricionario,
} from './conferirPrecoCliente'

const varejo = {
  tipoPreco: 'VAREJO' as const,
  precoOriginal: 10,
  precoUnitario: 10,
  varejoCadastro: 10,
  esperadoPreco: 10,
  esperadoTipo: 'VAREJO' as const,
}

describe('conferirPrecoCliente — autoridade do backend', () => {
  it('aceita varejo abaixo do mínimo da faixa', () => {
    expect(divergenciaPrecoAutomatico(varejo)).toBeNull()
  })

  it('aceita atacado exatamente no preço da RPC e com original = varejo', () => {
    expect(
      divergenciaPrecoAutomatico({
        ...varejo,
        tipoPreco: 'ATACADO',
        precoUnitario: 8,
        esperadoPreco: 8,
        esperadoTipo: 'ATACADO',
      }),
    ).toBeNull()
  })

  it('rejeita unitário adulterado pelo frontend', () => {
    expect(
      divergenciaPrecoAutomatico({ ...varejo, precoUnitario: 1 }),
    ).toBe('preco_diverge_cadastro')
  })

  it('rejeita tipo enviado diferente do calculado (varejo fingindo atacado)', () => {
    expect(
      divergenciaPrecoAutomatico({
        ...varejo,
        tipoPreco: 'ATACADO',
        precoUnitario: 8,
        esperadoPreco: 10,
        esperadoTipo: 'VAREJO',
      }),
    ).toBe('tipo_preco_mudou')
  })

  it('rejeita referência de atacado que não é o varejo do cadastro', () => {
    expect(
      divergenciaPrecoAutomatico({
        ...varejo,
        tipoPreco: 'ATACADO',
        precoOriginal: 8,
        precoUnitario: 8,
        esperadoPreco: 8,
        esperadoTipo: 'ATACADO',
      }),
    ).toBe('preco_ref_atacado_inconsistente')
  })

  it('desconto manual dentro da referência é aceito', () => {
    expect(divergenciaPrecoDiscricionario(10, 9.5)).toBeNull()
  })

  it('desconto manual acima da referência é recusado', () => {
    expect(divergenciaPrecoDiscricionario(10, 10.5)).toBe('preco_acima_referencia')
  })

  it('diferença de 2 centavos permanece dentro da tolerância já existente', () => {
    expect(divergenciaPrecoAutomatico({ ...varejo, precoUnitario: 10.02 })).toBeNull()
    expect(divergenciaPrecoAutomatico({ ...varejo, precoUnitario: 10.03 })).toBe(
      'preco_diverge_cadastro',
    )
  })
})

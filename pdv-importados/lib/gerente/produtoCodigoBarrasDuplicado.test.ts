import { describe, expect, it } from 'vitest'
import {
  formatMensagemCodigoBarrasDuplicado,
  isProdutosCodigoBarrasLojaUniqueViolation,
} from './produtoCodigoBarrasDuplicado'

describe('produtoCodigoBarrasDuplicado', () => {
  it('detecta 23505 da constraint por loja', () => {
    expect(
      isProdutosCodigoBarrasLojaUniqueViolation({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
      }),
    ).toBe(true)
  })

  it('ignora outros unique/códigos', () => {
    expect(
      isProdutosCodigoBarrasLojaUniqueViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "usuarios_email_key"',
      }),
    ).toBe(false)
    expect(
      isProdutosCodigoBarrasLojaUniqueViolation({
        code: '23503',
        message: 'produtos_codigo_barras_loja_unique',
      }),
    ).toBe(false)
  })

  it('formata mensagem com nome do produto existente', () => {
    expect(formatMensagemCodigoBarrasDuplicado('Cabo USB', 'pt')).toContain('Cabo USB')
    expect(formatMensagemCodigoBarrasDuplicado('Cabo USB', 'pt')).toContain(
      'Código de barras já cadastrado',
    )
  })

  it('formata mensagem sem nome quando lookup falha', () => {
    expect(formatMensagemCodigoBarrasDuplicado(null, 'pt')).toContain('Busque o produto existente')
  })
})

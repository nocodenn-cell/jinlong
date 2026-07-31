import { describe, expect, it } from 'vitest'
import { validarProdutoFormClient } from './produtoForm.clientValidation'

const messages = {
  nome_obrigatorio: 'nome obrigatorio',
  nome_minimo: 'nome minimo',
  preco_invalido: 'preco invalido',
  codigo_barras_minimo: 'barcode minimo',
  atacado_maior_varejo: 'atacado maior',
}

describe('validarProdutoFormClient', () => {
  it('exige nome', () => {
    expect(
      validarProdutoFormClient({
        nome: '  ',
        codigoBarras: '',
        precoVarejo: 10,
        precoAtacado: null,
        comoRascunho: false,
        messages,
      }),
    ).toEqual({ campo: 'nome', mensagem: messages.nome_obrigatorio })
  })

  it('exige nome com pelo menos 2 caracteres', () => {
    expect(
      validarProdutoFormClient({
        nome: 'A',
        codigoBarras: '',
        precoVarejo: 10,
        precoAtacado: null,
        comoRascunho: false,
        messages,
      }),
    ).toEqual({ campo: 'nome', mensagem: messages.nome_minimo })
  })

  it('exige barcode vazio ou >= 3', () => {
    expect(
      validarProdutoFormClient({
        nome: 'Produto',
        codigoBarras: '12',
        precoVarejo: 10,
        precoAtacado: null,
        comoRascunho: false,
        messages,
      }),
    ).toEqual({ campo: 'codigo_barras', mensagem: messages.codigo_barras_minimo })
  })

  it('permite rascunho sem preco', () => {
    expect(
      validarProdutoFormClient({
        nome: 'Produto',
        codigoBarras: '',
        precoVarejo: null,
        precoAtacado: null,
        comoRascunho: true,
        messages,
      }),
    ).toBeNull()
  })

  it('exige preco ao publicar', () => {
    expect(
      validarProdutoFormClient({
        nome: 'Produto',
        codigoBarras: '123',
        precoVarejo: 0,
        precoAtacado: null,
        comoRascunho: false,
        messages,
      }),
    ).toEqual({ campo: 'preco_varejo', mensagem: messages.preco_invalido })
  })

  it('bloqueia atacado >= varejo', () => {
    expect(
      validarProdutoFormClient({
        nome: 'Produto',
        codigoBarras: '',
        precoVarejo: 10,
        precoAtacado: 10,
        comoRascunho: false,
        messages,
      }),
    ).toEqual({ campo: 'preco_atacado', mensagem: messages.atacado_maior_varejo })
  })
})

/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { campoExigeModoCompleto, localizarCampo } from './produtoForm.campoFoco'

describe('campoExigeModoCompleto', () => {
  it('exige abrir Mais detalhes para o preço de atacado', () => {
    expect(campoExigeModoCompleto('preco_atacado')).toBe(true)
  })

  it('não exige para os campos do cadastro simples', () => {
    expect(campoExigeModoCompleto('nome')).toBe(false)
    expect(campoExigeModoCompleto('codigo_barras')).toBe(false)
    expect(campoExigeModoCompleto('preco_varejo')).toBe(false)
  })
})

describe('localizarCampo', () => {
  it('encontra o input pelo data-field', () => {
    const raiz = document.createElement('div')
    raiz.innerHTML = '<input data-field="nome" /><input data-field="preco_varejo" />'
    const el = localizarCampo(raiz, 'preco_varejo')
    expect(el).toBeInstanceOf(HTMLInputElement)
    expect(el?.dataset.field).toBe('preco_varejo')
  })

  it('devolve null quando o campo não está montado', () => {
    const raiz = document.createElement('div')
    raiz.innerHTML = '<input data-field="nome" />'
    expect(localizarCampo(raiz, 'preco_atacado')).toBeNull()
  })

  it('tolera raiz nula', () => {
    expect(localizarCampo(null, 'nome')).toBeNull()
  })
})

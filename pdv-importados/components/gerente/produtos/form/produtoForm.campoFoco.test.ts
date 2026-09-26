/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { localizarCampo } from './produtoForm.campoFoco'

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

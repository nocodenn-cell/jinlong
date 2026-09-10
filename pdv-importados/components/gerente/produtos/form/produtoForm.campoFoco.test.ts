/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { campoExigeModoCompleto, localizarCampo } from './produtoForm.campoFoco'

describe('campoExigeModoCompleto', () => {
  // O preço de atacado saiu de "Mais detalhes" para a seção Preços
  // (AtacadoSection): nenhum campo validável mora mais atrás de um disclosure,
  // então o erro sempre cai num campo que está na tela.
  it('não exige abrir Mais detalhes para nenhum campo validável', () => {
    expect(campoExigeModoCompleto('nome')).toBe(false)
    expect(campoExigeModoCompleto('codigo_barras')).toBe(false)
    expect(campoExigeModoCompleto('preco_varejo')).toBe(false)
    expect(campoExigeModoCompleto('preco_atacado')).toBe(false)
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

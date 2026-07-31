import { describe, expect, it } from 'vitest'
import {
  isOpcaoAtiva,
  opcoesSelecionaveis,
  selecionadaEstaInativa,
} from './opcoesCadastro'

const bebidas = { id: 'c1', nome: 'Bebidas', ativo: true }
const natal = { id: 'c2', nome: 'Natal 2024', ativo: false }
const semFlag = { id: 'c3', nome: 'Legado' }
const opcoes = [bebidas, natal, semFlag]

describe('opcoesCadastro', () => {
  it('trata opção sem flag como ativa (compatibilidade)', () => {
    expect(isOpcaoAtiva(semFlag)).toBe(true)
    expect(isOpcaoAtiva(natal)).toBe(false)
  })

  it('esconde inativa quando nada a seleciona', () => {
    expect(opcoesSelecionaveis(opcoes, '')).toEqual([bebidas, semFlag])
  })

  it('mantém a inativa visível quando é a do produto em edição', () => {
    // O ponto do teste: sem isto, salvar o produto apagaria o vínculo.
    expect(opcoesSelecionaveis(opcoes, 'c2')).toEqual([bebidas, natal, semFlag])
  })

  it('não ressuscita inativa quando outra está selecionada', () => {
    expect(opcoesSelecionaveis(opcoes, 'c1')).toEqual([bebidas, semFlag])
  })

  it('sinaliza quando a seleção atual está inativa', () => {
    expect(selecionadaEstaInativa(opcoes, 'c2')).toBe(true)
    expect(selecionadaEstaInativa(opcoes, 'c1')).toBe(false)
    expect(selecionadaEstaInativa(opcoes, '')).toBe(false)
    // Id que não existe mais na lista não conta como "inativa".
    expect(selecionadaEstaInativa(opcoes, 'sumiu')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { existeModalAberto, resolverAtalhoPdv, type EstadoAtalhosPdv } from './atalhosPdv'

const base: EstadoAtalhosPdv = { caixaAberto: true, temItens: true, finalizando: false, modalAberto: false }

describe('resolverAtalhoPdv', () => {
  it('mapeia cada tecla para a ação do botão', () => {
    expect(resolverAtalhoPdv('F2', { ...base, caixaAberto: false }).acao).toBe('abrirCaixa')
    expect(resolverAtalhoPdv('F3', base).acao).toBe('fecharCaixa')
    expect(resolverAtalhoPdv('F4', base).acao).toBe('movimentoCaixa')
    expect(resolverAtalhoPdv('F10', base).acao).toBe('finalizar')
    expect(resolverAtalhoPdv('Escape', base).acao).toBe('novoCupom')
  })

  it('botão indisponível = atalho sem efeito, mas F-key ainda bloqueia o padrão do navegador', () => {
    expect(resolverAtalhoPdv('F2', base)).toEqual({ acao: null, prevenirPadrao: true })
    expect(resolverAtalhoPdv('F3', { ...base, caixaAberto: false })).toEqual({ acao: null, prevenirPadrao: true })
    expect(resolverAtalhoPdv('F4', { ...base, caixaAberto: false }).acao).toBeNull()
    expect(resolverAtalhoPdv('F10', { ...base, temItens: false }).acao).toBeNull()
    expect(resolverAtalhoPdv('F10', { ...base, finalizando: true }).acao).toBeNull()
  })

  it('modal aberto tem precedência: nada é tratado nem prevenido', () => {
    for (const t of ['F2', 'F3', 'F4', 'F10', 'Escape']) {
      expect(resolverAtalhoPdv(t, { ...base, modalAberto: true })).toEqual({ acao: null, prevenirPadrao: false })
    }
    expect(resolverAtalhoPdv('F10', base, { jaTratado: true }).acao).toBeNull()
  })

  it('Esc é seguro: sem itens ou finalizando não faz nada', () => {
    expect(resolverAtalhoPdv('Escape', { ...base, temItens: false })).toEqual({ acao: null, prevenirPadrao: false })
    expect(resolverAtalhoPdv('Escape', { ...base, finalizando: true }).acao).toBeNull()
  })

  it('Enter e outras teclas não são interceptadas', () => {
    expect(resolverAtalhoPdv('Enter', base)).toEqual({ acao: null, prevenirPadrao: false })
    expect(resolverAtalhoPdv('a', base)).toEqual({ acao: null, prevenirPadrao: false })
  })

  it('tecla segurada (repeat) não repete a ação', () => {
    expect(resolverAtalhoPdv('F10', base, { repeticao: true })).toEqual({ acao: null, prevenirPadrao: true })
  })
})

describe('existeModalAberto', () => {
  it('detecta diálogo modal pelo seletor', () => {
    expect(existeModalAberto({ querySelector: () => ({}) as Element })).toBe(true)
    expect(existeModalAberto({ querySelector: () => null })).toBe(false)
    expect(existeModalAberto(undefined)).toBe(false)
  })
})

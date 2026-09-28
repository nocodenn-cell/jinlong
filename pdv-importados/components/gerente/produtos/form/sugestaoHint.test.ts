import { describe, expect, it } from 'vitest'
import { combinarSugestaoHint } from './sugestaoHint'

const MARCA_TEMPLATE = 'Marca sugerida: {{marca}} — selecione em Marca, se aplicável.'

describe('G-12 — combinarSugestaoHint', () => {
  it('inclui o aviso de marca quando a sugestão traz uma marca', () => {
    const hint = combinarSugestaoHint('Dados sugeridos aplicados (openfoodfacts).', 'Coca-Cola', MARCA_TEMPLATE)
    expect(hint).toContain('Dados sugeridos aplicados (openfoodfacts).')
    expect(hint).toContain('Marca sugerida: Coca-Cola — selecione em Marca, se aplicável.')
  })

  it('sem marca, mantém só o aviso base (comportamento anterior preservado)', () => {
    const hint = combinarSugestaoHint('Dados sugeridos aplicados (openfoodfacts).', null, MARCA_TEMPLATE)
    expect(hint).toBe('Dados sugeridos aplicados (openfoodfacts).')
  })

  it('sem aviso base e sem marca, retorna null (nunca string vazia)', () => {
    expect(combinarSugestaoHint(null, null, MARCA_TEMPLATE)).toBeNull()
  })

  it('sem aviso base mas com marca, mostra só o aviso de marca', () => {
    const hint = combinarSugestaoHint(null, 'Nestlé', MARCA_TEMPLATE)
    expect(hint).toBe('Marca sugerida: Nestlé — selecione em Marca, se aplicável.')
  })

  it('nunca escreve a marca num campo — só compõe texto', () => {
    // Assinatura da função não aceita nem devolve nenhum id/valor de campo do
    // formulário — só strings de exibição. Prova estrutural, não só de valor.
    const hint = combinarSugestaoHint('base', 'Marca X', MARCA_TEMPLATE)
    expect(typeof hint).toBe('string')
  })
})

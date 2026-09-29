import { describe, expect, it } from 'vitest'
import { atacadoEntradaTexto, type CatalogoAtacadoLabels } from './catalogoAtacadoTexto'
import pt from '../../../../src/lib/i18n/pt.json'
import zh from '../../../../src/lib/i18n/zh.json'

const labels: CatalogoAtacadoLabels = {
  atacadoAPartir: 'A partir de {{n}} un.: {{preco}}',
  atacadoFaixasUm: '+1 faixa',
  atacadoFaixasN: '+{{n}} faixas',
}
const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

describe('atacadoEntradaTexto — coluna Atacado do Catálogo', () => {
  it('sem faixa: null (a tabela mostra "—")', () => {
    expect(atacadoEntradaTexto({ quantidadeMinima: null, precoUnitario: null }, labels, brl)).toBeNull()
    expect(atacadoEntradaTexto({ quantidadeMinima: 6, precoUnitario: null }, labels, brl)).toBeNull()
  })

  it('uma faixa: "A partir de N un.: R$ X" e sem contador', () => {
    expect(
      atacadoEntradaTexto({ quantidadeMinima: 6, precoUnitario: 30, faixasAdicionais: 0 }, labels, brl),
    ).toEqual({ principal: 'A partir de 6 un.: R$ 30,00', extras: null })
  })

  it('faixas adicionais: singular e plural', () => {
    expect(
      atacadoEntradaTexto({ quantidadeMinima: 10, precoUnitario: 9, faixasAdicionais: 1 }, labels, brl)
        ?.extras,
    ).toBe('+1 faixa')
    expect(
      atacadoEntradaTexto({ quantidadeMinima: 10, precoUnitario: 9, faixasAdicionais: 3 }, labels, brl)
        ?.extras,
    ).toBe('+3 faixas')
  })

  it('faixasAdicionais ausente conta como zero', () => {
    expect(atacadoEntradaTexto({ quantidadeMinima: 2, precoUnitario: 5 }, labels, brl)?.extras).toBeNull()
  })
})

describe('i18n do atacado no Catálogo (pt e zh têm as mesmas chaves e placeholders)', () => {
  const ptUi = (pt as unknown as { admin_ui: Record<string, string> }).admin_ui
  const zhUi = (zh as unknown as { admin_ui: Record<string, string> }).admin_ui

  it.each(['catalogo_atacado_a_partir', 'catalogo_atacado_faixas_um', 'catalogo_atacado_faixas_n'])(
    'chave %s existe nos dois idiomas',
    (chave) => {
      expect(ptUi[chave]).toBeTruthy()
      expect(zhUi[chave]).toBeTruthy()
    },
  )

  it('placeholders {{n}}/{{preco}} preservados em pt e zh', () => {
    for (const ui of [ptUi, zhUi]) {
      expect(ui.catalogo_atacado_a_partir).toContain('{{n}}')
      expect(ui.catalogo_atacado_a_partir).toContain('{{preco}}')
      expect(ui.catalogo_atacado_faixas_n).toContain('{{n}}')
    }
  })
})

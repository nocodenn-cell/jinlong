import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { primeiroErroEntradasProduto, type EntradasNumericasProduto } from './produtoForm.entrada'
import { parseMoedaEntrada } from '@shared-core/src/formatting'

const p = getMessages('pt').produtos

const vazio: EntradasNumericasProduto = {
  precoVarejo: { ok: true, value: 10 },
  precoAtacado: { ok: true, value: null },
  precoCusto: { ok: true, value: null },
  estoqueInicial: '',
  estoqueMinimo: '',
  quantidadeGatilho: '',
}

describe('primeiroErroEntradasProduto', () => {
  it('sem erro quando todas as entradas são válidas ou vazias', () => {
    expect(primeiroErroEntradasProduto(vazio, p)).toBeNull()
  })

  it('10.50 no varejo bloqueia com mensagem no campo preco_varejo', () => {
    const e = { ...vazio, precoVarejo: parseMoedaEntrada('10.50') }
    const erro = primeiroErroEntradasProduto(e, p)
    expect(erro?.campo).toBe('preco_varejo')
    expect(erro?.mensagem).toContain('vírgula')
  })

  it('letras no custo bloqueiam em preco_custo', () => {
    const e = { ...vazio, precoCusto: parseMoedaEntrada('12abc') }
    expect(primeiroErroEntradasProduto(e, p)?.campo).toBe('preco_custo')
  })

  it('0,500 no estoque inicial é recusado (não vira 500)', () => {
    const e = { ...vazio, estoqueInicial: '0,500' }
    const erro = primeiroErroEntradasProduto(e, p)
    expect(erro?.campo).toBe('estoque_inicial')
    expect(erro?.mensagem).toBe(p.entrada_qtd_fracionada)
  })

  it('letras e negativo no mínimo e no gatilho', () => {
    expect(primeiroErroEntradasProduto({ ...vazio, estoqueMinimo: 'abc' }, p)?.campo).toBe(
      'estoque_minimo',
    )
    expect(primeiroErroEntradasProduto({ ...vazio, quantidadeGatilho: '-3' }, p)).toEqual({
      campo: 'quantidade_gatilho',
      mensagem: p.entrada_negativo,
    })
  })

  it('mantém a ordem do formulário: varejo antes de estoque', () => {
    const e = { ...vazio, precoVarejo: parseMoedaEntrada('x'), estoqueInicial: '1e5' }
    expect(primeiroErroEntradasProduto(e, p)?.campo).toBe('preco_varejo')
  })
})

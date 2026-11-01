import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { primeiroErroEntradasProduto, type EntradasNumericasProduto } from './produtoForm.entrada'

const p = getMessages('pt').produtos

const base: EntradasNumericasProduto = {
  precoVarejo: '10,00',
  precoAtacado: '',
  precoCusto: '',
  estoqueInicial: '',
  estoqueMinimo: '',
  quantidadeGatilho: '',
  unidadeMedida: 'UN',
}

describe('primeiroErroEntradasProduto', () => {
  it('sem erro quando todas as entradas são válidas ou vazias', () => {
    expect(primeiroErroEntradasProduto(base, p)).toBeNull()
  })

  it('10.50 no varejo bloqueia com mensagem explicando a vírgula (nunca vira 1050)', () => {
    const erro = primeiroErroEntradasProduto({ ...base, precoVarejo: '10.50' }, p)
    expect(erro?.campo).toBe('preco_varejo')
    expect(erro?.mensagem).toBe(p.entrada_moeda_separador)
  })

  it('custo aceita até 2 casas (contrato atual) e recusa o 3º decimal', () => {
    expect(primeiroErroEntradasProduto({ ...base, precoCusto: '3,50' }, p)).toBeNull()
    expect(primeiroErroEntradasProduto({ ...base, precoCusto: '3,505' }, p)?.campo).toBe('preco_custo')
  })

  it('letras no atacado bloqueiam em preco_atacado', () => {
    expect(primeiroErroEntradasProduto({ ...base, precoAtacado: '12abc' }, p)?.campo).toBe(
      'preco_atacado',
    )
  })

  it('UN não aceita fração no estoque inicial (0,500 é recusado)', () => {
    const erro = primeiroErroEntradasProduto({ ...base, estoqueInicial: '0,500' }, p)
    expect(erro?.campo).toBe('estoque_inicial')
    expect(erro?.mensagem).toBe(p.entrada_qtd_fracionada)
  })

  it('KG aceita 0,500 no estoque inicial e no mínimo', () => {
    expect(
      primeiroErroEntradasProduto({ ...base, unidadeMedida: 'KG', estoqueInicial: '0,500', estoqueMinimo: '0,250' }, p),
    ).toBeNull()
  })

  it('KG recusa ponto decimal e mais de 3 casas', () => {
    expect(
      primeiroErroEntradasProduto({ ...base, unidadeMedida: 'KG', estoqueInicial: '1.5' }, p)?.mensagem,
    ).toBe(p.entrada_qtd_separador)
    expect(
      primeiroErroEntradasProduto({ ...base, unidadeMedida: 'M', estoqueMinimo: '0,0005' }, p)?.mensagem,
    ).toBe(p.entrada_qtd_casas)
  })

  it('gatilho de atacado é inteiro: decimal e negativo são recusados', () => {
    expect(primeiroErroEntradasProduto({ ...base, quantidadeGatilho: '2,5' }, p)?.campo).toBe(
      'quantidade_gatilho',
    )
    expect(primeiroErroEntradasProduto({ ...base, quantidadeGatilho: '-3' }, p)).toEqual({
      campo: 'quantidade_gatilho',
      mensagem: p.entrada_negativo,
    })
  })

  it('mantém a ordem do formulário: varejo antes de estoque', () => {
    const e = { ...base, precoVarejo: 'x', estoqueInicial: '1e5' }
    expect(primeiroErroEntradasProduto(e, p)?.campo).toBe('preco_varejo')
  })
})

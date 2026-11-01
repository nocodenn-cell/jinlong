/**
 * Validação estrita das entradas numéricas do cadastro de produto.
 * Cada campo usa o contrato da coluna destino (casas e teto técnico) e a unidade
 * de medida do produto (fração só para KG e M). Erro aponta o campo (`data-field`)
 * e a mensagem PT/ZH vinda do i18n.
 */

import {
  INTEIRO_MAX_INT4,
  MOEDA_MAX_NUMERIC_10_2,
  parseMoedaEntrada,
  parseQuantidadeEntrada,
  parseQuantidadeInteiraEntrada,
  parseValorEntrada,
  type MotivoEntradaNumerica,
  type ResultadoEntradaNumerica,
} from '@shared-core/src/formatting'
import { unidadeAceitaFracao } from '@shared-core/src/products/unidadesMedida'
import type { ProdutoFormErro } from './produtoForm.clientValidation'
import type { Mensagens } from '@/i18n/getMessages'

type P = Mensagens['produtos']

/**
 * Casas do custo no cadastro. Hoje `produtos.preco_custo` é `numeric(10,2)`, então
 * fica em 2. Subir até 6 (IM-F01) exige alterar o schema e os cálculos de custo juntos.
 */
export const CASAS_CUSTO_CADASTRO = 2

const MENSAGEM_MOEDA: Record<MotivoEntradaNumerica, keyof P> = {
  formato: 'entrada_moeda_formato',
  separador_decimal: 'entrada_moeda_separador',
  casas_decimais: 'entrada_moeda_casas',
  negativo: 'entrada_negativo',
  faixa: 'entrada_moeda_faixa',
  fracionada: 'entrada_moeda_formato',
}

const MENSAGEM_QUANTIDADE: Record<MotivoEntradaNumerica, keyof P> = {
  formato: 'entrada_qtd_formato',
  separador_decimal: 'entrada_qtd_separador',
  casas_decimais: 'entrada_qtd_casas',
  fracionada: 'entrada_qtd_fracionada',
  negativo: 'entrada_negativo',
  faixa: 'entrada_qtd_faixa',
}

/** Mensagem PT/ZH do motivo de rejeição; `null` quando a entrada é válida. */
export function mensagemErroEntrada(
  r: ResultadoEntradaNumerica,
  tipo: 'moeda' | 'quantidade',
  p: P,
): string | null {
  if (r.ok) return null
  const chave = tipo === 'moeda' ? MENSAGEM_MOEDA[r.motivo] : MENSAGEM_QUANTIDADE[r.motivo]
  return String(p[chave])
}

function erroDe(
  campo: ProdutoFormErro['campo'],
  r: ResultadoEntradaNumerica,
  tipo: 'moeda' | 'quantidade',
  p: P,
): ProdutoFormErro | null {
  const mensagem = mensagemErroEntrada(r, tipo, p)
  return mensagem === null ? null : { campo, mensagem }
}

export type EntradasNumericasProduto = Readonly<{
  /** Texto exato do campo (sem tratamento prévio). */
  precoVarejo: string
  precoAtacado: string
  precoCusto: string
  estoqueInicial: string
  estoqueMinimo: string
  quantidadeGatilho: string
  unidadeMedida: string
}>

/** Primeiro erro das entradas numéricas, na ordem em que aparecem no formulário. */
export function primeiroErroEntradasProduto(
  e: EntradasNumericasProduto,
  p: P,
): ProdutoFormErro | null {
  const fracionada = unidadeAceitaFracao(e.unidadeMedida)
  return (
    erroDe('preco_varejo', parseMoedaEntrada(e.precoVarejo), 'moeda', p) ??
    erroDe(
      'preco_custo',
      parseValorEntrada(e.precoCusto, { casas: CASAS_CUSTO_CADASTRO, max: MOEDA_MAX_NUMERIC_10_2 }),
      'moeda',
      p,
    ) ??
    erroDe('preco_atacado', parseMoedaEntrada(e.precoAtacado), 'moeda', p) ??
    erroDe('estoque_inicial', parseQuantidadeEntrada(e.estoqueInicial, { fracionada }), 'quantidade', p) ??
    erroDe('estoque_minimo', parseQuantidadeEntrada(e.estoqueMinimo, { fracionada }), 'quantidade', p) ??
    erroDe(
      'quantidade_gatilho',
      parseQuantidadeInteiraEntrada(e.quantidadeGatilho, { max: INTEIRO_MAX_INT4 }),
      'quantidade',
      p,
    )
  )
}

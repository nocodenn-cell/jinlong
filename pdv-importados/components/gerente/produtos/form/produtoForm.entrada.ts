/**
 * Validação estrita das entradas numéricas do cadastro de produto.
 * Erro aponta o campo (`data-field`) e a mensagem em PT/ZH vinda do i18n.
 */

import {
  parseQuantidadeInteiraEntrada,
  type MotivoEntradaNumerica,
  type ResultadoEntradaNumerica,
} from '@shared-core/src/formatting'
import type { ProdutoFormErro } from './produtoForm.clientValidation'
import type { Mensagens } from '@/i18n/getMessages'

type P = Mensagens['produtos']

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
  separador_decimal: 'entrada_qtd_formato',
  casas_decimais: 'entrada_qtd_formato',
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
  precoVarejo: ResultadoEntradaNumerica
  precoAtacado: ResultadoEntradaNumerica
  precoCusto: ResultadoEntradaNumerica
  estoqueInicial: string
  estoqueMinimo: string
  quantidadeGatilho: string
}>

/** Primeiro erro das entradas numéricas, na ordem em que aparecem no formulário. */
export function primeiroErroEntradasProduto(
  e: EntradasNumericasProduto,
  p: P,
): ProdutoFormErro | null {
  return (
    erroDe('preco_varejo', e.precoVarejo, 'moeda', p) ??
    erroDe('preco_custo', e.precoCusto, 'moeda', p) ??
    erroDe('preco_atacado', e.precoAtacado, 'moeda', p) ??
    erroDe('estoque_inicial', parseQuantidadeInteiraEntrada(e.estoqueInicial), 'quantidade', p) ??
    erroDe('estoque_minimo', parseQuantidadeInteiraEntrada(e.estoqueMinimo), 'quantidade', p) ??
    erroDe('quantidade_gatilho', parseQuantidadeInteiraEntrada(e.quantidadeGatilho), 'quantidade', p)
  )
}

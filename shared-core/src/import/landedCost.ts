/**
 * Motor de landed cost: custo por item a partir de entrada estruturada.
 *
 * Função pura. Sem banco, sem parser de XML, sem relógio, sem aleatoriedade,
 * sem rede e sem hash. Mesma entrada, mesma saída, independentemente da ordem
 * das listas de entrada.
 *
 * Política (DECISÃO-06, aprovada): cálculo intermediário em 10 casas;
 * total do item em 4; unitário em 6; arredondamento HALF_UP; rateio exato
 * pelo maior resto; resíduos registrados.
 *
 * Fora do motor (`07-MOTOR-CONTRATO-MINIMO.md` §1): classificar tributo,
 * decidir recuperabilidade, escolher critério de rateio, definir câmbio,
 * validar contabilmente. Esses itens chegam prontos na entrada ou geram divergência.
 */

import { LANDED_DIVERGENCIA_CODES, LANDED_ERROR_CODES, type LandedErroCodigo } from './errorCodes'
import {
  DecimalErro,
  divide,
  formataDecimal,
  multiplica,
  parseDecimal,
  potencia10,
  reescala,
} from './decimal'
import { ratear, type BaseRateio } from './rateio'
import type {
  Atribuicao,
  CriterioRateio,
  Divergencia,
  ItemSaida,
  LandedCostInput,
  LandedCostOutput,
  LandedResult,
  RateioSaida,
  StatusRecuperabilidade,
} from './types'

export const ENGINE_VERSION = 'landed-cost/0.1.0'

const ESC_TAXA = 10
const ESC_INTERMEDIARIA = 10
const ESC_TOTAL = 4
const ESC_UNITARIO = 6
const ESC_MOEDA = 6
const ESC_QTD = 3
const ESC_FATOR = 6
const ESC_IMPOSTO = 2

/** Valor absoluto máximo de qualquer entrada monetária, em unidades: 10^12. Cabe em numeric(18,4). */
const LIMITE_UNIDADES = 10n ** 12n

const CRITERIOS: readonly CriterioRateio[] = [
  'VALOR_ADUANEIRO', 'PESO_LIQUIDO', 'PESO_BRUTO', 'VOLUME', 'QUANTIDADE_ESTOQUE',
]

const STATUS_VALIDOS: readonly StatusRecuperabilidade[] = [
  'PENDENTE_VALIDACAO', 'NAO_RECUPERAVEL', 'RECUPERAVEL_POTENCIAL',
  'RECUPERAVEL_RECONHECIDO', 'GLOSADO', 'NAO_APLICAVEL',
]

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Erro de entrada. O motor converte em `ok: false`. Nunca sai do módulo. */
class LandedErro extends Error {
  readonly codigo: LandedErroCodigo
  readonly detalhe: string | null
  constructor(codigo: LandedErroCodigo, detalhe: string | null = null) {
    super(detalhe ? `${codigo}: ${detalhe}` : codigo)
    this.name = 'LandedErro'
    this.codigo = codigo
    this.detalhe = detalhe
  }
}

// Função declarada (não arrow) com retorno `never`: o TypeScript usa isso no
// controle de fluxo, para estreitar tipos após `if (x === undefined) falha(...)`.
function falha(codigo: LandedErroCodigo, detalhe: string | null = null): never {
  throw new LandedErro(codigo, detalhe)
}

/**
 * Calcula o landed cost. Nunca lança exceção para entrada inválida:
 * retorna `{ ok: false, error }` com código estável.
 */
export function calcularLandedCost(input: LandedCostInput): LandedResult {
  try {
    return { ok: true, value: calcula(input) }
  } catch (e) {
    if (e instanceof LandedErro) return { ok: false, error: { codigo: e.codigo, detalhe: e.detalhe } }
    if (e instanceof DecimalErro) return { ok: false, error: { codigo: e.codigo, detalhe: e.message } }
    throw e
  }
}

// ---------- leitura de valores ----------

/** Lê decimal com escala máxima. Converte erro de formato em erro do motor com o campo informado. */
function lerDecimal(valor: unknown, escala: number, campo: string): bigint {
  if (valor === null || valor === undefined) falha(LANDED_ERROR_CODES.DADO_AUSENTE, campo)
  try {
    return parseDecimal(valor, escala)
  } catch (e) {
    if (e instanceof DecimalErro) falha(e.codigo, campo)
    throw e
  }
}

/** Dinheiro não negativo com limite de magnitude. */
function lerMoedaPositiva(valor: unknown, escala: number, campo: string): bigint {
  const v = lerDecimal(valor, escala, campo)
  if (v < 0n) falha(LANDED_ERROR_CODES.VALOR_NEGATIVO, campo)
  checaLimite(v, escala, campo)
  return v
}

/** Dinheiro com sinal. Usado em despesas, que podem ser ajuste ou estorno. */
function lerMoedaAssinada(valor: unknown, escala: number, campo: string): bigint {
  const v = lerDecimal(valor, escala, campo)
  checaLimite(v, escala, campo)
  return v
}

function checaLimite(v: bigint, escala: number, campo: string): void {
  const abs = v < 0n ? -v : v
  if (abs >= LIMITE_UNIDADES * potencia10(escala)) falha(LANDED_ERROR_CODES.LIMITE_EXCEDIDO, campo)
}

function lerOpcionalNaoNegativo(valor: unknown, escala: number, campo: string): bigint | null {
  if (valor === null || valor === undefined) return null
  return lerMoedaPositiva(valor, escala, campo)
}

function unicos(ids: readonly string[], origem: string, codigo: LandedErroCodigo = LANDED_ERROR_CODES.ID_DUPLICADO): void {
  const vistos = new Set<string>()
  for (const id of ids) {
    if (vistos.has(id)) falha(codigo, `${origem}.${id}`)
    vistos.add(id)
  }
}

const porId = <T extends { readonly id: string }>(lista: readonly T[]): T[] =>
  [...lista].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

// ---------- estado interno do cálculo ----------

interface ItemInterno {
  readonly id: string
  readonly produtoId: string | null
  readonly moeda: string
  readonly taxa: bigint
  readonly mercadoria: bigint        // escala 10, BRL
  readonly qtdEstoque: bigint        // escala 3
  readonly valorAduaneiro: bigint | null // escala 10
  readonly pesoLiquido: bigint | null   // escala 3
  readonly pesoBruto: bigint | null     // escala 3
  readonly volume: bigint | null        // escala 3
  despesas: bigint                   // escala 10
  tributos: bigint                   // escala 10
  descontos: bigint                  // escala 10, negativo ou zero
  readonly memoria: string[]
}

function calcula(input: LandedCostInput): LandedCostOutput {
  // ----- cabeçalho e política -----
  if (input.schema_version !== '1') falha(LANDED_ERROR_CODES.SCHEMA_VERSAO)
  if (input.processo?.moeda_base !== 'BRL') falha(LANDED_ERROR_CODES.MOEDA_BASE)
  const p = input.politica
  if (
    !p || p.escala_intermediaria !== 10 || p.escala_persistencia !== 4 || p.escala_unitario !== 6 ||
    p.arredondamento !== 'HALF_UP' || p.ordem_residuo !== 'MAIOR_RESTO_ITEM_ID_ASC'
  ) {
    falha(LANDED_ERROR_CODES.POLITICA_INVALIDA)
  }

  // ----- câmbios -----
  const cambioPorMoeda = new Map<string, bigint>([['BRL', 10n ** BigInt(ESC_TAXA)]])
  unicos((input.cambios ?? []).map((c) => c.moeda), 'cambios', LANDED_ERROR_CODES.CAMBIO_DUPLICADO)
  for (const c of [...(input.cambios ?? [])].sort((a, b) => (a.moeda < b.moeda ? -1 : a.moeda > b.moeda ? 1 : 0))) {
    if (c.moeda === 'BRL') falha(LANDED_ERROR_CODES.CAMBIO_INVALIDO, 'BRL não tem câmbio')
    const taxa = lerDecimal(c.taxa, ESC_TAXA, `cambio.${c.moeda}.taxa`)
    if (taxa <= 0n) falha(LANDED_ERROR_CODES.CAMBIO_INVALIDO, c.moeda)
    cambioPorMoeda.set(c.moeda, taxa)
  }
  const taxaDe = (moeda: string): bigint => {
    const t = cambioPorMoeda.get(moeda)
    if (t === undefined) falha(LANDED_ERROR_CODES.CAMBIO_AUSENTE, moeda)
    return t
  }

  // ----- identidades -----
  unicos(input.itens.map((i) => i.id), 'itens')
  unicos(input.despesas.map((d) => d.id), 'despesas')
  unicos(input.descontos.map((d) => d.id), 'descontos')
  unicos(input.tributos.map((t) => t.id), 'tributos')

  // ----- itens -----
  const divergencias: Divergencia[] = []
  const itens = new Map<string, ItemInterno>()
  for (const it of porId(input.itens)) {
    const mercadoria6 = lerMoedaPositiva(it.valor_mercadoria_moeda, ESC_MOEDA, `item.${it.id}.valor_mercadoria_moeda`)
    const taxa = taxaDe(it.moeda)
    const mercadoriaBrl = multiplica(mercadoria6, ESC_MOEDA, taxa, ESC_TAXA, ESC_INTERMEDIARIA)

    const qtdComercial = lerDecimal(it.quantidade_comercial, ESC_QTD, `item.${it.id}.quantidade_comercial`)
    if (qtdComercial <= 0n) falha(LANDED_ERROR_CODES.QTD_INVALIDA, it.id)
    const fator = lerDecimal(it.fator_para_estoque, ESC_FATOR, `item.${it.id}.fator_para_estoque`)
    if (fator <= 0n) falha(LANDED_ERROR_CODES.FATOR_INVALIDO, it.id)
    const qtdEstoque = lerDecimal(it.quantidade_estoque, ESC_QTD, `item.${it.id}.quantidade_estoque`)
    if (qtdEstoque <= 0n) falha(LANDED_ERROR_CODES.QTD_INVALIDA, it.id)
    // comercial (3) × fator (6) = escala 9; estoque (3) reescalado para 9
    if (qtdComercial * fator !== qtdEstoque * potencia10(ESC_FATOR)) {
      falha(LANDED_ERROR_CODES.QTD_FATOR_INCONSISTENTE, it.id)
    }

    const va6 = lerOpcionalNaoNegativo(it.valor_aduaneiro_brl, ESC_MOEDA, `item.${it.id}.valor_aduaneiro_brl`)
    const valorAduaneiro = va6 === null ? null : reescala(va6, ESC_MOEDA, ESC_INTERMEDIARIA)

    itens.set(it.id, {
      id: it.id,
      produtoId: it.produto_id ?? null,
      moeda: it.moeda,
      taxa,
      mercadoria: mercadoriaBrl,
      qtdEstoque,
      valorAduaneiro,
      pesoLiquido: lerOpcionalNaoNegativo(it.peso_liquido_kg, ESC_QTD, `item.${it.id}.peso_liquido_kg`),
      pesoBruto: lerOpcionalNaoNegativo(it.peso_bruto_kg, ESC_QTD, `item.${it.id}.peso_bruto_kg`),
      volume: lerOpcionalNaoNegativo(it.volume_m3, ESC_QTD, `item.${it.id}.volume_m3`),
      despesas: 0n,
      tributos: 0n,
      descontos: 0n,
      memoria: [
        `mercadoria: ${formataDecimal(mercadoria6, ESC_MOEDA)} ${it.moeda} × taxa ${formataDecimal(taxa, ESC_TAXA)} = ${formataDecimal(mercadoriaBrl, ESC_INTERMEDIARIA)} BRL`,
      ],
    })
  }

  const itemOuFalha = (id: string): ItemInterno => {
    const it = itens.get(id)
    if (!it) falha(LANDED_ERROR_CODES.ITEM_INEXISTENTE, id)
    return it
  }

  const rateios: RateioSaida[] = []
  const despesasNaoIncorporadas: string[] = []
  const creditos = { potencial: 0n, reconhecido: 0n }

  // ----- atribuições (valida antes de aplicar) -----
  const validaAtribuicao = (a: Atribuicao, origem: string): void => {
    if (typeof a.justificativa !== 'string' || a.justificativa.trim().length < 10) {
      falha(LANDED_ERROR_CODES.JUSTIFICATIVA_AUSENTE, origem)
    }
    if (a.modo === 'DIRETA') {
      itemOuFalha(a.item_id)
    } else if (a.modo === 'RATEIO') {
      if (!CRITERIOS.includes(a.criterio)) falha(LANDED_ERROR_CODES.CRITERIO_INVALIDO, origem)
    } else {
      falha(LANDED_ERROR_CODES.ATRIBUICAO_INVALIDA, origem)
    }
  }

  /** Base de rateio de um item para o critério. `null` = dado ausente de valor aduaneiro (divergência). */
  const baseDe = (criterio: CriterioRateio, it: ItemInterno, origem: string): bigint | null => {
    switch (criterio) {
      case 'VALOR_ADUANEIRO':
        return it.valorAduaneiro
      case 'PESO_LIQUIDO':
        if (it.pesoLiquido === null) falha(LANDED_ERROR_CODES.DADO_AUSENTE, `${origem}: peso líquido do item ${it.id}`)
        return it.pesoLiquido
      case 'PESO_BRUTO':
        if (it.pesoBruto === null) falha(LANDED_ERROR_CODES.DADO_AUSENTE, `${origem}: peso bruto do item ${it.id}`)
        return it.pesoBruto
      case 'VOLUME':
        if (it.volume === null) falha(LANDED_ERROR_CODES.DADO_AUSENTE, `${origem}: volume do item ${it.id}`)
        return it.volume
      case 'QUANTIDADE_ESTOQUE':
        return it.qtdEstoque
    }
  }

  const escalaDoCriterio = (criterio: CriterioRateio): number => (criterio === 'VALOR_ADUANEIRO' ? ESC_INTERMEDIARIA : ESC_QTD)

  const adiciona = (it: ItemInterno, componente: 'despesas' | 'descontos' | 'tributos', valor: bigint): void => {
    if (componente === 'despesas') it.despesas += valor
    else if (componente === 'tributos') it.tributos += valor
    else it.descontos += valor
  }

  /**
   * Aplica um valor (escala 10, com sinal) a um item ou ao rateio entre itens.
   * Retorna false quando o valor não pôde ser alocado (base ausente) e gerou divergência.
   */
  const aplica = (
    origemId: string,
    atribuicao: Atribuicao,
    valor: bigint,
    componente: 'despesas' | 'descontos' | 'tributos',
    justificativa: string,
  ): boolean => {
    if (atribuicao.modo === 'DIRETA') {
      const it = itemOuFalha(atribuicao.item_id)
      adiciona(it, componente, valor)
      it.memoria.push(`${componente} (${origemId}, direta): ${formataDecimal(valor, ESC_INTERMEDIARIA)} BRL`)
      return true
    }
    const criterio = atribuicao.criterio
    const bases: BaseRateio[] = []
    let faltou = false
    for (const it of porIdItens(itens)) {
      const b = baseDe(criterio, it, origemId)
      if (b === null) {
        faltou = true
      } else {
        bases.push({ id: it.id, peso: b })
      }
    }
    if (faltou) {
      divergencias.push({
        codigo: LANDED_DIVERGENCIA_CODES.VALOR_ADUANEIRO_AUSENTE,
        severidade: 'BLOQUEANTE',
        referencia: origemId,
        mensagem: 'valor aduaneiro do item não informado; rateio não aplicado',
      })
      return false
    }
    const escala = escalaDoCriterio(criterio)
    const resultado = ratear(valor, bases)
    for (const parte of resultado.partes) {
      const it = itens.get(parte.id)!
      adiciona(it, componente, parte.valor)
      rateios.push({
        origem_id: origemId,
        componente,
        criterio,
        base_total: formataDecimal(resultado.somaPesos, escala),
        item_id: parte.id,
        base_item: formataDecimal(parte.peso, escala),
        valor_alocado_brl: formataDecimal(parte.valor, ESC_INTERMEDIARIA),
        justificativa,
      })
      it.memoria.push(
        `${componente} (${origemId}, rateio ${criterio}): base ${formataDecimal(parte.peso, escala)} de ${formataDecimal(resultado.somaPesos, escala)} → ${formataDecimal(parte.valor, ESC_INTERMEDIARIA)} BRL`,
      )
    }
    return true
  }

  // ----- despesas -----
  for (const d of porId(input.despesas)) {
    const origem = `despesa.${d.id}`
    const valor6 = lerMoedaAssinada(d.valor, ESC_MOEDA, `${origem}.valor`)
    const valorBrl = multiplica(valor6, ESC_MOEDA, taxaDe(d.moeda), ESC_TAXA, ESC_INTERMEDIARIA)
    validaAtribuicao(d.atribuicao, origem)
    if (d.incorporavel === 'DECISAO_03') {
      divergencias.push({
        codigo: LANDED_DIVERGENCIA_CODES.DECISAO_INCORPORAVEL_PENDENTE,
        severidade: 'BLOQUEANTE',
        referencia: d.id,
        mensagem: 'incorporável ao custo não decidido (DECISÃO-03)',
      })
      continue
    }
    if (d.incorporavel === false) {
      despesasNaoIncorporadas.push(d.id)
      continue
    }
    if (d.incorporavel !== true) falha(LANDED_ERROR_CODES.INCORPORAVEL_INVALIDO, origem)
    aplica(d.id, d.atribuicao, valorBrl, 'despesas', d.atribuicao.justificativa)
  }

  // ----- descontos (valor positivo; o sinal de redução é do motor) -----
  for (const x of porId(input.descontos)) {
    const origem = `desconto.${x.id}`
    const valor6 = lerMoedaPositiva(x.valor, ESC_MOEDA, `${origem}.valor`)
    const valorBrl = multiplica(valor6, ESC_MOEDA, taxaDe(x.moeda), ESC_TAXA, ESC_INTERMEDIARIA)
    const atribuicao: Atribuicao = x.escopo === 'ITEM'
      ? { modo: 'DIRETA', item_id: x.item_id ?? '', justificativa: x.justificativa }
      : { modo: 'RATEIO', criterio: x.criterio as CriterioRateio, justificativa: x.justificativa }
    if (x.escopo === 'ITEM' && !x.item_id) falha(LANDED_ERROR_CODES.ATRIBUICAO_INVALIDA, origem)
    validaAtribuicao(atribuicao, origem)
    aplica(x.id, atribuicao, -valorBrl, 'descontos', x.justificativa)
  }

  // ----- tributos -----
  for (const t of porId(input.tributos)) {
    const origem = `tributo.${t.id}`
    if (!STATUS_VALIDOS.includes(t.status_recuperabilidade)) falha(LANDED_ERROR_CODES.TRIBUTO_STATUS_INVALIDO, origem)
    const apurado2 = lerMoedaPositiva(t.valor_apurado_brl, ESC_IMPOSTO, `${origem}.valor_apurado_brl`)
    const apurado = reescala(apurado2, ESC_IMPOSTO, ESC_INTERMEDIARIA)

    if (t.status_recuperabilidade === 'PENDENTE_VALIDACAO') {
      divergencias.push({
        codigo: LANDED_DIVERGENCIA_CODES.TRIBUTO_PENDENTE,
        severidade: 'BLOQUEANTE',
        referencia: t.id,
        mensagem: 'tributo sem status de recuperabilidade validado',
      })
      continue
    }

    if (t.regra) {
      if (!t.regra.vigencia_inicio) falha(LANDED_ERROR_CODES.REGRA_VIGENCIA_AUSENTE, origem)
      const dataFato = t.data_fato_gerador
      if (!dataFato || !DATA.test(dataFato)) falha(LANDED_ERROR_CODES.DADO_AUSENTE, `${origem}.data_fato_gerador`)
      const fim = t.regra.vigencia_fim
      const fora = dataFato < t.regra.vigencia_inicio || (fim !== null && dataFato > fim)
      if (fora) {
        divergencias.push({
          codigo: LANDED_DIVERGENCIA_CODES.TRIBUTO_REGRA_FORA_VIGENCIA,
          severidade: 'BLOQUEANTE',
          referencia: t.id,
          mensagem: 'regra não vigente na data do fato gerador',
        })
        continue
      }
    }

    if (t.status_recuperabilidade === 'RECUPERAVEL_RECONHECIDO') {
      if (!t.validado_por) falha(LANDED_ERROR_CODES.VALIDACAO_AUSENTE, origem)
      creditos.reconhecido += apurado
    } else if (t.status_recuperabilidade === 'RECUPERAVEL_POTENCIAL') {
      creditos.potencial += apurado
    }

    const incorpora = (t.status_recuperabilidade === 'NAO_RECUPERAVEL' || t.status_recuperabilidade === 'GLOSADO')
      && t.regra?.incorpora_custo === true
    if (incorpora) {
      if (!t.item_id) falha(LANDED_ERROR_CODES.TRIBUTO_ALOCACAO_AUSENTE, origem)
      const it = itemOuFalha(t.item_id)
      adiciona(it, 'tributos', apurado)
      it.memoria.push(`tributo (${t.id}, ${t.status_recuperabilidade}, incorporado por regra ${t.regra!.id}): ${formataDecimal(apurado, ESC_INTERMEDIARIA)} BRL`)
    }
  }

  // ----- saídas por item -----
  let entradas = 0n
  let descontosAbs = 0n
  let saidas = 0n
  const itensSaida: ItemSaida[] = []
  for (const it of porIdItens(itens)) {
    const total = it.mercadoria + it.despesas + it.tributos + it.descontos
    if (total < 0n) falha(LANDED_ERROR_CODES.CUSTO_NEGATIVO, it.id)

    const total4 = reescala(total, ESC_INTERMEDIARIA, ESC_TOTAL)
    const unitario6 = divide(total, ESC_INTERMEDIARIA, it.qtdEstoque, ESC_QTD, ESC_UNITARIO)
    // unitário (6) × quantidade (3) = escala 9; ×10 leva para escala 10
    const residuoUnitario = total - unitario6 * it.qtdEstoque * 10n
    const residuoTotal = total - reescala(total4, ESC_TOTAL, ESC_INTERMEDIARIA)

    entradas += it.mercadoria + it.despesas + it.tributos
    descontosAbs += -it.descontos
    saidas += total

    it.memoria.push(`total do item: ${formataDecimal(total, ESC_INTERMEDIARIA)} BRL → ${formataDecimal(total4, ESC_TOTAL)} (persistência)`)
    it.memoria.push(
      `unitário: ${formataDecimal(total, ESC_INTERMEDIARIA)} ÷ ${formataDecimal(it.qtdEstoque, ESC_QTD)} → ${formataDecimal(unitario6, ESC_UNITARIO)}; resíduo unitário ${formataDecimal(residuoUnitario, ESC_INTERMEDIARIA)}`,
    )

    itensSaida.push({
      item_id: it.id,
      produto_id: it.produtoId,
      quantidade_estoque: formataDecimal(it.qtdEstoque, ESC_QTD),
      componentes_brl: {
        mercadoria: formataDecimal(reescala(it.mercadoria, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
        despesas_incorporadas: formataDecimal(reescala(it.despesas, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
        tributos_nao_recuperaveis: formataDecimal(reescala(it.tributos, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
        descontos: formataDecimal(reescala(it.descontos, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
      },
      custo_total_brl: formataDecimal(total4, ESC_TOTAL),
      custo_unitario_brl: formataDecimal(unitario6, ESC_UNITARIO),
      residuo_unitario_brl: formataDecimal(residuoUnitario, ESC_INTERMEDIARIA),
      residuo_total_brl: formataDecimal(residuoTotal, ESC_INTERMEDIARIA),
      memoria: it.memoria,
    })
  }

  // ----- conservação (invariante; falha aqui indica defeito do motor) -----
  const diferenca = entradas - descontosAbs - saidas
  if (diferenca !== 0n) falha(LANDED_ERROR_CODES.CONSERVACAO_FALHOU, formataDecimal(diferenca, ESC_INTERMEDIARIA))

  const bloqueado = divergencias.some((d) => d.severidade === 'BLOQUEANTE')
  return {
    schema_version: '1',
    engine_version: ENGINE_VERSION,
    status: bloqueado ? 'BLOQUEADO' : 'OK',
    divergencias,
    itens: itensSaida,
    rateios,
    despesas_nao_incorporadas: despesasNaoIncorporadas,
    creditos: {
      potencial_brl: formataDecimal(reescala(creditos.potencial, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
      reconhecido_brl: formataDecimal(reescala(creditos.reconhecido, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
    },
    conservacao: {
      entradas_brl: formataDecimal(reescala(entradas, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
      descontos_brl: formataDecimal(reescala(descontosAbs, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
      saidas_brl: formataDecimal(reescala(saidas, ESC_INTERMEDIARIA, ESC_TOTAL), ESC_TOTAL),
      diferenca_brl: formataDecimal(diferenca, ESC_INTERMEDIARIA),
      ok: diferenca === 0n,
    },
  }
}

/** Itens por `id` crescente (ordem canônica de cálculo e de saída). */
function porIdItens(itens: Map<string, ItemInterno>): ItemInterno[] {
  return [...itens.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
